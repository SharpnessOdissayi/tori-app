import { useEffect } from "react";
import { useLocation } from "wouter";
import { CheckCircle, Crown, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PaymentSuccess() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type");
  const apptId = params.get("appt");

  const isSubscription = type === "subscription";
  const inPopup = !!window.opener && window.opener !== window;
  const inIframe = !inPopup && window !== window.parent;

  useEffect(() => {
    if (inPopup) {
      // Notify opener and close this popup
      try {
        window.opener.postMessage(
          { type: "kavati_payment_success", paymentType: type, apptId },
          "*"
        );
      } catch {}
      setTimeout(() => window.close(), 1200);
      return;
    }

    if (inIframe) {
      try {
        window.parent.postMessage(
          { type: "kavati_payment_success", paymentType: type, apptId },
          "*"
        );
      } catch {}
      setTimeout(() => {
        window.top!.location.href = isSubscription ? "/dashboard" : "/";
      }, 1500);
      return;
    }

    // Full-page return — normal auto-redirect
    const t = setTimeout(() => {
      setLocation(isSubscription ? "/dashboard" : "/");
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-green-100 p-8 text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          {isSubscription
            ? <Crown className="w-10 h-10 text-green-600" />
            : <CheckCircle className="w-10 h-10 text-green-600" />}
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-green-800">
            {isSubscription ? "ברוך הבא לפרו! 🎉" : "התשלום עבר בהצלחה"}
          </h1>
          <p className="text-muted-foreground">
            {isSubscription
              ? "המנוי שלך הופעל. כעת יש לך גישה מלאה לכל תכונות קבעתי פרו."
              : apptId
                ? `התור מספר ${apptId} אושר לאחר קבלת המקדמה.`
                : "התשלום התקבל בהצלחה."}
          </p>
        </div>

        {!inIframe && (
          <div className="flex flex-col gap-2">
            {isSubscription ? (
              <Button
                onClick={() => setLocation("/dashboard")}
                className="w-full bg-green-600 hover:bg-green-700 text-white gap-2"
              >
                <Crown className="w-4 h-4" /> לדשבורד הניהול
              </Button>
            ) : (
              <Button
                onClick={() => setLocation("/")}
                className="w-full gap-2"
              >
                <Calendar className="w-4 h-4" /> חזרה לדף הבית
              </Button>
            )}
            <p className="text-xs text-muted-foreground">מועבר אוטומטית בעוד מספר שניות…</p>
          </div>
        )}

        {inIframe && (
          <p className="text-xs text-muted-foreground animate-pulse">מעביר אותך לדשבורד...</p>
        )}
      </div>
    </div>
  );
}
