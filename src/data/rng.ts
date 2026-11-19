/** Deterministic PRNG (mulberry32). Same seed, same sequence, on the server and in the browser. */
export type Rng = {
  next: () => number;
  int: (min: number, max: number) => number;
  range: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
  weighted: <T>(items: readonly T[], weights: readonly number[]) => T;
  chance: (probability: number) => boolean;
};

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => Math.floor(next() * (max - min + 1)) + min;
  const range = (min: number, max: number): number => next() * (max - min) + min;
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T;
  const weighted = <T,>(items: readonly T[], weights: readonly number[]): T => {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let roll = next() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i] ?? 0;
      if (roll <= 0) return items[i] as T;
    }
    return items[items.length - 1] as T;
  };
  const chance = (probability: number): boolean => next() < probability;
  return { next, int, range, pick, weighted, chance };
}
