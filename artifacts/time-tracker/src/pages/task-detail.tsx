import { useState, useEffect } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { 
  useGetTask, 
  useListTaskEntries, 
  useStartTimer, 
  useStopTimer, 
  useUpdateEntry, 
  useDeleteEntry,
  useUpdateTask,
  useDeleteTask,
  useCreateManualEntry,
  useListInvoices,
  useDeleteInvoice,
  getInvoice,
  getGetTaskQueryKey,
  getListTaskEntriesQueryKey,
  getGetSummaryQueryKey,
  getGetActiveEntryQueryKey,
  getListTasksQueryKey,
  getListInvoicesQueryKey
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDurationParts, formatDateTime } from "@/lib/format";
import { ArrowLeft, Play, Square, MoreVertical, Pencil, Trash2, CheckCircle2, Clock, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function TaskDetail() {
  const [, params] = useRoute("/tasks/:id");
  const id = params?.id || "";
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: task, isLoading: isTaskLoading } = useGetTask(id, { query: { enabled: !!id, queryKey: getGetTaskQueryKey(id) } });
  const { data: entries, isLoading: isEntriesLoading } = useListTaskEntries(id, { query: { enabled: !!id, queryKey: getListTaskEntriesQueryKey(id) } });

  const startTimerMutation = useStartTimer();
  const stopTimerMutation = useStopTimer();
  const updateTaskMutation = useUpdateTask();
  const deleteTaskMutation = useDeleteTask();
  const { data: invoices } = useListInvoices({ query: { queryKey: getListInvoicesQueryKey() } });
  const deleteInvoiceMutation = useDeleteInvoice();
  const [unpaidPromptInvoice, setUnpaidPromptInvoice] = useState<{ id: string; invoiceNumber: string } | null>(null);

  const promptIfUnpaidInvoice = () => {
    const unpaid = invoices?.find((inv) => inv.status !== "paid");
    if (unpaid) {
      setUnpaidPromptInvoice({ id: unpaid.id, invoiceNumber: unpaid.invoiceNumber });
    }
  };

  const handleConfirmDeleteInvoice = async () => {
    if (!unpaidPromptInvoice) return;
    try {
      const full = await getInvoice(unpaidPromptInvoice.id);
      const stash = {
        invoiceNumber: full.invoiceNumber,
        notes: full.notes ?? "",
        credits: (full.credits ?? []).map((c) => ({ description: c.description, amount: c.amount })),
      };
      sessionStorage.setItem("pendingInvoiceRestore", JSON.stringify(stash));
    } catch {
      sessionStorage.removeItem("pendingInvoiceRestore");
    }
    deleteInvoiceMutation.mutate(
      { id: unpaidPromptInvoice.id },
      {
        onSuccess: () => {
          toast.success("Invoice deleted — regenerate when ready");
          setUnpaidPromptInvoice(null);
          queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListTaskEntriesQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
          setLocation("/invoices?restore=1");
        },
        onError: () => toast.error("Failed to delete invoice"),
      },
    );
  };

  const [description, setDescription] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  useEffect(() => {
    if (task && editOpen) {
      setEditTitle(task.title);
      setEditDescription(task.description ?? "");
    }
  }, [task, editOpen]);

  const handleSaveEdit = () => {
    if (!editTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    updateTaskMutation.mutate(
      { id, data: { title: editTitle.trim(), description: editDescription.trim() } },
      {
        onSuccess: () => {
          toast.success("Task updated");
          setEditOpen(false);
          queryClient.invalidateQueries({ queryKey: getGetTaskQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        },
      },
    );
  };

  const activeEntry = entries?.find(e => e.isRunning);

  useEffect(() => {
    if (!activeEntry) {
      setElapsed(0);
      return;
    }
    const start = new Date(activeEntry.startedAt).getTime();
    const updateElapsed = () => setElapsed(Math.floor((new Date().getTime() - start) / 1000));
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [activeEntry]);

  const handleStart = () => {
    if (!description.trim()) return;
    startTimerMutation.mutate({ id, data: { description } }, {
      onSuccess: () => {
        setDescription("");
        toast.success("Timer started");
        queryClient.invalidateQueries({ queryKey: getListTaskEntriesQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetTaskQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetActiveEntryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
      }
    });
  };

  const handleStop = () => {
    if (!activeEntry) return;
    stopTimerMutation.mutate({ entryId: activeEntry.id }, {
      onSuccess: () => {
        toast.success("Timer stopped");
        queryClient.invalidateQueries({ queryKey: getListTaskEntriesQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetTaskQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetActiveEntryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        promptIfUnpaidInvoice();
      }
    });
  };

  const toggleStatus = () => {
    if (!task) return;
    const newStatus = task.status === "completed" ? "active" : "completed";
    updateTaskMutation.mutate({ id, data: { status: newStatus } }, {
      onSuccess: () => {
        toast.success(`Task marked as ${newStatus}`);
        queryClient.invalidateQueries({ queryKey: getGetTaskQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
      }
    });
  };

  const handleDelete = () => {
    if (!confirm("Are you sure you want to delete this task? All time entries will be lost.")) return;
    deleteTaskMutation.mutate({ id }, {
      onSuccess: () => {
        toast.success("Task deleted");
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
        setLocation("/tasks");
      }
    });
  };

  if (isTaskLoading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-32 mb-8" />
      <Skeleton className="h-12 w-2/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-32 w-full mt-8" />
    </div>
  );

  if (!task) return <div className="text-destructive p-4 bg-destructive/10 rounded-md">Task not found.</div>;

  return (
    <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in duration-500">
      <Link href="/tasks" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors group">
        <ArrowLeft className="w-4 h-4 mr-1 group-hover:-translate-x-1 transition-transform" /> Back to Tasks
      </Link>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className={`text-3xl font-bold tracking-tight ${task.status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
              {task.title}
            </h1>
            {task.status === "completed" ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                <CheckCircle2 className="w-3 h-3" /> Done
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">
                <Clock className="w-3 h-3" /> Active
              </span>
            )}
          </div>
          {task.description && <p className="text-muted-foreground max-w-2xl">{task.description}</p>}
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="w-4 h-4 mr-2" /> Edit
          </Button>
          <Button variant="outline" onClick={toggleStatus} disabled={updateTaskMutation.isPending}>
            {task.status === "completed" ? "Mark Active" : "Mark Complete"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer">
                <Trash2 className="w-4 h-4 mr-2" /> Delete Task
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-task-title">Title</Label>
              <Input
                id="edit-task-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Task title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-task-description">Description</Label>
              <Textarea
                id="edit-task-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Optional description"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={updateTaskMutation.isPending || !editTitle.trim()}>
              {updateTaskMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg bg-card border border-card-border shadow-sm">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Total Tracked</span>
          <span className="text-lg font-mono font-bold">{formatDurationParts(task.totalSeconds)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Unbilled</span>
          <span className="text-lg font-mono font-bold text-primary">{formatDurationParts(task.unbilledSeconds)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Entries</span>
          <span className="text-lg font-mono font-bold">{task.entryCount}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Created</span>
          <span className="text-sm font-medium mt-1">{new Date(task.createdAt).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Timer Panel */}
      <Card className="bg-card border-card-border shadow-md overflow-hidden">
        <CardContent className="p-0">
          {activeEntry ? (
            <div className="bg-primary/10 p-8 flex flex-col md:flex-row items-center justify-between gap-6 relative">
              <div className="space-y-1 relative z-10 w-full md:w-auto">
                <div className="flex items-center gap-2 text-primary font-medium text-sm">
                  <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                  Currently Working
                </div>
                <div className="text-xl font-semibold text-foreground mt-2">{activeEntry.description}</div>
              </div>
              <div className="flex items-center gap-6 bg-card px-6 py-4 rounded-xl border border-primary/20 shadow-sm relative z-10 w-full md:w-auto justify-between md:justify-start">
                <div className="text-4xl font-mono font-bold tabular-nums text-primary tracking-tight">
                  {formatDurationParts(elapsed)}
                </div>
                <Button 
                  size="lg"
                  variant="destructive"
                  onClick={handleStop}
                  disabled={stopTimerMutation.isPending}
                  className="gap-2 shrink-0 h-14 px-6 text-lg"
                >
                  <Square className="w-5 h-5 fill-current" />
                  Stop
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-8 flex flex-col sm:flex-row gap-4 items-center">
              <Input
                placeholder="What are you working on?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="h-14 text-lg bg-background border-border shadow-sm placeholder:text-muted-foreground/50"
                onKeyDown={(e) => { if (e.key === 'Enter' && description.trim()) handleStart(); }}
              />
              <Button 
                size="lg" 
                onClick={handleStart} 
                disabled={!description.trim() || startTimerMutation.isPending || task.status === "completed"}
                className="h-14 px-8 text-lg gap-2 shrink-0 w-full sm:w-auto"
              >
                <Play className="w-5 h-5 fill-current" />
                Start Timer
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Entries List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Time Entries</h3>
          <ManualEntryButton taskId={id} disabled={task.status === "completed"} onCreated={promptIfUnpaidInvoice} />
        </div>
        {isEntriesLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : entries && entries.length > 0 ? (
          <div className="space-y-3">
            {entries.filter(e => !e.isRunning).map((entry) => (
              <EntryRow key={entry.id} entry={entry} taskId={id} />
            ))}
            {entries.filter(e => !e.isRunning).length === 0 && (
              <p className="text-sm text-muted-foreground italic">No completed entries yet.</p>
            )}
          </div>
        ) : (
          <div className="text-center py-12 bg-card rounded-lg border border-dashed border-border">
            <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-muted-foreground">No time tracked yet. Start the timer above!</p>
          </div>
        )}
      </div>

      <Dialog open={!!unpaidPromptInvoice} onOpenChange={(o) => !o && setUnpaidPromptInvoice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unpaid invoice exists</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3 text-sm text-muted-foreground">
            <p>
              You have an unpaid invoice <span className="font-mono font-semibold text-foreground">{unpaidPromptInvoice?.invoiceNumber}</span>.
              Your new time entry won't appear on it.
            </p>
            <p>
              Delete that invoice now so you can regenerate it with this entry included? (Time entries will be released back to unbilled.)
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnpaidPromptInvoice(null)}>
              Keep Invoice
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDeleteInvoice}
              disabled={deleteInvoiceMutation.isPending}
            >
              {deleteInvoiceMutation.isPending ? "Deleting..." : "Delete & Regenerate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}

function EntryRow({ entry, taskId }: { entry: any, taskId: string }) {
  const queryClient = useQueryClient();
  const updateEntryMutation = useUpdateEntry();
  const deleteEntryMutation = useDeleteEntry();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editDesc, setEditDesc] = useState(entry.description);
  const [editStart, setEditStart] = useState(toLocalInput(entry.startedAt));
  const [editEnd, setEditEnd] = useState(toLocalInput(entry.endedAt));
  const [editNoCharge, setEditNoCharge] = useState<boolean>(!!entry.noCharge);

  useEffect(() => {
    if (isEditOpen) {
      setEditDesc(entry.description);
      setEditStart(toLocalInput(entry.startedAt));
      setEditEnd(toLocalInput(entry.endedAt));
      setEditNoCharge(!!entry.noCharge);
    }
  }, [isEditOpen, entry]);

  const handleUpdate = () => {
    const data: { description?: string; startedAt?: string; endedAt?: string; noCharge?: boolean } = {};
    if (editDesc.trim() && editDesc !== entry.description) data.description = editDesc.trim();
    if (editStart && fromLocalInput(editStart) !== new Date(entry.startedAt).toISOString()) {
      data.startedAt = fromLocalInput(editStart);
    }
    if (entry.endedAt && editEnd && fromLocalInput(editEnd) !== new Date(entry.endedAt).toISOString()) {
      data.endedAt = fromLocalInput(editEnd);
    }
    if (editNoCharge !== !!entry.noCharge) data.noCharge = editNoCharge;
    if (Object.keys(data).length === 0) {
      setIsEditOpen(false);
      return;
    }
    if (data.startedAt || data.endedAt) {
      const s = new Date(data.startedAt ?? entry.startedAt).getTime();
      const e = new Date(data.endedAt ?? entry.endedAt).getTime();
      if (entry.endedAt && e <= s) {
        toast.error("End time must be after start time");
        return;
      }
    }
    updateEntryMutation.mutate({ entryId: entry.id, data }, {
      onSuccess: () => {
        toast.success("Entry updated");
        setIsEditOpen(false);
        queryClient.invalidateQueries({ queryKey: getListTaskEntriesQueryKey(taskId) });
        queryClient.invalidateQueries({ queryKey: getGetTaskQueryKey(taskId) });
        queryClient.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
      },
      onError: () => toast.error("Failed to update entry"),
    });
  };

  const handleDelete = () => {
    if (!confirm("Delete this time entry? This affects unbilled totals.")) return;
    deleteEntryMutation.mutate({ entryId: entry.id }, {
      onSuccess: () => {
        toast.success("Entry deleted");
        queryClient.invalidateQueries({ queryKey: getListTaskEntriesQueryKey(taskId) });
        queryClient.invalidateQueries({ queryKey: getGetTaskQueryKey(taskId) });
        queryClient.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
      }
    });
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors group">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-foreground truncate">{entry.description}</div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
          <span>{formatDateTime(entry.startedAt)}</span>
          {entry.invoiceId && (
            <>
              <span>•</span>
              <span className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Invoiced</span>
            </>
          )}
          {entry.noCharge && (
            <>
              <span>•</span>
              <span className="text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">No Charge</span>
            </>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-4 justify-between sm:justify-end">
        <div className="font-mono font-bold tabular-nums text-foreground bg-accent px-3 py-1 rounded-md text-sm">
          {formatDurationParts(entry.durationSeconds)}
        </div>
        
        {!entry.invoiceId && (
          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                  <Pencil className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Edit Time Entry</DialogTitle></DialogHeader>
                <div className="py-4 space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Description</label>
                    <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} autoFocus />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Start</label>
                      <Input type="datetime-local" value={editStart} onChange={e => setEditStart(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">End</label>
                      <Input
                        type="datetime-local"
                        value={editEnd}
                        onChange={e => setEditEnd(e.target.value)}
                        disabled={!entry.endedAt}
                      />
                      {!entry.endedAt && (
                        <p className="text-xs text-muted-foreground mt-1">Stop the timer to set an end time.</p>
                      )}
                    </div>
                  </div>
                  <label className="flex items-start gap-3 p-3 rounded-md border border-border bg-muted/30 cursor-pointer">
                    <Checkbox
                      checked={editNoCharge}
                      onCheckedChange={(v) => setEditNoCharge(v === true)}
                      className="mt-0.5"
                    />
                    <div className="space-y-1">
                      <div className="text-sm font-medium">Don't bill — complimentary</div>
                      <p className="text-xs text-muted-foreground">Appears in a separate "Complimentary / No Charge" section at the bottom of the invoice with $0.00.</p>
                    </div>
                  </label>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                  <Button onClick={handleUpdate} disabled={updateEntryMutation.isPending || !editDesc.trim()}>Save Changes</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button variant="ghost" size="icon" onClick={handleDelete} disabled={deleteEntryMutation.isPending} className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ManualEntryButton({ taskId, disabled, onCreated }: { taskId: string; disabled?: boolean; onCreated?: () => void }) {
  const queryClient = useQueryClient();
  const createManual = useCreateManualEntry();
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [noCharge, setNoCharge] = useState(false);

  useEffect(() => {
    if (open) {
      const now = new Date();
      const earlier = new Date(now.getTime() - 60 * 60 * 1000);
      const pad = (n: number) => String(n).padStart(2, "0");
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      setDesc("");
      setStart(fmt(earlier));
      setEnd(fmt(now));
      setNoCharge(false);
    }
  }, [open]);

  const handleSave = () => {
    if (!desc.trim() || !start || !end) {
      toast.error("Please fill in all fields");
      return;
    }
    const startedAt = new Date(start);
    const endedAt = new Date(end);
    if (endedAt.getTime() <= startedAt.getTime()) {
      toast.error("End time must be after start time");
      return;
    }
    createManual.mutate(
      {
        id: taskId,
        data: {
          description: desc.trim(),
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          noCharge,
        },
      },
      {
        onSuccess: () => {
          toast.success("Time entry added");
          setOpen(false);
          queryClient.invalidateQueries({ queryKey: getListTaskEntriesQueryKey(taskId) });
          queryClient.invalidateQueries({ queryKey: getGetTaskQueryKey(taskId) });
          queryClient.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          onCreated?.();
        },
        onError: () => toast.error("Failed to add entry"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={disabled}>
          <Plus className="w-4 h-4" /> Add Manual Entry
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Manual Time Entry</DialogTitle></DialogHeader>
        <div className="py-4 space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Description</label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What did you work on?" autoFocus />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Start</label>
              <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">End</label>
              <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <label className="flex items-start gap-3 p-3 rounded-md border border-border bg-muted/30 cursor-pointer">
            <Checkbox
              checked={noCharge}
              onCheckedChange={(v) => setNoCharge(v === true)}
              className="mt-0.5"
            />
            <div className="space-y-1">
              <div className="text-sm font-medium">Don't bill — complimentary</div>
              <p className="text-xs text-muted-foreground">For bug fixes or forgotten time. Appears in a separate "Complimentary / No Charge" section at the bottom of the invoice with $0.00.</p>
            </div>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={createManual.isPending || !desc.trim()}>
            {createManual.isPending ? "Saving..." : "Add Entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
