import { useEffect, type PointerEvent as RPointerEvent } from 'react';
import { create } from 'zustand';
import { AnimatePresence, motion } from 'framer-motion';
import { GripVertical } from 'lucide-react';
import { springSnappy } from '@/lib/motion';

/** Something being dragged between parts of the app (a task onto the timeline, a widget…). */
export interface DragItem {
  kind: 'task' | 'widget' | 'event';
  id: string;
  label: string;
  durationMin?: number;
}

interface DropHandler {
  accepts: DragItem['kind'][];
  onDrop: (item: DragItem, x: number, y: number, el: HTMLElement) => void;
  onHover?: (item: DragItem, x: number, y: number, el: HTMLElement) => void;
  onLeave?: () => void;
}

const zones = new Map<string, DropHandler>();

interface DndState {
  item: DragItem | null;
  x: number;
  y: number;
  over: string | null;
}
export const useDnd = create<DndState>(() => ({ item: null, x: 0, y: 0, over: null }));

/** Registers a drop zone; spread the returned props onto the element. */
export function useDropZone(id: string, handler: DropHandler) {
  useEffect(() => {
    zones.set(id, handler);
    return () => {
      zones.delete(id);
    };
  });
  return { 'data-drop': id } as const;
}

function zoneAt(x: number, y: number, item: DragItem) {
  const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-drop]');
  if (!el) return null;
  const z = zones.get(el.dataset.drop!);
  return z && z.accepts.includes(item.kind) ? { id: el.dataset.drop!, z, el } : null;
}

/**
 * Starts a drag from a pointerdown. Mouse drags begin after a few pixels of movement;
 * touch drags need a short press-and-hold so scrolling still works.
 */
export function beginDrag(e: RPointerEvent, item: DragItem, onTap?: () => void) {
  if (e.button !== 0) return;
  const sx = e.clientX;
  const sy = e.clientY;
  const touch = e.pointerType !== 'mouse';
  let active = false;
  let holdTimer = 0;
  let lastZone: string | null = null;

  const activate = (x: number, y: number) => {
    active = true;
    document.body.style.userSelect = 'none';
    navigator.vibrate?.(8);
    useDnd.setState({ item, x, y });
  };
  if (touch) holdTimer = window.setTimeout(() => activate(sx, sy), 280);

  const move = (ev: PointerEvent) => {
    if (!active) {
      const dist = Math.hypot(ev.clientX - sx, ev.clientY - sy);
      if (touch) {
        if (dist > 8) cleanup();
        return;
      }
      if (dist < 6) return;
      activate(ev.clientX, ev.clientY);
    }
    ev.preventDefault();
    const hit = zoneAt(ev.clientX, ev.clientY, item);
    if (lastZone && lastZone !== hit?.id) zones.get(lastZone)?.onLeave?.();
    lastZone = hit?.id ?? null;
    hit?.z.onHover?.(item, ev.clientX, ev.clientY, hit.el);
    useDnd.setState({ x: ev.clientX, y: ev.clientY, over: lastZone });
  };
  const up = (ev: PointerEvent) => {
    if (active) {
      const hit = zoneAt(ev.clientX, ev.clientY, item);
      if (lastZone) zones.get(lastZone)?.onLeave?.();
      hit?.z.onDrop(item, ev.clientX, ev.clientY, hit.el);
    } else if (onTap && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) onTap();
    cleanup();
  };
  const cleanup = () => {
    clearTimeout(holdTimer);
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', cleanup);
    document.body.style.userSelect = '';
    useDnd.setState({ item: null, over: null });
  };
  addEventListener('pointermove', move, { passive: false });
  addEventListener('pointerup', up);
  addEventListener('pointercancel', cleanup);
}

/** The floating glass pill that follows the pointer while dragging. */
export function DragGhost() {
  const { item, x, y } = useDnd();
  return (
    <AnimatePresence>
      {item && (item.kind === 'task' || item.kind === 'event') && (
        <motion.div
          className="glass glass-strong pointer-events-none fixed left-0 top-0 z-[80] flex max-w-[260px] items-center gap-2 rounded-2xl px-3 py-2 text-[14px] font-semibold"
          style={{ x: x + 12, y: y - 18 }}
          initial={{ scale: 0.8, opacity: 0, rotate: -3 }}
          animate={{ scale: 1, opacity: 1, rotate: -2 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={springSnappy}
        >
          <GripVertical size={14} className="shrink-0 text-fg/40" aria-hidden />
          <span className="truncate">{item.label}</span>
          {item.durationMin && <span className="shrink-0 text-[12px] font-medium text-fg/50">{item.durationMin}m</span>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
