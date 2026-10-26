import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { create } from 'zustand';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'framer-motion';
import { Cable, Frame, Lightbulb, Maximize, Minus, Plus, X } from 'lucide-react';
import { db, stamp, uid } from '@/lib/db';
import { createIdea, updateIdea } from '@/lib/actions';
import type { Idea, IdeaGroup } from '@/lib/types';
import { Button, IconButton } from '@/ui/Button';
import { confirm } from '@/ui/Confirm';
import { toast } from '@/ui/Toast';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { useIdeaEditor, COLUMNS } from './IdeaEditor';
import { linkPath } from './geometry';

const CARD_W = 220;

/** Pan/zoom state survives switching to the board and back. */
export const useCanvasView = create<{ x: number; y: number; zoom: number; set: (p: Partial<{ x: number; y: number; zoom: number }>) => void }>((set) => ({
  x: 0,
  y: 0,
  zoom: 1,
  set: (p) => set(p),
}));

const clampZoom = (z: number) => Math.min(2.5, Math.max(0.25, z));

export function IdeaCanvas() {
  const t = useT();
  const ideas = useLiveQuery(() => db.ideas.toArray(), []) ?? [];
  const links = useLiveQuery(() => db.ideaLinks.toArray(), []) ?? [];
  const groups = useLiveQuery(() => db.ideaGroups.toArray(), []) ?? [];
  const openIdea = useIdeaEditor((s) => s.open);
  const view = useCanvasView();
  const rootRef = useRef<HTMLDivElement>(null);
  const [connect, setConnect] = useState<{ on: boolean; from: string | null }>({ on: false, from: null });
  // Live positions while dragging, committed to the database on release.
  const [live, setLive] = useState<Record<string, { x: number; y: number }>>({});
  const [liveGroups, setLiveGroups] = useState<Record<string, Partial<IdeaGroup>>>({});
  const [heights, setHeights] = useState<Record<string, number>>({});
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const liveRef = useRef(live);
  liveRef.current = live;
  const liveGroupsRef = useRef(liveGroups);
  liveGroupsRef.current = liveGroups;

  const pos = (i: Idea) => live[i.id] ?? { x: i.x, y: i.y };
  const gpos = (g: IdeaGroup) => ({ ...g, ...liveGroups[g.id] });

  // Measure card heights so link lines meet card centers.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const next: Record<string, number> = {};
    el.querySelectorAll<HTMLElement>('[data-idea]').forEach((c) => (next[c.dataset.idea!] = c.offsetHeight));
    if (Object.keys(next).some((k) => next[k] !== heights[k])) setHeights(next);
  });

  const toWorld = (cx: number, cy: number) => {
    const r = rootRef.current!.getBoundingClientRect();
    return { x: (cx - r.left - view.x) / view.zoom, y: (cy - r.top - view.y) / view.zoom };
  };

  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    const r = rootRef.current!.getBoundingClientRect();
    const px = cx ?? r.left + r.width / 2;
    const py = cy ?? r.top + r.height / 2;
    const { x, y, zoom } = useCanvasView.getState();
    const nz = clampZoom(zoom * factor);
    const k = nz / zoom;
    view.set({ zoom: nz, x: px - r.left - (px - r.left - x) * k, y: py - r.top - (py - r.top - y) * k });
  };

  const fit = () => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r || (!ideas.length && !groups.length)) return view.set({ x: 0, y: 0, zoom: 1 });
    const xs = [...ideas.map((i) => i.x), ...groups.map((g) => g.x)];
    const ys = [...ideas.map((i) => i.y), ...groups.map((g) => g.y)];
    const xe = [...ideas.map((i) => i.x + CARD_W), ...groups.map((g) => g.x + g.w)];
    const ye = [...ideas.map((i) => i.y + (heights[i.id] ?? 110)), ...groups.map((g) => g.y + g.h)];
    const minX = Math.min(...xs) - 40;
    const minY = Math.min(...ys) - 40;
    const w = Math.max(...xe) - minX + 40;
    const h = Math.max(...ye) - minY + 40;
    const zoom = clampZoom(Math.min(r.width / w, r.height / h, 1.2));
    view.set({ zoom, x: (r.width - w * zoom) / 2 - minX * zoom, y: (r.height - h * zoom) / 2 - minY * zoom });
  };

  // Fit everything on first view.
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && ideas.length && Object.keys(heights).length) {
      fitted.current = true;
      if (view.x === 0 && view.y === 0 && view.zoom === 1) fit();
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
      else {
        const { x, y } = useCanvasView.getState();
        view.set({ x: x - e.deltaX, y: y - e.deltaY });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  /** Generic drag helper in world units. */
  const drag = (e: RPointerEvent, onMove: (dx: number, dy: number) => void, onEnd: (moved: boolean) => void) => {
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const z = useCanvasView.getState().zoom;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / z;
      const dy = (ev.clientY - sy) / z;
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true;
      onMove(dx, dy);
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      onEnd(moved);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  };

  const onCardDown = (e: RPointerEvent, idea: Idea) => {
    if (e.button !== 0) return;
    const start = pos(idea);
    drag(
      e,
      (dx, dy) => setLive((l) => ({ ...l, [idea.id]: { x: start.x + dx, y: start.y + dy } })),
      async (moved) => {
        if (moved) {
          const p = liveRef.current[idea.id];
          if (p) await updateIdea(idea.id, { x: Math.round(p.x), y: Math.round(p.y) });
          setLive((l) => {
            const { [idea.id]: _, ...rest } = l;
            return rest;
          });
          return;
        }
        if (connect.on) {
          if (!connect.from) return setConnect({ on: true, from: idea.id });
          if (connect.from !== idea.id && !links.some((l) => (l.from === connect.from && l.to === idea.id) || (l.to === connect.from && l.from === idea.id))) {
            await db.ideaLinks.add({ id: uid(), from: connect.from, to: idea.id });
            toast(t('Ideas connected'));
          }
          return setConnect({ on: true, from: null });
        }
        openIdea(idea.id);
      },
    );
  };

  const onGroupDown = (e: RPointerEvent, g: IdeaGroup) => {
    if (e.button !== 0) return;
    // Cards inside the frame travel with it.
    const inside = ideas.filter((i) => {
      const cx = i.x + CARD_W / 2;
      const cy = i.y + (heights[i.id] ?? 100) / 2;
      return cx > g.x && cx < g.x + g.w && cy > g.y && cy < g.y + g.h;
    });
    drag(
      e,
      (dx, dy) => {
        setLiveGroups((l) => ({ ...l, [g.id]: { x: g.x + dx, y: g.y + dy } }));
        setLive((l) => ({ ...l, ...Object.fromEntries(inside.map((i) => [i.id, { x: i.x + dx, y: i.y + dy }])) }));
      },
      async (moved) => {
        if (!moved) return;
        const ng = liveGroupsRef.current[g.id];
        const cards = liveRef.current;
        await db.transaction('rw', db.ideaGroups, db.ideas, async () => {
          if (ng) await db.ideaGroups.update(g.id, { x: Math.round(ng.x!), y: Math.round(ng.y!), updatedAt: Date.now() });
          for (const i of inside) if (cards[i.id]) await db.ideas.update(i.id, { x: Math.round(cards[i.id].x), y: Math.round(cards[i.id].y), groupId: g.id });
        });
        setLiveGroups({});
        setLive({});
      },
    );
  };

  const onGroupResize = (e: RPointerEvent, g: IdeaGroup) => {
    drag(
      e,
      (dx, dy) => setLiveGroups((l) => ({ ...l, [g.id]: { w: Math.max(240, g.w + dx), h: Math.max(160, g.h + dy) } })),
      async (moved) => {
        const ng = liveGroupsRef.current[g.id];
        if (moved && ng) await db.ideaGroups.update(g.id, { w: Math.round(ng.w!), h: Math.round(ng.h!), updatedAt: Date.now() });
        setLiveGroups({});
      },
    );
  };

  // Background: pan with one pointer, pinch-zoom with two.
  const onBgDown = (e: RPointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-idea],[data-group],[data-ui]')) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onBgMove = (e: RPointerEvent) => {
    const p = pointers.current;
    if (!p.has(e.pointerId)) return;
    const prev = p.get(e.pointerId)!;
    if (p.size === 1) {
      const { x, y } = useCanvasView.getState();
      view.set({ x: x + e.clientX - prev.x, y: y + e.clientY - prev.y });
    } else if (p.size === 2) {
      const [a, b] = [...p.entries()].map(([id, v]) => (id === e.pointerId ? { x: e.clientX, y: e.clientY } : v));
      const [a0, b0] = [...p.values()];
      const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y);
      const d1 = Math.hypot(a.x - b.x, a.y - b.y);
      if (d0 > 0) zoomAt(d1 / d0, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    p.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onBgUp = (e: RPointerEvent) => pointers.current.delete(e.pointerId);

  const addIdeaAt = async (wx: number, wy: number) => {
    const idea = await createIdea({ title: t('New idea'), x: Math.round(wx - CARD_W / 2), y: Math.round(wy - 40) });
    openIdea(idea.id);
  };

  const center = () => {
    const r = rootRef.current!.getBoundingClientRect();
    return toWorld(r.left + r.width / 2, r.top + r.height / 2);
  };

  const byId = useMemo(() => new Map(ideas.map((i) => [i.id, i])), [ideas]);

  return (
    <div className="relative">
      <div
        ref={rootRef}
        className={cn('relative h-[calc(100dvh-280px)] min-h-[440px] touch-none select-none overflow-hidden rounded-[24px] bg-fg/[0.02]', connect.on ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing')}
        style={{
          backgroundImage: 'radial-gradient(rgb(var(--fg) / 0.12) 1px, transparent 1px)',
          backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
        onPointerDown={onBgDown}
        onPointerMove={onBgMove}
        onPointerUp={onBgUp}
        onPointerCancel={onBgUp}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest('[data-idea],[data-group],[data-ui]')) return;
          const w = toWorld(e.clientX, e.clientY);
          void addIdeaAt(w.x, w.y);
        }}
        role="application"
        aria-label={t('Idea canvas. Double-click to add an idea.')}
      >
        <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
          {groups.map((g0) => {
            const g = gpos(g0);
            return (
              <div key={g.id} data-group className="absolute rounded-[28px] border-2 border-dashed border-fg/15 bg-fg/[0.025]" style={{ left: g.x, top: g.y, width: g.w, height: g.h }}>
                <div className="flex cursor-move items-center gap-2 px-4 py-2" onPointerDown={(e) => onGroupDown(e, g0)}>
                  <input
                    defaultValue={g.title}
                    onPointerDown={(e) => e.stopPropagation()}
                    onBlur={(e) => void db.ideaGroups.update(g.id, { title: e.target.value, updatedAt: Date.now() })}
                    aria-label={t('Group name')}
                    className="min-w-0 flex-1 bg-transparent text-[14px] font-bold uppercase tracking-[0.06em] text-fg/55 focus-visible:outline-none"
                  />
                  <button
                    type="button"
                    aria-label={t('Delete group')}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={async () => {
                      if (await confirm({ title: t('Delete this group?'), body: t('The ideas inside stay on the canvas.'), confirmLabel: t('Delete'), danger: true })) await db.ideaGroups.delete(g.id);
                    }}
                    className="rounded-md p-1 text-fg/40 hover:bg-fg/[0.06] hover:text-fg"
                  >
                    <X size={14} />
                  </button>
                </div>
                <span onPointerDown={(e) => onGroupResize(e, g0)} className="absolute bottom-1 right-1 h-5 w-5 cursor-nwse-resize rounded-br-[20px] border-b-2 border-r-2 border-fg/25" aria-hidden />
              </div>
            );
          })}

          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden>
            <defs>
              <linearGradient id="link-g" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#2F6BFF" />
                <stop offset="1" stopColor="#FF4FA3" />
              </linearGradient>
            </defs>
            {links.map((l) => {
              const a = byId.get(l.from);
              const b = byId.get(l.to);
              if (!a || !b) return null;
              const { d } = linkPath({ ...pos(a), w: CARD_W, h: heights[a.id] ?? 100 }, { ...pos(b), w: CARD_W, h: heights[b.id] ?? 100 });
              return <path key={l.id} d={d} fill="none" stroke="url(#link-g)" strokeWidth={2.5 / Math.max(view.zoom, 0.6)} strokeLinecap="round" opacity={0.75} />;
            })}
          </svg>
          {links.map((l) => {
            const a = byId.get(l.from);
            const b = byId.get(l.to);
            if (!a || !b) return null;
            const { mid } = linkPath({ ...pos(a), w: CARD_W, h: heights[a.id] ?? 100 }, { ...pos(b), w: CARD_W, h: heights[b.id] ?? 100 });
            const mx = mid.x;
            const my = mid.y;
            return (
              <button
                key={`x${l.id}`}
                type="button"
                data-ui
                aria-label={`${t('Disconnect')} ${a.title} – ${b.title}`}
                onClick={async () => {
                  await db.ideaLinks.delete(l.id);
                  toast(t('Connection removed'), { action: { label: t('Undo'), run: () => void db.ideaLinks.add(l) } });
                }}
                className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-bg text-fg/50 opacity-0 shadow ring-1 ring-fg/10 transition-opacity hover:text-fg hover:opacity-100 focus-visible:opacity-100"
                style={{ left: mx, top: my }}
              >
                <X size={12} />
              </button>
            );
          })}

          {ideas.map((i) => {
            const p = pos(i);
            const dragging = !!live[i.id];
            const col = COLUMNS.find((c) => c.id === i.column)!;
            return (
              <motion.div
                key={i.id}
                data-idea={i.id}
                onPointerDown={(e) => onCardDown(e, i)}
                className={cn(
                  'glass absolute cursor-pointer rounded-[20px] p-4',
                  connect.from === i.id && 'ring-2 ring-pink',
                  dragging && 'z-10 shadow-2xl',
                )}
                style={{ left: p.x, top: p.y, width: CARD_W }}
                animate={{ scale: dragging ? 1.04 : 1, rotate: dragging ? -1.2 : 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                role="button"
                tabIndex={0}
                aria-label={i.title}
                onKeyDown={(e) => e.key === 'Enter' && openIdea(i.id)}
              >
                <div className="flex items-start gap-2">
                  {i.color !== 'none' && <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', i.color === 'blue' ? 'bg-blue' : 'bg-pink')} />}
                  <h3 className="text-[15px] font-bold leading-snug tracking-[-0.01em]">{i.title}</h3>
                </div>
                {i.body && <p className="mt-1.5 line-clamp-3 text-[13px] leading-snug text-fg/60">{i.body}</p>}
                <span className="mt-2.5 inline-block rounded-full bg-fg/[0.06] px-2 py-0.5 text-[11px] font-semibold text-fg/55">{t(col.label)}</span>
              </motion.div>
            );
          })}
        </div>

        {ideas.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
            <Lightbulb size={32} className="text-fg/25" />
            <p className="text-[15px] font-semibold text-fg/50">{t('Double-click anywhere to drop an idea')}</p>
          </div>
        )}

        <div data-ui className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full p-1 glass glass-strong">
          <Button size="sm" variant="ghost" icon={Plus} onClick={() => void addIdeaAt(center().x, center().y)}>{t('Idea')}</Button>
          <Button
            size="sm"
            variant="ghost"
            icon={Frame}
            onClick={async () => {
              const c = center();
              await db.ideaGroups.add(stamp({ title: t('Group'), x: Math.round(c.x - 260), y: Math.round(c.y - 170), w: 520, h: 340 }) as IdeaGroup);
            }}
          >
            {t('Group')}
          </Button>
          <Button size="sm" variant={connect.on ? 'brand' : 'ghost'} icon={Cable} onClick={() => setConnect((c) => ({ on: !c.on, from: null }))} aria-pressed={connect.on}>
            {connect.on ? (connect.from ? t('Pick the second idea') : t('Pick the first idea')) : t('Connect')}
          </Button>
          <span className="mx-1 h-5 w-px bg-fg/10" />
          <IconButton icon={Minus} size={32} label={t('Zoom out')} onClick={() => zoomAt(1 / 1.25)} />
          <button type="button" onClick={() => view.set({ zoom: 1 })} className="w-12 text-center text-[12px] font-semibold tabular-nums text-fg/60">{Math.round(view.zoom * 100)}%</button>
          <IconButton icon={Plus} size={32} label={t('Zoom in')} onClick={() => zoomAt(1.25)} />
          <IconButton icon={Maximize} size={32} label={t('Fit everything')} onClick={fit} />
        </div>
      </div>
      <p className="mt-2 hidden px-2 text-[12px] text-fg/40 lg:block">{t('Drag to pan · pinch or Ctrl+scroll to zoom · double-click to add · drag a group’s title to move it with its ideas')}</p>
    </div>
  );
}
