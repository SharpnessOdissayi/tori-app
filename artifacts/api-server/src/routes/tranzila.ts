import { Router } from "express";
import { db, appointmentsTable, businessesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

const SUPPLIER = process.env.TRANZILA_SUPPLIER ?? "";
const NOTIFY_PASSWORD = process.env.TRANZILA_NOTIFY_PASSWORD ?? "";

// Build Tranzila payment redirect URL
export function buildTranzilaUrl(params: {
  appointmentId: number;
  sum: number; // in ILS (not agorot)
  description: string;
  clientName: string;
}): string {
  const base = `https://direct.tranzila.com/${SUPPLIER}/iframenew.php`;
  const successUrl = `https://kavati.net/payment/success?appt=${params.appointmentId}`;
  const failUrl = `https://kavati.net/payment/fail?appt=${params.appointmentId}`;
  const notifyUrl = `https://kavati.net/api/tranzila/notify`;

  const p = new URLSearchParams({
    sum: params.sum.toFixed(2),
    currency: "1",
    cred_type: "1",
    pdesc: params.description,
    contact: params.clientName,
    myid: String(params.appointmentId),
    success_url: successUrl,
    fail_url: failUrl,
    notify_url: notifyUrl,
    TranzilaTK: NOTIFY_PASSWORD,
  });

  return `${base}?${p.toString()}`;
}

// POST /api/tranzila/notify — Tranzila calls this after payment
router.post("/tranzila/notify", async (req, res): Promise<void> => {
  try {
    const body = req.body ?? {};

    // Verify notify password
    const receivedPw = body.TranzilaTK ?? body.tranzilatk ?? "";
    if (NOTIFY_PASSWORD && receivedPw !== NOTIFY_PASSWORD) {
      console.warn("[Tranzila] Notify password mismatch");
      res.status(200).send("OK"); // Always return 200 to Tranzila
      return;
    }

    const responsecode = body.Response ?? body.responsecode ?? "";
    const apptIdStr = body.pdesc ?? "";

    // Parse appointment ID from description or custom field
    const apptIdMatch = String(body.myid ?? body.contact ?? "").match(/\d+/);
    const apptId = apptIdMatch ? parseInt(apptIdMatch[0]) : null;

    console.log("[Tranzila] Notify received:", { responsecode, apptId, body });

    // Response code "000" = success; anything else = payment failed → cancel
    if (apptId) {
      if (responsecode === "000") {
        await db
          .update(appointmentsTable)
          .set({ status: "confirmed" })
          .where(and(
            eq(appointmentsTable.id, apptId),
            eq(appointmentsTable.status, "pending_payment")
          ));
        console.log(`[Tranzila] Appointment ${apptId} confirmed after payment`);
      } else {
        await db
          .update(appointmentsTable)
          .set({ status: "cancelled" })
          .where(and(
            eq(appointmentsTable.id, apptId),
            eq(appointmentsTable.status, "pending_payment")
          ));
        console.log(`[Tranzila] Appointment ${apptId} cancelled — payment rejected (code: ${responsecode})`);
      }
    }

    res.status(200).send("OK");
  } catch (e) {
    console.error("[Tranzila] Notify error:", e);
    res.status(200).send("OK"); // Always 200
  }
});

// GET /api/tranzila/payment-url/:appointmentId — get payment URL for an appointment
router.get("/tranzila/payment-url/:appointmentId", async (req, res): Promise<void> => {
  const apptId = parseInt(req.params.appointmentId);
  if (isNaN(apptId)) { res.status(400).json({ error: "Invalid appointment ID" }); return; }

  const [appt] = await db
    .select({
      id: appointmentsTable.id,
      clientName: appointmentsTable.clientName,
      serviceName: appointmentsTable.serviceName,
      status: appointmentsTable.status,
      businessId: appointmentsTable.businessId,
    })
    .from(appointmentsTable)
    .where(eq(appointmentsTable.id, apptId));

  if (!appt) { res.status(404).json({ error: "Appointment not found" }); return; }

  const [business] = await db
    .select({ depositAmountAgorot: (businessesTable as any).depositAmountAgorot })
    .from(businessesTable)
    .where(eq(businessesTable.id, appt.businessId));

  if (!business || !business.depositAmountAgorot) {
    res.status(400).json({ error: "No deposit required" });
    return;
  }

  const sumILS = business.depositAmountAgorot / 100;
  const url = buildTranzilaUrl({
    appointmentId: appt.id,
    sum: sumILS,
    description: `${appt.serviceName} - תור מספר ${appt.id}`,
    clientName: appt.clientName,
  });

  res.json({ url, sum: sumILS, appointmentId: appt.id });
});

export default router;
