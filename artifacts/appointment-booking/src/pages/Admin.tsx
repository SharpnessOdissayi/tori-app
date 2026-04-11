import { useState } from "react";
import { format, parseISO } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Clock, Trash2, Users, LayoutDashboard, LogOut, Search, User } from "lucide-react";
import { Link } from "wouter";

import { useListAppointments, useGetUpcomingSummary, useDeleteAppointment, getListAppointmentsQueryKey, getGetUpcomingSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function Admin() {
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginError, setLoginError] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "admin123") {
      setIsAuthenticated(true);
      setLoginError(false);
    } else {
      setLoginError(true);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setPassword("");
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-muted/30">
        <header className="px-6 py-4 flex items-center justify-between bg-card border-b sticky top-0 z-10">
          <Link href="/" className="flex items-center gap-2 text-primary font-bold text-xl tracking-tight">
            <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
              A
            </div>
            Appoint.
          </Link>
        </header>

        <div className="flex-1 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-sm"
          >
            <Card className="border-border shadow-xl rounded-2xl overflow-hidden">
              <div className="bg-primary h-2 w-full"></div>
              <CardHeader className="text-center pb-2">
                <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
                  <LayoutDashboard className="w-6 h-6" />
                </div>
                <CardTitle className="text-2xl font-bold">Admin Portal</CardTitle>
                <CardDescription>Enter your password to access the dashboard</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Input 
                      type="password" 
                      placeholder="Password" 
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setLoginError(false);
                      }}
                      className={`h-12 rounded-xl text-center text-lg tracking-widest bg-muted/50 ${loginError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    />
                    {loginError && <p className="text-sm text-destructive text-center font-medium">Incorrect password</p>}
                  </div>
                  <Button type="submit" className="w-full h-12 rounded-xl text-base font-semibold shadow-md">
                    Access Dashboard
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    );
  }

  return <AdminDashboard password={password} onLogout={handleLogout} />;
}

function AdminDashboard({ password, onLogout }: { password: string, onLogout: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: appointments, isLoading: isLoadingAppointments } = useListAppointments(
    { adminPassword: password },
    { query: { enabled: !!password, queryKey: getListAppointmentsQueryKey({ adminPassword: password }) } }
  );

  const { data: summary, isLoading: isLoadingSummary } = useGetUpcomingSummary(
    { adminPassword: password },
    { query: { enabled: !!password, queryKey: getGetUpcomingSummaryQueryKey({ adminPassword: password }) } }
  );

  const deleteAppointment = useDeleteAppointment({
    mutation: {
      onSuccess: () => {
        toast({ title: "Appointment Cancelled", description: "The appointment has been removed." });
        queryClient.invalidateQueries({ queryKey: getListAppointmentsQueryKey({ adminPassword: password }) });
        queryClient.invalidateQueries({ queryKey: getGetUpcomingSummaryQueryKey({ adminPassword: password }) });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to cancel appointment.", variant: "destructive" });
      }
    }
  });

  const filteredAppointments = appointments?.filter(app => 
    app.clientName.toLowerCase().includes(searchQuery.toLowerCase()) || 
    app.serviceType.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-muted/20">
      <header className="px-6 py-4 flex items-center justify-between bg-card border-b sticky top-0 z-20 shadow-sm">
        <Link href="/" className="flex items-center gap-2 text-primary font-bold text-xl tracking-tight">
          <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
            A
          </div>
          Appoint.
        </Link>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="hidden sm:inline-flex rounded-full px-3 py-1 font-medium bg-muted/50">
            Admin Mode
          </Badge>
          <Button variant="ghost" size="icon" onClick={onLogout} className="rounded-full text-muted-foreground hover:text-foreground">
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
            <p className="text-muted-foreground mt-1">Manage your schedule and bookings.</p>
          </div>
        </div>

        {/* Summary Widgets */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-none shadow-md bg-card overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Today's Sessions</p>
                  <div className="text-4xl font-bold text-foreground">
                    {isLoadingSummary ? <Skeleton className="h-10 w-16" /> : summary?.todayCount || 0}
                  </div>
                </div>
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <Clock className="w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-none shadow-md bg-card overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">This Week</p>
                  <div className="text-4xl font-bold text-foreground">
                    {isLoadingSummary ? <Skeleton className="h-10 w-16" /> : summary?.thisWeekCount || 0}
                  </div>
                </div>
                <div className="w-12 h-12 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center">
                  <Calendar className="w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-md bg-card overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Total Upcoming</p>
                  <div className="text-4xl font-bold text-foreground">
                    {isLoadingSummary ? <Skeleton className="h-10 w-16" /> : summary?.totalUpcoming || 0}
                  </div>
                </div>
                <div className="w-12 h-12 rounded-full bg-accent text-accent-foreground flex items-center justify-center">
                  <Users className="w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Appointments List */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-xl font-bold">Upcoming Appointments</h2>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search clients or services..." 
                className="pl-9 rounded-full bg-card shadow-sm border-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            {isLoadingAppointments ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="border-none shadow-sm">
                  <CardContent className="p-4 flex items-center gap-4">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                    <Skeleton className="h-10 w-24 rounded-lg hidden sm:block" />
                  </CardContent>
                </Card>
              ))
            ) : filteredAppointments.length === 0 ? (
              <div className="text-center p-12 bg-card rounded-2xl shadow-sm border border-dashed border-border/50">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4 text-muted-foreground">
                  <Calendar className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-semibold">No appointments found</h3>
                <p className="text-muted-foreground">There are no upcoming bookings matching your criteria.</p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {filteredAppointments.map((app) => (
                  <motion.div
                    key={app.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Card className="border-none shadow-sm hover:shadow-md transition-shadow group overflow-hidden">
                      <CardContent className="p-0">
                        <div className="flex flex-col sm:flex-row sm:items-center p-4 sm:p-5 gap-4">
                          
                          {/* Date & Time block (Mobile: Row, Desktop: Col) */}
                          <div className="flex sm:flex-col items-center sm:items-start gap-3 sm:gap-1 sm:w-32 shrink-0">
                            <div className="bg-primary/10 text-primary px-3 py-1.5 rounded-lg text-center flex flex-col items-center justify-center min-w-[70px]">
                              <span className="text-xs font-bold uppercase tracking-wider">{format(parseISO(app.appointmentDate), "MMM")}</span>
                              <span className="text-xl font-extrabold leading-none">{format(parseISO(app.appointmentDate), "dd")}</span>
                            </div>
                            <div className="flex items-center text-sm font-semibold text-foreground/80 bg-muted/50 px-2 py-1 rounded-md">
                              <Clock className="w-3.5 h-3.5 mr-1.5 text-primary" />
                              {app.appointmentTime}
                            </div>
                          </div>

                          {/* Client Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-lg font-bold truncate">{app.clientName}</h3>
                              <Badge variant="secondary" className="bg-secondary text-secondary-foreground shrink-0 border-none">
                                {app.serviceType}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                              <span className="flex items-center truncate">
                                <User className="w-3.5 h-3.5 mr-1" />
                                {app.phoneNumber}
                              </span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="mt-2 sm:mt-0 flex items-center justify-end border-t sm:border-t-0 pt-3 sm:pt-0 border-border/50">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive hover:text-destructive-foreground sm:opacity-0 sm:group-hover:opacity-100 transition-all rounded-lg">
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Cancel
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="rounded-2xl">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Cancel Appointment?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to cancel the appointment for <strong>{app.clientName}</strong> on <strong>{format(parseISO(app.appointmentDate), "MMM d")}</strong> at <strong>{app.appointmentTime}</strong>?
                                    This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="rounded-xl">Keep Appointment</AlertDialogCancel>
                                  <AlertDialogAction 
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
                                    onClick={() => deleteAppointment.mutate({ id: app.id, params: { adminPassword: password } })}
                                    disabled={deleteAppointment.isPending}
                                  >
                                    {deleteAppointment.isPending ? "Cancelling..." : "Yes, Cancel"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
