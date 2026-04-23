import { useState, useEffect } from "react";
import {
  useSuperAdminListBusinesses,
  useSuperAdminCreateBusiness,
  useSuperAdminDeleteBusiness,
  useSuperAdminUpdateBusiness,
  getSuperAdminListBusinessesQueryKey
} from "@workspace/api-client-react";
import type { AdminBusinessSummary, AdminUpdateBusinessBody } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, ExternalLink, Shield, Eye, EyeOff, RefreshCw, BarChart3, Users, Globe, FolderTree, FileDown, TrendingUp, TrendingDown, AlertTriangle, DollarSign, X } from "lucide-react";
import Navbar from "@/components/Navbar";

const PLANS = [
  { value: "free",     label: "חינמי", color: "bg-slate-100 text-slate-700"       },
  { value: "pro",      label: "פרו",   color: "bg-emerald-100 text-emerald-700"   },
  { value: "pro-plus", label: "עסקי",  color: "bg-blue-100 text-blue-700"         },
];

interface EditFormData {
  name: string;
  slug: string;
  username: string;
  ownerName: string;
  email: string;
  password: string;
  phone: string;
  address: string;
  city: string;
  websiteUrl: string;
  instagramHandle: string;
  businessDescription: string;
  subscriptionPlan: string;
}

