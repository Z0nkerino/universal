import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Voice input with the device's own speech recognition: the native recognizer in the iOS and
 * Android apps (the Android web view has none), the browser's Web Speech API elsewhere.
 * Audio never goes to a Universal Planner server.
 */

interface WebRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

const g = globalThis as typeof globalThis & {
  SpeechRecognition?: new () => WebRec;
  webkitSpeechRecognition?: new () => WebRec;
  Capacitor?: { isNativePlatform?: () => boolean };
};
const WebSpeech = g.SpeechRecognition ?? g.webkitSpeechRecognition;
const native = !!g.Capacitor?.isNativePlatform?.();

export const speechSupported = () => native || !!WebSpeech;

export type SpeechError = 'unsupported' | 'denied' | 'failed';

/**
 * `onText` gets the transcript as it grows; `onDone` the final text when listening stops
 * (empty if nothing was heard).
 */
export function useSpeech({ lang, onText, onDone, onError }: { lang: 'en' | 'ru'; onText: (t: string) => void; onDone: (t: string) => void; onError?: (e: SpeechError) => void }) {
  const [listening, setListening] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const cb = useRef({ onText, onDone, onError });
  cb.current = { onText, onDone, onError };
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US';

  useEffect(() => () => stopRef.current?.(), []);

  const start = useCallback(async () => {
    if (native) {
      const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
      if (!(await SpeechRecognition.available()).available) return cb.current.onError?.('unsupported');
      const perm = await SpeechRecognition.requestPermissions();
      if (perm.speechRecognition !== 'granted') return cb.current.onError?.('denied');
      let latest = '';
      const partial = await SpeechRecognition.addListener('partialResults', (d: { matches?: string[] }) => {
        latest = d.matches?.[0] ?? latest;
        cb.current.onText(latest);
      });
      const state = await SpeechRecognition.addListener('listeningState', (d: { status: 'started' | 'stopped' }) => {
        if (d.status !== 'stopped') return;
        void partial.remove();
        void state.remove();
        setListening(false);
        stopRef.current = null;
        cb.current.onDone(latest.trim());
      });
      stopRef.current = () => void SpeechRecognition.stop();
      setListening(true);
      try {
        await SpeechRecognition.start({ language: locale, partialResults: true, popup: false, maxResults: 1 });
      } catch {
        setListening(false);
        cb.current.onError?.('failed');
      }
      return;
    }
    if (!WebSpeech) return cb.current.onError?.('unsupported');
    const rec = new WebSpeech();
    rec.lang = locale;
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      finalText = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      cb.current.onText(finalText + interim);
    };
    rec.onerror = (e) => {
      if (e.error !== 'aborted' && e.error !== 'no-speech') cb.current.onError?.(e.error === 'not-allowed' ? 'denied' : 'failed');
    };
    rec.onend = () => {
      setListening(false);
      stopRef.current = null;
      cb.current.onDone(finalText.trim());
    };
    stopRef.current = () => rec.stop();
    try {
      rec.start();
      setListening(true);
    } catch {
      cb.current.onError?.('failed');
    }
  }, [locale]);

  const toggle = useCallback(() => (listening ? stopRef.current?.() : void start()), [listening, start]);
  return { listening, toggle, supported: speechSupported() };
}
