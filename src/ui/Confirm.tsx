import { create } from 'zustand';
import { Trash2 } from 'lucide-react';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { useT } from '@/lib/i18n';

interface ConfirmRequest {
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

const useConfirmStore = create<{ req: ConfirmRequest | null }>(() => ({ req: null }));

/** Asks the user before anything destructive. Resolves true only on an explicit confirm. */
export function confirm(opts: Omit<ConfirmRequest, 'resolve'>) {
  return new Promise<boolean>((resolve) => useConfirmStore.setState({ req: { ...opts, resolve } }));
}

export function ConfirmHost() {
  const t = useT();
  const req = useConfirmStore((s) => s.req);
  const close = (ok: boolean) => {
    req?.resolve(ok);
    useConfirmStore.setState({ req: null });
  };
  return (
    <Sheet open={!!req} onClose={() => close(false)} label={req?.title ?? ''} className="max-w-md">
      {req && (
        <div className="p-6">
          <h2 className="text-[20px] font-bold tracking-[-0.02em]">{req.title}</h2>
          {req.body && <p className="mt-2 text-[15px] text-fg/60">{req.body}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => close(false)}>{t('Cancel')}</Button>
            <Button autoFocus variant={req.danger ? 'danger' : 'primary'} icon={req.danger ? Trash2 : undefined} onClick={() => close(true)}>
              {req.confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

interface ChoiceRequest {
  title: string;
  body?: string;
  options: { label: string; value: string; primary?: boolean }[];
  resolve: (v: string | null) => void;
}
const useChoiceStore = create<{ req: ChoiceRequest | null }>(() => ({ req: null }));

/** Asks the user to pick one of several options; resolves null if dismissed. */
export function choose(opts: Omit<ChoiceRequest, 'resolve'>) {
  return new Promise<string | null>((resolve) => useChoiceStore.setState({ req: { ...opts, resolve } }));
}

export function ChoiceHost() {
  const t = useT();
  const req = useChoiceStore((s) => s.req);
  const close = (v: string | null) => {
    req?.resolve(v);
    useChoiceStore.setState({ req: null });
  };
  return (
    <Sheet open={!!req} onClose={() => close(null)} label={req?.title ?? ''} className="max-w-md">
      {req && (
        <div className="p-6">
          <h2 className="text-[20px] font-bold tracking-[-0.02em]">{req.title}</h2>
          {req.body && <p className="mt-2 text-[15px] text-fg/60">{req.body}</p>}
          <div className="mt-6 flex flex-col gap-2">
            {req.options.map((o) => (
              <Button key={o.value} variant={o.primary ? 'primary' : 'glass'} onClick={() => close(o.value)} className="w-full">
                {o.label}
              </Button>
            ))}
            <Button variant="ghost" onClick={() => close(null)} className="w-full">{t('Cancel')}</Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
