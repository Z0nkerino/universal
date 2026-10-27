import { create } from 'zustand';
import { db } from '@/lib/db';
import { useSettings } from '@/lib/settings';
import type { CalEvent } from '@/lib/types';

export type Draft = Omit<CalEvent, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

interface EditorState {
  draft: Draft | null;
  /** For recurring events: which occurrence was clicked. */
  occStart?: number;
  openNew: (start: number, end: number, allDay?: boolean) => void;
  openExisting: (id: string, occStart?: number) => Promise<void>;
  close: () => void;
}

export const useEventEditor = create<EditorState>((set) => ({
  draft: null,
  openNew: (start, end, allDay) => {
    const { eventColor, eventReminder } = useSettings.getState();
    set({ draft: { title: '', start, end, allDay, color: eventColor, reminder: allDay || eventReminder < 0 ? undefined : eventReminder }, occStart: undefined });
  },
  openExisting: async (id, occStart) => {
    const e = await db.events.get(id);
    if (e) set({ draft: e, occStart });
  },
  close: () => set({ draft: null }),
}));
