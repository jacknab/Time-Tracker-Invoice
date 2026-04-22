import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export type AppSettings = { clientName: string; hourlyRate: number };

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.id, 1));
  if (rows.length === 0) {
    const [created] = await db
      .insert(settingsTable)
      .values({ id: 1 })
      .returning();
    return { clientName: created.clientName, hourlyRate: Number(created.hourlyRate) };
  }
  return { clientName: rows[0].clientName, hourlyRate: Number(rows[0].hourlyRate) };
}

export async function updateSettings(
  patch: Partial<{ clientName: string; hourlyRate: number }>,
): Promise<AppSettings> {
  await getSettings();
  const update: Record<string, unknown> = {};
  if (patch.clientName !== undefined) update.clientName = patch.clientName;
  if (patch.hourlyRate !== undefined) update.hourlyRate = patch.hourlyRate.toFixed(2);
  if (Object.keys(update).length > 0) {
    await db.update(settingsTable).set(update).where(eq(settingsTable.id, 1));
  }
  return getSettings();
}

export function computeAmount(seconds: number, hourlyRate: number): number {
  return Math.round((seconds / 3600) * hourlyRate * 100) / 100;
}
