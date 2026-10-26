import type { EventColor } from '@/lib/types';

/** Event category colors: all drawn from the blue→pink brand range plus a neutral. */
export const EVENT_HEX: Record<EventColor, string> = {
  blue: '#2F6BFF',
  pink: '#FF4FA3',
  violet: '#8F5BFF',
  sky: '#4FA3FF',
  rose: '#FF7BB8',
  gray: '#8A8A90',
};

export const EVENT_LABEL: Record<EventColor, string> = {
  blue: 'Work',
  pink: 'Personal',
  violet: 'Meetings',
  sky: 'Health',
  rose: 'Family',
  gray: 'Other',
};

/** Soft tinted fill + strong text/edge for event blocks, readable in both themes. */
export function eventStyle(color: EventColor, dashed = false) {
  const hex = EVENT_HEX[color] ?? EVENT_HEX.blue;
  return {
    background: dashed ? 'transparent' : `color-mix(in srgb, ${hex} 16%, transparent)`,
    borderLeft: `3px ${dashed ? 'dashed' : 'solid'} ${hex}`,
    color: `color-mix(in srgb, ${hex} 70%, rgb(var(--fg)))`,
  };
}
