import { BarChart3, CalendarDays, HeartPulse, Lightbulb, NotebookPen, Sparkles, Sunrise, type LucideIcon } from 'lucide-react';
import type { Route } from './router';

export interface NavItem {
  id: Route;
  icon: LucideIcon;
  shortcut: string; // Alt + digit
}

export const NAV: NavItem[] = [
  { id: 'today', icon: Sunrise, shortcut: '1' },
  { id: 'calendar', icon: CalendarDays, shortcut: '2' },
  { id: 'notes', icon: NotebookPen, shortcut: '3' },
  { id: 'ideas', icon: Lightbulb, shortcut: '4' },
  { id: 'health', icon: HeartPulse, shortcut: '5' },
  { id: 'insights', icon: BarChart3, shortcut: '6' },
  { id: 'afina', icon: Sparkles, shortcut: '7' },
];

/** Today and Afina are always shown; the rest follow the user's choice in onboarding/Settings. */
export const OPTIONAL: Route[] = ['calendar', 'notes', 'ideas', 'health', 'insights'];
export const visibleNav = (features: string[]) => NAV.filter((n) => !OPTIONAL.includes(n.id) || features.includes(n.id));
