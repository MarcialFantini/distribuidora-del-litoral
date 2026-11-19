import { createRng, type Rng } from '../data/rng';

/**
 * Live randomness. Seeded, so a fresh session (and every showcase run) plays out the same way;
 * reseeded from the clock when a saved session resumes, so it does not replay the same morning.
 */
let rng: Rng = createRng(1102);

export function reseed(seed: number): void {
  rng = createRng(seed);
}

export const random = (): number => rng.next();
export const live = (): Rng => rng;
