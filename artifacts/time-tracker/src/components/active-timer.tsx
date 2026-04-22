import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { PlaySquare, Square } from "lucide-react";
import { 
  useGetActiveEntry, 
  useStopTimer,
  getGetActiveEntryQueryKey,
  getListTaskEntriesQueryKey,
  getGetSummaryQueryKey,
  getGetTaskQueryKey,
  getListTasksQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDurationParts } from "@/lib/format";
import { Button } from "@/components/ui/button";

export function ActiveTimer() {
  const { data: activeEntryData } = useGetActiveEntry();
  const entry = activeEntryData?.entry;
  
  const stopTimerMutation = useStopTimer();
  const queryClient = useQueryClient();
  
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!entry) {
      setElapsed(0);
      return;
    }

    const start = new Date(entry.startedAt).getTime();
    
    const updateElapsed = () => {
      const now = new Date().getTime();
      setElapsed(Math.floor((now - start) / 1000));
    };
    
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [entry]);

  if (!entry) return null;

  const handleStop = () => {
    stopTimerMutation.mutate({ entryId: entry.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetActiveEntryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListTaskEntriesQueryKey(entry.taskId) });
        queryClient.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTaskQueryKey(entry.taskId) });
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
      }
    });
  };

  return (
    <div className="flex items-center gap-4 bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-full shadow-sm animate-in fade-in zoom-in-95 duration-300">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        <Link href={`/tasks/${entry.taskId}`} className="text-sm font-medium hover:underline text-foreground max-w-[200px] truncate">
          {entry.description}
        </Link>
      </div>
      <div className="text-sm font-mono font-bold text-primary tabular-nums">
        {formatDurationParts(elapsed)}
      </div>
      <Button 
        size="icon" 
        variant="ghost" 
        className="h-6 w-6 text-primary hover:text-primary hover:bg-primary/20 rounded-full"
        onClick={handleStop}
        disabled={stopTimerMutation.isPending}
      >
        <Square className="h-3 w-3 fill-current" />
      </Button>
    </div>
  );
}
