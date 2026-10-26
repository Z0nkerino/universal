import { create } from 'zustand';

export type Filter = { kind: 'all' } | { kind: 'pinned' } | { kind: 'folder'; name: string } | { kind: 'tag'; name: string };

export const useNotesState = create<{ openId: string | null; filter: Filter; set: (p: Partial<{ openId: string | null; filter: Filter }>) => void }>((set) => ({
  openId: null,
  filter: { kind: 'all' },
  set: (p) => set(p),
}));

