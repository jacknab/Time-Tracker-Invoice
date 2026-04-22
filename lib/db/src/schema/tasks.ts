import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const tasksTable = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status", {
    enum: ["active", "completed", "archived"],
  })
    .notNull()
    .default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type TaskRow = typeof tasksTable.$inferSelect;
