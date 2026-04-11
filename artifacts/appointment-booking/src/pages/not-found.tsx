import Navbar from "@/components/Navbar";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col bg-muted/20" dir="rtl">
      <Navbar />
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <div className="text-6xl mb-4">😔</div>
        <h1 className="text-3xl font-bold mb-2">404 — הדף לא נמצא</h1>
        <p className="text-muted-foreground mb-6">הכתובת שהזנת אינה קיימת</p>
        <Link href="/">
          <Button>חזור לדף הבית</Button>
        </Link>
      </div>
    </div>
  );
}
