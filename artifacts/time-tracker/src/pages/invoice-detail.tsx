import { useRoute, Link } from "wouter";
import { 
  useGetInvoice, 
  useUpdateInvoiceStatus,
  getGetInvoiceQueryKey,
  getListInvoicesQueryKey,
  getGetSummaryQueryKey
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDurationDecimal, formatDate } from "@/lib/format";
import { ArrowLeft, Printer, CheckCircle2, Circle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo } from "react";

export default function InvoiceDetail() {
  const [, params] = useRoute("/invoices/:id");
  const id = params?.id || "";
  const queryClient = useQueryClient();

  const { data: invoice, isLoading } = useGetInvoice(id, { query: { enabled: !!id, queryKey: getGetInvoiceQueryKey(id) } });
  const updateStatusMutation = useUpdateInvoiceStatus();

  // Group line items by task for cleaner presentation
  const groupedItems = useMemo(() => {
    if (!invoice) return {};
    return invoice.lineItems.reduce((acc, item) => {
      if (!acc[item.taskId]) {
        acc[item.taskId] = {
          taskTitle: item.taskTitle,
          totalDuration: 0,
          totalAmount: 0,
          items: []
        };
      }
      acc[item.taskId].totalDuration += item.durationSeconds;
      acc[item.taskId].totalAmount += item.amount;
      acc[item.taskId].items.push(item);
      return acc;
    }, {} as Record<string, { taskTitle: string, totalDuration: number, totalAmount: number, items: any[] }>);
  }, [invoice]);

  const handlePrint = () => {
    window.print();
  };

  const handleToggleStatus = () => {
    if (!invoice) return;
    const newStatus = invoice.status === "paid" ? "unpaid" : "paid";
    updateStatusMutation.mutate({ id, data: { status: newStatus as any } }, {
      onSuccess: () => {
        toast.success(`Invoice marked as ${newStatus}`);
        queryClient.invalidateQueries({ queryKey: getGetInvoiceQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
      }
    });
  };

  if (isLoading) return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-[600px] w-full" />
    </div>
  );

  if (!invoice) return <div className="text-destructive p-4 bg-destructive/10 rounded-md">Invoice not found.</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center no-print">
        <Link href="/invoices" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors group">
          <ArrowLeft className="w-4 h-4 mr-1 group-hover:-translate-x-1 transition-transform" /> Back to Invoices
        </Link>
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            onClick={handleToggleStatus}
            disabled={updateStatusMutation.isPending}
            className="gap-2"
          >
            {invoice.status === 'paid' ? <Circle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            Mark {invoice.status === 'paid' ? 'Unpaid' : 'Paid'}
          </Button>
          <Button onClick={handlePrint} className="gap-2 shadow-sm">
            <Printer className="w-4 h-4" /> Print / PDF
          </Button>
        </div>
      </div>

      {/* Printable Invoice Container */}
      <div className="bg-white text-black p-10 md:p-16 border border-border shadow-md rounded-md print:border-none print:shadow-none print:p-0">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start gap-8 mb-16 border-b border-gray-200 pb-12">
          <div>
            <h1 className="text-5xl font-bold tracking-tighter mb-6 text-gray-900">INVOICE</h1>
            <div className="space-y-1">
              <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Invoice Number</p>
              <p className="font-mono text-lg">{invoice.invoiceNumber}</p>
            </div>
            <div className="space-y-1 mt-4">
              <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Date of Issue</p>
              <p className="text-lg">{formatDate(invoice.createdAt)}</p>
            </div>
          </div>
          
          <div className="text-right">
            <div className="mb-8">
              <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-1">From</p>
              <p className="font-medium text-lg">Freelance Web Developer</p>
              <p className="text-gray-600">workshop@example.com</p>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-1">Bill To</p>
              <p className="font-medium text-lg">{invoice.clientName}</p>
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex justify-between items-end mb-8">
          <div>
            <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-1">Hourly Rate</p>
            <p className="text-xl font-mono">{formatCurrency(invoice.hourlyRate)}/hr</p>
          </div>
          <div className={`px-4 py-2 rounded-full border-2 text-sm font-bold uppercase tracking-widest flex items-center gap-2 ${
            invoice.status === 'paid' ? 'border-green-600 text-green-700 bg-green-50' : 'border-gray-300 text-gray-500 bg-gray-50'
          }`}>
            {invoice.status === 'paid' && <CheckCircle2 className="w-4 h-4" />}
            {invoice.status}
            {invoice.paidAt && <span className="text-xs font-normal opacity-75 lowercase ml-1">on {formatDate(invoice.paidAt)}</span>}
          </div>
        </div>

        {/* Itemized Table */}
        <div className="mb-16">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-y-2 border-gray-900 text-sm">
                <th className="py-4 font-bold text-gray-500 uppercase tracking-widest">Description</th>
                <th className="py-4 font-bold text-gray-500 uppercase tracking-widest text-right">Hours</th>
                <th className="py-4 font-bold text-gray-500 uppercase tracking-widest text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(groupedItems).map((group: any, i) => (
                <React.Fragment key={i}>
                  {/* Task Header */}
                  <tr className="bg-gray-50/50">
                    <td colSpan={3} className="py-3 px-2 font-bold text-gray-900 border-b border-gray-100">
                      Task: {group.taskTitle}
                    </td>
                  </tr>
                  {/* Entries */}
                  {group.items.map((item: any, j: number) => (
                    <tr key={j} className="border-b border-gray-100 last:border-b-0 group">
                      <td className="py-3 px-4 pl-6 text-gray-600 text-sm">
                        <div className="font-medium">{item.description}</div>
                        <div className="text-xs text-gray-400 mt-1">{formatDate(item.startedAt)}</div>
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-sm text-gray-600">
                        {formatDurationDecimal(item.durationSeconds)}
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-sm text-gray-600">
                        {formatCurrency(item.amount)}
                      </td>
                    </tr>
                  ))}
                  {/* Task Subtotal */}
                  <tr className="border-b-2 border-gray-200">
                    <td className="py-2 text-right text-xs font-bold text-gray-500 uppercase pr-4">Task Subtotal</td>
                    <td className="py-2 text-right font-mono font-bold text-sm">{formatDurationDecimal(group.totalDuration)}</td>
                    <td className="py-2 text-right font-mono font-bold text-sm">{formatCurrency(group.totalAmount)}</td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex flex-col items-end border-t-4 border-gray-900 pt-6">
          <div className="w-full max-w-sm space-y-4">
            <div className="flex justify-between text-gray-600">
              <span className="font-bold text-sm uppercase tracking-widest">Total Hours</span>
              <span className="font-mono text-lg">{formatDurationDecimal(invoice.totalSeconds)}</span>
            </div>
            <div className="flex justify-between items-end border-t border-gray-200 pt-4">
              <span className="font-bold text-lg uppercase tracking-widest text-gray-900">Total Due</span>
              <span className="font-mono text-3xl font-bold text-gray-900">{formatCurrency(invoice.totalAmount)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="mt-16 pt-8 border-t border-gray-200">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-2">Notes</p>
            <p className="text-gray-600 italic">{invoice.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
