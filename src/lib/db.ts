import Dexie, { type Table } from 'dexie';

export interface KV<T = unknown> {
  key: string;
  value: T;
}

/**
 * The single local database. Every feature adds its tables here via a new
 * `version()` so existing installs migrate in place. Nothing leaves the device.
 */
export class PlannerDB extends Dexie {
  kv!: Table<KV, string>;

  constructor() {
    super('universal-planner');
    this.version(1).stores({
      kv: '&key',
    });
  }
}

export const db = new PlannerDB();

export async function getKV<T>(key: string): Promise<T | undefined> {
  return (await db.kv.get(key))?.value as T | undefined;
}

export function setKV<T>(key: string, value: T) {
  return db.kv.put({ key, value });
}
