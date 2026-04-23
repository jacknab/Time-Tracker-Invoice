import { numeric, pgTable, text, integer } from "drizzle-orm/pg-core";

export const settingsTable = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  clientName: text("client_name").notNull().default("Tom Lam"),
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 })
    .notNull()
    .default("7.50"),
  businessName: text("business_name"),
  businessEmail: text("business_email"),
  businessPhone: text("business_phone"),
});

export type SettingsRow = typeof settingsTable.$inferSelect;
