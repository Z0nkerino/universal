import { create } from 'zustand';

export const useIdeaEditor = create<{ id: string | null; open: (id: string) => void; close: () => void }>((set) => ({ id: null, open: (id) => set({ id }), close: () => set({ id: null }) }));
