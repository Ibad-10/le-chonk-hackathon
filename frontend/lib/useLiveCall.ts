// Live voice call hook (product decision: the call is LIVE like a phone call).
//
// The browser opens WS /voice/live/{run_id} on our backend and streams the mic
// continuously: getUserMedia (echoCancellation, noiseSuppression,
// autoGainControl) -> AudioWorklet (public/worklets/pcm-worklet.js) resamples
// to 16 kHz mono PCM16 and posts ~100 ms frames -> sent as
// {"type":"audio","data":base64} over the WebSocket. The backend relays them
// to Mistral realtime transcription (server-side API key) and sends back
// caption deltas, agent audio chunks (pcm_f32le) and control messages. The
// player can interrupt the agent at any time (barge-in). The only button on
// the mic is Mute (Space toggles it); "End call" ends the run. If the
// WebSocket or the mic streaming fails, the hook falls back automatically to
// the push-to-talk HTTP endpoint (POST /voice/sessions/{id}/turn).

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export interface Caption {
  role: "player" | "agent";
  text: string;
  final: boolean;
}

// --- mute toggle state machine (exported pure, driven by the Vitest test) ---

export type CallState = "live" | "muted" | "agentSpeaking" | "ended";

export type CallEvent =
  | "start"
  | "space" // Space keydown (auto-repeat filtered out by spaceKeyEvent)
  | "space_repeat"
  | "agent_audio_start"
  | "agent_audio_end"
  | "barge_in"
  | "end";

export function nextCallState(state: CallState, event: CallEvent): CallState {
  switch (event) {
    case "start":
      return "live";
    case "space_repeat":
      return state; // key auto-repeat is ignored everywhere
    case "space":
      if (state === "live") return "muted";
      if (state === "muted") return "live";
      if (state === "agentSpeaking") return "live"; // barge-in: interrupt + mic live
      return state; // ended is terminal
    case "agent_audio_start":
      if (state === "live") return "agentSpeaking";
      return state; // muted stays muted while the agent speaks
    case "agent_audio_end":
      if (state === "agentSpeaking") return "live";
      return state;
    case "barge_in":
      if (state === "agentSpeaking") return "live";
      return state;
    case "end":
      return "ended";
  }
}

/** Space keydown only; auto-repeat maps to "space_repeat" (a no-op). */
export function spaceKeyEvent(event: {
  type: string;
  code: string;
  repeat?: boolean;
}): CallEvent | null {
  if (event.code !== "Space") return null;
  if (event.type !== "keydown") return null;
  return event.repeat ? "space_repeat" : "space";
}

// --- helpers ---------------------------------------------------------------

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function wsUrl(path: string): string {
  return `${BACKEND_URL.replace(/^http/, "ws")}${path}`;
}

const BARGE_IN_RMS_THRESHOLD = 0.02; // mic level that counts as "player started speaking"

export type LiveMode = "live" | "ptt";
export type CallStatus = "idle" | "connecting" | CallState;

