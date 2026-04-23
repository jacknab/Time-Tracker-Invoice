import { useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  useListInvoices, 
  useCreateInvoice, 
  usePreviewInvoice,
  useUpdateInvoiceStatus,
  useDeleteInvoice,
  getListInvoicesQueryKey,
  getGetSummaryQueryKey
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency, formatDurationDecimal, formatDate } from "@/lib/format";
import { FileText, Plus, CheckCircle2, Circle, Eye, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";

function GenerateInvoiceModal({ open, onOpenChange }: { open: boolean, onOpenChange: (o: boolean) => void }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: preview, isLoading: isPreviewLoading } = usePreviewInvoice({ query: { enabled: open } });
  const createInvoiceMutation = useCreateInvoice();
  
  const [notes, setNotes] = useState("");

  const handleCreate = () => {
    createInvoiceMutation.mutate({ data: { notes } }, {
      onSuccess: (invoice) => {
        toast.success("Invoice generated successfully");
        onOpenChange(false);
        queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
        setLocation(`/invoices/${invoice.id}`);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Generate Invoice</DialogTitle>
        </DialogHeader>
        
        {isPreviewLoading ? (
          <div className="py-12 flex justify-center"><Skeleton className="h-8 w-32" /></div>
        ) : !preview ? (
          <div className="py-8 text-center text-destructive">Failed to load preview.</div>
        ) : preview.lineItems.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground flex flex-col items-center">
            <CheckCircle2 className="w-12 h-12 mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-medium text-foreground">You're all caught up!</h3>
            <p className="mt-2 max-w-sm">There are no unbilled time entries to invoice. Track more time first.</p>
          </div>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto py-4 space-y-6">
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg border border-border">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Hours</p>
                  <p className="text-2xl font-mono font-bold">{formatDurationDecimal(preview.totalSeconds)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Amount</p>
                  <p className="text-2xl font-mono font-bold text-primary">{formatCurrency(preview.totalAmount)}</p>
                </div>
              </div>
              
              <div>
                <h4 className="text-sm font-medium mb-3 border-b border-border pb-2">Line Items Preview</h4>
                <div className="space-y-3">
                  {preview.lineItems.slice(0, 5).map((item, i) => (
                    <div key={i} className="flex justify-between gap-4 text-sm p-3 bg-card rounded border border-card-border">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.taskTitle}</p>
                        <p className="text-muted-foreground text-xs mt-1 truncate">{item.description}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono">{formatDurationDecimal(item.durationSeconds)}</p>
                        <p className="font-mono font-bold">{formatCurrency(item.amount)}</p>
                      </div>
                    </div>
                  ))}
                  {preview.lineItems.length > 5 && (
                    <p className="text-center text-xs text-muted-foreground py-2 italic bg-muted/20 rounded border border-dashed border-border">
                      + {preview.lineItems.length - 5} more items
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Invoice Notes (Optional)</label>
                <Textarea 
                  placeholder="Thank you for your business!" 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="resize-none"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter className="pt-4 border-t border-border">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createInvoiceMutation.isPending}>
                {createInvoiceMutation.isPending ? "Generating..." : "Generate Invoice"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Invoices() {
  const { data: invoices, isLoading } = useListInvoices();
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const queryClient = useQueryClient();
  
  const updateStatusMutation = useUpdateInvoiceStatus();
  const deleteInvoiceMutation = useDeleteInvoice();

  const handleToggleStatus = (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "paid" ? "unpaid" : "paid";
    updateStatusMutation.mutate({ id, data: { status: newStatus as any } }, {
      onSuccess: () => {
        toast.success(`Invoice marked as ${newStatus}`);
        queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this invoice? This action cannot be undone. Associated time entries will remain but will be marked as unbilled.")) return;
    deleteInvoiceMutation.mutate({ id }, {
      onSuccess: () => {
        toast.success("Invoice deleted");
        queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Invoices</h1>
          <p className="text-muted-foreground mt-1">Billing history for Tom Lam.</p>
        </div>
        <Button onClick={() => setIsGenerateOpen(true)} className="gap-2 shadow-sm shrink-0">
          <Plus className="w-4 h-4" />
          Generate Invoice
        </Button>
      </div>

      <GenerateInvoiceModal open={isGenerateOpen} onOpenChange={setIsGenerateOpen} />

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : invoices && invoices.length > 0 ? (
        <div className="bg-card border border-card-border rounded-lg overflow-hidden shadow-sm">
          <div className="grid grid-cols-12 gap-4 p-4 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <div className="col-span-3">Invoice</div>
            <div className="col-span-3">Date</div>
            <div className="col-span-2 text-right">Hours</div>
            <div className="col-span-2 text-right">Amount</div>
            <div className="col-span-2 text-right pr-4">Status</div>
          </div>
          <div className="divide-y divide-border">
            {invoices.map((inv) => (
              <div key={inv.id} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-muted/10 transition-colors group">
                <div className="col-span-3">
                  <Link href={`/invoices/${inv.id}`} className="font-mono font-bold text-foreground hover:text-primary hover:underline flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    {inv.invoiceNumber}
                  </Link>
                </div>
                <div className="col-span-3 text-sm text-muted-foreground">
                  {formatDate(inv.createdAt)}
                </div>
                <div className="col-span-2 text-right font-mono text-sm">
                  {formatDurationDecimal(inv.totalSeconds)}
                </div>
                <div className="col-span-2 text-right font-mono font-bold text-sm">
                  {formatCurrency(inv.totalAmount)}
                </div>
                <div className="col-span-2 flex justify-end items-center gap-2">
                  <button 
                    onClick={() => handleToggleStatus(inv.id, inv.status)}
                    disabled={updateStatusMutation.isPending}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors hover:brightness-110 ${
                      inv.status === 'paid' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-muted text-muted-foreground border border-border hover:border-muted-foreground/30'
                    }`}
                  >
                    {inv.status === 'paid' ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                    {inv.status.toUpperCase()}
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/invoices/${inv.id}`} className="flex items-center cursor-pointer">
                          <Eye className="w-4 h-4 mr-2" /> View Details
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggleStatus(inv.id, inv.status)} className="cursor-pointer">
                        {inv.status === 'paid' ? <Circle className="w-4 h-4 mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                        Mark as {inv.status === 'paid' ? 'Unpaid' : 'Paid'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDelete(inv.id)} className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer">
                        <Trash2 className="w-4 h-4 mr-2" /> Delete Invoice
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-card rounded-lg border border-dashed border-border">
          <div className="bg-muted p-4 rounded-full mb-4">
            <FileText className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-medium text-foreground mb-2">No invoices yet</h3>
          <p className="text-muted-foreground max-w-sm mb-6">
            Generate your first invoice from unbilled time entries.
          </p>
          <Button onClick={() => setIsGenerateOpen(true)} variant="outline" className="gap-2">
            <Plus className="w-4 h-4" /> Generate Invoice
          </Button>
        </div>
      )}
    </div>
  );
}
