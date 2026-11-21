// Small shared helpers.

export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function secondsUntil(iso: string, now: number = Date.now()): number {
  return Math.max(0, (new Date(iso).getTime() - now) / 1000);
}

export const TEXT_RUN_SECONDS = 600; // 10:00 text limit (v4)
export const MAX_PLAYER_MESSAGES = 20; // text message limit (v4)
