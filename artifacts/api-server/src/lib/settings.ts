import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export type AppSettings = {
  clientName: string;
  hourlyRate: number;
  businessName: string | null;
  businessEmail: string | null;
  businessPhone: string | null;
};

function rowToSettings(row: {
  clientName: string;
  hourlyRate: string | number;
  businessName: string | null;
  businessEmail: string | null;
  businessPhone: string | null;
}): AppSettings {
  return {
    clientName: row.clientName,
    hourlyRate: Number(row.hourlyRate),
    businessName: row.businessName,
    businessEmail: row.businessEmail,
    businessPhone: row.businessPhone,
  };
}

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.id, 1));
  if (rows.length === 0) {
    const [created] = await db
      .insert(settingsTable)
      .values({ id: 1 })
      .returning();
    return rowToSettings(created);
  }
  return rowToSettings(rows[0]);
}

export async function updateSettings(
  patch: Partial<{
    clientName: string;
    hourlyRate: number;
    businessName: string | null;
    businessEmail: string | null;
    businessPhone: string | null;
  }>,
): Promise<AppSettings> {
  await getSettings();
  const update: Record<string, unknown> = {};
  if (patch.clientName !== undefined) update.clientName = patch.clientName;
  if (patch.hourlyRate !== undefined) update.hourlyRate = patch.hourlyRate.toFixed(2);
  if (patch.businessName !== undefined)
    update.businessName = patch.businessName ? patch.businessName : null;
  if (patch.businessEmail !== undefined)
    update.businessEmail = patch.businessEmail ? patch.businessEmail : null;
  if (patch.businessPhone !== undefined)
    update.businessPhone = patch.businessPhone ? patch.businessPhone : null;
  if (Object.keys(update).length > 0) {
    await db.update(settingsTable).set(update).where(eq(settingsTable.id, 1));
  }
  return getSettings();
}

export function computeAmount(seconds: number, hourlyRate: number): number {
  return Math.round((seconds / 3600) * hourlyRate * 100) / 100;
}
