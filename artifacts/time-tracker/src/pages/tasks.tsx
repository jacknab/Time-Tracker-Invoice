import { useState } from "react";
import { Link } from "wouter";
import { useListTasks, useCreateTask, getListTasksQueryKey, TaskWithStats } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatDurationParts } from "@/lib/format";
import { Plus, CheckCircle2, Clock, Inbox, ArrowRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

function TaskCard({ task }: { task: TaskWithStats }) {
  const isCompleted = task.status === "completed";
  
  return (
    <Link
      href={`/tasks/${task.id}`}
      className={`group flex flex-col p-5 border rounded-lg bg-card hover:shadow-md transition-all cursor-pointer h-full no-underline text-inherit ${
        isCompleted ? "border-muted-border opacity-70 bg-muted/20" : "border-card-border hover:border-primary/40"
      }`}
    >
      <div className="contents">
        <div className="flex justify-between items-start mb-3 gap-4">
          <h3 className={`font-semibold text-lg line-clamp-1 ${isCompleted ? "line-through text-muted-foreground" : "text-foreground group-hover:text-primary transition-colors"}`}>
            {task.title}
          </h3>
          <div className="shrink-0">
            {isCompleted ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                <CheckCircle2 className="w-3 h-3" /> Done
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">
                <Clock className="w-3 h-3" /> Active
              </span>
            )}
          </div>
        </div>
        
        <p className="text-sm text-muted-foreground line-clamp-2 mb-4 flex-1">
          {task.description || "No description provided."}
        </p>
        
        <div className="flex items-center justify-between mt-auto pt-4 border-t border-border/50 text-sm">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Total Time</span>
            <span className="font-mono font-medium text-foreground">{formatDurationParts(task.totalSeconds)}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs text-muted-foreground">Unbilled</span>
            <span className={`font-mono font-medium ${task.unbilledSeconds > 0 ? "text-primary" : "text-muted-foreground"}`}>
              {formatDurationParts(task.unbilledSeconds)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function Tasks() {
  const { data: tasks, isLoading } = useListTasks();
  const createTaskMutation = useCreateTask();
  const queryClient = useQueryClient();
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    
    createTaskMutation.mutate({ data: { title, description } }, {
      onSuccess: () => {
        toast.success("Task created");
        setIsCreateOpen(false);
        setTitle("");
        setDescription("");
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Tasks</h1>
          <p className="text-muted-foreground mt-1">Manage your work and track time.</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 shadow-sm shrink-0">
              <Plus className="w-4 h-4" />
              New Task
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Create New Task</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-4">
              <div className="space-y-2">
                <label htmlFor="title" className="text-sm font-medium">Task Title</label>
                <Input 
                  id="title" 
                  value={title} 
                  onChange={(e) => setTitle(e.target.value)} 
                  placeholder="e.g. Build new landing page"
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="description" className="text-sm font-medium">Description (Optional)</label>
                <Textarea 
                  id="description" 
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)} 
                  placeholder="Brief details about the task..."
                  rows={3}
                />
              </div>
              <div className="pt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createTaskMutation.isPending || !title.trim()}>
                  {createTaskMutation.isPending ? "Creating..." : "Create Task"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-[200px] w-full rounded-lg" />
          ))}
        </div>
      ) : tasks && tasks.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 auto-rows-fr">
          {tasks.map(task => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-card rounded-lg border border-dashed border-border">
          <div className="bg-muted p-4 rounded-full mb-4">
            <Inbox className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-medium text-foreground mb-2">No tasks yet</h3>
          <p className="text-muted-foreground max-w-sm mb-6">
            Create your first task to start tracking time and generating invoices for your client.
          </p>
          <Button onClick={() => setIsCreateOpen(true)} variant="outline" className="gap-2">
            <Plus className="w-4 h-4" /> Start your first task
          </Button>
        </div>
      )}
    </div>
  );
}
