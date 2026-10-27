import type { Profile } from '@/lib/profiles';
import { initialOf } from '@/lib/profiles';
import { cn } from '@/lib/cn';

/** A profile's round avatar: its emoji, or the name's initial on the profile color. */
export function Avatar({ profile, size = 36, className }: { profile: Pick<Profile, 'name' | 'emoji' | 'color'>; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white', className)}
      style={{ width: size, height: size, background: profile.emoji ? `${profile.color}26` : profile.color, fontSize: profile.emoji ? size * 0.55 : size * 0.42 }}
    >
      {profile.emoji || initialOf(profile)}
    </span>
  );
}
