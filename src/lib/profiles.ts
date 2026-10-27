import { create } from 'zustand';

/**
 * Local accounts. Each profile has its own database on this device, so tasks, notes, health
 * logs and settings never mix. The list lives in localStorage because the right database has
 * to be known before anything opens. A PIN keeps casual eyes out; it isn't encryption.
 */
export interface Profile {
  id: string;
  name: string;
  /** An emoji, or '' to show the name's initial. */
  emoji: string;
  color: string;
  createdAt: number;
  lock?: { salt: string; hash: string };
  /** Minutes of inactivity before locking again; 0 = only when the app starts. */
  autoLockMin?: number;
}

export const AVATAR_COLORS = ['#2F6BFF', '#FF4FA3', '#7C5CFF', '#0EA5A0', '#E8590C', '#D6336C', '#0F9D58', '#636366'];
export const AVATAR_EMOJI = ['', '🙂', '😎', '🦊', '🐼', '🐱', '🌿', '🌙', '⭐', '🔥', '🎧', '📚', '🏃', '🎨', '💼', '🏠'];

const LIST = 'up.profiles';
const ACTIVE = 'up.activeProfile';
const DEFAULT_ID = 'default';

let memory: Record<string, string> = {};
function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return memory[key] ?? null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    memory = { ...memory, [key]: value };
  }
}

function load(): Profile[] {
  try {
    const list = JSON.parse(read(LIST) ?? '[]') as Profile[];
    if (Array.isArray(list) && list.length) return list;
  } catch {
    /* fall through to the default profile */
  }
  // The first profile keeps the original database, so existing data stays where it was.
  return [{ id: DEFAULT_ID, name: '', emoji: '', color: AVATAR_COLORS[0], createdAt: Date.now() }];
}

export function activeProfileId() {
  const id = read(ACTIVE);
  const list = load();
  return id && list.some((p) => p.id === id) ? id : list[0].id;
}

/** The IndexedDB database that holds a profile's data. */
export function dbNameFor(id: string) {
  return id === DEFAULT_ID ? 'universal-planner' : `universal-planner-${id}`;
}

interface ProfilesState {
  profiles: Profile[];
  activeId: string;
  /** False while a profile with a PIN is waiting to be unlocked. */
  unlocked: boolean;
}

export const useProfiles = create<ProfilesState>(() => {
  const activeId = activeProfileId();
  const active = load().find((p) => p.id === activeId);
  return { profiles: load(), activeId, unlocked: !active?.lock || sessionUnlocked(activeId) };
});

function save(profiles: Profile[]) {
  write(LIST, JSON.stringify(profiles));
  useProfiles.setState({ profiles });
}

export const activeProfile = () => {
  const { profiles, activeId } = useProfiles.getState();
  return profiles.find((p) => p.id === activeId) ?? profiles[0];
};
export const useActiveProfile = () => useProfiles((s) => s.profiles.find((p) => p.id === s.activeId) ?? s.profiles[0]);

export function updateProfile(id: string, patch: Partial<Profile>) {
  save(useProfiles.getState().profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)));
}

export function createProfile(name: string, emoji: string, color: string): Profile {
  const p: Profile = { id: Math.random().toString(36).slice(2, 10), name: name.trim(), emoji, color, createdAt: Date.now() };
  save([...useProfiles.getState().profiles, p]);
  return p;
}

/** Opens another profile. The app reloads so every screen reads from that profile's database. */
export function switchProfile(id: string) {
  write(ACTIVE, id);
  location.reload();
}

/** Deletes a profile and everything in it. */
export async function deleteProfile(id: string) {
  const { profiles, activeId } = useProfiles.getState();
  const rest = profiles.filter((p) => p.id !== id);
  if (!rest.length) throw new Error('Keep at least one profile.');
  const { default: Dexie } = await import('dexie');
  await Dexie.delete(dbNameFor(id));
  save(rest);
  if (id === activeId) switchProfile(rest[0].id);
}

/** Forgot the PIN: erases this profile's data and lock so it starts fresh. */
export async function resetProfile(id: string) {
  const { default: Dexie } = await import('dexie');
  await Dexie.delete(dbNameFor(id));
  updateProfile(id, { lock: undefined });
  switchProfile(id);
}

// ---------- PIN ----------

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hashPin(pin: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 150_000 }, key, 256);
  return hex(bits);
}

export const pinSupported = () => typeof crypto !== 'undefined' && !!crypto.subtle;

export async function setPin(id: string, pin: string) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  updateProfile(id, { lock: { salt, hash: await hashPin(pin, salt) } });
  markUnlocked(id);
}

export function removePin(id: string) {
  updateProfile(id, { lock: undefined });
}

export async function checkPin(id: string, pin: string) {
  const p = useProfiles.getState().profiles.find((x) => x.id === id);
  if (!p?.lock) return true;
  return (await hashPin(pin, p.lock.salt)) === p.lock.hash;
}

// Unlocking lasts for this tab's session (it survives the reload a profile switch needs).
function sessionUnlocked(id: string) {
  try {
    return sessionStorage.getItem(`up.unlocked.${id}`) === '1';
  } catch {
    return false;
  }
}
function markUnlocked(id: string) {
  try {
    sessionStorage.setItem(`up.unlocked.${id}`, '1');
  } catch {
    /* storage unavailable */
  }
}

export async function unlock(pin: string) {
  const { activeId } = useProfiles.getState();
  if (!(await checkPin(activeId, pin))) return false;
  markUnlocked(activeId);
  useProfiles.setState({ unlocked: true });
  return true;
}

export function lockNow() {
  const p = activeProfile();
  if (!p?.lock) return;
  try {
    sessionStorage.removeItem(`up.unlocked.${p.id}`);
  } catch {
    /* storage unavailable */
  }
  useProfiles.setState({ unlocked: false });
}

/** Locks after the chosen minutes without a tap, click or key press. */
export function startAutoLock() {
  let last = Date.now();
  const touch = () => (last = Date.now());
  const evs = ['pointerdown', 'keydown', 'wheel'] as const;
  evs.forEach((e) => addEventListener(e, touch, { passive: true }));
  const timer = setInterval(() => {
    const p = activeProfile();
    if (p?.lock && p.autoLockMin && useProfiles.getState().unlocked && Date.now() - last > p.autoLockMin * 60_000) lockNow();
  }, 15_000);
  return () => {
    clearInterval(timer);
    evs.forEach((e) => removeEventListener(e, touch));
  };
}

/** Initial for avatars without an emoji. */
export const initialOf = (p: Pick<Profile, 'name'>) => (p.name.trim()[0] ?? '?').toUpperCase();
