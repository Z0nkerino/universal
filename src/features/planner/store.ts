import { create } from 'zustand';
import { useSettings } from '@/lib/settings';

/** Which task (if any) is open in the editor sheet. */
export const useTaskEditor = create<{ id: string | null; open: (id: string) => void; close: () => void }>((set) => ({
  id: null,
  open: (id) => set({ id }),
  close: () => set({ id: null }),
}));

/** Full-screen focus mode. `quickStart` = the "just start for 2 minutes" variant. */
export const useFocusMode = create<{ open: boolean; taskId?: string; minutes: number; start: (taskId?: string, minutes?: number) => void; close: () => void }>((set) => ({
  open: false,
  minutes: 25,
  start: (taskId, minutes = useSettings.getState().focusMin) => set({ open: true, taskId, minutes }),
  close: () => set({ open: false }),
}));
