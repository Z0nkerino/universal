// Self-updates the app's content (all UI and features) from GitHub Releases.
//
// macOS only allows full binary auto-updates (Squirrel) for apps signed with a paid Apple
// Developer ID, so instead the signed-once shell stays put and swaps in newer app files:
//   latest.json → app-bundle.tar.gz (sha256-verified) → userData/app-content/<version>/
// If a release needs a newer shell (rare), the user is offered the new installer instead.
const { app, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const pkg = require('../package.json');

// UP_UPDATE_FEED overrides the feed for local testing.
const FEED = process.env.UP_UPDATE_FEED || `https://github.com/${pkg.updates.repo}/releases/latest/download/latest.json`;
const RELEASES_PAGE = `https://github.com/${pkg.updates.repo}/releases/latest`;
const SHELL_VERSION = pkg.updates.shellVersion;
const contentDir = () => path.join(app.getPath('userData'), 'app-content');
const stateFile = () => path.join(contentDir(), 'state.json');

/** Compares dotted numeric versions: 1 if a > b, -1 if a < b, 0 if equal. */
function compare(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch {
    return {};
  }
}

function writeState(patch) {
  fs.mkdirSync(contentDir(), { recursive: true });
  fs.writeFileSync(stateFile(), JSON.stringify({ ...readState(), ...patch }, null, 2));
}

/** Minimal ustar reader: extracts regular files and directories, refusing paths outside dest. */
function untar(buf, dest) {
  let off = 0;
  let longName = null;
  while (off + 512 <= buf.length) {
    const header = buf.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const str = (s, l) => header.subarray(s, s + l).toString('utf8').replace(/\0.*$/s, '');
    const size = parseInt(str(124, 12).trim() || '0', 8);
    const type = String.fromCharCode(header[156] || 48);
    const prefix = str(345, 155);
    let name = longName ?? (prefix ? `${prefix}/${str(0, 100)}` : str(0, 100));
    longName = null;
    const body = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;

    if (type === 'L') {
      longName = body.toString('utf8').replace(/\0.*$/s, '');
      continue;
    }
    name = name.replace(/^\.\//, '');
    if (!name || name === '.') continue;
    const target = path.resolve(dest, name);
    if (!target.startsWith(path.resolve(dest) + path.sep)) throw new Error(`Unsafe path in bundle: ${name}`);
    if (type === '5') fs.mkdirSync(target, { recursive: true });
    else if (type === '0' || type === '\0') {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, body);
    }
  }
}

function createUpdater({ builtinRoot, onStatus }) {
  let status = { state: 'idle' };
  let pending = null; // { version, root } downloaded and ready to apply
  let busy = false;

  const emit = (s) => {
    status = s;
    onStatus(s);
  };

  /** Where app files are served from right now: a downloaded release if it is newer and healthy. */
  function resolveActive() {
    const st = readState();
    if (st.current && !st.bad?.includes(st.current) && compare(st.current, app.getVersion()) > 0) {
      const root = path.join(contentDir(), st.current);
      if (fs.existsSync(path.join(root, 'index.html'))) return { version: st.current, root, downloaded: true };
    }
    return { version: app.getVersion(), root: builtinRoot, downloaded: false };
  }

  let active = resolveActive();

  /** Called when downloaded content fails to boot: never use that version again. */
  function markBad(version) {
    const st = readState();
    writeState({ bad: [...new Set([...(st.bad || []), version])], current: null });
    active = resolveActive();
    return active;
  }

  function prune(keep) {
    try {
      for (const d of fs.readdirSync(contentDir())) {
        if (d !== 'state.json' && !keep.includes(d)) fs.rmSync(path.join(contentDir(), d), { recursive: true, force: true });
      }
    } catch {
      /* nothing to prune */
    }
  }

  async function check({ manual = false } = {}) {
    if (busy) return status;
    busy = true;
    try {
      if (manual) emit({ state: 'checking' });
      const res = await net.fetch(`${FEED}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) {
        emit({ state: 'unavailable', message: res.status === 404 ? 'No published updates found.' : `Update server returned ${res.status}.` });
        return status;
      }
      const feed = await res.json();
      const current = pending?.version ?? active.version;
      if (compare(feed.version, current) <= 0) {
        emit(pending ? { state: 'ready', version: pending.version, notes: pending.notes } : { state: 'current', version: active.version });
        return status;
      }
      if (readState().bad?.includes(feed.version)) {
        emit({ state: 'current', version: active.version });
        return status;
      }
      if ((feed.shellVersion || 1) > SHELL_VERSION) {
        const dl = feed.downloads?.[process.platform === 'darwin' ? 'mac' : 'win'] || RELEASES_PAGE;
        emit({ state: 'installer', version: feed.version, notes: feed.notes, url: dl });
        return status;
      }

      emit({ state: 'downloading', version: feed.version });
      const bundle = await net.fetch(feed.bundle.url);
      if (!bundle.ok) throw new Error(`Download failed (${bundle.status}).`);
      const gz = Buffer.from(await bundle.arrayBuffer());
      const sha = crypto.createHash('sha256').update(gz).digest('hex');
      if (sha !== feed.bundle.sha256) throw new Error('Downloaded update failed its integrity check.');

      const dest = path.join(contentDir(), feed.version);
      const tmp = `${dest}.partial`;
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.mkdirSync(tmp, { recursive: true });
      untar(zlib.gunzipSync(gz), tmp);
      if (!fs.existsSync(path.join(tmp, 'index.html'))) throw new Error('Update bundle is missing index.html.');
      fs.rmSync(dest, { recursive: true, force: true });
      fs.renameSync(tmp, dest);

      pending = { version: feed.version, root: dest, notes: feed.notes };
      writeState({ current: feed.version });
      prune([feed.version, active.downloaded ? active.version : '']);
      emit({ state: 'ready', version: feed.version, notes: feed.notes });
    } catch (err) {
      emit({ state: 'error', message: err.message || String(err) });
    } finally {
      busy = false;
    }
    return status;
  }

  /** Switch to the downloaded version (the caller reloads the window). */
  function apply() {
    if (!pending) return null;
    active = { version: pending.version, root: pending.root, downloaded: true };
    pending = null;
    emit({ state: 'current', version: active.version });
    return active;
  }

  return {
    get active() {
      return active;
    },
    get status() {
      return status;
    },
    check,
    apply,
    markBad,
    releasesPage: RELEASES_PAGE,
  };
}

module.exports = { createUpdater, compare, untar };
