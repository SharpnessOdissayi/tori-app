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
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, ExternalLink, Shield, Eye, EyeOff, RefreshCw } from "lucide-react";
import Navbar from "@/components/Navbar";

const PLANS = [
  { value: "free", label: "חינמי", color: "bg-slate-100 text-slate-700" },
  { value: "pro", label: "פרו", color: "bg-purple-100 text-purple-700" },
];

interface EditFormData {
  name: string;
  slug: string;
  ownerName: string;
  email: string;
  password: string;
  phone: string;
}

export default function SuperAdmin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newBusiness, setNewBusiness] = useState({ name: "", slug: "", ownerName: "", email: "", password: "", phone: "" });
  const [editDialogBusiness, setEditDialogBusiness] = useState<AdminBusinessSummary | null>(null);
  const [editForm, setEditForm] = useState<EditFormData>({ name: "", slug: "", ownerName: "", email: "", password: "", phone: "" });
  const [showEditPassword, setShowEditPassword] = useState(false);

  const [loginAttempted, setLoginAttempted] = useState(false);

  const { data: businesses, isLoading, isError } = useSuperAdminListBusinesses(
    { adminPassword: password },
    { query: { enabled: loginAttempted, retry: false } }
  );

  useEffect(() => {
    if (loginAttempted && !isLoading && businesses && !isAuthenticated) {
      setIsAuthenticated(true);
    }
    if (loginAttempted && isError && !isAuthenticated) {
      setLoginAttempted(false);
      toast({ title: "סיסמה שגויה", variant: "destructive" });
    }
  }, [loginAttempted, isLoading, businesses, isAuthenticated, isError, toast]);

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
    createMutation.mutate({ params: { adminPassword: password }, data: { ...newBusiness, phone: newBusiness.phone || undefined } }, {
      onSuccess: () => {
        toast({ title: "עסק נוצר בהצלחה" });
        setIsDialogOpen(false);
        setNewBusiness({ name: "", slug: "", ownerName: "", email: "", password: "", phone: "" });
        invalidate();
      },
      onError: () => toast({ title: "שגיאה ביצירת עסק", variant: "destructive" }),
    });
  };

  const handleToggleActive = (id: number, isActive: boolean) => {
    updateMutation.mutate({ id, params: { adminPassword: password }, data: { isActive: !isActive } }, {
      onSuccess: () => { toast({ title: !isActive ? "עסק הופעל" : "עסק הושהה" }); invalidate(); },
    });
  };

  const handleChangePlan = (id: number, plan: string) => {
    const maxServices = plan === "pro" ? 999 : 3;
    const maxAppts = plan === "pro" ? 9999 : 20;
    updateMutation.mutate({ id, params: { adminPassword: password }, data: { subscriptionPlan: plan as any, maxServicesAllowed: maxServices, maxAppointmentsPerMonth: maxAppts } }, {
      onSuccess: () => { toast({ title: "מנוי עודכן" }); invalidate(); },
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
      ownerName: business.ownerName,
      email: business.email,
      password: "",
      phone: business.phone ?? "",
    });
    setShowEditPassword(false);
  };

  const handleEditSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDialogBusiness) return;

    const data: AdminUpdateBusinessBody = {};
    if (editForm.name !== editDialogBusiness.name) data.name = editForm.name;
    if (editForm.slug !== editDialogBusiness.slug) data.slug = editForm.slug;
    if (editForm.ownerName !== editDialogBusiness.ownerName) data.ownerName = editForm.ownerName;
    if (editForm.email !== editDialogBusiness.email) data.email = editForm.email;
    if (editForm.password) data.password = editForm.password;
    if (editForm.phone !== (editDialogBusiness.phone ?? "")) data.phone = editForm.phone || "";

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
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label>שם משתמש</Label>
                  <Input value={username} onChange={e => setUsername(e.target.value)} dir="ltr" placeholder="admin" autoComplete="username" />
                </div>
                <div className="space-y-2">
                  <Label>סיסמת מנהל</Label>
                  <Input type="password" value={password} onChange={e => setPassword(e.target.value)} dir="ltr" placeholder="••••••••" autoComplete="current-password" />
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
            <DialogContent dir="rtl" className="max-w-md">
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
                  <Input type="tel" value={newBusiness.phone} onChange={e => setNewBusiness(p => ({ ...p, phone: e.target.value }))} dir="ltr" placeholder="050-0000000" />
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
              isPending={updateMutation.isPending || deleteMutation.isPending}
            />
          )) : (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              אין עסקים עדיין. הוסף את הראשון!
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!editDialogBusiness} onOpenChange={(open) => { if (!open) setEditDialogBusiness(null); }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>עריכת עסק</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSave} className="space-y-4">
            <div className="space-y-2">
              <Label>שם העסק</Label>
              <Input required value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} placeholder="מספרת יוסי" />
            </div>
            <div className="space-y-2">
              <Label>כתובת URL (Slug)</Label>
              <Input required value={editForm.slug} onChange={e => setEditForm(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))} dir="ltr" placeholder="yosi-barber" />
              {editForm.slug && <p className="text-xs text-muted-foreground" dir="ltr">/book/{editForm.slug}</p>}
            </div>
            <div className="space-y-2">
              <Label>שם הבעלים</Label>
              <Input required value={editForm.ownerName} onChange={e => setEditForm(p => ({ ...p, ownerName: e.target.value }))} placeholder="יוסי כהן" />
            </div>
            <div className="space-y-2">
              <Label>אימייל</Label>
              <Input required type="email" value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} dir="ltr" placeholder="yosi@example.com" />
            </div>
            <div className="space-y-2">
              <Label>מספר טלפון</Label>
              <Input type="tel" value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} dir="ltr" placeholder="050-0000000" />
            </div>
            <div className="space-y-2">
              <Label>איפוס סיסמה</Label>
              <p className="text-xs text-muted-foreground">השאר ריק כדי לא לשנות את הסיסמה</p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    value={editForm.password}
                    onChange={e => setEditForm(p => ({ ...p, password: e.target.value }))}
                    dir="ltr"
                    placeholder="סיסמה חדשה"
                    type={showEditPassword ? "text" : "password"}
                    className="pl-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(prev => !prev)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
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
    </div>
  );
}

interface BusinessCardProps {
  business: AdminBusinessSummary;
  onToggleActive: () => void;
  onChangePlan: (plan: string) => void;
  onDelete: () => void;
  onEdit: () => void;
  isPending: boolean;
}

function BusinessCard({ business, onToggleActive, onChangePlan, onDelete, onEdit, isPending }: BusinessCardProps) {
  const plan = PLANS.find(p => p.value === business.subscriptionPlan) ?? PLANS[0];

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
          <div className="flex items-center gap-1 shrink-0">
            <Switch checked={business.isActive} onCheckedChange={onToggleActive} disabled={isPending} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={plan.color + " border-0"}>{plan.label}</Badge>
          <Badge variant="outline" className="text-xs font-mono" dir="ltr">/{business.slug}</Badge>
          {!business.isActive && <Badge variant="outline" className="text-xs bg-red-50 text-red-600 border-red-200">מושהה</Badge>}
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

        <div className="flex gap-2 pt-2">
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
      </CardContent>
    </Card>
  );
}