export default function SuperAdmin() {
  // Per-screen storage — admin credentials never touch the business-owner
  // or client-portal keys.
  const [username, setUsername] = useState(() => {
    try { return localStorage.getItem("kavati_admin_last_username") ?? ""; }
    catch { return ""; }
  });
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newBusiness, setNewBusiness] = useState({ name: "", slug: "", ownerName: "", email: "", password: "", phone: "", subscriptionPlan: "free", address: "", websiteUrl: "", instagramHandle: "" });
  const [editDialogBusiness, setEditDialogBusiness] = useState<AdminBusinessSummary | null>(null);
  const [editForm, setEditForm] = useState<EditFormData>({ name: "", slug: "", username: "", ownerName: "", email: "", password: "", phone: "", address: "", city: "", websiteUrl: "", instagramHandle: "", businessDescription: "", subscriptionPlan: "free" });
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [grantProBusiness, setGrantProBusiness] = useState<AdminBusinessSummary | null>(null);
  // SMS credit top-up — super-admin can add N credits to any business's
  // sms_extra_balance. Used for manual refunds (Tranzila webhook rejected)
  // or to comp credits to VIP customers.
  const [smsTopupBusiness, setSmsTopupBusiness] = useState<AdminBusinessSummary | null>(null);
  const [smsTopupAmount, setSmsTopupAmount] = useState<number>(100);
  const [smsTopupLoading, setSmsTopupLoading] = useState(false);
  // Free-text number of days; null = unlimited. Admin types any value (1 day,
  // 42 days, 800 days — whatever). Previous fixed presets were replaced per
  // owner's request ('instead of week/month/year, let me type how many days').
  const [grantProDays, setGrantProDays] = useState<number | null>(30);
  const [grantProPlan, setGrantProPlan] = useState<"pro" | "pro-plus">("pro");
  const [grantProLoading, setGrantProLoading] = useState(false);

  const [loginAttempted, setLoginAttempted] = useState(false);

  // Top-level tab in the super-admin workspace. Persisted across reloads so
  // a refresh during analytics work doesn't bounce back to "עסקים".
  const [activeTab, setActiveTab] = useState<string>(() => {
    try { return localStorage.getItem("kavati_admin_tab") ?? "businesses"; }
    catch { return "businesses"; }
  });
  useEffect(() => {
    try { localStorage.setItem("kavati_admin_tab", activeTab); } catch {}
  }, [activeTab]);

  const { data: businesses, isLoading, isError } = useSuperAdminListBusinesses(
    { adminPassword: password },
    { query: { enabled: loginAttempted, retry: false } }
  );

  useEffect(() => {
    if (loginAttempted && !isLoading && businesses && !isAuthenticated) {
      setIsAuthenticated(true);
      // Persist the admin username for next visit when the owner checked
      // "זכור אותי". Password is NEVER persisted — only the handle.
      try {
        if (rememberMe) localStorage.setItem("kavati_admin_last_username", username.trim());
        else            localStorage.removeItem("kavati_admin_last_username");
      } catch {}
    }
    if (loginAttempted && isError && !isAuthenticated) {
      setLoginAttempted(false);
      toast({ title: "סיסמה שגויה", variant: "destructive" });
    }
  }, [loginAttempted, isLoading, businesses, isAuthenticated, isError, toast, rememberMe, username]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    if (username.trim().toLowerCase() !== "admin") {
      toast({ title: "שם משתמש שגוי", variant: "destructive" });
      return;
    }
    setLoginAttempted(true);
  };

  const createMutation = useSuperAdminCreateBusiness();
  const deleteMutation = useSuperAdminDeleteBusiness();
  const updateMutation = useSuperAdminUpdateBusiness();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getSuperAdminListBusinessesQueryKey({ adminPassword: password }) });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const createData: any = {
      name: newBusiness.name,
      slug: newBusiness.slug,
      ownerName: newBusiness.ownerName,
      email: newBusiness.email,
      password: newBusiness.password,
      phone: newBusiness.phone || undefined,
      subscriptionPlan: newBusiness.subscriptionPlan,
      address: newBusiness.address || undefined,
      websiteUrl: newBusiness.websiteUrl || undefined,
      instagramUrl: newBusiness.instagramHandle ? `https://www.instagram.com/${newBusiness.instagramHandle.replace(/^@/, "")}` : undefined,
    };
    createMutation.mutate({ params: { adminPassword: password }, data: createData }, {
      onSuccess: () => {
        toast({ title: "עסק נוצר בהצלחה" });
        setIsDialogOpen(false);
        setNewBusiness({ name: "", slug: "", ownerName: "", email: "", password: "", phone: "", subscriptionPlan: "free", address: "", websiteUrl: "", instagramHandle: "" });
        invalidate();
      },
      onError: () => toast({ title: "שגיאה ביצירת עסק", variant: "destructive" }),
    });
  };

  const handleToggleActive = (id: number, isActive: boolean) => {
    updateMutation.mutate({ id, params: { adminPassword: password }, data: { isActive: !isActive } }, {
      onSuccess: () => { toast({ title: !isActive ? "עסק הופעל" : "עסק הושהה" }); invalidate(); },
      onError: (err: any) => toast({ title: "שגיאה בשינוי סטטוס", description: err?.response?.data?.message ?? err?.message ?? "נסה שוב", variant: "destructive" }),
    });
  };

  const handleChangePlan = (id: number, plan: string) => {
    // All paid tiers (pro, pro-plus) share the "unlimited" caps. Free is the
    // only tier that keeps the 3-service / 20-appointment limits.
    const isPaid = plan === "pro" || plan === "pro-plus";
    const maxServices = isPaid ? 999 : 3;
    const maxAppts = isPaid ? 9999 : 20;
    updateMutation.mutate({ id, params: { adminPassword: password }, data: { subscriptionPlan: plan as any, maxServicesAllowed: maxServices, maxAppointmentsPerMonth: maxAppts } }, {
      onSuccess: () => { toast({ title: "מנוי עודכן" }); invalidate(); },
      onError: (err: any) => toast({ title: "שגיאה בעדכון מנוי", description: err?.response?.data?.message ?? err?.message ?? "נסה שוב", variant: "destructive" }),
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("האם אתה בטוח שברצונך למחוק עסק זה? הפעולה בלתי הפיכה!")) {
      deleteMutation.mutate({ id, params: { adminPassword: password } }, {
        onSuccess: () => { toast({ title: "עסק נמחק" }); invalidate(); },
        onError: () => toast({ title: "שגיאה במחיקה", variant: "destructive" }),
      });
    }
  };

  const generatePassword = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let p = "";
    for (let i = 0; i < 10; i++) p += chars[Math.floor(Math.random() * chars.length)];
    setNewBusiness(prev => ({ ...prev, password: p }));
  };

  const generateEditPassword = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let p = "";
    for (let i = 0; i < 10; i++) p += chars[Math.floor(Math.random() * chars.length)];
    setEditForm(prev => ({ ...prev, password: p }));
  };

  const openEditDialog = (business: AdminBusinessSummary) => {
    setEditDialogBusiness(business);
    setEditForm({
      name: business.name,
      slug: business.slug,
      username: (business as any).username ?? "",
      ownerName: business.ownerName,
      email: business.email,
      password: "",
      phone: business.phone ?? "",
      address: (business as any).address ?? "",
      city: (business as any).city ?? "",
      websiteUrl: (business as any).websiteUrl ?? "",
      instagramHandle: ((business as any).instagramUrl ?? "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, ""),
      businessDescription: (business as any).businessDescription ?? "",
      subscriptionPlan: business.subscriptionPlan ?? "free",
    });
    setShowEditPassword(false);
  };

  const handleEditSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDialogBusiness) return;

    const data: AdminUpdateBusinessBody = {};
    if (editForm.name !== editDialogBusiness.name) data.name = editForm.name;
    if (editForm.slug !== editDialogBusiness.slug) data.slug = editForm.slug;
    if (editForm.username !== ((editDialogBusiness as any).username ?? "")) (data as any).username = editForm.username || null;
    if (editForm.ownerName !== editDialogBusiness.ownerName) data.ownerName = editForm.ownerName;
    if (editForm.email !== editDialogBusiness.email) data.email = editForm.email;
    if (editForm.password) data.password = editForm.password;
    if (editForm.phone !== (editDialogBusiness.phone ?? "")) data.phone = editForm.phone || "";
    (data as any).address = editForm.address || null;
    (data as any).city = editForm.city || null;
    (data as any).websiteUrl = editForm.websiteUrl || null;
    (data as any).instagramUrl = editForm.instagramHandle ? `https://www.instagram.com/${editForm.instagramHandle.replace(/^@/, "")}` : null;
    (data as any).businessDescription = editForm.businessDescription || null;
    if (editForm.subscriptionPlan !== editDialogBusiness.subscriptionPlan) {
      data.subscriptionPlan = editForm.subscriptionPlan as any;
      // Both paid tiers (pro, pro-plus/עסקי) share unlimited caps.
      const isPaid = editForm.subscriptionPlan === "pro" || editForm.subscriptionPlan === "pro-plus";
      data.maxServicesAllowed = isPaid ? 999 : 3;
      data.maxAppointmentsPerMonth = isPaid ? 9999 : 20;
    }

    if (Object.keys(data).length === 0) {
      toast({ title: "לא בוצעו שינויים" });
      setEditDialogBusiness(null);
      return;
    }

    updateMutation.mutate({ id: editDialogBusiness.id, params: { adminPassword: password }, data }, {
      onSuccess: () => {
        toast({ title: "העסק עודכן בהצלחה" });
        setEditDialogBusiness(null);
        invalidate();
      },
      onError: () => toast({ title: "שגיאה בעדכון העסק", variant: "destructive" }),
    });
  };

  const handleGrantPro = async () => {
    if (!grantProBusiness) return;
    setGrantProLoading(true);
    try {
      const res = await fetch(`/api/super-admin/businesses/${grantProBusiness.id}/grant-pro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminPassword: password,
          durationDays: grantProDays,
          targetPlan: grantProPlan,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "שגיאה");
      const planLabel = grantProPlan === "pro-plus" ? "עסקי" : "פרו";
      toast({ title: `מנוי ${planLabel} הוענק בהצלחה!`, description: grantProDays ? `עד ${new Date(data.renewDate).toLocaleDateString("he-IL")}` : "ללא הגבלת זמן" });
      setGrantProBusiness(null);
      invalidate();
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setGrantProLoading(false);
    }
  };

  const handleSmsTopup = async () => {
    if (!smsTopupBusiness || !smsTopupAmount || smsTopupAmount <= 0) return;
    setSmsTopupLoading(true);
    try {
      const res = await fetch(`/api/super-admin/businesses/${smsTopupBusiness.id}/add-sms-credits?adminPassword=${encodeURIComponent(password)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: smsTopupAmount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "שגיאה");
      toast({
        title: `נוספו ${data.added} SMS ל-${smsTopupBusiness.name}`,
        description: `יתרה: ${data.previousExtra} → ${data.newExtra}`,
      });
      setSmsTopupBusiness(null);
      setSmsTopupAmount(100);
      invalidate();
    } catch (err: any) {
      toast({ title: "שגיאה בטעינת SMS", description: err.message, variant: "destructive" });
    } finally {
      setSmsTopupLoading(false);
    }
  };

  const handleRevokePro = async (biz: AdminBusinessSummary) => {
    try {
      const res = await fetch(`/api/super-admin/businesses/${biz.id}/revoke-pro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminPassword: password }),
      });
      if (!res.ok) throw new Error("שגיאה");
      toast({ title: "המנוי הוסר" });
      invalidate();
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
  };

  const handleCancelSubscription = async (biz: AdminBusinessSummary) => {
    if (!confirm(`לבטל את המנוי של ${biz.name}? הגישה תישמר עד תאריך החידוש.`)) return;
    try {
      const res = await fetch(`/api/super-admin/businesses/${biz.id}/cancel-subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminPassword: password }),
      });
      if (!res.ok) throw new Error("שגיאה");
      toast({ title: "המנוי בוטל — הגישה תפוג בתאריך החידוש" });
      invalidate();
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col bg-muted/30" dir="rtl">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md shadow-xl">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Shield className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-2xl">פאנל מנהל ראשי</CardTitle>
              <CardDescription>גישה מוגבלת למנהלי המערכת בלבד</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Unique name= on each input keeps this credential set
                  separate in the browser's password manager — so it
                  WILL offer to save/autofill the admin password, without
                  mixing it with the business-owner or client-portal
                  credentials the same browser also remembers. */}
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label>שם משתמש</Label>
                  <Input
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    dir="ltr"
                    placeholder="admin"
                    name="kavati-admin-username"
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-2">
                  <Label>סיסמת מנהל</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    dir="ltr"
                    placeholder="••••••••"
                    name="kavati-admin-password"
                    autoComplete="current-password"
                  />
                </div>
                <div className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    id="admin-remember-me"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                  />
                  <label htmlFor="admin-remember-me" className="text-sm text-muted-foreground cursor-pointer select-none">
                    זכור אותי במכשיר זה
                  </label>
                </div>
                <Button type="submit" className="w-full h-11">כניסה</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const bizList = Array.isArray(businesses) ? businesses : [];
  const activeCount = bizList.filter(b => b.isActive).length;
  const totalCount = bizList.length;

  return (
    <div className="min-h-screen bg-muted/20 flex flex-col" dir="rtl">
      <Navbar />
      <div className="flex-1 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Shield className="w-7 h-7 text-primary" /> פאנל מנהל ראשי
            </h1>
            <p className="text-muted-foreground mt-1">{activeCount} עסקים פעילים מתוך {totalCount}</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> הוסף עסק חדש</Button>
            </DialogTrigger>
            <DialogContent dir="rtl" className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>יצירת עסק חדש</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>שם העסק *</Label>
                  <Input required value={newBusiness.name} onChange={e => setNewBusiness(p => ({ ...p, name: e.target.value }))} placeholder="מספרת יוסי" />
                </div>
                <div className="space-y-2">
                  <Label>כתובת URL (Slug) *</Label>
                  <Input required value={newBusiness.slug} onChange={e => setNewBusiness(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))} dir="ltr" placeholder="yosi-barber" />
                  {newBusiness.slug && <p className="text-xs text-muted-foreground" dir="ltr">/book/{newBusiness.slug}</p>}
                </div>
                <div className="space-y-2">
                  <Label>שם הבעלים *</Label>
                  <Input required value={newBusiness.ownerName} onChange={e => setNewBusiness(p => ({ ...p, ownerName: e.target.value }))} placeholder="יוסי כהן" />
                </div>
                <div className="space-y-2">
                  <Label>אימייל *</Label>
                  <Input required type="email" value={newBusiness.email} onChange={e => setNewBusiness(p => ({ ...p, email: e.target.value }))} dir="ltr" placeholder="yosi@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>מספר טלפון</Label>
                  <Input type="tel" value={newBusiness.phone} onChange={e => setNewBusiness(p => ({ ...p, phone: e.target.value }))} dir="ltr" placeholder="" />
                </div>
                <div className="space-y-2">
                  <Label>מנוי</Label>
                  <div className="flex gap-2">
                    {PLANS.map(p => (
                      <button key={p.value} type="button" onClick={() => setNewBusiness(prev => ({ ...prev, subscriptionPlan: p.value }))}
                        className={`flex-1 py-2 text-sm rounded-lg border font-medium transition-all ${newBusiness.subscriptionPlan === p.value ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/40"}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>כתובת העסק</Label>
                  <Input value={newBusiness.address} onChange={e => setNewBusiness(p => ({ ...p, address: e.target.value }))} placeholder="רחוב הרצל 1, תל אביב" />
                </div>
                <div className="space-y-2">
                  <Label>אתר העסק</Label>
                  <Input dir="ltr" value={newBusiness.websiteUrl} onChange={e => setNewBusiness(p => ({ ...p, websiteUrl: e.target.value }))} placeholder="https://..." />
                </div>
                <div className="space-y-2">
                  <Label>אינסטגרם (שם משתמש)</Label>
                  <div className="flex items-center rounded-xl border bg-muted/40 overflow-hidden">
                    <span className="px-3 text-sm text-muted-foreground border-l bg-muted">@</span>
                    <input dir="ltr" className="flex-1 px-3 py-2 bg-transparent text-sm outline-none" placeholder="my_business"
                      value={newBusiness.instagramHandle} onChange={e => setNewBusiness(p => ({ ...p, instagramHandle: e.target.value.replace(/^@/, "") }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>סיסמה *</Label>
                  <div className="flex gap-2">
                    <Input required value={newBusiness.password} onChange={e => setNewBusiness(p => ({ ...p, password: e.target.value }))} dir="ltr" placeholder="סיסמה חזקה" className="flex-1" />
                    <Button type="button" variant="outline" onClick={generatePassword} className="shrink-0">צור</Button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "יוצר..." : "צור עסק"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl" className="w-full">
          <TabsList className="grid grid-cols-5 w-full h-auto p-1">
            <TabsTrigger value="overview" className="flex flex-col sm:flex-row gap-1.5 text-xs sm:text-sm py-2.5">
              <BarChart3 className="w-4 h-4" /> סקירה
            </TabsTrigger>
            <TabsTrigger value="businesses" className="flex flex-col sm:flex-row gap-1.5 text-xs sm:text-sm py-2.5">
              <Users className="w-4 h-4" /> עסקים
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex flex-col sm:flex-row gap-1.5 text-xs sm:text-sm py-2.5">
              <TrendingUp className="w-4 h-4" /> אנליטיקה
            </TabsTrigger>
            <TabsTrigger value="domains" className="flex flex-col sm:flex-row gap-1.5 text-xs sm:text-sm py-2.5">
              <Globe className="w-4 h-4" /> דומיינים
            </TabsTrigger>
            <TabsTrigger value="categories" className="flex flex-col sm:flex-row gap-1.5 text-xs sm:text-sm py-2.5">
              <FolderTree className="w-4 h-4" /> קטגוריות
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <OverviewKPIs adminPassword={password} />
          </TabsContent>

          <TabsContent value="businesses" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {isLoading ? (
                <div className="col-span-full p-12 text-center text-muted-foreground">טוען...</div>
              ) : bizList.length ? bizList.map(b => (
                <BusinessCard
                  key={b.id}
                  business={b}
                  onToggleActive={() => handleToggleActive(b.id, b.isActive)}
                  onChangePlan={(plan) => handleChangePlan(b.id, plan)}
                  onDelete={() => handleDelete(b.id)}
                  onEdit={() => openEditDialog(b)}
                  onGrantPro={() => { setGrantProBusiness(b); setGrantProDays(30); }}
                  onRevokePro={() => handleRevokePro(b)}
                  onCancelSubscription={() => handleCancelSubscription(b)}
                  onAddSmsCredits={() => { setSmsTopupBusiness(b); setSmsTopupAmount(100); }}
                  isPending={updateMutation.isPending || deleteMutation.isPending}
                />
              )) : (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  אין עסקים עדיין. הוסף את הראשון!
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="mt-6">
            <AnalyticsTable adminPassword={password} />
          </TabsContent>

          <TabsContent value="domains" className="mt-6">
            <DomainReviewPanel adminPassword={password} />
          </TabsContent>

          <TabsContent value="categories" className="mt-6">
            <CategoryManagementPanel adminPassword={password} />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!editDialogBusiness} onOpenChange={(open) => { if (!open) setEditDialogBusiness(null); }}>
        <DialogContent dir="rtl" className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>עריכת עסק — {editDialogBusiness?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSave} className="space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">פרטי חשבון</p>
            <div className="space-y-2">
              <Label>שם העסק</Label>
              <Input required value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>כתובת URL (Slug)</Label>
              <Input required value={editForm.slug} onChange={e => setEditForm(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))} dir="ltr" />
              {editForm.slug && <p className="text-xs text-muted-foreground" dir="ltr">/book/{editForm.slug}</p>}
            </div>
            <div className="space-y-2">
              <Label>שם משתמש לכניסה</Label>
              <Input value={editForm.username} onChange={e => setEditForm(p => ({ ...p, username: e.target.value.toLowerCase().replace(/\s+/g, "") }))} dir="ltr" placeholder="אופציונלי" />
            </div>
            <div className="space-y-2">
              <Label>שם הבעלים</Label>
              <Input required value={editForm.ownerName} onChange={e => setEditForm(p => ({ ...p, ownerName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>אימייל</Label>
              <Input required type="email" value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center justify-between">
                <span>מספר טלפון</span>
                {editForm.phone && (
                  <button
                    type="button"
                    onClick={() => setEditForm(p => ({ ...p, phone: "" }))}
                    className="text-xs text-destructive hover:underline"
                  >
                    מחק מספר
                  </button>
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  type="tel"
                  value={editForm.phone}
                  onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))}
                  dir="ltr"
                  placeholder=""
                  className="flex-1"
                />
                {editForm.phone && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setEditForm(p => ({ ...p, phone: "" }))}
                    className="shrink-0 text-destructive hover:bg-destructive/10"
                    title="מחק את המספר"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">השאר ריק כדי לנתק את מספר הטלפון מהחשבון.</p>
            </div>
            <div className="space-y-2">
              <Label>מנוי</Label>
              <div className="flex gap-2">
                {PLANS.map(p => (
                  <button key={p.value} type="button" onClick={() => setEditForm(prev => ({ ...prev, subscriptionPlan: p.value }))}
                    className={`flex-1 py-2 text-sm rounded-lg border font-medium transition-all ${editForm.subscriptionPlan === p.value ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/40"}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">פרופיל העסק</p>
            <div className="space-y-2">
              <Label>תיאור העסק</Label>
              <textarea value={editForm.businessDescription} onChange={e => setEditForm(p => ({ ...p, businessDescription: e.target.value }))}
                className="flex min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-ring"
                placeholder="כמה מילים על העסק..." />
            </div>
            <div className="space-y-2">
              <Label>כתובת העסק</Label>
              <Input value={editForm.address} onChange={e => setEditForm(p => ({ ...p, address: e.target.value }))} placeholder="רחוב הרצל 1, תל אביב" />
            </div>
            <div className="space-y-2">
              <Label>עיר (לספריית גלה עסקים)</Label>
              <Input value={editForm.city} onChange={e => setEditForm(p => ({ ...p, city: e.target.value }))} placeholder="תל אביב" />
            </div>
            <div className="space-y-2">
              <Label>אתר העסק</Label>
              <Input dir="ltr" value={editForm.websiteUrl} onChange={e => setEditForm(p => ({ ...p, websiteUrl: e.target.value }))} placeholder="https://..." />
            </div>
            <div className="space-y-2">
              <Label>אינסטגרם (שם משתמש)</Label>
              <div className="flex items-center rounded-xl border bg-muted/40 overflow-hidden">
                <span className="px-3 text-sm text-muted-foreground border-l bg-muted">@</span>
                <input dir="ltr" className="flex-1 px-3 py-2 bg-transparent text-sm outline-none" placeholder="my_business"
                  value={editForm.instagramHandle} onChange={e => setEditForm(p => ({ ...p, instagramHandle: e.target.value.replace(/^@/, "") }))} />
              </div>
              {editForm.instagramHandle && <p className="text-xs text-muted-foreground">instagram.com/{editForm.instagramHandle}</p>}
            </div>

            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">אבטחה</p>
            <div className="space-y-2">
              <Label>איפוס סיסמה</Label>
              <p className="text-xs text-muted-foreground">השאר ריק כדי לא לשנות</p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  {/* autoComplete='new-password' + an always-random name
                      stops Chrome / Safari from autofilling the admin's
                      OWN saved password into this field (which would
                      silently rewrite every edited business's password
                      on save — the owner reported seeing their personal
                      password 'Ofekiko132' prefilled on every edit). */}
                  <Input
                    value={editForm.password}
                    onChange={e => setEditForm(p => ({ ...p, password: e.target.value }))}
                    dir="ltr"
                    placeholder="סיסמה חדשה"
                    type={showEditPassword ? "text" : "password"}
                    className="pl-10"
                    autoComplete="new-password"
                    name={`admin-edit-pwd-${Math.random().toString(36).slice(2)}`}
                    data-lpignore="true"
                    data-1p-ignore="true"
                  />
                  <button type="button" onClick={() => setShowEditPassword(prev => !prev)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Button type="button" variant="outline" onClick={generateEditPassword} className="shrink-0 gap-1">
                  <RefreshCw className="w-3.5 h-3.5" /> צור
                </Button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "שומר..." : "שמור שינויים"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      </div>

      {/* Grant paid-subscription dialog — פרו or עסקי (pro-plus), with
          admin-typed duration in days (or unlimited). */}
      <Dialog open={!!grantProBusiness} onOpenChange={v => { if (!v) setGrantProBusiness(null); }}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>הענק מנוי — {grantProBusiness?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Plan picker — two pills. Both tiers share unlimited
                services/appointments; only the SMS quota + plan label
                differ (pro=100, pro-plus=300). */}
            <div className="space-y-2">
              <Label>סוג מנוי</Label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button"
                  onClick={() => setGrantProPlan("pro")}
                  className={`py-2 text-sm rounded-lg border font-medium transition-all ${grantProPlan === "pro" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-border hover:border-emerald-400"}`}>
                  פרו
                </button>
                <button type="button"
                  onClick={() => setGrantProPlan("pro-plus")}
                  className={`py-2 text-sm rounded-lg border font-medium transition-all ${grantProPlan === "pro-plus" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-border hover:border-blue-400"}`}>
                  עסקי
                </button>
              </div>
            </div>

            {/* Free-text duration. Admin types ANY integer for days; the
                'ללא הגבלת זמן' toggle below swaps to unlimited and disables
                the number field visually. */}
            <div className="space-y-2">
              <Label>משך המנוי (בימים)</Label>
              <Input
                type="number"
                min={1}
                value={grantProDays ?? ""}
                onChange={e => {
                  const v = e.target.value.trim();
                  if (!v) { setGrantProDays(null); return; }
                  const n = Math.max(1, Math.floor(Number(v) || 1));
                  setGrantProDays(n);
                }}
                disabled={grantProDays === null}
                placeholder="למשל: 30"
                className="text-center"
              />
              <button type="button"
                onClick={() => setGrantProDays(d => d === null ? 30 : null)}
                className={`w-full py-2 text-sm rounded-lg border font-medium transition-all ${grantProDays === null ? "border-blue-500 bg-blue-50 text-blue-600" : "border-border hover:border-blue-300"}`}>
                {grantProDays === null ? "♾️ ללא הגבלת זמן (פעיל)" : "לחץ לבחירת ללא הגבלת זמן"}
              </button>
            </div>

            <Button className="w-full bg-blue-500 hover:bg-blue-600 text-white"
              onClick={handleGrantPro} disabled={grantProLoading || (grantProDays !== null && grantProDays < 1)}>
              {grantProLoading ? "מעניק..." : `הענק מנוי ${grantProPlan === "pro-plus" ? "עסקי" : "פרו"}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* SMS credit top-up dialog. Adds N credits to sms_extra_balance.
          Used for manual refunds when Tranzila webhook gets rejected,
          or to comp SMS to VIP customers. */}
      <Dialog open={!!smsTopupBusiness} onOpenChange={v => { if (!v) setSmsTopupBusiness(null); }}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>טעינת הודעות SMS — {smsTopupBusiness?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>כמות הודעות להוספה</Label>
              <Input
                type="number"
                min={1}
                max={5000}
                value={smsTopupAmount}
                onChange={(e) => setSmsTopupAmount(Math.max(1, Math.min(5000, Number(e.target.value) || 0)))}
                placeholder="100"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                ההודעות יצטברו ליתרה הנוספת (sms_extra_balance). אלה משמשות אחרי שהמכסה החודשית נגמרת ולא פגות תוקף.
              </p>
            </div>
            {/* Quick-pick shortcuts — match the current SMS pack sizes. */}
            <div className="flex gap-2 flex-wrap">
              {[50, 100, 250, 500, 1000].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSmsTopupAmount(n)}
                  className={`px-3 py-1 rounded-md text-xs border transition-colors ${smsTopupAmount === n ? "bg-emerald-500 text-white border-emerald-600" : "bg-white text-foreground border-border hover:bg-emerald-50"}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleSmsTopup} disabled={smsTopupLoading || smsTopupAmount <= 0}>
              {smsTopupLoading ? "טוען..." : `הוסף ${smsTopupAmount} SMS`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface BusinessCardProps {
  business: AdminBusinessSummary & {
    subscriptionRenewDate?: string | null;
    subscriptionCancelledAt?: string | null;
    hasToken?: boolean;
  };
  onToggleActive: () => void;
  onChangePlan: (plan: string) => void;
  onDelete: () => void;
  onEdit: () => void;
  onGrantPro: () => void;
  onRevokePro: () => void;
  onCancelSubscription: () => void;
  onAddSmsCredits: () => void;
  isPending: boolean;
}

function BusinessCard({ business, onToggleActive, onChangePlan, onDelete, onEdit, onGrantPro, onRevokePro, onCancelSubscription, onAddSmsCredits, isPending }: BusinessCardProps) {
  const plan = PLANS.find(p => p.value === business.subscriptionPlan) ?? PLANS[0];
  const renewDate = business.subscriptionRenewDate ? new Date(business.subscriptionRenewDate) : null;
  const isCancelled = !!business.subscriptionCancelledAt;

  return (
    <Card
      className={`transition-all cursor-pointer ${!business.isActive ? "opacity-60 border-dashed" : "hover:border-primary/30 hover:shadow-md"}`}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button") || target.closest("input") || target.closest("a") || target.closest("[role='switch']")) return;
        onEdit();
      }}
    >

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-lg truncate">{business.name}</div>
            <div className="text-sm text-muted-foreground">{business.ownerName}</div>
            <div className="text-xs text-muted-foreground" dir="ltr">{business.email}</div>
            {business.phone && <div className="text-xs text-muted-foreground" dir="ltr">{business.phone}</div>}
          </div>
          <div className="flex flex-col items-center gap-1 shrink-0">
            <Switch checked={business.isActive} onCheckedChange={onToggleActive} disabled={isPending} />
            <span className={`text-[10px] font-medium ${business.isActive ? "text-green-600" : "text-red-500"}`}>
              {business.isActive ? "פעיל" : "מושהה"}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={plan.color + " border-0"}>{plan.label}</Badge>
          <Badge variant="outline" className="text-xs font-mono" dir="ltr">/{business.slug}</Badge>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">מנוי</Label>
          <div className="flex gap-2">
            {PLANS.map(p => (
              <button key={p.value} onClick={() => onChangePlan(p.value)}
                className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-all ${business.subscriptionPlan === p.value ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/40"}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <a href={`/book/${business.slug}`} target="_blank" rel="noopener noreferrer" className="flex-1">
            <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs">
              <ExternalLink className="w-3.5 h-3.5" /> עמוד הזמנות
            </Button>
          </a>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs px-2" onClick={onEdit}>
            <Edit className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 px-2" onClick={onDelete} disabled={isPending}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>

        {/* Subscription details */}
        {(business.subscriptionPlan === "pro" || business.subscriptionPlan === "pro-plus") && (
          <div className="text-xs text-muted-foreground space-y-0.5 border rounded-lg px-3 py-2 bg-blue-50/50">
            {renewDate && (
              <div>חידוש: <span className="font-medium text-foreground">{renewDate.toLocaleDateString("he-IL")}</span></div>
            )}
            {isCancelled && (
              <div className="text-orange-600 font-medium">בוטל — פוקע בתאריך החידוש</div>
            )}
            {business.hasToken
              ? <div className="text-green-700">טוקן כרטיס שמור ✓</div>
              : <div className="text-orange-600">אין טוקן (הוענק ידנית)</div>
            }
          </div>
        )}

        {/* Grant/Revoke Pro */}
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline"
            className="flex-1 text-xs border-blue-300 text-blue-600 hover:bg-blue-50"
            onClick={onGrantPro}>
            👑 הענק פרו
          </Button>
          {(business.subscriptionPlan === "pro" || business.subscriptionPlan === "pro-plus") && !isCancelled && (
            <Button size="sm" variant="ghost" className="text-xs text-orange-600 hover:bg-orange-50"
              onClick={onCancelSubscription}>
              בטל מנוי
            </Button>
          )}
          {(business.subscriptionPlan === "pro" || business.subscriptionPlan === "pro-plus") && (
            <Button size="sm" variant="ghost" className="text-xs text-muted-foreground hover:text-red-600 hover:bg-red-50"
              onClick={onRevokePro}>
              הסר פרו
            </Button>
          )}
        </div>
        {/* SMS top-up — always visible (useful both to comp credits to
            paid customers and to fix the "Tranzila webhook rejected,
            pack never landed" edge case). */}
        <Button size="sm" variant="outline" className="w-full text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 mt-1"
          onClick={onAddSmsCredits}>
          📨 הוסף הודעות SMS
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Domain review panel ───────────────────────────────────────────────────
// Lists every business that set a custom_domain and hasn't been verified yet.
// The super admin copies the hostname, adds it to Railway's custom-domains
// list (Settings → Domains → Add), waits for SSL to provision, then clicks
// "אישור" here to flip the flag on.

interface DomainRow {
  id:                    number;
  name:                  string;
  slug:                  string;
  customDomain:          string;
  customDomainVerified:  boolean;
  subscriptionPlan:      string;
}

function DomainReviewPanel({ adminPassword }: { adminPassword: string }) {
  const [rows, setRows]           = useState<DomainRow[]>([]);
  const [loading, setLoading]     = useState(false);
  const [open, setOpen]           = useState(true);
  const { toast } = useToast();

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/super-admin/domains?adminPassword=${encodeURIComponent(adminPassword)}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data)) setRows(data);
      else setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [adminPassword]);

  const setVerified = async (id: number, verified: boolean) => {
    const endpoint = verified ? "verify" : "unverify";
    try {
      const res = await fetch(`/api/super-admin/domains/${id}/${endpoint}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ adminPassword }),
      });
      if (!res.ok) throw new Error("failed");
      toast({ title: verified ? "הדומיין אושר" : "האישור בוטל" });
      refresh();
    } catch {
      toast({ title: "שגיאה", variant: "destructive" });
    }
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast({ title: "הועתק" }); } catch {}
  };

  const pending  = rows.filter(r => !r.customDomainVerified);
  const verified = rows.filter(r =>  r.customDomainVerified);

  return (
    <Card className="mb-6 border-blue-200">
      <CardHeader className="cursor-pointer" onClick={() => setOpen(!open)}>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            🌐 דומיינים מותאמים אישית
            {pending.length > 0 && (
              <Badge className="bg-amber-100 text-amber-700 border-amber-200">{pending.length} ממתינים</Badge>
            )}
          </span>
          <span className="text-xs text-muted-foreground">{open ? "▲" : "▼"}</span>
        </CardTitle>
        {open && (
          <CardDescription className="pt-2">
            עסקים שהוסיפו דומיין משלהם. <b>התהליך אוטומטי לגמרי</b> — המערכת רושמת את הדומיין ב-Railway ברגע שהלקוח שומר, ה-cron בודק כל 2 דקות, וברגע שה-DNS + SSL מוכנים (2-10 דקות אחרי שהלקוח הוסיף CNAME) הדומיין עובר אוטומטית לסטטוס "פעיל". <b>אין צורך בפעולה ידנית.</b> הכפתורים "אשר / בטל" כאן קיימים רק למקרי חירום (override ידני).
          </CardDescription>
        )}
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          {loading && <div className="text-sm text-muted-foreground text-center py-4">טוען...</div>}
          {!loading && pending.length === 0 && verified.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4">אין דומיינים מותאמים כרגע.</div>
          )}

          {pending.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-amber-700 mb-2">ממתינים לאישור</div>
              <div className="space-y-2">
                {pending.map(r => (
                  <div key={r.id} className="flex items-center gap-3 border border-amber-200 bg-amber-50/50 rounded-lg p-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-sm font-semibold" dir="ltr">{r.customDomain}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.name} (/{r.slug}) · {r.subscriptionPlan === "pro-plus" ? "עסקי" : r.subscriptionPlan === "pro" ? "פרו" : "חינמי"}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => copy(r.customDomain)} className="text-xs">
                      📋 העתק
                    </Button>
                    <Button size="sm" onClick={() => setVerified(r.id, true)} className="text-xs bg-green-600 hover:bg-green-700">
                      ✓ אשר
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {verified.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-green-700 mb-2">פעילים</div>
              <div className="space-y-2">
                {verified.map(r => (
                  <div key={r.id} className="flex items-center gap-3 border bg-muted/30 rounded-lg p-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-sm" dir="ltr">{r.customDomain}</div>
                      <div className="text-xs text-muted-foreground">{r.name} (/{r.slug})</div>
                    </div>
                    <a href={`https://${r.customDomain}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                      <ExternalLink className="inline w-3.5 h-3.5" />
                    </a>
                    <Button size="sm" variant="ghost" onClick={() => setVerified(r.id, false)} className="text-xs text-muted-foreground">
                      בטל אישור
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Category management panel ─────────────────────────────────────────────
// Lists every business_categories row and lets the super admin add, rename,
// delete, and reorder them. The catalog feeds the Register page's "סוג עסק"
// picker, so changes propagate to the next registration automatically.

interface CategoryRow {
  id:         number;
  name:       string;
  sort_order: number;
}

function CategoryManagementPanel({ adminPassword }: { adminPassword: string }) {
  const [rows, setRows]       = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState(false);
  const [newName, setNewName] = useState("");
  const [editId, setEditId]   = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const { toast } = useToast();

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/super-admin/categories`, {
        headers: { "X-Admin-Password": adminPassword },
      });
      const data = await res.json();
      setRows(res.ok && Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, adminPassword]);

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    const res = await fetch(`/api/super-admin/categories`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Password": adminPassword },
      body:    JSON.stringify({ name }),
    });
    const data = await res.json();
    if (res.ok) {
      setNewName("");
      toast({ title: `"${data.name}" נוסף` });
      refresh();
    } else {
      toast({ title: "שגיאה", description: data.message ?? "לא ניתן להוסיף", variant: "destructive" });
    }
  };

  const rename = async (id: number, name: string) => {
    if (!name.trim()) return;
    const res = await fetch(`/api/super-admin/categories/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", "X-Admin-Password": adminPassword },
      body:    JSON.stringify({ name: name.trim() }),
    });
    if (res.ok) {
      setEditId(null);
      toast({ title: "נשמר" });
      refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      toast({ title: "שגיאה", description: data.message ?? "", variant: "destructive" });
    }
  };

  const remove = async (id: number, name: string) => {
    if (!confirm(`למחוק את "${name}"?`)) return;
    const res = await fetch(`/api/super-admin/categories/${id}`, {
      method:  "DELETE",
      headers: { "X-Admin-Password": adminPassword },
    });
    if (res.ok) {
      toast({ title: "נמחק" });
      refresh();
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
      >
        <CardTitle className="flex items-center gap-2">
          <span>📁</span>
          סוגי עסקים
          <Badge variant="outline" className="text-xs">{rows.length}</Badge>
          <span className="mr-auto text-xs text-muted-foreground">
            {open ? "סגור ▲" : "פתח ▼"}
          </span>
        </CardTitle>
        <CardDescription>עריכת הרשימה שמופיעה בטופס ההרשמה כשבעל עסק בוחר "סוג עסק".</CardDescription>
      </CardHeader>
      {open && (
        <CardContent>
          {/* Add form */}
          <div className="flex gap-2 mb-4">
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
              placeholder="הוסף סוג עסק חדש..."
              className="flex-1"
            />
            <Button onClick={add} disabled={!newName.trim()}>הוסף</Button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-4">טוען...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">אין עדיין קטגוריות — הוסף את הראשונה.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
              {rows.map(r => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 px-3 py-2 border rounded-lg bg-muted/20"
                >
                  {editId === r.id ? (
                    <>
                      <Input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") { e.preventDefault(); rename(r.id, editName); }
                          if (e.key === "Escape") { setEditId(null); }
                        }}
                        autoFocus
                        className="flex-1 h-8"
                      />
                      <Button size="sm" variant="ghost" onClick={() => rename(r.id, editName)} className="h-8 px-2">✓</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditId(null)} className="h-8 px-2">✕</Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm truncate">{r.name}</span>
                      <button
                        onClick={() => { setEditId(r.id); setEditName(r.name); }}
                        className="text-xs text-muted-foreground hover:text-primary"
                        title="ערוך"
                      >ערוך</button>
                      <button
                        onClick={() => remove(r.id, r.name)}
                        className="text-xs text-destructive hover:underline"
                        title="מחק"
                      >מחק</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Analytics types & shared fetcher ──────────────────────────────────────

interface AnalyticsAggregate {
  totalBusinesses: number;
  activeBusinesses: number;
  paidBusinesses: number;
  freeBusinesses: number;
  newThisMonth: number;
  churnedLast30: number;
  churnRatePct: number;
  mrrIls: number;
  arrIls: number;
  arpuIls: number;
  forecast30Ils: number;
  forecast60Ils: number;
  forecast90Ils: number;
  totalWhatsappCostMonthIls: number;
  totalPackRevenueIls: number;
  totalAppointmentsAllTime: number;
  totalAppointmentsLast30: number;
  totalReviews: number;
  grossMarginIls: number;
}

interface BusinessAnalytics {
  id: number;
  name: string;
  slug: string;
  ownerName: string;
  email: string;
  phone: string | null;
  plan: string;
  isActive: boolean;
  signedUpAt: string;
  monthsActive: number;
  cancelledAt: string | null;
  renewDate: string | null;
  monthlyFeeIls: number;
  ltvHistoricIls: number;
  ltvProjectedIls: number;
  packRevenueIls: number;
  appointmentsAllTime: number;
  appointmentsLast30: number;
  lastAppointmentAt: string | null;
  reviewsCount: number;
  avgRating: number | null;
  whatsappSentToday: number;
  whatsappEstMonthlyCostIls: number;
  smsUsedThisPeriod: number;
  smsExtraBalance: number;
  marginIls: number;
  riskLevel: "low" | "medium" | "high";
}

interface AnalyticsResponse {
  aggregate: AnalyticsAggregate;
  loyaltyBuckets: Array<{ bucket: string; total: number; paid: number }>;
  perBusiness: BusinessAnalytics[];
}

function useAnalytics(adminPassword: string) {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/super-admin/analytics", { headers: { "X-Admin-Password": adminPassword } })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => { if (!cancelled) { setData(d); setError(null); } })
      .catch(e => { if (!cancelled) setError(e?.message ?? "שגיאה"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [adminPassword]);
  return { data, loading, error };
}

function ils(n: number): string {
  return n.toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
}

// ─── Overview KPIs (top-of-page dashboard) ─────────────────────────────────

function OverviewKPIs({ adminPassword }: { adminPassword: string }) {
  const { data, loading, error } = useAnalytics(adminPassword);

  if (loading) return <div className="p-12 text-center text-muted-foreground">טוען נתונים...</div>;
  if (error || !data) return <div className="p-12 text-center text-destructive">שגיאה בטעינת אנליטיקה: {error}</div>;
  const a = data.aggregate;

  type KpiTone = "default" | "success" | "warning" | "danger";
  const Kpi = ({ icon, label, value, hint, tone = "default" }: {
    icon: React.ReactNode; label: string; value: string; hint?: string; tone?: KpiTone;
  }) => {
    const toneClass = {
      default: "bg-card",
      success: "bg-emerald-50 border-emerald-200",
      warning: "bg-amber-50 border-amber-200",
      danger:  "bg-rose-50 border-rose-200",
    }[tone];
    return (
      <Card className={toneClass}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            {icon} {label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{value}</div>
          {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Headline KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<DollarSign className="w-4 h-4" />} label="MRR" value={ils(a.mrrIls)} hint={`ARR ${ils(a.arrIls)}`} tone="success" />
        <Kpi icon={<Users className="w-4 h-4" />} label="עסקים בתשלום" value={String(a.paidBusinesses)} hint={`מתוך ${a.totalBusinesses} סה"כ`} />
        <Kpi icon={<TrendingUp className="w-4 h-4" />} label="ARPU" value={ils(a.arpuIls)} hint="הכנסה ממוצעת ללקוח" />
        <Kpi icon={<TrendingDown className="w-4 h-4" />} label="Churn (30 יום)" value={`${a.churnRatePct}%`}
          hint={`${a.churnedLast30} ביטולים`}
          tone={a.churnRatePct > 5 ? "danger" : a.churnRatePct > 2 ? "warning" : "success"} />
      </div>

      {/* Forecast */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">תחזית MRR (בהנחה ש-churn נשאר {a.churnRatePct}%)</CardTitle>
          <CardDescription>בלי לקוחות חדשים — רצפה פסימית.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-4 rounded-lg border">
              <div className="text-xs text-muted-foreground">בעוד 30 יום</div>
              <div className="text-xl font-bold mt-1">{ils(a.forecast30Ils)}</div>
            </div>
            <div className="text-center p-4 rounded-lg border">
              <div className="text-xs text-muted-foreground">בעוד 60 יום</div>
              <div className="text-xl font-bold mt-1">{ils(a.forecast60Ils)}</div>
            </div>
            <div className="text-center p-4 rounded-lg border">
              <div className="text-xs text-muted-foreground">בעוד 90 יום</div>
              <div className="text-xl font-bold mt-1">{ils(a.forecast90Ils)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity & costs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<Plus className="w-4 h-4" />} label="חדשים החודש" value={String(a.newThisMonth)} />
        <Kpi icon={<TrendingUp className="w-4 h-4" />} label="תורים (30 יום)" value={a.totalAppointmentsLast30.toLocaleString("he-IL")}
          hint={`${a.totalAppointmentsAllTime.toLocaleString("he-IL")} סה"כ`} />
        <Kpi icon={<DollarSign className="w-4 h-4" />} label="עלות WhatsApp צפויה" value={ils(a.totalWhatsappCostMonthIls)}
          hint="הערכת חודש נוכחי" tone={a.totalWhatsappCostMonthIls > a.mrrIls * 0.3 ? "warning" : "default"} />
        <Kpi icon={<DollarSign className="w-4 h-4" />} label="רווח גולמי משוער" value={ils(a.grossMarginIls)}
          hint="MRR פחות עלות הודעות" tone={a.grossMarginIls > 0 ? "success" : "danger"} />
      </div>

      {/* Loyalty buckets */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">נאמנות — לפי ותק במערכת</CardTitle>
          <CardDescription>כמה לקוחות נשארו איתנו בכל טווח גיל מנוי.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {data.loyaltyBuckets.map(b => (
              <div key={b.bucket} className="p-3 rounded-lg border text-center">
                <div className="text-xs text-muted-foreground">{b.bucket}</div>
                <div className="text-2xl font-bold mt-1">{b.total}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{b.paid} בתשלום</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Analytics table (per-business breakdown + CSV export) ─────────────────

function AnalyticsTable({ adminPassword }: { adminPassword: string }) {
  const { data, loading, error } = useAnalytics(adminPassword);
  const [sortBy, setSortBy] = useState<"ltv" | "appts" | "risk" | "name" | "joined">("ltv");
  const [filterPlan, setFilterPlan] = useState<string>("all");

  if (loading) return <div className="p-12 text-center text-muted-foreground">טוען...</div>;
  if (error || !data) return <div className="p-12 text-center text-destructive">שגיאה: {error}</div>;

  const filtered = filterPlan === "all"
    ? data.perBusiness
    : data.perBusiness.filter(b => b.plan === filterPlan);

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "ltv")    return b.ltvHistoricIls - a.ltvHistoricIls;
    if (sortBy === "appts")  return b.appointmentsLast30 - a.appointmentsLast30;
    if (sortBy === "name")   return a.name.localeCompare(b.name, "he");
    if (sortBy === "joined") return new Date(a.signedUpAt).getTime() - new Date(b.signedUpAt).getTime();
    if (sortBy === "risk") {
      const w = { high: 3, medium: 2, low: 1 };
      return w[b.riskLevel] - w[a.riskLevel];
    }
    return 0;
  });

  const downloadCsv = () => {
    // Open as full URL so the browser handles the file download via the
    // server's Content-Disposition header.
    const url = `/api/super-admin/analytics/export.csv`;
    fetch(url, { headers: { "X-Admin-Password": adminPassword } })
      .then(r => r.blob())
      .then(blob => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `kavati-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(link.href);
      });
  };

  const riskBadge = (r: BusinessAnalytics["riskLevel"]) => {
    const cls = r === "high" ? "bg-rose-100 text-rose-700 border-rose-200"
              : r === "medium" ? "bg-amber-100 text-amber-700 border-amber-200"
              : "bg-emerald-100 text-emerald-700 border-emerald-200";
    const label = r === "high" ? "סיכון גבוה" : r === "medium" ? "סיכון בינוני" : "תקין";
    return <Badge variant="outline" className={cls}>{label}</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <Label className="text-xs">מסלול:</Label>
          {(["all", "free", "pro", "pro-plus"] as const).map(p => (
            <Button key={p} size="sm" variant={filterPlan === p ? "default" : "outline"}
              onClick={() => setFilterPlan(p)}>
              {p === "all" ? "הכל" : p === "free" ? "חינמי" : p === "pro" ? "פרו" : "עסקי"}
            </Button>
          ))}
          <Label className="text-xs mr-3">מיון:</Label>
          {([
            ["ltv", "LTV"], ["appts", "תורים"], ["risk", "סיכון"], ["joined", "תאריך"], ["name", "שם"],
          ] as const).map(([v, label]) => (
            <Button key={v} size="sm" variant={sortBy === v ? "default" : "outline"}
              onClick={() => setSortBy(v)}>
              {label}
            </Button>
          ))}
        </div>
        <Button onClick={downloadCsv} className="gap-2">
          <FileDown className="w-4 h-4" /> ייצא CSV
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-right p-3 font-semibold">עסק</th>
              <th className="text-right p-3 font-semibold">מסלול</th>
              <th className="text-right p-3 font-semibold">חודשים</th>
              <th className="text-right p-3 font-semibold">LTV עד היום</th>
              <th className="text-right p-3 font-semibold">LTV צפוי</th>
              <th className="text-right p-3 font-semibold">תורים (30 יום)</th>
              <th className="text-right p-3 font-semibold">WA היום</th>
              <th className="text-right p-3 font-semibold">עלות WA חודש</th>
              <th className="text-right p-3 font-semibold">רווח גולמי</th>
              <th className="text-right p-3 font-semibold">סיכון</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(b => (
              <tr key={b.id} className="border-t hover:bg-muted/20">
                <td className="p-3">
                  <div className="font-medium">{b.name}</div>
                  <div className="text-xs text-muted-foreground">{b.ownerName} · /{b.slug}</div>
                </td>
                <td className="p-3">
                  <Badge variant="outline" className="text-xs">
                    {b.plan === "pro-plus" ? "עסקי" : b.plan === "pro" ? "פרו" : "חינמי"}
                  </Badge>
                </td>
                <td className="p-3 text-muted-foreground">{b.monthsActive}</td>
                <td className="p-3 font-semibold">{ils(b.ltvHistoricIls)}</td>
                <td className="p-3 text-muted-foreground">{ils(b.ltvProjectedIls)}</td>
                <td className="p-3">{b.appointmentsLast30}</td>
                <td className="p-3">{b.whatsappSentToday}</td>
                <td className="p-3 text-muted-foreground">{ils(b.whatsappEstMonthlyCostIls)}</td>
                <td className={`p-3 font-medium ${b.marginIls > 0 ? "text-emerald-700" : "text-rose-700"}`}>{ils(b.marginIls)}</td>
                <td className="p-3">{riskBadge(b.riskLevel)}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={10} className="p-12 text-center text-muted-foreground">אין עסקים בסינון הנוכחי</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* High-risk callout */}
      {sorted.filter(b => b.riskLevel === "high").length > 0 && (
        <Card className="border-rose-200 bg-rose-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-rose-700">
              <AlertTriangle className="w-4 h-4" /> {sorted.filter(b => b.riskLevel === "high").length} עסקים בסיכון גבוה
            </CardTitle>
            <CardDescription className="text-xs">
              לקוחות בתשלום ללא תורים ב-30 יום אחרונים, או עם מנוי שכבר בוטל. שווה ליצור קשר.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
