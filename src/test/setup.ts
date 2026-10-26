import 'fake-indexeddb/auto';

// Minimal browser globals the settings store touches.
const g = globalThis as Record<string, unknown>;
g.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
g.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
g.addEventListener ??= () => {};
