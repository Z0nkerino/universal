import { create } from 'zustand';

/** Open with `editId` to edit a profile, or without to create one. */
export const useProfileSheet = create<{ open: boolean; editId?: string; show: (editId?: string) => void; hide: () => void }>((set) => ({
  open: false,
  show: (editId) => set({ open: true, editId }),
  hide: () => set({ open: false }),
}));
