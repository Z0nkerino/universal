// Ambient sound for focus mode, synthesised on the fly (no audio files, works offline).
export type Ambient = 'off' | 'rain' | 'brown' | 'waves';

let ctx: AudioContext | null = null;
let nodes: { src: AudioBufferSourceNode; gain: GainNode; lfo?: OscillatorNode } | null = null;

function noiseBuffer(c: AudioContext, kind: 'brown' | 'pink') {
  const len = c.sampleRate * 4;
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let last = 0;
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else {
        // Paul Kellet's pink noise filter.
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
  }
  return buf;
}

export function stopAmbient() {
  if (!nodes || !ctx) return;
  const { src, gain, lfo } = nodes;
  gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
  setTimeout(() => {
    src.stop();
    lfo?.stop();
  }, 1500);
  nodes = null;
}

export async function playAmbient(kind: Ambient, volume = 0.5) {
  stopAmbient();
  if (kind === 'off') return;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') await ctx.resume();
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, kind === 'brown' ? 'brown' : 'pink');
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = kind === 'rain' ? 5200 : kind === 'waves' ? 900 : 1400;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(filter).connect(gain).connect(ctx.destination);
  let lfo: OscillatorNode | undefined;
  if (kind === 'waves') {
    // Slow swell, like surf rolling in.
    lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const depth = ctx.createGain();
    depth.gain.value = volume * 0.35;
    lfo.connect(depth).connect(gain.gain);
    lfo.start();
  }
  src.start();
  gain.gain.setTargetAtTime(volume * (kind === 'rain' ? 0.35 : 0.5), ctx.currentTime, 0.8);
  nodes = { src, gain, lfo };
}

/** A soft two-note chime — a nudge, not an alarm. */
export async function chime() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') await ctx.resume();
  const now = ctx.currentTime;
  [659.25, 880].forEach((f, i) => {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0, now + i * 0.18);
    g.gain.linearRampToValueAtTime(0.18, now + i * 0.18 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 1.6);
    o.connect(g).connect(ctx!.destination);
    o.start(now + i * 0.18);
    o.stop(now + i * 0.18 + 1.7);
  });
}
