import { Router, type IRouter } from "express";
import {
  db,
  invoicesTable,
  tasksTable,
  timeEntriesTable,
} from "@workspace/db";
import { zodSchemas } from "@workspace/api-zod";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { computeAmount, getSettings } from "../lib/settings";
import { durationSeconds } from "./tasks";

const router: IRouter = Router();

function formatLineItem(
  row: {
    entry: typeof timeEntriesTable.$inferSelect;
    task: typeof tasksTable.$inferSelect;
  },
  hourlyRate: number,
) {
  const sec = durationSeconds(row.entry.startedAt, row.entry.endedAt);
  return {
    id: row.entry.id,
    taskId: row.task.id,
    taskTitle: row.task.title,
    description: row.entry.description,
    startedAt: row.entry.startedAt.toISOString(),
    endedAt: (row.entry.endedAt ?? row.entry.startedAt).toISOString(),
    durationSeconds: sec,
    amount: row.entry.noCharge ? 0 : computeAmount(sec, hourlyRate),
    noCharge: row.entry.noCharge,
  };
}

async function loadInvoice(id: string) {
  const [inv] = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.id, id));
  if (!inv) return null;
  const rows = await db
    .select({ entry: timeEntriesTable, task: tasksTable })
    .from(timeEntriesTable)
    .innerJoin(tasksTable, eq(tasksTable.id, timeEntriesTable.taskId))
    .where(eq(timeEntriesTable.invoiceId, id))
    .orderBy(timeEntriesTable.startedAt);
  const rate = Number(inv.hourlyRate);
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    clientName: inv.clientName,
    hourlyRate: rate,
    status: inv.status,
    createdAt: inv.createdAt.toISOString(),
    paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
    notes: inv.notes,
    totalSeconds: inv.totalSeconds,
    totalAmount: Number(inv.totalAmount),
    lineItems: rows.map((r) => formatLineItem(r, rate)),
  };
}

router.get("/invoices", async (_req, res) => {
  const invs = await db
    .select()
    .from(invoicesTable)
    .orderBy(desc(invoicesTable.createdAt));
  const result = await Promise.all(
    invs.map(async (inv) => {
      const rows = await db
        .select({ id: timeEntriesTable.id })
        .from(timeEntriesTable)
        .where(eq(timeEntriesTable.invoiceId, inv.id));
      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        clientName: inv.clientName,
        status: inv.status,
        createdAt: inv.createdAt.toISOString(),
        paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
        totalSeconds: inv.totalSeconds,
        totalAmount: Number(inv.totalAmount),
        lineItemCount: rows.length,
      };
    }),
  );
  res.json(result);
});

router.get("/invoices/preview", async (_req, res) => {
  const settings = await getSettings();
  const rows = await db
    .select({ entry: timeEntriesTable, task: tasksTable })
    .from(timeEntriesTable)
    .innerJoin(tasksTable, eq(tasksTable.id, timeEntriesTable.taskId))
    .where(
      and(
        isNull(timeEntriesTable.invoiceId),
        isNotNull(timeEntriesTable.endedAt),
      ),
    )
    .orderBy(timeEntriesTable.startedAt);
  const lineItems = rows.map((r) => formatLineItem(r, settings.hourlyRate));
  const totalSeconds = lineItems.reduce(
    (sum, li) => (li.noCharge ? sum : sum + li.durationSeconds),
    0,
  );
  res.json({
    clientName: settings.clientName,
    hourlyRate: settings.hourlyRate,
    totalSeconds,
    totalAmount: computeAmount(totalSeconds, settings.hourlyRate),
    lineItems,
  });
});

router.post("/invoices", async (req, res) => {
  const body = zodSchemas.CreateInvoiceBody.parse(req.body ?? {});
  const settings = await getSettings();
  const rows = await db
    .select({ entry: timeEntriesTable })
    .from(timeEntriesTable)
    .where(
      and(
        isNull(timeEntriesTable.invoiceId),
        isNotNull(timeEntriesTable.endedAt),
      ),
    );
  if (rows.length === 0) {
    res.status(400).json({ error: "No unbilled time entries to invoice" });
    return;
  }
  const totalSeconds = rows.reduce(
    (sum, r) =>
      r.entry.noCharge
        ? sum
        : sum + durationSeconds(r.entry.startedAt, r.entry.endedAt),
    0,
  );
  const totalAmount = computeAmount(totalSeconds, settings.hourlyRate);
  const count = await db.$count(invoicesTable);
  const invoiceNumber = `INV-${String(count + 1).padStart(4, "0")}`;
  const [inv] = await db
    .insert(invoicesTable)
    .values({
      invoiceNumber,
      clientName: settings.clientName,
      hourlyRate: settings.hourlyRate.toString(),
      notes: body.notes ?? "",
      totalSeconds,
      totalAmount: totalAmount.toString(),
    })
    .returning();
  await db
    .update(timeEntriesTable)
    .set({ invoiceId: inv.id })
    .where(
      and(
        isNull(timeEntriesTable.invoiceId),
        isNotNull(timeEntriesTable.endedAt),
      ),
    );
  const result = await loadInvoice(inv.id);
  res.status(201).json(result);
});

router.get("/invoices/:id", async (req, res) => {
  const result = await loadInvoice(req.params.id);
  if (!result) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  res.json(result);
});

router.delete("/invoices/:id", async (req, res) => {
  await db
    .update(timeEntriesTable)
    .set({ invoiceId: null })
    .where(eq(timeEntriesTable.invoiceId, req.params.id));
  await db.delete(invoicesTable).where(eq(invoicesTable.id, req.params.id));
  res.status(204).end();
});

router.patch("/invoices/:id/status", async (req, res) => {
  const body = zodSchemas.UpdateInvoiceStatusBody.parse(req.body);
  await db
    .update(invoicesTable)
    .set({
      status: body.status,
      paidAt: body.status === "paid" ? new Date() : null,
    })
    .where(eq(invoicesTable.id, req.params.id));
  const result = await loadInvoice(req.params.id);
  if (!result) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  res.json(result);
});

export default router;
