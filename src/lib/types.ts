// Shared record types for everything stored on the device.
// Times are epoch milliseconds; calendar days are 'YYYY-MM-DD' strings in local time.

export type ID = string;
export type DayKey = string; // 'YYYY-MM-DD'

interface Base {
  id: ID;
  createdAt: number;
  updatedAt: number;
  /** Seeded sample data, removable in one click. */
  demo?: boolean;
}

export type TaskStatus = 'inbox' | 'today' | 'scheduled' | 'someday';
export type Energy = 'low' | 'med' | 'high';
export type Priority = 0 | 1 | 2 | 3; // none, low, medium, high

export interface Subtask {
  id: ID;
  title: string;
  done: boolean;
}

export interface Task extends Base {
  title: string;
  notes?: string;
  status: TaskStatus;
  done: 0 | 1;
  doneAt?: number;
  priority: Priority;
  tags: string[];
  subtasks: Subtask[];
  due?: DayKey;
  estimate?: number; // minutes
  energy?: Energy;
  /** Time-blocked slot on the timeline. */
  start?: number;
  end?: number;
  goalId?: ID;
  /** One of today's top three. */
  top?: 0 | 1;
  order: number;
  remindAt?: number;
}

export type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly';
export interface Recurrence {
  freq: Freq;
  interval: number;
  /** 0 = Sunday … 6 = Saturday, weekly only. */
  byDay?: number[];
  until?: number;
  count?: number;
}

export const EVENT_COLORS = ['blue', 'pink', 'violet', 'sky', 'rose', 'gray'] as const;
export type EventColor = (typeof EVENT_COLORS)[number];

export interface CalEvent extends Base {
  title: string;
  start: number;
  end: number;
  allDay?: boolean;
  color: EventColor;
  location?: string;
  notes?: string;
  rrule?: Recurrence;
  /** Start times of skipped occurrences. */
  exdates?: number[];
  reminder?: number; // minutes before; undefined = none
  /** UID from an imported .ics, kept so re-imports don't duplicate. */
  uid?: string;
}

/** One concrete occurrence of an event (recurrences expanded). */
export interface Occurrence {
  event: CalEvent;
  start: number;
  end: number;
}

export interface Habit extends Base {
  name: string;
  emoji: string;
  color: 'blue' | 'pink';
  /** Times per period, e.g. 3 per week, 1 per day. */
  target: number;
  period: 'day' | 'week';
  archived?: boolean;
  order: number;
}

export interface HabitLog {
  id: ID;
  habitId: ID;
  date: DayKey;
  demo?: boolean;
}

export interface Milestone {
  id: ID;
  title: string;
  done: boolean;
}

export interface Goal extends Base {
  title: string;
  why?: string;
  targetDate?: DayKey;
  milestones: Milestone[];
  done?: boolean;
}

export interface FocusSession {
  id: ID;
  taskId?: ID;
  start: number;
  end: number;
  minutes: number;
  demo?: boolean;
}

export interface Note extends Base {
  title: string;
  /** TipTap JSON document. */
  content: unknown;
  /** Plain text for search and previews. */
  text: string;
  folder: string;
  tags: string[];
  pinned: 0 | 1;
  /** Titles referenced with [[…]]. */
  links: string[];
}

export type IdeaColumn = 'raw' | 'exploring' | 'doing' | 'done';
export interface Idea extends Base {
  title: string;
  body: string;
  column: IdeaColumn;
  x: number;
  y: number;
  color: 'none' | 'blue' | 'pink';
  order: number;
  groupId?: ID;
}
export interface IdeaLink {
  id: ID;
  from: ID;
  to: ID;
  demo?: boolean;
}
export interface IdeaGroup extends Base {
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Food {
  id: ID;
  name: string;
  nameRu?: string;
  /** Human serving description, e.g. "1 cup (240 g)". */
  serving: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  category: string;
  custom?: boolean;
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export interface MealEntry extends Base {
  date: DayKey;
  slot: MealSlot;
  foodId?: ID;
  name: string;
  servings: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}
export interface SavedMeal extends Base {
  name: string;
  items: Pick<MealEntry, 'foodId' | 'name' | 'servings' | 'kcal' | 'protein' | 'carbs' | 'fat'>[];
}

export interface WaterLog { id: ID; date: DayKey; ml: number; at: number; demo?: boolean }
export interface WeightLog { id: ID; date: DayKey; kg: number; demo?: boolean }
export interface SleepLog { id: ID; date: DayKey; hours: number; quality?: 1 | 2 | 3 | 4 | 5; demo?: boolean }
export interface MoodLog { id: ID; date: DayKey; score: 1 | 2 | 3 | 4 | 5; note?: string; demo?: boolean }

export interface ChatMessage {
  id: ID;
  role: 'user' | 'afina';
  text: string;
  at: number;
  chips?: string[];
  /** Pending destructive action awaiting the user's confirmation. */
  confirm?: { label: string; action: string; payload: unknown };
  demo?: boolean;
}
