import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Sheet } from '@/ui/Sheet';
import { Button } from '@/ui/Button';
import { Field, Input } from '@/ui/Field';
import { Avatar } from '@/ui/Avatar';
import { AVATAR_COLORS, AVATAR_EMOJI, createProfile, switchProfile, updateProfile, useProfiles } from '@/lib/profiles';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { useProfileSheet } from './store';

/** Name, emoji and color for a profile; the same fields edit an existing one. */
export function AvatarPicker({ name, emoji, color, onChange }: { name: string; emoji: string; color: string; onChange: (p: { emoji?: string; color?: string }) => void }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('Avatar')}>
        {AVATAR_EMOJI.map((e) => (
          <button
            key={e || 'initial'}
            type="button"
            role="radio"
            aria-checked={emoji === e}
            aria-label={e || t('Initial')}
            onClick={() => onChange({ emoji: e })}
            className={cn('rounded-full p-0.5 ring-2 transition', emoji === e ? 'ring-blue' : 'ring-transparent hover:ring-fg/15')}
          >
            <Avatar profile={{ name: name || '?', emoji: e, color }} size={34} />
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('Color')}>
        {AVATAR_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={color === c}
            aria-label={c}
            onClick={() => onChange({ color: c })}
            className="flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 ring-offset-bg transition"
            style={{ background: c, boxShadow: color === c ? `0 0 0 2px rgb(var(--bg)), 0 0 0 4px ${c}` : undefined }}
          >
            {color === c && <Check size={16} className="text-white" aria-hidden />}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ProfileSheet() {
  const t = useT();
  const { open, editId, hide } = useProfileSheet();
  const editing = useProfiles((s) => s.profiles.find((p) => p.id === editId));
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [color, setColor] = useState(AVATAR_COLORS[0]);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? '');
    setEmoji(editing?.emoji ?? '');
    setColor(editing?.color ?? AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]);
  }, [open, editing]);

  const submit = () => {
    if (!name.trim()) return;
    if (editing) {
      updateProfile(editing.id, { name: name.trim(), emoji, color });
      hide();
    } else {
      switchProfile(createProfile(name, emoji, color).id);
    }
  };

  return (
    <Sheet open={open} onClose={hide} label={editing ? t('Edit profile') : t('New profile')} className="max-w-md">
      <form
        className="flex flex-col gap-5 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex items-center gap-4">
          <Avatar profile={{ name: name || '?', emoji, color }} size={56} />
          <div>
            <h2 className="text-[20px] font-bold tracking-[-0.02em]">{editing ? t('Edit profile') : t('New profile')}</h2>
            {!editing && <p className="text-[14px] text-fg/60">{t('A separate space with its own tasks, notes, health and settings.')}</p>}
          </div>
        </div>
        <Field label="Name" htmlFor="profile-name">
          <Input id="profile-name" autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={t('Your name')} />
        </Field>
        <AvatarPicker name={name} emoji={emoji} color={color} onChange={(p) => (p.emoji !== undefined && setEmoji(p.emoji), p.color && setColor(p.color))} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={hide}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim()}>
            {editing ? t('Save') : t('Create and open')}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
