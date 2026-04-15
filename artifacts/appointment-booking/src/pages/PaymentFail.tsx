import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { XCircle, RefreshCw, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const REDIRECT_SECONDS = 20;

// Extract just the appointment id (digits only) — Tranzila appends many extra
// URL fragments that can leak into the "appt" value when not URL-encoded.
function parseApptId(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.match(/^\d+/);
  return digits ? digits[0] : null;
}

type ErrorInfo = { title: string; detail: string; actionable: boolean };

// Common Tranzila response codes — explain to the client what went wrong.
// Reference: Tranzila rejection code table.
function explainTranzilaCode(code: string | null): ErrorInfo {
  if (!code) return {
    title: "התשלום לא הושלם",
    detail: "ייתכן שסגרת את חלון התשלום לפני הסיום, או שאירעה תקלה זמנית.",
    actionable: true,
  };
  switch (code) {
    case "001": return { title: "הכרטיס נדחה", detail: "הבנק שלך דחה את החיוב. נסה כרטיס אחר או פנה לבנק לבירור.", actionable: true };
    case "002": return { title: "הכרטיס חסום", detail: "הכרטיס סומן כחסום על ידי הבנק. פנה לבנק להסרת החסימה.", actionable: false };
    case "003": case "036": return { title: "הכרטיס פג תוקף", detail: "תאריך התוקף של הכרטיס עבר. בדוק את ה-MM/YY ונסה כרטיס פעיל.", actionable: true };
    case "004": return { title: "סירוב מחברת האשראי", detail: "חברת האשראי דחתה את העסקה. נסה כרטיס אחר.", actionable: true };
    case "005": return { title: "חשד לכרטיס בעייתי", detail: "הכרטיס סומן על ידי שב״א. פנה לבנק לפני שתנסה שוב.", actionable: false };
    case "006": return { title: "שגיאה בפרטי הכרטיס", detail: "ת״ז או CVV שהוזנו אינם תואמים לכרטיס. בדוק ונסה שוב.", actionable: true };
    case "026": return { title: "תעודת זהות שגויה", detail: "מספר הת״ז שהזנת לא תואם לזהות של בעל הכרטיס. תקן ונסה שוב.", actionable: true };
    case "007": case "039": return { title: "מספר כרטיס לא תקין", detail: "נראה שיש טעות במספר הכרטיס. בדוק את הספרות ונסה שוב.", actionable: true };
    case "008": return { title: "בעיית תקשורת", detail: "אין תקשורת עם חברת האשראי. נסה שוב בעוד דקה-שתיים.", actionable: true };
    case "009": return { title: "העסקה נותקה", detail: "התשלום נקטע באמצע. אם חויבת — פנה אלינו, אחרת נסה שוב.", actionable: true };
    case "010": return { title: "התשלום בוטל", detail: "סגרת את חלון התשלום לפני הסיום.", actionable: true };
    case "014": return { title: "כרטיס לא נתמך", detail: "סוג הכרטיס לא נתמך במערכת. נסה Visa או Mastercard.", actionable: true };
    case "017": return { title: "CVV שגוי", detail: "שלוש הספרות בגב הכרטיס לא נכונות. בדוק ונסה שוב.", actionable: true };
    case "033": case "034": case "035": return { title: "כרטיס לא חוקי", detail: "הכרטיס לא מזוהה כחוקי במערכת. נסה כרטיס אחר.", actionable: true };
    case "041": return { title: "חריגה ממסגרת", detail: "סכום העסקה חורג ממסגרת האשראי. פנה לבנק או נסה כרטיס אחר.", actionable: true };
    case "042": return { title: "הגבלה על הכרטיס", detail: "הכרטיס מוגבל לסוג עסקאות מסוים. פנה לבנק.", actionable: false };
    case "051": return { title: "אין יתרה מספקת", detail: "אין מספיק יתרה בכרטיס. פנה לבנק או נסה כרטיס אחר.", actionable: true };
    case "057": return { title: "אימות 3D Secure נכשל", detail: "הבנק דרש אימות נוסף שלא הושלם. נסה שוב או פנה לבנק.", actionable: true };
    default: return { title: "התשלום נכשל", detail: `לא הצלחנו להשלים את החיוב (קוד: ${code}). נסה כרטיס אחר או פנה אלינו.`, actionable: true };
  }
}

export default function PaymentFail() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type");
  // Tranzila appends its own URL-params after ours without encoding them.
  // Only keep the leading digits of `appt` to avoid leaking the whole payload.
  const apptId = parseApptId(params.get("appt"));
  const errorCode = params.get("Response") || params.get("responsecode");

  const isSubscription = type === "subscription";
  const inPopup = !!window.opener && window.opener !== window;
  const inIframe = !inPopup && window !== window.parent;

  const err = explainTranzilaCode(errorCode);
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
          <h1 className="text-3xl font-bold text-red-800">{err.title}</h1>
          <p className="text-base text-gray-700 leading-relaxed">
            {err.detail}
          </p>
          {apptId && !isSubscription && (
            <div className="text-sm text-gray-600 bg-red-50 rounded-lg p-3 border border-red-100 text-right">
              <div>תור מספר <strong>#{apptId}</strong> <strong className="text-red-700">לא נשמר</strong></div>
              <div className="text-xs mt-1 text-muted-foreground">המקדמה לא התקבלה — לאחר ניסיון חוזר מוצלח התור ייקבע.</div>
            </div>
          )}
          {errorCode && (
            <p className="text-xs text-muted-foreground">קוד שגיאה: {errorCode}</p>
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
