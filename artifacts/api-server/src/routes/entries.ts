import { Router, type IRouter } from "express";
import { db, tasksTable, timeEntriesTable } from "@workspace/db";
import { zodSchemas } from "@workspace/api-zod";
import { eq, isNull } from "drizzle-orm";
import { durationSeconds } from "./tasks";

const router: IRouter = Router();

async function entryWithTitle(entryId: string) {
  const [row] = await db
    .select({
      entry: timeEntriesTable,
      task: tasksTable,
    })
    .from(timeEntriesTable)
    .innerJoin(tasksTable, eq(tasksTable.id, timeEntriesTable.taskId))
    .where(eq(timeEntriesTable.id, entryId));
  if (!row) return null;
  return {
    id: row.entry.id,
    taskId: row.entry.taskId,
    taskTitle: row.task.title,
    description: row.entry.description,
    startedAt: row.entry.startedAt.toISOString(),
    endedAt: row.entry.endedAt ? row.entry.endedAt.toISOString() : null,
    durationSeconds: durationSeconds(row.entry.startedAt, row.entry.endedAt),
    isRunning: row.entry.endedAt === null,
    invoiceId: row.entry.invoiceId,
  };
}

router.post("/entries/:entryId/stop", async (req, res) => {
  const [existing] = await db
    .select()
    .from(timeEntriesTable)
    .where(eq(timeEntriesTable.id, req.params.entryId));
  if (!existing) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  if (existing.endedAt === null) {
    await db
      .update(timeEntriesTable)
      .set({ endedAt: new Date() })
      .where(eq(timeEntriesTable.id, req.params.entryId));
  }
  const result = await entryWithTitle(req.params.entryId);
  res.json(result);
});

router.patch("/entries/:entryId", async (req, res) => {
  const body = zodSchemas.UpdateEntryBody.parse(req.body);
  const updates: Record<string, unknown> = {};
  if (body.description !== undefined) updates.description = body.description;
  if (body.startedAt !== undefined) updates.startedAt = new Date(body.startedAt);
  if (body.endedAt !== undefined) updates.endedAt = new Date(body.endedAt);
  if (
    updates.startedAt instanceof Date &&
    updates.endedAt instanceof Date &&
    (updates.endedAt as Date).getTime() <= (updates.startedAt as Date).getTime()
  ) {
    res.status(400).json({ error: "End time must be after start time" });
    return;
  }
  await db
    .update(timeEntriesTable)
    .set(updates)
    .where(eq(timeEntriesTable.id, req.params.entryId));
  const result = await entryWithTitle(req.params.entryId);
  if (!result) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  res.json(result);
});

router.delete("/entries/:entryId", async (req, res) => {
  await db
    .delete(timeEntriesTable)
    .where(eq(timeEntriesTable.id, req.params.entryId));
  res.status(204).end();
});

router.get("/entries/active", async (_req, res) => {
  const [row] = await db
    .select({
      entry: timeEntriesTable,
      task: tasksTable,
    })
    .from(timeEntriesTable)
    .innerJoin(tasksTable, eq(tasksTable.id, timeEntriesTable.taskId))
    .where(isNull(timeEntriesTable.endedAt))
    .limit(1);
  if (!row) {
    res.json({ entry: null });
    return;
  }
  res.json({
    entry: {
      id: row.entry.id,
      taskId: row.entry.taskId,
      taskTitle: row.task.title,
      description: row.entry.description,
      startedAt: row.entry.startedAt.toISOString(),
      endedAt: null,
      durationSeconds: durationSeconds(row.entry.startedAt, null),
      isRunning: true,
      invoiceId: row.entry.invoiceId,
    },
  });
});

export default router;
export { entryWithTitle };
