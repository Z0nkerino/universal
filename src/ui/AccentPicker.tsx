import { Check, Pipette } from 'lucide-react';
import { PALETTES, accentPair, type PaletteId } from '@/lib/appearance';
import { useSettings } from '@/lib/settings';
import { useIsDark } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

/** Accent palettes as two-tone swatches, plus a custom color. Changes apply immediately. */
export function AccentPicker() {
  const t = useT();
  const dark = useIsDark();
  const { palette, customAccent, set } = useSettings();
  const ids = [...(Object.keys(PALETTES) as PaletteId[]), 'custom' as const];
  return (
    <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label={t('Accent color')}>
      {ids.map((id) => {
        const [a, b] = accentPair(id, customAccent, dark);
        const on = palette === id;
        const name = id === 'custom' ? t('Custom') : t(PALETTES[id as Exclude<PaletteId, 'custom'>].name);
        const swatch = (
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full" style={{ background: `linear-gradient(135deg, ${a} 0 50%, ${b} 50% 100%)`, boxShadow: on ? `0 0 0 2px rgb(var(--bg)), 0 0 0 4px ${a}` : 'inset 0 0 0 1px rgb(var(--fg) / .08)' }}>
            {on ? <Check size={18} className="text-white drop-shadow" aria-hidden /> : id === 'custom' && <Pipette size={16} className="text-white drop-shadow" aria-hidden />}
          </span>
        );
        return (
          <div key={id} className="flex w-14 flex-col items-center gap-1">
            {id === 'custom' ? (
              <label className="relative cursor-pointer" title={name}>
                <input
                  type="color"
                  value={customAccent}
                  aria-label={t('Custom accent color')}
                  onChange={(e) => set({ palette: 'custom', customAccent: e.target.value })}
                  onClick={() => palette !== 'custom' && set({ palette: 'custom' })}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
                {swatch}
              </label>
            ) : (
              <button type="button" role="radio" aria-checked={on} aria-label={name} onClick={() => set({ palette: id })}>
                {swatch}
              </button>
            )}
            <span className="text-[11px] font-medium text-fg/60">{name}</span>
          </div>
        );
      })}
    </div>
  );
}
