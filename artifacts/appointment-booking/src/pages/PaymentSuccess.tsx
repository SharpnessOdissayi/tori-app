import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle, Crown, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

const REDIRECT_SECONDS = 12;

export default function PaymentSuccess() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type");
  // Tranzila appends its own URL-params after ours without encoding them.
  // Only keep the leading digits of `appt`.
  const rawAppt = params.get("appt");
  const apptId = rawAppt ? (rawAppt.match(/^\d+/)?.[0] ?? null) : null;
  const requiresApproval = params.get("approval") === "1";

  const isSubscription = type === "subscription";
  const inPopup = !!window.opener && window.opener !== window;
  const inIframe = !inPopup && window !== window.parent;

  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_SECONDS);

  useEffect(() => {
    if (inPopup) {
      try {
        window.opener.postMessage(
          { type: "kavati_payment_success", paymentType: type, apptId },
          "*"
        );
      } catch {}
      setTimeout(() => window.close(), 2500);
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
      }, 3000);
      return;
    }

    // Full-page return — countdown then redirect
    const interval = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          clearInterval(interval);
          setLocation(isSubscription ? "/dashboard" : "/");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-green-100 p-8 text-center space-y-6">
        <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center mx-auto animate-in zoom-in duration-500">
          {isSubscription
            ? <Crown className="w-12 h-12 text-green-600" />
            : <CheckCircle className="w-12 h-12 text-green-600" />}
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl font-bold text-green-800">
            {isSubscription ? "ברוך הבא לפרו! 🎉" : "התשלום עבר בהצלחה ✓"}
          </h1>
          <p className="text-base text-gray-700 leading-relaxed">
            {isSubscription
              ? "המנוי שלך הופעל. כעת יש לך גישה מלאה לכל תכונות קבעתי פרו."
              : apptId && requiresApproval
                ? "המקדמה התקבלה. התור ממתין לאישור בעל העסק — תקבל/י הודעת אישור בוואטסאפ לאחר שיאושר."
                : apptId
                  ? "התור שלך אושר לאחר קבלת המקדמה. נשלחה לך הודעת אישור בוואטסאפ."
                  : "התשלום התקבל בהצלחה."}
          </p>
        </div>

        {!inIframe && !inPopup && (
          <div className="flex flex-col gap-3 pt-2">
            {isSubscription ? (
              <Button
                onClick={() => setLocation("/dashboard")}
                size="lg"
                className="w-full bg-green-600 hover:bg-green-700 text-white gap-2"
              >
                <Crown className="w-5 h-5" /> לדשבורד הניהול
              </Button>
            ) : (
              <Button
                onClick={() => setLocation("/")}
                size="lg"
                className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
              >
                <Calendar className="w-5 h-5" /> חזרה לדף הבית
              </Button>
            )}
            <p className="text-sm text-muted-foreground">
              מועבר אוטומטית בעוד {secondsLeft} שניות…
            </p>
          </div>
        )}

        {(inIframe || inPopup) && (
          <p className="text-sm text-muted-foreground animate-pulse">סוגר ומעדכן...</p>
        )}
      </div>
    </div>
  );
}
