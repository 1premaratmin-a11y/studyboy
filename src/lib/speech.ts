// StudyBoy — live lecture transcription (Turbo-style "record live → notes").
// Wraps the Web Speech API (webkitSpeechRecognition) for continuous mic capture
// and incremental transcript accumulation. Pure browser, no audio upload.
import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResult {
  0: SpeechRecognitionAlternative;
  isFinal: boolean;
  length: number;
}
interface SpeechRecognitionResultList {
  length: number;
  item(i: number): SpeechRecognitionResult;
  [i: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}
interface ISpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
declare global {
  interface Window {
    SpeechRecognition?: { new (): ISpeechRecognition };
    webkitSpeechRecognition?: { new (): ISpeechRecognition };
  }
}

function makeRecognition(lang: string): ISpeechRecognition | null {
  const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new Ctor();
  r.lang = lang;
  r.continuous = true;
  r.interimResults = true;
  r.maxAlternatives = 1;
  return r;
}

export function useTranscriber(lang = "en-US") {
  const recRef = useRef<ISpeechRecognition | null>(null);
  const finalRef = useRef<string>("");
  const interimRef = useRef<string>("");
  const stopResolvers = useRef<Array<() => void>>([]);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [autoEnded, setAutoEnded] = useState(false);
  const [supported] = useState(() => !!(window.SpeechRecognition || window.webkitSpeechRecognition));

  const start = useCallback(() => {
    if (listening || !supported) return;
    setError(null);
    setAutoEnded(false);
    const r = makeRecognition(lang);
    if (!r) {
      setError("speech recognition not supported in this browser");
      return;
    }
    recRef.current = r;
    r.onresult = (e) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalRef.current += res[0].transcript + " ";
        else interimText += res[0].transcript;
      }
      interimRef.current = interimText;
      setInterim(interimText);
    };
    r.onerror = (e) => {
      setError(e.error === "not-allowed" ? "mic permission denied" : e.error);
      setListening(false);
    };
    r.onend = () => {
      // keep any in-flight interim text as a best-effort final chunk so it is not lost.
      // Read from a ref (not inside a state updater) — StrictMode double-invokes
      // updaters, which would otherwise append the interim chunk twice.
      const t = interimRef.current.trim();
      if (t) finalRef.current += t + " ";
      interimRef.current = "";
      setInterim("");
      setListening(false);
      // resolve any pending stop() promises — this fires AFTER all final
      // results have been delivered, so commit() called after stop() sees them.
      const hadStopper = stopResolvers.current.length > 0;
      stopResolvers.current.forEach((fn) => fn());
      stopResolvers.current = [];
      // auto-end (silence/network) without an explicit stop() → flag for the UI
      if (!hadStopper) setAutoEnded(true);
    };
    try {
      r.start();
      setListening(true);
    } catch {
      setError("could not start mic");
      setListening(false);
    }
  }, [listening, supported, lang]);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec) {
      setListening(false);
      setInterim("");
      interimRef.current = "";
      return Promise.resolve();
    }
    // resolve when onend fires (after final results flush) — prevents the
    // truncation race where commit() ran before the last phrase landed.
    return new Promise<void>((resolve) => {
      stopResolvers.current.push(() => {
        setAutoEnded(false);
        resolve();
      });
      try {
        rec.stop();
      } catch {
        resolve();
      }
    });
  }, []);

  // commit: returns the accumulated final transcript and resets buffer
  const commit = useCallback(() => {
    const t = finalRef.current.trim();
    finalRef.current = "";
    interimRef.current = "";
    setInterim("");
    setAutoEnded(false);
    return t;
  }, []);

  useEffect(() => {
    return () => {
      recRef.current?.abort();
    };
  }, []);

  return { listening, interim, error, autoEnded, supported, start, stop, commit, transcript: () => finalRef.current.trim() };
}