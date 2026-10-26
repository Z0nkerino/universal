// Small, honest statistics. Every insight shown in the app is computed with these.

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : NaN);

export function stdev(xs: number[]) {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1));
}

/** Pearson correlation coefficient; NaN when undefined (fewer than 3 pairs or no variance). */
export function pearson(xs: number[], ys: number[]) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return NaN;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : NaN;
}

/** Least-squares line y = a + b·x. */
export function linearRegression(xs: number[], ys: number[]) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return { slope: NaN, intercept: NaN };
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den ? num / den : 0;
  return { slope, intercept: my - slope * mx };
}

/** Trailing moving average; nulls are skipped (and averaged over what's present). */
export function movingAverage(values: (number | null)[], window: number) {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1).filter((v): v is number => v !== null && !Number.isNaN(v));
    return slice.length ? mean(slice) : null;
  });
}

export function describeCorrelation(r: number) {
  const a = Math.abs(r);
  if (Number.isNaN(r)) return 'not enough data';
  const strength = a >= 0.7 ? 'strong' : a >= 0.4 ? 'moderate' : a >= 0.2 ? 'weak' : 'no clear';
  return a < 0.2 ? 'no clear link' : `${strength} ${r > 0 ? 'positive' : 'negative'} link`;
}

/** % difference of mean(b) over mean(a), rounded; null if either group is too small. */
export function percentLift(a: number[], b: number[], minEach = 3) {
  if (a.length < minEach || b.length < minEach) return null;
  const ma = mean(a);
  const mb = mean(b);
  if (!ma) return null;
  return Math.round(((mb - ma) / ma) * 100);
}
