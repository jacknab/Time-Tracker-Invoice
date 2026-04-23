import { useRoute, Link } from "wouter";
import {
  useGetInvoice,
  useUpdateInvoiceStatus,
  useAddInvoiceCredit,
  useDeleteInvoiceCredit,
  getGetInvoiceQueryKey,
  getListInvoicesQueryKey,
  getGetSummaryQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency, formatDurationDecimal, formatDate } from "@/lib/format";
import { ArrowLeft, Printer, CheckCircle2, Circle, Download, FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo, useRef, useState } from "react";
import React from "react";

type Group = {
  taskTitle: string;
  totalDuration: number;
  totalAmount: number;
  items: any[];
};

export default function InvoiceDetail() {
  const [, params] = useRoute("/invoices/:id");
  const id = params?.id || "";
  const queryClient = useQueryClient();

  const { data: invoice, isLoading } = useGetInvoice(id, { query: { enabled: !!id, queryKey: getGetInvoiceQueryKey(id) } });
  const updateStatusMutation = useUpdateInvoiceStatus();
  const addCreditMutation = useAddInvoiceCredit();
  const deleteCreditMutation = useDeleteInvoiceCredit();

  const [creditOpen, setCreditOpen] = useState(false);
  const [creditDescription, setCreditDescription] = useState("");
  const [creditAmount, setCreditAmount] = useState("");

  const refreshInvoice = () => {
    queryClient.invalidateQueries({ queryKey: getGetInvoiceQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
  };

  const handleAddCredit = () => {
    const amount = parseFloat(creditAmount);
    if (!creditDescription.trim()) {
      toast.error("Description is required");
      return;
    }
    if (!isFinite(amount) || amount <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }
    addCreditMutation.mutate(
      { id, data: { description: creditDescription.trim(), amount } },
      {
        onSuccess: () => {
          toast.success("Credit added");
          setCreditOpen(false);
          setCreditDescription("");
          setCreditAmount("");
          refreshInvoice();
        },
        onError: () => toast.error("Failed to add credit"),
      },
    );
  };

  const handleDeleteCredit = (creditId: string) => {
    if (!confirm("Remove this credit?")) return;
    deleteCreditMutation.mutate(
      { id, creditId },
      {
        onSuccess: () => {
          toast.success("Credit removed");
          refreshInvoice();
        },
        onError: () => toast.error("Failed to remove credit"),
      },
    );
  };

  const { billableGroups, complimentaryGroups, complimentarySeconds } = useMemo(() => {
    const groupBy = (items: any[]) =>
      items.reduce((acc: Record<string, Group>, item: any) => {
        if (!acc[item.taskId]) {
          acc[item.taskId] = {
            taskTitle: item.taskTitle,
            totalDuration: 0,
            totalAmount: 0,
            items: [],
          };
        }
        acc[item.taskId].totalDuration += item.durationSeconds;
        acc[item.taskId].totalAmount += item.amount;
        acc[item.taskId].items.push(item);
        return acc;
      }, {} as Record<string, Group>);
    if (!invoice) return { billableGroups: {} as Record<string, Group>, complimentaryGroups: {} as Record<string, Group>, complimentarySeconds: 0 };
    const billable = invoice.lineItems.filter((i: any) => !i.noCharge);
    const comp = invoice.lineItems.filter((i: any) => i.noCharge);
    return {
      billableGroups: groupBy(billable),
      complimentaryGroups: groupBy(comp),
      complimentarySeconds: comp.reduce((s: number, i: any) => s + i.durationSeconds, 0),
    };
  }, [invoice]);

  const handlePrint = () => {
    window.print();
  };

  const mainRef = useRef<HTMLDivElement>(null);
  const itemizedHeaderRef = useRef<HTMLDivElement>(null);
  const itemizedBodyRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleExportPdf = async () => {
    if (!invoice || !mainRef.current) return;
    setPdfLoading(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);

      const pdf = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 36;
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;

      const renderCanvas = (node: HTMLElement) =>
        html2canvas(node, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          windowWidth: node.scrollWidth,
        });

      const placeSliced = (
        canvas: HTMLCanvasElement,
        topReserved: number,
        onPageStart?: () => void,
      ) => {
        const ratio = usableWidth / canvas.width;
        const fullHeightPt = canvas.height * ratio;
        const availPt = usableHeight - topReserved;
        if (fullHeightPt <= availPt) {
          if (onPageStart) onPageStart();
          const imgData = canvas.toDataURL("image/png");
          pdf.addImage(imgData, "PNG", margin, margin + topReserved, usableWidth, fullHeightPt);
          return;
        }
        const sliceHeightPx = Math.floor(availPt / ratio);
        let yOffset = 0;
        let first = true;
        while (yOffset < canvas.height) {
          if (!first) pdf.addPage();
          first = false;
          if (onPageStart) onPageStart();
          const sliceHeight = Math.min(sliceHeightPx, canvas.height - yOffset);
          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sliceHeight;
          const ctx = sliceCanvas.getContext("2d");
          if (!ctx) break;
          ctx.drawImage(
            canvas,
            0, yOffset, canvas.width, sliceHeight,
            0, 0, canvas.width, sliceHeight,
          );
          const imgData = sliceCanvas.toDataURL("image/png");
          pdf.addImage(imgData, "PNG", margin, margin + topReserved, usableWidth, sliceHeight * ratio);
          yOffset += sliceHeight;
        }
      };

      // --- Page 1+: Main professional invoice ---
      const mainCanvas = await renderCanvas(mainRef.current);
      placeSliced(mainCanvas, 0);

      // --- Itemized breakdown pages ---
      if (itemizedBodyRef.current && itemizedHeaderRef.current) {
        const headerCanvas = await renderCanvas(itemizedHeaderRef.current);
        const headerRatio = usableWidth / headerCanvas.width;
        const headerHeightPt = headerCanvas.height * headerRatio;
        const headerImg = headerCanvas.toDataURL("image/png");

        const bodyCanvas = await renderCanvas(itemizedBodyRef.current);

        pdf.addPage();
        placeSliced(bodyCanvas, headerHeightPt + 12, () => {
          pdf.addImage(headerImg, "PNG", margin, margin, usableWidth, headerHeightPt);
        });
      }

      const filename = `${invoice.invoiceNumber}-${invoice.clientName.replace(/\s+/g, "_")}.pdf`;
      pdf.save(filename);
      toast.success("PDF downloaded");
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleExportCsv = () => {
    if (!invoice) return;
    const escape = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      "Invoice Number",
      "Client",
      "Status",
      "Issued",
      "Task",
      "Description",
      "Started",
      "Ended",
      "Hours",
      "Rate",
      "Amount",
    ];
    const rows = invoice.lineItems.map((li: any) => [
      invoice.invoiceNumber,
      invoice.clientName,
      invoice.status,
      formatDate(invoice.createdAt),
      li.taskTitle,
      li.description,
      new Date(li.startedAt).toISOString(),
      new Date(li.endedAt).toISOString(),
      (li.durationSeconds / 3600).toFixed(2),
      invoice.hourlyRate.toFixed(2),
      li.amount.toFixed(2),
    ]);
    const totalRow = [
      "",
      "",
      "",
      "",
      "",
      "TOTAL",
      "",
      "",
      (invoice.totalSeconds / 3600).toFixed(2),
      "",
      invoice.totalAmount.toFixed(2),
    ];
    const csv = [header, ...rows, totalRow]
      .map((r) => r.map(escape).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${invoice.invoiceNumber}-${invoice.clientName.replace(/\s+/g, "_")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
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

  const billableTaskCount = Object.keys(billableGroups).length;
  const hasComplimentary = Object.keys(complimentaryGroups).length > 0;
  const hasItemized = invoice.lineItems.length > 0;

  // Compact header used at the top of every itemized page
  const ItemizedPageHeader = (
    <div className="flex justify-between items-end pb-4 mb-6 border-b-2 border-gray-900">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Itemized Time Entries</h2>
        <p className="text-sm text-gray-500 mt-1">Detailed breakdown — supplement to invoice</p>
      </div>
      <div className="text-right text-sm">
        <div className="font-mono font-bold">{invoice.invoiceNumber}</div>
        <div className="text-gray-600">{invoice.clientName}</div>
        <div className="text-gray-500 text-xs uppercase tracking-widest mt-1">{formatDate(invoice.createdAt)}</div>
      </div>
    </div>
  );

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
          <Button variant="outline" onClick={() => setCreditOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Add Credit
          </Button>
          <Button variant="outline" onClick={handleExportCsv} className="gap-2">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <Button
            variant="outline"
            onClick={handleExportPdf}
            disabled={pdfLoading}
            className="gap-2"
          >
            {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {pdfLoading ? "Generating…" : "Download PDF"}
          </Button>
          <Button onClick={handlePrint} className="gap-2 shadow-sm">
            <Printer className="w-4 h-4" /> Print
          </Button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* MAIN INVOICE — professional summary page                      */}
      {/* ============================================================ */}
      <div ref={mainRef} className="bg-white text-black p-10 md:p-16 border border-border shadow-md rounded-md print:border-none print:shadow-none print:p-0">
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

        {/* Status / Rate row */}
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

        {/* Summary table — one row per task */}
        <div className="mb-12">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-y-2 border-gray-900 text-sm">
                <th className="py-4 font-bold text-gray-500 uppercase tracking-widest">Task</th>
                <th className="py-4 font-bold text-gray-500 uppercase tracking-widest text-right">Hours</th>
                <th className="py-4 font-bold text-gray-500 uppercase tracking-widest text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(Object.values(billableGroups) as Group[]).map((group, i) => (
                <tr key={i} className="border-b border-gray-200">
                  <td className="py-4 font-medium text-gray-900">{group.taskTitle}</td>
                  <td className="py-4 text-right font-mono">{formatDurationDecimal(group.totalDuration)}</td>
                  <td className="py-4 text-right font-mono">{formatCurrency(group.totalAmount)}</td>
                </tr>
              ))}
              {hasComplimentary && (
                <tr className="border-b border-gray-200 text-gray-500 italic">
                  <td className="py-4">Complimentary / no-charge work</td>
                  <td className="py-4 text-right font-mono">{formatDurationDecimal(complimentarySeconds)}</td>
                  <td className="py-4 text-right font-mono">{formatCurrency(0)}</td>
                </tr>
              )}
              {billableTaskCount === 0 && !hasComplimentary && (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-gray-400 italic">No billable items</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Credits */}
        {invoice.credits.length > 0 && (
          <div className="mt-8 mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Credits / Deductions</h2>
            <table className="w-full">
              <tbody>
                {invoice.credits.map((c: any) => (
                  <tr key={c.id} className="border-b border-gray-100 last:border-b-0">
                    <td className="py-2 text-sm text-gray-700">{c.description}</td>
                    <td className="py-2 text-right font-mono text-sm text-red-600 whitespace-nowrap">
                      −{formatCurrency(c.amount)}
                    </td>
                    <td className="py-2 pl-3 text-right w-10 print:hidden">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-gray-400 hover:text-destructive"
                        onClick={() => handleDeleteCredit(c.id)}
                        disabled={deleteCreditMutation.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals */}
        <div className="flex flex-col items-end border-t-4 border-gray-900 pt-6 mt-8">
          <div className="w-full max-w-sm space-y-3">
            <div className="flex justify-between text-gray-600">
              <span className="font-bold text-sm uppercase tracking-widest">Total Hours</span>
              <span className="font-mono text-lg">{formatDurationDecimal(invoice.totalSeconds)}</span>
            </div>
            <div className="flex justify-between text-gray-700">
              <span className="font-bold text-sm uppercase tracking-widest">Subtotal</span>
              <span className="font-mono text-lg">{formatCurrency(invoice.subtotalAmount)}</span>
            </div>
            {invoice.creditsAmount > 0 && (
              <div className="flex justify-between text-red-600">
                <span className="font-bold text-sm uppercase tracking-widest">Credits</span>
                <span className="font-mono text-lg">−{formatCurrency(invoice.creditsAmount)}</span>
              </div>
            )}
            <div className="flex justify-between items-end border-t border-gray-200 pt-4">
              <span className="font-bold text-lg uppercase tracking-widest text-gray-900">Total Owed</span>
              <span className="font-mono text-3xl font-bold text-gray-900">{formatCurrency(invoice.totalAmount)}</span>
            </div>
            <div className="pt-2 print:hidden">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setCreditOpen(true)}
              >
                <Plus className="w-4 h-4 mr-2" /> Add Credit / Deduction
              </Button>
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

        {hasItemized && (
          <div className="mt-16 pt-8 border-t border-gray-200 text-xs text-gray-500 italic">
            An itemized breakdown of all time entries is appended on the following pages for your records.
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* ITEMIZED BREAKDOWN — appended pages with repeating header     */}
      {/* ============================================================ */}
      {hasItemized && (
        <div className="bg-white text-black p-10 md:p-16 border border-border shadow-md rounded-md print:border-none print:shadow-none print:p-0 page-break-before">
          {/* Header rendered separately for PDF; visible in screen view too */}
          <div ref={itemizedHeaderRef}>{ItemizedPageHeader}</div>

          <div ref={itemizedBodyRef}>
            {/* Single table with repeating thead so print pages each get the column header */}
            <table className="w-full text-left border-collapse">
              <thead className="repeat-header">
                <tr className="border-b-2 border-gray-900 text-xs">
                  <th className="py-3 font-bold text-gray-500 uppercase tracking-widest">Date</th>
                  <th className="py-3 font-bold text-gray-500 uppercase tracking-widest">Description</th>
                  <th className="py-3 font-bold text-gray-500 uppercase tracking-widest text-right whitespace-nowrap">Hours</th>
                  <th className="py-3 font-bold text-gray-500 uppercase tracking-widest text-right whitespace-nowrap">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(Object.values(billableGroups) as Group[]).map((group, i) => (
                  <React.Fragment key={`b-${i}`}>
                    <tr className="bg-gray-50">
                      <td colSpan={4} className="py-2 px-2 font-bold text-gray-900 text-sm">
                        {group.taskTitle}
                      </td>
                    </tr>
                    {group.items.map((item, j) => (
                      <tr key={j} className="border-b border-gray-100">
                        <td className="py-2 px-2 text-xs text-gray-500 whitespace-nowrap align-top">
                          {formatDate(item.startedAt)}
                        </td>
                        <td className="py-2 px-2 text-sm text-gray-700">{item.description}</td>
                        <td className="py-2 px-2 text-right font-mono text-sm text-gray-700 whitespace-nowrap align-top">
                          {formatDurationDecimal(item.durationSeconds)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-sm text-gray-700 whitespace-nowrap align-top">
                          {formatCurrency(item.amount)}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-b-2 border-gray-300">
                      <td colSpan={2} className="py-2 px-2 text-right text-xs font-bold text-gray-500 uppercase">Subtotal</td>
                      <td className="py-2 px-2 text-right font-mono text-sm font-bold">{formatDurationDecimal(group.totalDuration)}</td>
                      <td className="py-2 px-2 text-right font-mono text-sm font-bold">{formatCurrency(group.totalAmount)}</td>
                    </tr>
                  </React.Fragment>
                ))}

                {hasComplimentary && (
                  <>
                    <tr>
                      <td colSpan={4} className="pt-8 pb-2 text-sm font-bold uppercase tracking-widest text-gray-900">
                        Complimentary / No Charge
                      </td>
                    </tr>
                    {(Object.values(complimentaryGroups) as Group[]).map((group, i) => (
                      <React.Fragment key={`c-${i}`}>
                        <tr className="bg-gray-50">
                          <td colSpan={4} className="py-2 px-2 font-bold text-gray-900 text-sm">
                            {group.taskTitle}
                          </td>
                        </tr>
                        {group.items.map((item, j) => (
                          <tr key={j} className="border-b border-gray-100">
                            <td className="py-2 px-2 text-xs text-gray-500 whitespace-nowrap align-top">
                              {formatDate(item.startedAt)}
                            </td>
                            <td className="py-2 px-2 text-sm text-gray-700">{item.description}</td>
                            <td className="py-2 px-2 text-right font-mono text-sm text-gray-700 whitespace-nowrap align-top">
                              {formatDurationDecimal(item.durationSeconds)}
                            </td>
                            <td className="py-2 px-2 text-right font-mono text-sm text-gray-500 italic whitespace-nowrap align-top">
                              {formatCurrency(0)}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                    <tr className="border-b-2 border-gray-300">
                      <td colSpan={2} className="py-2 px-2 text-right text-xs font-bold text-gray-500 uppercase">Complimentary Total</td>
                      <td className="py-2 px-2 text-right font-mono text-sm font-bold">{formatDurationDecimal(complimentarySeconds)}</td>
                      <td className="py-2 px-2 text-right font-mono text-sm font-bold">{formatCurrency(0)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Credit Dialog */}
      <Dialog open={creditOpen} onOpenChange={setCreditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Credit / Deduction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="credit-description">Description</Label>
              <Input
                id="credit-description"
                value={creditDescription}
                onChange={(e) => setCreditDescription(e.target.value)}
                placeholder="e.g. Early payment discount"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="credit-amount">Amount to deduct ($)</Label>
              <Input
                id="credit-amount"
                type="number"
                step="0.01"
                min="0"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                placeholder="50.00"
              />
              <p className="text-xs text-muted-foreground">
                This amount will be subtracted from the invoice subtotal.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreditOpen(false)}>Cancel</Button>
            <Button onClick={handleAddCredit} disabled={addCreditMutation.isPending}>
              {addCreditMutation.isPending ? "Adding..." : "Add Credit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
