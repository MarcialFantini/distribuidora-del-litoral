/** Tiny SVG path helpers for the inline charts (no chart library). */
export type Point = { x: number; y: number };

export function scaleLinear(domain: [number, number], range: [number, number]): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (value) => r0 + ((value - d0) / span) * (r1 - r0);
}

export function stepPath(points: Point[]): string {
  if (!points.length) return '';
  let d = `M${points[0]!.x.toFixed(1)},${points[0]!.y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const point = points[i]!;
    d += `H${point.x.toFixed(1)}V${point.y.toFixed(1)}`;
  }
  return d;
}

export function linePath(points: Point[]): string {
  return points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join('');
}

export function areaPath(points: Point[], baseline: number, step = false): string {
  if (!points.length) return '';
  const top = step ? stepPath(points) : linePath(points);
  return `${top}V${baseline.toFixed(1)}H${points[0]!.x.toFixed(1)}Z`;
}

export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}