export function useLiveCall(
  agentId: string,
  agentName = "Ava",
  getToken?: () => string | null | Promise<string | null>,
) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [mode, setMode] = useState<LiveMode>("live");
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const stateRef = useRef<CallState>("ended");
  const modeRef = useRef<LiveMode>("live");
  const mutedSentRef = useRef(false);

  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const ttsSampleRateRef = useRef(24000);
  const nextStartRef = useRef(0);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const pttAudioRef = useRef<HTMLAudioElement | null>(null);

  const applyState = useCallback((event: CallEvent) => {
    const next = nextCallState(stateRef.current, event);
    stateRef.current = next;
    setStatus(next);
    return next;
  }, []);

  const setModeBoth = (m: LiveMode) => {
    modeRef.current = m;
    setMode(m);
  };

  // --- playback (gapless queue of AudioBuffers) -----------------------------

  const stopPlayback = useCallback(() => {
    for (const src of sourcesRef.current) {
      try {
        src.onended = null;
        src.stop();
      } catch {
        /* already stopped */
      }
    }
    sourcesRef.current = [];
    nextStartRef.current = 0;
  }, []);

  const enqueueAudio = useCallback((data: string) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const floats = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
    const buffer = ctx.createBuffer(1, floats.length, ttsSampleRateRef.current);
    buffer.copyToChannel(floats, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    const when = Math.max(ctx.currentTime, nextStartRef.current);
    src.start(when);
    nextStartRef.current = when + buffer.duration;
    sourcesRef.current.push(src);
    src.onended = () => {
      sourcesRef.current = sourcesRef.current.filter((s) => s !== src);
    };
  }, []);

  // --- barge-in ---------------------------------------------------------------

  const bargeIn = useCallback(() => {
    if (stateRef.current !== "agentSpeaking") return;
    stopPlayback(); // stop agent playback immediately
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "interrupt" }));
    }
    applyState("barge_in");
  }, [applyState, stopPlayback]);

  // mic volume threshold watcher (the other barge-in trigger is a new player
  // caption delta while the agent speaks — handled in the WS message switch)
  useEffect(() => {
    const interval = setInterval(() => {
      const analyser = analyserRef.current;
      if (!analyser || stateRef.current !== "agentSpeaking") return;
      const buf = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      if (Math.sqrt(sum / buf.length) > BARGE_IN_RMS_THRESHOLD) bargeIn();
    }, 100);
    return () => clearInterval(interval);
  }, [bargeIn]);

  // --- captions ---------------------------------------------------------------

  const pushCaption = useCallback((role: "player" | "agent", text: string, final: boolean) => {
    setCaptions((prev) => {
      const last = prev[prev.length - 1];
      if (!final && last && last.role === role && !last.final) {
        return [...prev.slice(0, -1), { role, text: last.text + text, final }];
      }
      if (final && last && last.role === role && !last.final) {
        return [...prev.slice(0, -1), { role, text, final }];
      }
      return [...prev, { role, text, final }];
    });
  }, []);

  // --- live WebSocket -----------------------------------------------------------

  const sendFrame = useCallback((frame: ArrayBuffer) => {
    if (stateRef.current === "muted") return; // muted: frames are not sent
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "audio", data: toBase64(frame) }));
    }
  }, []);

  const startMic = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    micStreamRef.current = stream;
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    await ctx.audioWorklet.addModule("/worklets/pcm-worklet.js");
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "pcm16-16k");
    node.port.onmessage = (e: MessageEvent) => sendFrame(e.data as ArrayBuffer);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const silentGain = ctx.createGain();
    silentGain.gain.value = 0; // never play the mic back
    source.connect(node);
    node.connect(silentGain);
    silentGain.connect(ctx.destination);
    source.connect(analyser);
    analyserRef.current = analyser;
    workletRef.current = node;
  }, [sendFrame]);

  const handleWsMessage = useCallback(
    (raw: string) => {
      const msg = JSON.parse(raw) as Record<string, never> & {
        type: string;
        role?: "player" | "agent";
        text?: string;
        final?: boolean;
        data?: string;
        sample_rate?: number;
        ends_at?: number;
        detail?: string;
        fallback?: string;
      };
      switch (msg.type) {
        case "ready":
          if (typeof msg.ends_at === "number") {
            setSecondsLeft(Math.max(0, Math.round(msg.ends_at - Date.now() / 1000)));
          }
          applyState("start");
          break;
        case "caption":
          if (msg.role && typeof msg.text === "string") {
            const final = Boolean(msg.final);
            pushCaption(msg.role, msg.text, final);
            // a new partial transcript while the agent speaks = barge-in
            if (msg.role === "player" && !final && stateRef.current === "agentSpeaking") {
              bargeIn();
            }
          }
          break;
        case "audio_start":
          if (typeof msg.sample_rate === "number") ttsSampleRateRef.current = msg.sample_rate;
          applyState("agent_audio_start");
          break;
        case "audio":
          if (typeof msg.data === "string") enqueueAudio(msg.data);
          break;
        case "audio_end":
          applyState("agent_audio_end");
          break;
        case "agent_interrupted":
          stopPlayback();
          applyState("agent_audio_end");
          break;
        case "ended":
          applyState("end");
          setSecondsLeft(0);
          break;
        case "error":
          setError(String(msg.detail ?? "voice error"));
          if (msg.fallback === "ptt") setModeBoth("ptt"); // automatic PTT fallback
          break;
      }
    },
    [applyState, bargeIn, enqueueAudio, pushCaption, stopPlayback],
  );

  const startLive = useCallback(
    async (sessionId: string) => {
      const token = (await getToken?.()) ?? null;
      const ws = new WebSocket(
        wsUrl(`/voice/live/${sessionId}${token ? `?token=${encodeURIComponent(token)}` : ""}`),
      );
      wsRef.current = ws;
      ws.onmessage = (e) => handleWsMessage(typeof e.data === "string" ? e.data : "");
      ws.onclose = () => {
        if (stateRef.current !== "ended" && modeRef.current === "live") {
          // socket dropped mid-call: fall back to the PTT endpoint
          setModeBoth("ptt");
        }
      };
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("live socket timeout")), 8000);
        ws.onopen = () => {
          clearTimeout(timer);
          if (token) ws.send(JSON.stringify({ type: "auth", token }));
          resolve();
        };
        ws.onerror = () => {
          clearTimeout(timer);
          setError("live socket error — falling back to push-to-talk");
          reject(new Error("live socket failed"));
        };
      });
      await startMic();
      // tell the server whether the mic is muted from now on
      if (mutedSentRef.current) {
        ws.send(JSON.stringify({ type: "mute", muted: stateRef.current === "muted" }));
      }
    },
    [getToken, handleWsMessage, startMic],
  );

  // --- push-to-talk fallback (existing HTTP endpoint) ---------------------------

  const sendClip = useCallback(async (blob: Blob) => {
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    try {
      const form = new FormData();
      form.append("file", blob, "clip.webm");
      const res = await fetch(`${BACKEND_URL}/voice/sessions/${sessionId}/turn`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(`turn failed (${res.status})`);
      const turn = await res.json();
      if (turn.transcript) pushCaption("player", turn.transcript, true);
      if (turn.reply) pushCaption("agent", turn.reply, true);
      if (turn.audio_base64) {
        applyState("agent_audio_start");
        const audio = new Audio(
          `data:${turn.audio_content_type ?? "audio/mpeg"};base64,${turn.audio_base64}`,
        );
        pttAudioRef.current = audio;
        audio.onended = () => applyState("agent_audio_end");
        await audio.play();
      } else {
        applyState("agent_audio_end");
      }
      if (turn.ended) applyState("end");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [applyState, pushCaption]);

  const startRecording = useCallback(async () => {
    try {
      const stream =
        micStreamRef.current ??
        (await navigator.mediaDevices.getUserMedia({ audio: true }));
      micStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size > 0) void sendClip(blob);
      };
      recorder.start();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [sendClip]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  // --- start / end ---------------------------------------------------------------

  const start = useCallback(async () => {
    setError(null);
    setStatus("connecting");
    try {
      const res = await fetch(`${BACKEND_URL}/voice/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId, player_id: "anon", mode: "arena" }),
      });
      if (!res.ok) throw new Error(`start failed (${res.status})`);
      const data = await res.json();
      sessionRef.current = data.session_id;
      setSecondsLeft(Math.max(0, Math.round(data.ends_at - Date.now() / 1000)));
      setModeBoth("live");
      try {
        await startLive(data.session_id);
      } catch (e) {
        // WebSocket or mic streaming failed: automatic push-to-talk fallback
        setModeBoth("ptt");
        setError(`${e instanceof Error ? e.message : String(e)} — push-to-talk fallback`);
        try {
          await startMic();
        } catch {
          /* PTT will request the mic itself on first hold */
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("idle");
    }
  }, [agentId, startLive, startMic]);

  const end = useCallback(async () => {
    stopPlayback();
    pttAudioRef.current?.pause();
    recorderRef.current?.stop();
    const sessionId = sessionRef.current;
    try {
      wsRef.current?.send(JSON.stringify({ type: "end" }));
    } catch {
      /* best effort */
    }
    wsRef.current?.close();
    wsRef.current = null;
    if (sessionId) {
      try {
        await fetch(`${BACKEND_URL}/voice/sessions/${sessionId}/end`, { method: "POST" });
      } catch {
        /* hang-up is best-effort */
      }
    }
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    workletRef.current = null;
    applyState("end");
    setSecondsLeft(0);
  }, [applyState, stopPlayback]);

  const toggleMute = useCallback(() => {
    const next = applyState("space");
    mutedSentRef.current = true;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "mute", muted: next === "muted" }));
    }
  }, [applyState]);

  // --- Space key: live mode toggles mute, PTT mode holds to talk -------------------

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = spaceKeyEvent(event);
      if (action === "space") {
        event.preventDefault();
        if (modeRef.current === "ptt") void startRecording();
        else toggleMute();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space" && modeRef.current === "ptt") {
        event.preventDefault();
        stopRecording();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [startRecording, stopRecording, toggleMute]);

  // --- call timer ------------------------------------------------------------------

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

  // cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return {
    agentName,
    status,
    mode,
    captions,
    secondsLeft,
    error,
    muted: stateRef.current === "muted",
    agentSpeaking: stateRef.current === "agentSpeaking",
    start,
    end,
    toggleMute,
    startRecording,
    stopRecording,
  };
}
