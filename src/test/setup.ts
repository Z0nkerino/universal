import 'fake-indexeddb/auto';

// Minimal browser globals the settings store touches.
const g = globalThis as Record<string, unknown>;
g.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
g.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
g.addEventListener ??= () => {};

// Date parsing loads lazily in the app; tests parse synchronously, so load it up front.
import { beforeAll } from 'vitest';
import { loadDateParsers } from '@/lib/nlp';
beforeAll(() => loadDateParsers());

// The Russian dictionary is lazy in the app.
import { loadRussian } from '@/lib/i18n';
beforeAll(() => loadRussian());
