import { Router, type IRouter } from "express";
import { db, invoicesTable, tasksTable, timeEntriesTable } from "@workspace/db";
import { desc, eq, isNull } from "drizzle-orm";
import { computeAmount, getSettings } from "../lib/settings";
import { durationSeconds } from "./tasks";

const router: IRouter = Router();

router.get("/summary", async (_req, res) => {
  const settings = await getSettings();
  const tasks = await db.select().from(tasksTable);
  const entries = await db
    .select({ entry: timeEntriesTable, task: tasksTable })
    .from(timeEntriesTable)
    .innerJoin(tasksTable, eq(tasksTable.id, timeEntriesTable.taskId))
    .orderBy(desc(timeEntriesTable.startedAt));

  let totalSeconds = 0;
  let unbilledSeconds = 0;
  let activeEntry: ReturnType<typeof toEntry> | null = null;

  for (const r of entries) {
    const sec = durationSeconds(r.entry.startedAt, r.entry.endedAt);
    totalSeconds += sec;
    if (!r.entry.invoiceId) unbilledSeconds += sec;
    if (r.entry.endedAt === null && !activeEntry) {
      activeEntry = toEntry(r);
    }
  }

  const invs = await db.select().from(invoicesTable);
  let paidAmount = 0;
  let outstandingAmount = 0;
  for (const inv of invs) {
    const amt = Number(inv.totalAmount);
    if (inv.status === "paid") paidAmount += amt;
    else outstandingAmount += amt;
  }

  const recentEntries = entries
    .filter((r) => r.entry.endedAt !== null)
    .slice(0, 8)
    .map(toEntry);

  res.json({
    clientName: settings.clientName,
    hourlyRate: settings.hourlyRate,
    totalTasks: tasks.length,
    totalSeconds,
    unbilledSeconds,
    unbilledAmount: computeAmount(unbilledSeconds, settings.hourlyRate),
    paidAmount: Math.round(paidAmount * 100) / 100,
    outstandingAmount: Math.round(outstandingAmount * 100) / 100,
    recentEntries,
    activeEntry,
  });
});

function toEntry(r: {
  entry: typeof timeEntriesTable.$inferSelect;
  task: typeof tasksTable.$inferSelect;
}) {
  return {
    id: r.entry.id,
    taskId: r.entry.taskId,
    taskTitle: r.task.title,
    description: r.entry.description,
    startedAt: r.entry.startedAt.toISOString(),
    endedAt: r.entry.endedAt ? r.entry.endedAt.toISOString() : null,
    durationSeconds: durationSeconds(r.entry.startedAt, r.entry.endedAt),
    isRunning: r.entry.endedAt === null,
    invoiceId: r.entry.invoiceId,
  };
}

export default router;
