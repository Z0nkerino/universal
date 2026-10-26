// Afina's on-device language model (WebLLM on WebGPU). Downloaded once, cached by the
// browser, then runs fully offline. Without WebGPU, Afina uses only her local engine.
import { create } from 'zustand';
import type { MLCEngineInterface, ChatCompletionMessageParam } from '@mlc-ai/web-llm';
import { useSettings } from '@/lib/settings';

export const MODELS = [
  { id: 'Qwen2.5-1.5B-Instruct', label: 'Qwen 2.5 · 1.5B', size: '1.1 GB', note: 'Recommended — best balance, good Russian' },
  { id: 'Qwen2.5-0.5B-Instruct', label: 'Qwen 2.5 · 0.5B', size: '0.4 GB', note: 'Lightest — for older or low-memory devices' },
  { id: 'Llama-3.2-1B-Instruct', label: 'Llama 3.2 · 1B', size: '0.9 GB', note: 'Fast, English-first' },
  { id: 'Llama-3.2-3B-Instruct', label: 'Llama 3.2 · 3B', size: '2.3 GB', note: 'Smartest — needs a strong GPU' },
] as const;

export type LlmStatus = 'checking' | 'unsupported' | 'idle' | 'downloading' | 'ready' | 'error';

interface LlmState {
  status: LlmStatus;
  /** 0–1 while downloading/loading. */
  progress: number;
  detail: string;
  reason?: string;
  modelId: string | null;
  installed: boolean;
}

export const useLlm = create<LlmState>(() => ({ status: 'checking', progress: 0, detail: '', modelId: null, installed: false }));

let engine: MLCEngineInterface | null = null;
let f16 = true;
let checked: Promise<boolean> | null = null;

/** Full WebLLM model id for a base name, picking 16- or 32-bit weights for this GPU. */
export function modelIdFor(base: string) {
  return `${base}-${f16 ? 'q4f16_1' : 'q4f32_1'}-MLC`;
}

function baseFromSetting() {
  const s = useSettings.getState().model || 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';
  return s.replace(/-q4f(16|32)_1-MLC$/, '');
}

/** Checks for WebGPU (and 16-bit float support), and whether the model is already cached. */
export function checkSupport() {
  checked ??= (async () => {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<{ features: Set<string> } | null> } }).gpu;
    if (!gpu) {
      useLlm.setState({ status: 'unsupported', reason: 'This browser doesn’t support WebGPU.' });
      return false;
    }
    try {
      const adapter = await gpu.requestAdapter();
      if (!adapter) {
        useLlm.setState({ status: 'unsupported', reason: 'No compatible graphics adapter was found.' });
        return false;
      }
      f16 = adapter.features.has('shader-f16');
    } catch {
      useLlm.setState({ status: 'unsupported', reason: 'WebGPU is turned off or blocked.' });
      return false;
    }
    const { hasModelInCache } = await import('@mlc-ai/web-llm');
    const id = modelIdFor(baseFromSetting());
    const installed = await hasModelInCache(id).catch(() => false);
    useLlm.setState({ status: 'idle', installed, modelId: id });
    return true;
  })();
  return checked;
}

/** Downloads (first time) and loads the model. Safe to call repeatedly. */
export async function loadModel() {
  if (!(await checkSupport())) return false;
  const id = modelIdFor(baseFromSetting());
  if (engine && useLlm.getState().modelId === id && useLlm.getState().status === 'ready') return true;
  const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
  useLlm.setState({ status: 'downloading', progress: 0, detail: '', modelId: id });
  try {
    await engine?.unload();
    engine = await CreateWebWorkerMLCEngine(new Worker(new URL('./llm.worker.ts', import.meta.url), { type: 'module' }), id, {
      initProgressCallback: (r) => useLlm.setState({ progress: r.progress, detail: r.text }),
    });
    useLlm.setState({ status: 'ready', progress: 1, installed: true });
    return true;
  } catch (e) {
    engine = null;
    useLlm.setState({ status: 'error', reason: explainError(e) });
    return false;
  }
}

/** Turns WebLLM/WebGPU failures into something a person can act on. */
function explainError(e: unknown) {
  const msg = String((e as Error)?.message ?? e ?? '');
  if (!msg || /fetch|network|failed to load|load failed|cors|404|403/i.test(msg)) return 'Couldn’t reach the model download (huggingface.co). Check your internet connection and try again.';
  if (/memory|oom|allocation|device lost|out of/i.test(msg)) return 'Your device ran out of graphics memory. Try the smaller Qwen 2.5 · 0.5B model.';
  if (/quota|storage/i.test(msg)) return 'There isn’t enough free storage for the model. Free some space and try again.';
  return msg;
}

/** Removes the downloaded model from this device. */
export async function removeModel() {
  const { deleteModelAllInfoInCache } = await import('@mlc-ai/web-llm');
  await engine?.unload().catch(() => {});
  engine = null;
  for (const base of MODELS.map((m) => m.id)) {
    for (const q of ['q4f16_1', 'q4f32_1']) await deleteModelAllInfoInCache(`${base}-${q}-MLC`).catch(() => {});
  }
  useLlm.setState({ status: 'idle', installed: false, progress: 0 });
}

/** Switching models unloads the current one; the next message loads the new choice. */
export async function switchModel(base: string) {
  useSettings.getState().set({ model: `${base}-q4f16_1-MLC` });
  await engine?.unload().catch(() => {});
  engine = null;
  const { hasModelInCache } = await import('@mlc-ai/web-llm');
  const id = modelIdFor(base);
  useLlm.setState({ status: 'idle', modelId: id, installed: await hasModelInCache(id).catch(() => false) });
}

export const llmReady = () => !!engine && useLlm.getState().status === 'ready';

export async function complete(messages: ChatCompletionMessageParam[], opts: { json?: boolean; maxTokens?: number } = {}) {
  if (!engine) throw new Error('Model not loaded');
  const r = await engine.chat.completions.create({
    messages,
    temperature: 0.3,
    max_tokens: opts.maxTokens ?? 400,
    ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
  });
  return r.choices[0]?.message?.content ?? '';
}
