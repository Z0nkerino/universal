import { create } from 'zustand';

export type TodayTab = 'overview' | 'tasks' | 'habits' | 'goals';
export const useTodayTab = create<{ tab: TodayTab; set: (tab: TodayTab) => void }>((set) => ({ tab: 'overview', set: (tab) => set({ tab }) }));
