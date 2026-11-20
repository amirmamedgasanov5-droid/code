// Построение восьмиугольной геометрии: звёздчатые многоугольники {n/k}
type Pt = [number, number];
export const poly = (n: number, r: number, rot = 0): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = ((i / n) * 360 + rot - 90) * (Math.PI / 180);
    return [+(Math.cos(a) * r).toFixed(2), +(Math.sin(a) * r).toFixed(2)] as Pt;
  });
/** звёздчатый многоугольник {n/k}, одной непрерывной линией */
export const star = (n: number, k: number, r: number, rot = 0) => {
  const v = poly(n, r, rot);
  const seen = new Set<number>();
  const parts: string[] = [];
  for (let s = 0; s < n; s++) {
    if (seen.has(s)) continue;
    let i = s;
    const cur: Pt[] = [];
    while (!seen.has(i)) {
      seen.add(i);
      cur.push(v[i]);
      i = (i + k) % n;
    }
    parts.push('M' + cur.map((p) => p.join(' ')).join('L') + 'Z');
  }
  return parts.join('');
};
export const ring = (n: number, r: number, rot = 0) => 'M' + poly(n, r, rot).map((p) => p.join(' ')).join('L') + 'Z';
export const spokes = (n: number, r1: number, r2: number, rot = 0) => {
  const a = poly(n, r1, rot);
  const b = poly(n, r2, rot);
  return a.map((p, i) => `M${p.join(' ')}L${b[i].join(' ')}`).join('');
};

