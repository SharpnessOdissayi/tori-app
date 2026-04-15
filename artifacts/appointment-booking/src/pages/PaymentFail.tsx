import { useEffect } from "react";
import { useLocation } from "wouter";
import { XCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PaymentFail() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type");
  const apptId = params.get("appt");

  const isSubscription = type === "subscription";
  const inPopup = !!window.opener && window.opener !== window;
  const inIframe = !inPopup && window !== window.parent;

  useEffect(() => {
    if (inPopup) {
      try {
        window.opener.postMessage(
          { type: "kavati_payment_fail", paymentType: type, apptId },
          "*"
        );
      } catch {}
      return;
    }
    if (inIframe) {
      try {
        window.parent.postMessage(
          { type: "kavati_payment_fail", paymentType: type, apptId },
          "*"
        );
      } catch {}
    }
  }, []);

  const handleRetry = () => {
    if (inIframe) {
      window.history.back();
    } else {
      window.history.back();
    }
  };

  const handleBack = () => {
    if (inIframe) {
      // window.top works even from cross-origin iframes
      window.top!.location.href = isSubscription ? "/dashboard" : "/";
    } else {
      setLocation(isSubscription ? "/dashboard" : "/");
    }
  };

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-rose-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-red-100 p-8 text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <XCircle className="w-10 h-10 text-red-500" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-red-800">התשלום נכשל</h1>
          <p className="text-muted-foreground">
            {isSubscription
              ? "לא הצלחנו לאמת את פרטי הכרטיס. בדוק את הפרטים ונסה שוב."
              : apptId
                ? `לא הצלחנו לגבות מקדמה עבור תור מספר ${apptId}. ניתן לנסות שוב.`
                : "הכרטיס נדחה. נסה כרטיס אחר או פנה לבנק."}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            onClick={handleRetry}
            className="w-full gap-2 bg-red-600 hover:bg-red-700 text-white"
          >
            <RefreshCw className="w-4 h-4" /> נסה שוב
          </Button>
          <Button
            variant="ghost"
            onClick={handleBack}
            className="w-full"
          >
            חזרה
          </Button>
        </div>
      </div>
    </div>
  );
}
