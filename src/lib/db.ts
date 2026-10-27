import Dexie, { type Table } from 'dexie';
import { activeProfileId, dbNameFor } from './profiles';
import type {
  CalEvent,
  ChatMessage,
  FocusSession,
  Food,
  Goal,
  Habit,
  HabitLog,
  Idea,
  IdeaGroup,
  IdeaLink,
  MealEntry,
  MoodLog,
  Note,
  SavedMeal,
  SleepLog,
  Task,
  WaterLog,
  WeightLog,
} from './types';

export interface KV<T = unknown> {
  key: string;
  value: T;
}

/**
 * The single local database. Every schema change adds a new `version()` so existing
 * installs migrate in place. Nothing leaves the device.
 */
export class PlannerDB extends Dexie {
  kv!: Table<KV, string>;
  tasks!: Table<Task, string>;
  events!: Table<CalEvent, string>;
  habits!: Table<Habit, string>;
  habitLogs!: Table<HabitLog, string>;
  goals!: Table<Goal, string>;
  focus!: Table<FocusSession, string>;
  notes!: Table<Note, string>;
  ideas!: Table<Idea, string>;
  ideaLinks!: Table<IdeaLink, string>;
  ideaGroups!: Table<IdeaGroup, string>;
  foods!: Table<Food, string>;
  meals!: Table<MealEntry, string>;
  savedMeals!: Table<SavedMeal, string>;
  water!: Table<WaterLog, string>;
  weight!: Table<WeightLog, string>;
  sleep!: Table<SleepLog, string>;
  mood!: Table<MoodLog, string>;
  chat!: Table<ChatMessage, string>;
  handles!: Table<{ key: string; handle: FileSystemDirectoryHandle }, string>;

  constructor() {
    // Each local profile has its own database (see profiles.ts).
    super(dbNameFor(activeProfileId()));
    this.version(1).stores({ kv: '&key' });
    this.version(2).stores({
      kv: '&key',
      tasks: 'id, status, done, due, start, goalId, doneAt, createdAt, *tags',
      events: 'id, start, end, uid',
      habits: 'id, order',
      habitLogs: 'id, habitId, date, [habitId+date]',
      goals: 'id, createdAt',
      focus: 'id, taskId, start',
      notes: 'id, folder, pinned, updatedAt, *tags, *links',
      ideas: 'id, column, order',
      ideaLinks: 'id, from, to',
      ideaGroups: 'id',
      foods: 'id, name',
      meals: 'id, date, createdAt',
      savedMeals: 'id',
      water: 'id, date',
      weight: 'id, date',
      sleep: 'id, date',
      mood: 'id, date',
      chat: 'id, at',
    });
    // v3: events can come from a connector (a subscribed calendar, holidays).
    // Folder handles for the backup connector live in their own table and are never exported.
    this.version(3).stores({ events: 'id, start, end, uid, source', handles: '&key' });
  }
}

export const db = new PlannerDB();

export async function getKV<T>(key: string): Promise<T | undefined> {
  return (await db.kv.get(key))?.value as T | undefined;
}

export function setKV<T>(key: string, value: T) {
  return db.kv.put({ key, value });
}

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Fills id/createdAt/updatedAt for a new record. */
export function stamp<T extends object>(fields: T): T & { id: string; createdAt: number; updatedAt: number } {
  const now = Date.now();
  return { id: uid(), createdAt: now, updatedAt: now, ...fields };
}
