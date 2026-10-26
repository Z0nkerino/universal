// Sending a message to Afina, shared by her screen and the command bar.
import { create } from 'zustand';
import { db, uid } from '@/lib/db';
import { useRouter } from '@/app/router';
import { tNow } from '@/lib/i18n';
import { think } from './brain';
import type { AfinaReply } from './engine';

/** Undo callbacks live only for this session (they close over in-memory state). */
export const undos = new Map<string, () => Promise<unknown>>();

export const useAfinaBusy = create<{ thinking: boolean }>(() => ({ thinking: false }));

export async function postReply(reply: AfinaReply) {
  const id = uid();
  if (reply.undo) undos.set(id, reply.undo);
  await db.chat.add({ id, role: 'afina', text: reply.text, at: Date.now(), chips: reply.chips, confirm: reply.confirm ? { label: reply.confirm.title, action: reply.confirm.kind, payload: reply.confirm } : undefined });
  if (reply.navigate) setTimeout(() => useRouter.getState().go(reply.navigate!), 500);
}

export async function sendToAfina(value: string) {
  const msg = value.trim();
  if (!msg || useAfinaBusy.getState().thinking) return;
  const history = (await db.chat.orderBy('at').toArray()).slice(-8).map((m) => ({ role: m.role, text: m.text }));
  await db.chat.add({ id: uid(), role: 'user', text: msg, at: Date.now() });
  useAfinaBusy.setState({ thinking: true });
  try {
    const started = Date.now();
    const reply = await think(msg, history);
    // A beat of "thinking" so instant answers don't feel abrupt.
    const wait = 450 - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    await postReply(reply);
  } catch (e) {
    await postReply({ handled: true, text: `${tNow('Something went wrong')}: ${(e as Error).message}` });
  } finally {
    useAfinaBusy.setState({ thinking: false });
  }
}
