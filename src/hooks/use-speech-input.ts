// RoleSquare — Web Speech API hook
//
// Wraps the browser's SpeechRecognition API with a clean React interface.
// Returns interim transcripts for real-time display and fires a callback
// with the final committed transcript.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface SpeechInputOptions {
  /** Called when a final (committed) transcript is ready. */
  onFinalTranscript: (text: string) => void;
  /**
   * Milliseconds of silence after the last final result before the hook
   * auto-stops. 0 = never auto-stop. Default: 1500.
   */
  silenceTimeoutMs?: number;
  /** BCP-47 language tag. Default: "en-US". */
  lang?: string;
}

export interface SpeechInputResult {
  /** Interim (grey, still being recognized) transcript. */
  interimTranscript: string;
  /** Whether the mic is actively listening. */
  isListening: boolean;
  /** Whether the browser supports SpeechRecognition. */
  isSupported: boolean;
  /** Start mic recording. */
  start: () => void;
  /** Stop mic recording. */
  stop: () => void;
  /** Toggle mic recording. */
  toggle: () => void;
}

// Use a loose type for the browser Speech API to avoid lib.dom dependency
 
type AnySpeechRecognition = any;

declare global {
  interface Window {
     
    SpeechRecognition: any;
     
    webkitSpeechRecognition: any;
  }
}

export function useSpeechInput(opts: SpeechInputOptions): SpeechInputResult {
  const { onFinalTranscript, silenceTimeoutMs = 1500, lang = "en-US" } = opts;

  const [interimTranscript, setInterimTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);

  const recognitionRef = useRef<AnySpeechRecognition | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFinalRef = useRef(onFinalTranscript);
  onFinalRef.current = onFinalTranscript;

  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const stop = useCallback(() => {
    clearSilenceTimer();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
    setInterimTranscript("");
  }, []);

  const start = useCallback(() => {
    if (!isSupported) return;

    // Stop any existing session first
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
     
    const rec: AnySpeechRecognition = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setIsListening(true);
      setInterimTranscript("");
    };

    rec.onresult = (event: { resultIndex: number; results: { isFinal: boolean; [0]: { transcript: string } }[] }) => {
      let interim = "";
      let finalSegment = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalSegment += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      setInterimTranscript(interim);

      if (finalSegment.trim()) {
        clearSilenceTimer();
        onFinalRef.current(finalSegment.trim());
        setInterimTranscript("");

        // Restart silence timer after each final segment
        if (silenceTimeoutMs > 0) {
          silenceTimerRef.current = setTimeout(() => {
            stop();
          }, silenceTimeoutMs);
        }
      }
    };

    rec.onerror = (event: { error: string }) => {
      // "no-speech" and "aborted" are non-fatal
      if (event.error !== "no-speech" && event.error !== "aborted") {
        console.warn("[useSpeechInput] error:", event.error);
      }
      setIsListening(false);
      setInterimTranscript("");
    };

    rec.onend = () => {
      setIsListening(false);
      setInterimTranscript("");
    };

    recognitionRef.current = rec;
    rec.start();
  }, [isSupported, lang, silenceTimeoutMs, stop]);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }, [isListening, start, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearSilenceTimer();
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  return { interimTranscript, isListening, isSupported, start, stop, toggle };
}
