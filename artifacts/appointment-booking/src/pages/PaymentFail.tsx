import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { XCircle, RefreshCw, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const REDIRECT_SECONDS = 20;

// Common Tranzila response codes — explain to the client what went wrong
function explainTranzilaCode(code: string | null): string {
  if (!code) return "לא הצלחנו להשלים את החיוב. ייתכן שהעסקה בוטלה או שאירעה תקלה זמנית.";
  switch (code) {
    case "001": return "הכרטיס נדחה על ידי הבנק. נסה כרטיס אחר או פנה לבנק שלך.";
    case "002": return "הכרטיס חסום. פנה לבנק להסרת החסימה.";
    case "003": return "כרטיס פג תוקף. בדוק את תאריך התפוגה ונסה שוב.";
    case "004": return "סירוב מהבנק. נסה כרטיס אחר.";
    case "005": return "כרטיס מזויף או חסום על ידי שב״א. פנה לבנק.";
    case "006": case "036": return "מספר תעודת זהות שגוי. בדוק את הת״ז ונסה שוב.";
    case "007": return "מספר ספרות שגוי בכרטיס. בדוק את מספר הכרטיס.";
    case "008": return "אין תקשורת עם חברת האשראי. נסה שוב בעוד מספר דקות.";
    case "009": return "ניתוק תקשורת באמצע. אם חויבת — פנה אלינו, אם לא — נסה שוב.";
    case "010": return "תשלום הופסק על ידי המשתמש.";
    case "014": return "הכרטיס לא נתמך. נסה כרטיס Visa/Mastercard.";
    case "017": return "ה-CVV שגוי. בדוק את 3 הספרות בגב הכרטיס.";
    case "026": return "מספר עסקאות לתשלומים גבוה מהמותר. נסה פחות תשלומים.";
    case "033": case "034": case "035": return "כרטיס לא חוקי במערכת.";
    case "039": return "מספר הכרטיס שגוי לפי ספרת ביקורת.";
    case "041": return "סכום העסקה חורג ממסגרת האשראי.";
    case "042": return "הכרטיס מוגבל לסוג עסקאות מסוים.";
    case "057": return "תשלום נכשל בגלל אימות 3D Secure. נסה שוב או פנה לבנק.";
    default: return `התשלום נכשל (קוד שגיאה: ${code}). נסה כרטיס אחר או פנה אלינו לעזרה.`;
  }
}

export default function PaymentFail() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type");
  const apptId = params.get("appt");
  // Tranzila sends the error code as Response= (or sometimes responsecode=)
  const errorCode = params.get("Response") || params.get("responsecode");

  const isSubscription = type === "subscription";
  const inPopup = !!window.opener && window.opener !== window;
  const inIframe = !inPopup && window !== window.parent;

  const errorExplanation = explainTranzilaCode(errorCode);
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_SECONDS);

  useEffect(() => {
    if (inPopup) {
      try {
        window.opener.postMessage(
          { type: "kavati_payment_fail", paymentType: type, apptId, code: errorCode },
          "*"
        );
      } catch {}
      return;
    }
    if (inIframe) {
      try {
        window.parent.postMessage(
          { type: "kavati_payment_fail", paymentType: type, apptId, code: errorCode },
          "*"
        );
      } catch {}
      return;
    }

    // Full-page — soft countdown so user has time to read
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

  const handleRetry = () => {
    if (inPopup) { window.close(); return; }
    window.history.back();
  };

  const handleBack = () => {
    if (inPopup) { window.close(); return; }
    if (inIframe) {
      window.top!.location.href = isSubscription ? "/dashboard" : "/";
    } else {
      setLocation(isSubscription ? "/dashboard" : "/");
    }
  };

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-rose-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-red-100 p-8 text-center space-y-6">
        <div className="w-24 h-24 rounded-full bg-red-100 flex items-center justify-center mx-auto animate-in zoom-in duration-500">
          <XCircle className="w-12 h-12 text-red-500" />
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl font-bold text-red-800">התשלום לא עבר</h1>
          <p className="text-base text-gray-700 leading-relaxed">
            {errorExplanation}
          </p>
          {apptId && !isSubscription && (
            <p className="text-sm text-muted-foreground bg-red-50 rounded-lg p-3 border border-red-100">
              התור (#{apptId}) <strong>לא נשמר</strong> כי המקדמה לא התקבלה.
              ניתן לנסות לקבוע אותו מחדש.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <Button
            onClick={handleRetry}
            size="lg"
            className="w-full gap-2 bg-red-600 hover:bg-red-700 text-white"
          >
            <RefreshCw className="w-5 h-5" /> נסה תשלום שוב
          </Button>
          <Button
            variant="outline"
            onClick={handleBack}
            size="lg"
            className="w-full gap-2"
          >
            <ArrowRight className="w-5 h-5" /> חזרה {isSubscription ? "לדשבורד" : "לדף הבית"}
          </Button>
          {!inIframe && !inPopup && (
            <p className="text-sm text-muted-foreground pt-1">
              מועבר אוטומטית בעוד {secondsLeft} שניות…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
