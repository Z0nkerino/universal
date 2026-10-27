import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { Sheet } from '@/ui/Sheet';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { checkPin, setPin } from '@/lib/profiles';
import { useT } from '@/lib/i18n';
import { toast } from '@/ui/Toast';

const pinInput = 'h-12 w-full rounded-2xl bg-fg/[0.06] text-center text-[22px] font-semibold tracking-[0.4em] focus:shadow-[0_0_0_2px_rgb(var(--blue-rgb)/0.55)]';

/** Sets a new PIN for a profile. When it already has one, asks for the current PIN first. */
export function PinSheet({ open, profileId, hasPin, onClose }: { open: boolean; profileId: string; hasPin: boolean; onClose: () => void }) {
  const t = useT();
  const [current, setCurrent] = useState('');
  const [pin, setPinValue] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) (setCurrent(''), setPinValue(''), setAgain(''), setError(''));
  }, [open]);

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 8);
  const submit = async () => {
    if (hasPin && !(await checkPin(profileId, current))) return setError(t('The current PIN isn’t right.'));
    if (pin.length < 4) return setError(t('Use 4 to 8 digits.'));
    if (pin !== again) return setError(t('The two PINs don’t match.'));
    await setPin(profileId, pin);
    toast(hasPin ? t('PIN changed') : t('PIN lock is on'));
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} label={hasPin ? t('Change PIN') : t('Set a PIN')} className="max-w-sm">
      <form
        className="flex flex-col gap-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-blue/10 text-blue">
            <Lock size={20} aria-hidden />
          </span>
          <div>
            <h2 className="text-[20px] font-bold tracking-[-0.02em]">{hasPin ? t('Change PIN') : t('Set a PIN')}</h2>
            <p className="text-[13px] text-fg/60">{t('Asked when the app opens. It keeps others out of this profile on a shared device.')}</p>
          </div>
        </div>
        {hasPin && (
          <Field label="Current PIN" htmlFor="pin-cur">
            <input id="pin-cur" type="password" inputMode="numeric" autoComplete="off" autoFocus value={current} onChange={(e) => (setCurrent(digits(e.target.value)), setError(''))} className={pinInput} />
          </Field>
        )}
        <Field label="New PIN" htmlFor="pin-new" hint="4–8 digits">
          <input id="pin-new" type="password" inputMode="numeric" autoComplete="off" autoFocus={!hasPin} value={pin} onChange={(e) => (setPinValue(digits(e.target.value)), setError(''))} className={pinInput} />
        </Field>
        <Field label="Repeat PIN" htmlFor="pin-again">
          <input id="pin-again" type="password" inputMode="numeric" autoComplete="off" value={again} onChange={(e) => (setAgain(digits(e.target.value)), setError(''))} className={pinInput} />
        </Field>
        <p role="alert" className="min-h-5 text-[13px] font-medium text-[#E5484D]">
          {error}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pin.length < 4 || again.length < 4}>
            {t('Save PIN')}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
