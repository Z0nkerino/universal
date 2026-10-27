import { db } from './db';

const APP_ID = 'universal-planner';

export interface Backup {
  app: typeof APP_ID;
  schema: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

export async function exportBackup(): Promise<Backup> {
  const tables: Record<string, unknown[]> = {};
  await db.transaction('r', db.tables, async () => {
    for (const t of db.tables) if (t.name !== 'handles') tables[t.name] = await t.toArray();
  });
  return { app: APP_ID, schema: db.verno, exportedAt: new Date().toISOString(), tables };
}

export async function downloadBackup() {
  const data = await exportBackup();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `universal-planner-backup-${data.exportedAt.slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Replaces all local data with the contents of a backup file. */
export async function importBackup(file: File) {
  const parsed = JSON.parse(await file.text()) as Partial<Backup>;
  if (parsed.app !== APP_ID || typeof parsed.tables !== 'object' || !parsed.tables) {
    throw new Error('This file is not a Universal Planner backup.');
  }
  const tables = parsed.tables;
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) {
      const rows = tables[t.name];
      if (!Array.isArray(rows)) continue;
      await t.clear();
      await t.bulkPut(rows);
    }
  });
}

/** Erases this profile's data. Other profiles, and the list of profiles, stay as they are. */
export async function wipeAllData() {
  await db.delete();
  try {
    ['up.theme', 'up.look'].forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage unavailable */
  }
  location.reload();
}
