import { Link } from "wouter";
import { useGetAdminCurriculum, useGetAdminOverview } from "@workspace/api-client-react";
import { AlertTriangle, ArrowRight, BarChart3, BookOpen, CalendarDays, ClipboardList, FileText, LayoutDashboard, Users, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const operationLinks = [
  { href: "/admin/curriculum?section=people", title: "Clients & tutors", detail: "People, subject access, and active status.", icon: Users },
  { href: "/admin/curriculum?section=programs", title: "Programs", detail: "Publish, archive, and update program details.", icon: BookOpen },
  { href: "/admin/curriculum?section=curriculum", title: "Curriculum", detail: "Assignments, materials, question bank, and submissions.", icon: ClipboardList },
  { href: "/admin/curriculum?section=sessions", title: "Sessions", detail: "Participants, Meet links, status, and conflicts.", icon: CalendarDays },
];

export default function AdminDashboard() {
  const { data: overview, isLoading: overviewLoading } = useGetAdminOverview();
  const { data: curriculum, isLoading: curriculumLoading } = useGetAdminCurriculum();
  if (overviewLoading || curriculumLoading) {
    return <div className="space-y-6"><Skeleton className="h-10 w-72 rounded-xl" /><div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-28 rounded-2xl" />)}</div><Skeleton className="h-72 rounded-2xl" /></div>;
  }
  const platform = (overview as typeof overview & { platform?: { outstandingInvoices: number; upcomingSessions: number; newRequests: number } } | undefined)?.platform;
  const audit = overview?.audit?.slice(0, 6) ?? [];
  const statCards = [
    { label: "Programs", value: curriculum?.programs.length ?? 0, icon: BookOpen },
    { label: "Upcoming sessions", value: platform?.upcomingSessions ?? curriculum?.sessions.filter((item) => item.status === "published").length ?? 0, icon: CalendarDays },
    { label: "Open assignments", value: curriculum?.assignments.filter((item) => item.status !== "archived").length ?? 0, icon: ClipboardList },
    { label: "Needs attention", value: curriculum?.attention.length ?? 0, icon: AlertTriangle },
    { label: "Outstanding invoices", value: platform?.outstandingInvoices ?? 0, icon: WalletCards },
  ];
  return <div className="mx-auto max-w-7xl space-y-7 pb-16 animate-in fade-in">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-2 text-sm font-medium text-primary">Accepted Admissions · administrator</p><h1 className="text-3xl font-bold tracking-tight">Admin overview</h1><p className="mt-1 text-muted-foreground">A compact view of the learning product and the work that needs an operator.</p></div><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/admin/financials"><WalletCards className="mr-2 h-4 w-4" /> Finance</Link></Button><Button asChild variant="outline"><Link href="/admin/content"><FileText className="mr-2 h-4 w-4" /> Public content</Link></Button></div></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{statCards.map(({ label, value, icon: Icon }) => <Card key={label}><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></div><Icon className="h-5 w-5 text-primary" /></CardContent></Card>)}</div>
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card><CardHeader><CardTitle>Operations</CardTitle><CardDescription>Jump directly to a focused area instead of scanning one long workspace.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{operationLinks.map(({ href, title, detail, icon: Icon }) => <Link key={href} href={href} className="group rounded-xl border p-4 transition-colors hover:border-primary/50 hover:bg-primary/5"><div className="flex items-start justify-between"><Icon className="h-5 w-5 text-primary" /><ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" /></div><h2 className="mt-4 font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{detail}</p></Link>)}</CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" /> Attention queue</CardTitle><CardDescription>Drafts, conflicts, and incomplete assignments.</CardDescription></CardHeader><CardContent className="space-y-3">{curriculum?.attention.slice(0, 5).map((item, index) => <div key={`${item.kind}-${index}`} className="rounded-xl border p-3"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{item.label}</span><Badge variant={item.severity === "urgent" ? "destructive" : "outline"}>{item.severity}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{item.detail}</p></div>)}{!curriculum?.attention.length && <div className="rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-700">Everything is clear right now.</div>}<Button asChild variant="link" className="px-0"><Link href="/admin/curriculum?section=curriculum">Open curriculum queue <ArrowRight className="ml-1 h-4 w-4" /></Link></Button></CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" /> Recent administrator activity</CardTitle><CardDescription>Audited platform mutations and operational changes.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="border-b text-xs uppercase text-muted-foreground"><tr><th className="p-3">Action</th><th className="p-3">Entity</th><th className="p-3">When</th></tr></thead><tbody>{audit.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="p-3 font-medium">{item.action.replaceAll("_", " ")}</td><td className="p-3 text-muted-foreground">{item.entityType}</td><td className="p-3 text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</td></tr>)}</tbody></table>{!audit.length && <p className="p-6 text-center text-sm text-muted-foreground">No recent activity.</p>}</div></CardContent></Card>
  </div>;
}