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
    <Sheet open={!!req} onClose={() => close(false)} label={t(req?.title ?? '')} className="max-w-md">
      {req && (
        <div className="p-6">
          <h2 className="text-[20px] font-bold tracking-[-0.02em]">{t(req.title)}</h2>
          {req.body && <p className="mt-2 text-[15px] text-fg/60">{t(req.body)}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => close(false)}>{t('Cancel')}</Button>
            <Button autoFocus variant={req.danger ? 'danger' : 'primary'} icon={req.danger ? Trash2 : undefined} onClick={() => close(true)}>
              {t(req.confirmLabel)}
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

interface PromptRequest {
  title: string;
  label: string;
  initial?: string;
  placeholder?: string;
  confirmLabel: string;
  resolve: (v: string | null) => void;
}
const usePromptStore = create<{ req: PromptRequest | null }>(() => ({ req: null }));

/** Asks for a line of text inside the app (window.prompt doesn't work in the desktop app). */
export function promptText(opts: Omit<PromptRequest, 'resolve'>) {
  return new Promise<string | null>((resolve) => usePromptStore.setState({ req: { ...opts, resolve } }));
}

export function PromptHost() {
  const t = useT();
  const req = usePromptStore((s) => s.req);
  const close = (v: string | null) => {
    req?.resolve(v);
    usePromptStore.setState({ req: null });
  };
  return (
    <Sheet open={!!req} onClose={() => close(null)} label={req?.title ?? ''} className="max-w-md">
      {req && (
        <form
          className="p-6"
          onSubmit={(e) => {
            e.preventDefault();
            close(String(new FormData(e.currentTarget).get('value') ?? ''));
          }}
        >
          <h2 className="text-[20px] font-bold tracking-[-0.02em]">{req.title}</h2>
          <label className="mt-4 block text-[13px] font-semibold text-fg/60" htmlFor="prompt-value">{req.label}</label>
          <input
            id="prompt-value"
            name="value"
            autoFocus
            defaultValue={req.initial}
            placeholder={req.placeholder}
            className="mt-1.5 h-11 w-full rounded-[14px] bg-fg/[0.05] px-3.5 text-[15px] focus:shadow-[0_0_0_2px_rgb(47_107_255/0.55)] focus-visible:outline-none"
          />
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => close(null)}>{t('Cancel')}</Button>
            <Button type="submit">{req.confirmLabel}</Button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
