import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, Cpu, Download, Mic, MicOff, RotateCcw, ShieldCheck, Trash2, Undo2 } from 'lucide-react';
import { db, uid } from '@/lib/db';
import type { ChatMessage } from '@/lib/types';
import { detectLang } from '@/lib/nlp';
import { useSettings } from '@/lib/settings';
import { useIsDesktop } from '@/lib/hooks';
import { resolveLang, useT } from '@/lib/i18n';
import { PageHeader } from '@/ui/PageHeader';
import { Glass } from '@/ui/Glass';
import { Button, IconButton } from '@/ui/Button';
import { confirm } from '@/ui/Confirm';
import { toast } from '@/ui/Toast';
import { useRouter } from '@/app/router';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion';
import { AfinaOrb } from './AfinaOrb';
import { think } from './brain';
import { runConfirmed, type AfinaReply, type ConfirmAction } from './engine';
import { MODELS, checkSupport, loadModel, switchModel, useLlm } from './llm';

// Undo callbacks live only for this session (they close over in-memory state).
const undos = new Map<string, () => Promise<unknown>>();

type SpeechRec = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const SpeechRecognitionCtor = (window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition;

function ModelCard() {
  const t = useT();
  const { status, progress, detail, reason, installed, modelId } = useLlm();
  const model = MODELS.find((m) => modelId?.startsWith(m.id)) ?? MODELS[0];
  const [choosing, setChoosing] = useState(false);

  if (status === 'checking') return null;
  if (status === 'ready')
    return (
      <div className="flex items-center justify-center gap-2 text-[12px] font-medium text-fg/50">
        <ShieldCheck size={13} className="text-blue" aria-hidden />
        {t('On-device model ready')} · {model.label} · {t('nothing leaves this device')}
      </div>
    );
  return (
    <Glass shimmer={false} className="mx-auto w-full max-w-xl p-4">
      {status === 'unsupported' ? (
        <div className="flex gap-3">
          <Cpu size={20} className="mt-0.5 shrink-0 text-fg/50" aria-hidden />
          <p className="text-[14px] text-fg/70">
            <strong className="text-fg">{t('Running on Afina’s built-in engine.')}</strong> {reason} {t('She can still plan, log, schedule and answer questions about your data. Free-form chat needs WebGPU (Chrome or Edge 113+, Safari 18+, or the desktop app).')}
          </p>
        </div>
      ) : status === 'downloading' ? (
        <div>
          <div className="flex items-center justify-between text-[14px] font-semibold">
            <span>{installed ? t('Waking Afina up…') : t('Downloading Afina’s on-device brain…')}</span>
            <span className="tabular-nums text-fg/60">{Math.round(progress * 100)}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-fg/[0.08]" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={t('Model download')}>
            <motion.div className="h-full rounded-full bg-brand" animate={{ width: `${Math.max(3, progress * 100)}%` }} transition={spring} />
          </div>
          <p className="mt-2 truncate text-[12px] text-fg/45">{detail || `${model.label} · ${model.size} · ${t('downloads once, then works offline')}`}</p>
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Cpu size={20} className="shrink-0 text-blue" aria-hidden />
            <p className="min-w-0 flex-1 text-[14px] text-fg/70">
              {status === 'error' ? (
                <><strong className="text-fg">{t('The model couldn’t load.')}</strong> {reason}</>
              ) : (
                <><strong className="text-fg">{t('Give Afina an on-device brain for free-form chat.')}</strong> {model.label} · {model.size}. {t('Downloads once, runs offline, private.')}</>
              )}
            </p>
            <Button size="sm" variant="brand" icon={status === 'error' ? RotateCcw : Download} onClick={() => void loadModel()}>
              {status === 'error' ? t('Try again') : t('Install')}
            </Button>
          </div>
          <button type="button" onClick={() => setChoosing((v) => !v)} className="mt-2 text-[12px] font-semibold text-fg/50 hover:text-fg">{choosing ? t('Hide models') : t('Choose a different model')}</button>
          <AnimatePresence>
            {choosing && (
              <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-2 overflow-hidden" role="radiogroup" aria-label={t('Model')}>
                {MODELS.map((m) => (
                  <li key={m.id}>
                    <button type="button" role="radio" aria-checked={m.id === model.id} onClick={() => void switchModel(m.id)} className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] hover:bg-fg/[0.05]', m.id === model.id && 'bg-fg/[0.06]')}>
                      <span className={cn('h-3 w-3 rounded-full border-2', m.id === model.id ? 'border-blue bg-blue' : 'border-fg/30')} />
                      <span className="flex-1"><strong>{m.label}</strong> · {m.size}<br /><span className="text-fg/50">{t(m.note)}</span></span>
                    </button>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}
    </Glass>
  );
}

function Bubble({ m, last, onChip, onConfirm }: { m: ChatMessage; last: boolean; onChip: (c: string) => void; onConfirm: (m: ChatMessage, ok: boolean) => void }) {
  const t = useT();
  const mine = m.role === 'user';
  const undo = undos.get(m.id);
  return (
    <motion.li layout="position" initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring} className={cn('flex scroll-mb-36 lg:scroll-mb-28', mine ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[85%] sm:max-w-[75%]')}>
        <div
          className={cn(
            'whitespace-pre-line rounded-[22px] px-4 py-2.5 text-[15px] leading-relaxed',
            mine ? 'rounded-br-md bg-fg text-bg' : 'glass rounded-bl-md',
          )}
        >
          {m.text}
        </div>
        {!mine && m.confirm && (
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="danger" icon={Trash2} onClick={() => onConfirm(m, true)}>{t('Delete')}</Button>
            <Button size="sm" variant="glass" onClick={() => onConfirm(m, false)}>{t('Keep it')}</Button>
          </div>
        )}
        {!mine && (undo || (last && m.chips?.length)) ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {undo && (
              <button
                type="button"
                onClick={async () => {
                  await undo();
                  undos.delete(m.id);
                  await db.chat.add({ id: uid(), role: 'afina', text: t('Undone.'), at: Date.now() });
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-fg/[0.06] px-3 text-[13px] font-semibold text-fg/70 hover:bg-fg/[0.1]"
              >
                <Undo2 size={13} aria-hidden /> {t('Undo')}
              </button>
            )}
            {last &&
              m.chips?.map((c) => (
                <button key={c} type="button" onClick={() => onChip(c)} className="h-8 rounded-full bg-brand-soft px-3 text-[13px] font-semibold text-blue hover:brightness-95 dark:text-[#8DAEFF]">
                  {c}
                </button>
              ))}
          </div>
        ) : null}
      </div>
    </motion.li>
  );
}

export default function AfinaPage() {
  const t = useT();
  const language = useSettings((s) => s.language);
  const go = useRouter((s) => s.go);
  const messages = useLiveQuery(() => db.chat.orderBy('at').toArray(), []) ?? [];
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const status = useLlm((s) => s.status);
  const desktop = useIsDesktop();
  const installed = useLlm((s) => s.installed);

  // Check WebGPU once; if the model is already downloaded, wake it in the background.
  useEffect(() => {
    void checkSupport().then((ok) => {
      if (ok && useLlm.getState().installed && useLlm.getState().status === 'idle') void loadModel();
    });
  }, []);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, thinking]);

  const post = async (reply: AfinaReply) => {
    const id = uid();
    if (reply.undo) undos.set(id, reply.undo);
    await db.chat.add({ id, role: 'afina', text: reply.text, at: Date.now(), chips: reply.chips, confirm: reply.confirm ? { label: reply.confirm.title, action: reply.confirm.kind, payload: reply.confirm } : undefined });
    if (reply.navigate) setTimeout(() => go(reply.navigate!), 500);
  };

  const send = async (value: string) => {
    const msg = value.trim();
    if (!msg || thinking) return;
    setText('');
    const history = messages.slice(-8).map((m) => ({ role: m.role, text: m.text }));
    await db.chat.add({ id: uid(), role: 'user', text: msg, at: Date.now() });
    setThinking(true);
    try {
      const started = Date.now();
      const reply = await think(msg, history);
      // A beat of "thinking" so instant answers don't feel abrupt.
      const wait = 450 - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      await post(reply);
    } catch (e) {
      await post({ handled: true, text: `${t('Something went wrong')}: ${(e as Error).message}` });
    } finally {
      setThinking(false);
      inputRef.current?.focus();
    }
  };

  const onConfirm = async (m: ChatMessage, ok: boolean) => {
    const action = m.confirm!.payload as ConfirmAction;
    await db.chat.update(m.id, { confirm: undefined });
    if (ok) await post(await runConfirmed(action, detectLang(m.text)));
    else await post({ handled: true, text: t('Okay, I’ll leave it.') });
  };

  const toggleMic = () => {
    if (!SpeechRecognitionCtor) return toast(t('Voice input isn’t available in this browser.'), { tone: 'error' });
    if (listening) return recRef.current?.stop();
    const rec = new SpeechRecognitionCtor();
    rec.lang = resolveLang(language) === 'ru' ? 'ru-RU' : 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setText(finalText + interim);
    };
    rec.onerror = (e) => {
      setListening(false);
      if (e.error !== 'aborted' && e.error !== 'no-speech') toast(e.error === 'not-allowed' ? t('Microphone access was blocked.') : t('Voice input isn’t available here.'), { tone: 'error' });
    };
    rec.onend = () => {
      setListening(false);
      if (finalText.trim()) void send(finalText);
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      toast(t('Voice input isn’t available here.'), { tone: 'error' });
    }
  };

  const starters = t.lang === 'ru'
    ? ['Спланируй мой день', 'Что у меня сегодня?', 'Съел шаурму и колу на обед', 'Как я спал на этой неделе?', 'Разбей «подготовить презентацию» на шаги', 'На что я потратил больше всего времени?']
    : ['Plan my day', 'What’s on today?', 'I ate shawarma and a Coke for lunch', 'How did I sleep this week?', 'Break down “prepare the presentation”', 'What did I spend most time on?'];
  const empty = messages.length === 0;
  const orbState = thinking || status === 'downloading';

  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      <PageHeader
        title={t('nav.afina')}
        actions={
          !empty && (
            <IconButton
              icon={Trash2}
              label={t('Clear conversation')}
              onClick={async () => {
                if (await confirm({ title: t('Clear the conversation?'), body: t('Your tasks, events and logs stay — only the chat is removed.'), confirmLabel: t('Clear'), danger: true })) await db.chat.clear();
              }}
            />
          )
        }
      />
      <motion.div layout transition={spring} className={cn('flex flex-col items-center text-center', empty ? 'pt-2' : 'pb-2')}>
        <motion.div layout transition={spring} className={cn(listening && 'drop-shadow-[0_0_30px_rgba(255,79,163,0.6)]')}>
          <AfinaOrb size={empty ? 220 : 96} thinking={orbState || listening} />
        </motion.div>
        {empty && (
          <>
            <h2 className="mt-3 text-[26px] font-bold tracking-[-0.03em]">
              {t('Hi, I’m')} <span className="text-brand">Afina</span>.
            </h2>
            <p className="mt-1 max-w-[44ch] text-[16px] text-fg/60">{t('I plan your day, log what you eat, break big tasks into small steps, and answer questions about your own data — all on this device.')}</p>
          </>
        )}
      </motion.div>

      <div className="my-4"><ModelCard /></div>

      {empty ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4 flex flex-wrap justify-center gap-2">
          {starters.map((s) => (
            <button key={s} type="button" onClick={() => void send(s)} className="glass rounded-full px-4 py-2 text-[14px] font-medium hover:bg-fg/[0.04]">
              {s}
            </button>
          ))}
        </motion.div>
      ) : (
        <ul ref={listRef} className="flex flex-col gap-3 pb-4" aria-live="polite" aria-label={t('Conversation with Afina')}>
          {messages.map((m, i) => (
            <Bubble key={m.id} m={m} last={i === messages.length - 1} onChip={(c) => void send(c)} onConfirm={(mm, ok) => void onConfirm(mm, ok)} />
          ))}
          <AnimatePresence>
            {thinking && (
              <motion.li initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex scroll-mb-36 lg:scroll-mb-28">
                <div className="glass flex gap-1.5 rounded-[22px] rounded-bl-md px-4 py-3.5" aria-label={t('Afina is thinking')}>
                  {[0, 1, 2].map((d) => (
                    <motion.span key={d} className="h-2 w-2 rounded-full bg-brand" animate={{ y: [0, -5, 0], opacity: [0.5, 1, 0.5] }} transition={{ duration: 0.9, repeat: Infinity, delay: d * 0.15 }} />
                  ))}
                </div>
              </motion.li>
            )}
          </AnimatePresence>
        </ul>
      )}

      <div className="sticky bottom-[calc(88px+env(safe-area-inset-bottom))] z-20 lg:bottom-6">
        <Glass strong shimmer={false} radius="xl" className="flex items-end gap-2 bg-[rgb(var(--bg)/0.9)] p-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
            placeholder={listening ? t('Listening…') : desktop ? t('Ask Afina or tell her what to do') : t('Message Afina')}
            aria-label={t('Message Afina')}
            className="max-h-[140px] min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[16px] placeholder:text-fg/40 focus-visible:outline-none"
          />
          <IconButton icon={listening ? MicOff : Mic} label={listening ? t('Stop listening') : t('Speak')} size={44} onClick={toggleMic} className={cn(listening && 'bg-pink/15 text-pink')} />
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            disabled={!text.trim() || thinking}
            onClick={() => void send(text)}
            aria-label={t('Send')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-md transition-opacity disabled:opacity-30"
          >
            <ArrowUp size={20} strokeWidth={2.5} />
          </motion.button>
        </Glass>
        {!installed && status === 'idle' && <p className="mt-1.5 text-center text-[11px] text-fg/40">{t('Afina’s built-in engine is answering. Install the on-device model above for free-form chat.')}</p>}
      </div>
    </div>
  );
}
