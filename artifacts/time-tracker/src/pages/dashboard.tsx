import { useGetSummary, useStopTimer, getGetSummaryQueryKey, getGetActiveEntryQueryKey } from "@workspace/api-client-react";
import { formatDurationParts, formatCurrency, formatDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, CheckCircle2, CircleDollarSign, ArrowRight, Activity, PlaySquare, Square } from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

function StatCard({ title, value, subtitle, icon: Icon }: { title: string; value: React.ReactNode; subtitle?: string; icon: React.ElementType }) {
  return (
    <Card className="bg-card border-card-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-mono">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="bg-card">
            <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
            <CardContent><Skeleton className="h-8 w-32" /></CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-card">
          <CardHeader><Skeleton className="h-6 w-32" /></CardHeader>
          <CardContent><Skeleton className="h-48 w-full" /></CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading, error } = useGetSummary();
  const stopTimerMutation = useStopTimer();
  const queryClient = useQueryClient();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!summary?.activeEntry) {
      setElapsed(0);
      return;
    }
    const start = new Date(summary.activeEntry.startedAt).getTime();
    const updateElapsed = () => {
      const now = new Date().getTime();
      setElapsed(Math.floor((now - start) / 1000));
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [summary?.activeEntry]);

  if (isLoading) return <DashboardSkeleton />;
  if (error || !summary) return <div className="text-destructive p-4 bg-destructive/10 rounded-md">Failed to load dashboard.</div>;

  const handleStopTimer = () => {
    if (!summary.activeEntry) return;
    stopTimerMutation.mutate({ entryId: summary.activeEntry.id }, {
      onSuccess: () => {
        toast.success("Timer stopped");
        queryClient.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetActiveEntryQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Overview of tracked time and billing for {summary.clientName}.</p>
      </div>

      {summary.activeEntry && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Activity className="w-48 h-48" />
          </div>
          <div className="space-y-1 relative z-10">
            <div className="flex items-center gap-2 text-primary font-medium">
              <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              Timer Running
            </div>
            <h3 className="text-xl font-bold">{summary.activeEntry.description || "Working on task"}</h3>
            {summary.activeEntry.taskTitle && (
              <p className="text-muted-foreground">Task: {summary.activeEntry.taskTitle}</p>
            )}
          </div>
          
          <div className="flex items-center gap-6 bg-card/50 p-4 rounded-md border border-card-border relative z-10 w-full md:w-auto">
            <div className="text-3xl font-mono font-bold tabular-nums text-primary tracking-tight">
              {formatDurationParts(elapsed)}
            </div>
            <Button 
              size="lg"
              variant="destructive"
              onClick={handleStopTimer}
              disabled={stopTimerMutation.isPending}
              className="gap-2 shrink-0"
            >
              <Square className="w-4 h-4 fill-current" />
              Stop
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title="Unbilled Time" 
          value={formatDurationParts(summary.unbilledSeconds)} 
          subtitle="Ready to invoice"
          icon={Clock} 
        />
        <StatCard 
          title="Unbilled Amount" 
          value={formatCurrency(summary.unbilledAmount)} 
          subtitle={`At ${formatCurrency(summary.hourlyRate)}/hr`}
          icon={CircleDollarSign} 
        />
        <StatCard 
          title="Outstanding" 
          value={formatCurrency(summary.outstandingAmount)} 
          subtitle="Awaiting payment"
          icon={Activity} 
        />
        <StatCard 
          title="Total Paid" 
          value={formatCurrency(summary.paidAmount)} 
          subtitle="Lifetime earnings"
          icon={CheckCircle2} 
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-card-border mb-4">
            <CardTitle className="text-lg">Recent Work</CardTitle>
            <Link href="/tasks" className="text-sm text-primary hover:underline flex items-center gap-1">
              View all tasks <ArrowRight className="w-3 h-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {summary.recentEntries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <p>No recent time entries.</p>
                <Link href="/tasks">
                  <Button variant="outline" size="sm" className="mt-4">Go to Tasks</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {summary.recentEntries.map((entry) => (
                  <div key={entry.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-md hover:bg-muted/50 transition-colors border border-transparent hover:border-border">
                    <div>
                      <div className="font-medium text-sm text-foreground">
                        {entry.description || "No description"}
                        {entry.isRunning && <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Running</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                        <span>{entry.taskTitle || "Unknown Task"}</span>
                        <span>•</span>
                        <span>{formatDateTime(entry.startedAt)}</span>
                      </div>
                    </div>
                    <div className="text-right sm:text-left text-sm font-mono font-bold bg-accent text-accent-foreground px-2 py-1 rounded w-fit self-start sm:self-auto">
                      {formatDurationParts(entry.durationSeconds)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-card-border mb-4">
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <Link href="/tasks" className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all group">
                <div className="bg-primary/10 p-2 rounded-md group-hover:bg-primary/20 transition-colors">
                  <CheckSquare className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium text-foreground group-hover:text-primary transition-colors">Manage Tasks</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">Create tasks and track time</p>
                </div>
              </Link>
              
              <Link href="/invoices" className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all group">
                <div className="bg-primary/10 p-2 rounded-md group-hover:bg-primary/20 transition-colors">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium text-foreground group-hover:text-primary transition-colors">Billing & Invoices</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">Generate and manage invoices</p>
                </div>
              </Link>
            </div>
            
            <div className="mt-6 p-4 rounded-md bg-muted/30 border border-muted-border">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                Project Stats
              </h4>
              <div className="flex justify-between items-center text-sm py-1">
                <span className="text-muted-foreground">Total Tasks</span>
                <span className="font-mono font-medium">{summary.totalTasks}</span>
              </div>
              <div className="flex justify-between items-center text-sm py-1 border-t border-border/50">
                <span className="text-muted-foreground">Total Time Tracked</span>
                <span className="font-mono font-medium">{formatDurationParts(summary.totalSeconds)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Temporary imports for the Quick Actions block
import { CheckSquare, FileText } from "lucide-react";
