import { Router, type IRouter } from "express";
import { db, tasksTable, timeEntriesTable } from "@workspace/db";
import { zodSchemas } from "@workspace/api-zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

const router: IRouter = Router();

function durationSeconds(
  startedAt: Date,
  endedAt: Date | null,
): number {
  const end = endedAt ? endedAt.getTime() : Date.now();
  return Math.max(0, Math.floor((end - startedAt.getTime()) / 1000));
}

async function getTaskWithStats(id: string) {
  const [task] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, id));
  if (!task) return null;
  const entries = await db
    .select()
    .from(timeEntriesTable)
    .where(eq(timeEntriesTable.taskId, id));
  let total = 0;
  let unbilled = 0;
  for (const e of entries) {
    const sec = durationSeconds(e.startedAt, e.endedAt);
    total += sec;
    if (!e.invoiceId) unbilled += sec;
  }
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    createdAt: task.createdAt.toISOString(),
    totalSeconds: total,
    unbilledSeconds: unbilled,
    entryCount: entries.length,
  };
}

router.get("/tasks", async (_req, res) => {
  const tasks = await db
    .select()
    .from(tasksTable)
    .orderBy(desc(tasksTable.createdAt));
  const result = await Promise.all(
    tasks.map(async (t) => {
      const stats = await getTaskWithStats(t.id);
      return stats;
    }),
  );
  res.json(result.filter(Boolean));
});

router.post("/tasks", async (req, res) => {
  const body = zodSchemas.CreateTaskBody.parse(req.body);
  const [task] = await db
    .insert(tasksTable)
    .values({ title: body.title, description: body.description })
    .returning();
  res.status(201).json({
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    createdAt: task.createdAt.toISOString(),
  });
});

router.get("/tasks/:id", async (req, res) => {
  const stats = await getTaskWithStats(req.params.id);
  if (!stats) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json(stats);
});

router.patch("/tasks/:id", async (req, res) => {
  const body = zodSchemas.UpdateTaskBody.parse(req.body);
  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.status !== undefined) updates.status = body.status;
  const [task] = await db
    .update(tasksTable)
    .set(updates)
    .where(eq(tasksTable.id, req.params.id))
    .returning();
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json({
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    createdAt: task.createdAt.toISOString(),
  });
});

router.delete("/tasks/:id", async (req, res) => {
  await db.delete(tasksTable).where(eq(tasksTable.id, req.params.id));
  res.status(204).end();
});

router.get("/tasks/:id/entries", async (req, res) => {
  const [task] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, req.params.id));
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  const entries = await db
    .select()
    .from(timeEntriesTable)
    .where(eq(timeEntriesTable.taskId, req.params.id))
    .orderBy(desc(timeEntriesTable.startedAt));
  res.json(
    entries.map((e) => ({
      id: e.id,
      taskId: e.taskId,
      taskTitle: task.title,
      description: e.description,
      startedAt: e.startedAt.toISOString(),
      endedAt: e.endedAt ? e.endedAt.toISOString() : null,
      durationSeconds: durationSeconds(e.startedAt, e.endedAt),
      isRunning: e.endedAt === null,
      invoiceId: e.invoiceId,
    })),
  );
});

router.post("/tasks/:id/start", async (req, res) => {
  const body = zodSchemas.StartTimerBody.parse(req.body);
  const [task] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, req.params.id));
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  // Stop any currently running entry
  await db
    .update(timeEntriesTable)
    .set({ endedAt: new Date() })
    .where(isNull(timeEntriesTable.endedAt));
  const [entry] = await db
    .insert(timeEntriesTable)
    .values({
      taskId: req.params.id,
      description: body.description,
      startedAt: new Date(),
    })
    .returning();
  res.status(201).json({
    id: entry.id,
    taskId: entry.taskId,
    taskTitle: task.title,
    description: entry.description,
    startedAt: entry.startedAt.toISOString(),
    endedAt: null,
    durationSeconds: 0,
    isRunning: true,
    invoiceId: null,
  });
});

export default router;
export { durationSeconds, getTaskWithStats };
