import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tasksTable } from "./tasks";
import { invoicesTable } from "./invoices";

export const timeEntriesTable = pgTable("time_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasksTable.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  invoiceId: uuid("invoice_id").references(() => invoicesTable.id, {
    onDelete: "set null",
  }),
});

export type TimeEntryRow = typeof timeEntriesTable.$inferSelect;
