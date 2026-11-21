const BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export interface Challenge {
  date: string;
  title: string;
  tactic_family: string;
  brief: string;
  target_agent_id: string;
  bonus_points: number;
}

export interface Rank {
  name: string;
  min_xp: number;
  next_xp: number | null;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  return (await res.json()) as T;
}

export const getTodayChallenge = () => get<Challenge>("/challenge/today");
export const getRanks = async () => (await get<{ ranks: Rank[] }>("/ranks")).ranks;
