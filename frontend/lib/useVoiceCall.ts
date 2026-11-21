// V4-10 voice call hook: push-to-talk against an arena agent.
// Hold Space (or the on-screen button) to record a clip; on release the clip
// is uploaded to the backend, which transcribes (Voxtral STT), runs the same
// agent turn + executor as text, and returns the reply as text + mp3 (Voxtral
// TTS). The browser never sees the Mistral API key.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export type VoiceStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "recording"
  | "thinking"
  | "speaking"
  | "ended";

export interface Caption {
  role: "player" | "agent";
  text: string;
}

export interface VoiceTurnResponse {
  session_id: string;
  transcript: string;
  language?: string;
  reply: string | null;
  audio_base64: string | null;
  audio_content_type: string | null;
  ended: boolean;
  outcome: string | null;
}

/** Pure Space-key handler, exported so the Vitest test can drive it directly. */
export type TalkKeyAction = "start" | "stop" | "none";

export function talkKeyAction(event: {
  type: string;
  code: string;
  repeat?: boolean;
}): TalkKeyAction {
  if (event.code !== "Space") return "none";
  if (event.type === "keydown") return event.repeat ? "none" : "start";
  if (event.type === "keyup") return "stop";
  return "none";
}

export function useVoiceCall(
  agentId: string,
  agentName = "Ava",
  getToken?: () => string | null | Promise<string | null>,
) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<string>("auto");
  const sessionRef = useRef<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const statusRef = useRef<VoiceStatus>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const setStatusBoth = (s: VoiceStatus) => {
    statusRef.current = s;
    setStatus(s);
  };

  // The voice HTTP routes verify the Clerk session token like every write
  // route; send it as a Bearer header whenever the caller can mint one.
  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = (await getToken?.()) ?? null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getToken]);

  const start = useCallback(async () => {
    setError(null);
    setStatusBoth("connecting");
    try {
      const res = await fetch(`${BACKEND_URL}/voice/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ agent_id: agentId, mode: "arena" }),
      });
      if (!res.ok) throw new Error(`start failed (${res.status})`);
      const data = await res.json();
      sessionRef.current = data.session_id;
      setSecondsLeft(Math.max(0, Math.round(data.ends_at - Date.now() / 1000)));
      setStatusBoth("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatusBoth("idle");
    }
  }, [agentId, authHeaders]);

  const sendClip = useCallback(async (blob: Blob) => {
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    setStatusBoth("thinking"); // nothing plays while the agent thinks
    try {
      const form = new FormData();
      form.append("file", blob, "clip.webm");
      const t0 = performance.now();
      const res = await fetch(`${BACKEND_URL}/voice/sessions/${sessionId}/turn`, {
        method: "POST",
        headers: await authHeaders(),
        body: form,
      });
      if (!res.ok) throw new Error(`turn failed (${res.status})`);
      const turn: VoiceTurnResponse = await res.json();
      const latencyMs = Math.round(performance.now() - t0);
      if (turn.transcript) {
        setCaptions((c) => [...c, { role: "player", text: turn.transcript }]);
      }
      if (turn.language) setLanguage(turn.language);
      if (turn.reply) {
        setCaptions((c) => [...c, { role: "agent", text: turn.reply! }]);
      }
      if (turn.audio_base64) {
        setStatusBoth("speaking");
        const audio = new Audio(
          `data:${turn.audio_content_type ?? "audio/mpeg"};base64,${turn.audio_base64}`
        );
        audioRef.current = audio;
        audio.onended = () => setStatusBoth(turn.ended ? "ended" : "ready");
        await audio.play();
        if (turn.ended) setStatusBoth("ended");
      } else if (turn.ended) {
        setStatusBoth("ended");
      } else {
        setStatusBoth("ready");
      }
      console.info(`[voice] turn latency ${latencyMs} ms`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatusBoth("ready");
    }
  }, [authHeaders]);

  const startRecording = useCallback(async () => {
    if (statusRef.current !== "ready") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size > 0) void sendClip(blob);
        else setStatusBoth("ready");
      };
      recorder.start();
      setStatusBoth("recording");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [sendClip]);

  const stopRecording = useCallback(() => {
    if (statusRef.current !== "recording") return;
    recorderRef.current?.stop();
  }, []);

  const handleKey = useCallback(
    (event: KeyboardEvent) => {
      const action = talkKeyAction(event);
      if (action === "start") {
        event.preventDefault();
        void startRecording();
      } else if (action === "stop") {
        event.preventDefault();
        stopRecording();
      }
    },
    [startRecording, stopRecording]
  );

  const end = useCallback(async () => {
    const sessionId = sessionRef.current;
    stopRecording();
    audioRef.current?.pause();
    if (sessionId) {
      try {
        await fetch(`${BACKEND_URL}/voice/sessions/${sessionId}/end`, {
          method: "POST",
          headers: await authHeaders(),
        });
      } catch {
        /* hang-up is best-effort */
      }
    }
    setStatusBoth("ended");
  }, [stopRecording, authHeaders]);

  // Space key listeners + countdown timer
  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    window.addEventListener("keyup", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("keyup", handleKey);
    };
  }, [handleKey]);

  useEffect(() => {
    if (secondsLeft === null) return;
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s === null) return s;
        if (s <= 1) {
          void end();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [secondsLeft !== null, end]);

  return {
    agentName,
    status,
    captions,
    secondsLeft,
    error,
    language,
    start,
    end,
    startRecording,
    stopRecording,
  };
}
