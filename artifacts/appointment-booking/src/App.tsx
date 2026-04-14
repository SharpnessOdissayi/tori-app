import { Component, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import SuperAdmin from "@/pages/SuperAdmin";
import Dashboard from "@/pages/Dashboard";
import Register from "@/pages/Register";
import Book from "@/pages/Book";
import ClientPortal from "@/pages/ClientPortal";
import Details from "@/pages/Details";
import Contact from "@/pages/Contact";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import PaymentSuccess from "@/pages/PaymentSuccess";
import PaymentFail from "@/pages/PaymentFail";

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div dir="rtl" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", fontFamily: "sans-serif" }}>
          <div style={{ textAlign: "center", maxWidth: 400 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>משהו השתבש</h2>
            <p style={{ color: "#888", marginBottom: 16 }}>אירעה שגיאה בלתי צפויה. נסה לרענן את הדף.</p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              style={{ background: "#2563eb", color: "white", border: "none", borderRadius: 8, padding: "10px 24px", cursor: "pointer", fontSize: 15 }}
            >
              רענן דף
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/details" component={Details} />
      <Route path="/contact" component={Contact} />
      <Route path={import.meta.env.VITE_ADMIN_PATH ?? "/superadmin"} component={SuperAdmin} />
      <Route path="/register" component={Register} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/book/:businessSlug" component={Book} />
      <Route path="/client" component={ClientPortal} />
      <Route path="/portal" component={ClientPortal} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/payment/success" component={PaymentSuccess} />
      <Route path="/payment/fail" component={PaymentFail} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
