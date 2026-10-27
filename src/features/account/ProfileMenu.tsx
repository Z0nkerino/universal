import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronsUpDown, Lock, Pencil, Plus } from 'lucide-react';
import { Avatar } from '@/ui/Avatar';
import { lockNow, switchProfile, useActiveProfile, useProfiles } from '@/lib/profiles';
import { useT } from '@/lib/i18n';
import { springSnappy } from '@/lib/motion';
import { useProfileSheet } from './store';

/** The current profile at the bottom of the sidebar; opens a menu to switch, add, edit or lock. */
export function ProfileMenu() {
  const t = useT();
  const me = useActiveProfile();
  const profiles = useProfiles((s) => s.profiles);
  const show = useProfileSheet((s) => s.show);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('pointerdown', onDown);
    addEventListener('keydown', onKey);
    return () => (removeEventListener('pointerdown', onDown), removeEventListener('keydown', onKey));
  }, [open]);

  const item = 'flex h-10 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-[14px] font-semibold hover:bg-fg/[0.06]';
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 rounded-[14px] p-1.5 text-left hover:bg-fg/[0.05]">
        <Avatar profile={me} size={32} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{me.name || t('Your profile')}</span>
          <span className="block truncate text-[12px] text-fg/60">{profiles.length > 1 ? `${profiles.length} ${t('profiles on this device')}` : t('On this device')}</span>
        </span>
        <ChevronsUpDown size={16} className="text-fg/60" aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={springSnappy}
            className="glass glass-strong absolute bottom-full left-0 right-0 z-50 mb-2 rounded-2xl p-1.5"
          >
            {profiles.map((p) => (
              <button key={p.id} type="button" role="menuitemradio" aria-checked={p.id === me.id} className={item} onClick={() => (p.id === me.id ? setOpen(false) : switchProfile(p.id))}>
                <Avatar profile={p} size={24} />
                <span className="flex-1 truncate">{p.name || t('Your profile')}</span>
                {p.lock && <Lock size={13} className="text-fg/60" aria-label={t('PIN')} />}
                {p.id === me.id && <Check size={16} className="text-blue" aria-hidden />}
              </button>
            ))}
            <div className="my-1 h-px bg-fg/[0.08]" />
            <button type="button" role="menuitem" className={item} onClick={() => (setOpen(false), show())}>
              <Plus size={16} aria-hidden /> {t('New profile')}
            </button>
            <button type="button" role="menuitem" className={item} onClick={() => (setOpen(false), show(me.id))}>
              <Pencil size={15} aria-hidden /> {t('Edit profile')}
            </button>
            {me.lock && (
              <button type="button" role="menuitem" className={item} onClick={() => (setOpen(false), lockNow())}>
                <Lock size={15} aria-hidden /> {t('Lock now')}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
