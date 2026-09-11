/** Ridge + shallow MLP permutation. Explains remainder weights. Not oil alpha. */

export type Col = { id: string; name: string; xs: number[]; pinch?: boolean };

export type ExplainRow = {
  id: string;
  name: string;
  ruleW: number;
  ridgeW: number;
  mlpW: number;
  mixW: number;
  usedW: number;
};

function zcol(xs: number[]): number[] {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length) || 1;
  return xs.map((x) => (x - m) / sd);
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(A: number[][]): number[] {
  const n = A.length;
  const M = A.map((r) => r.slice());
  for (let i = 0; i < n; i++) {
    let piv = M[i][i];
    if (Math.abs(piv) < 1e-12) piv = 1e-12;
    for (let j = i; j <= n; j++) M[i][j] /= piv;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = M[r][i];
      for (let j = i; j <= n; j++) M[r][j] -= f * M[i][j];
    }
  }
  return M.map((r) => r[n]);
}

function ridgeShare(Z: number[][], y: number[], lam = 0.2): number[] {
  const k = Z.length;
  const n = y.length;
  const XtX: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  const Xty = Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      Xty[a] += Z[a][i] * y[i];
      for (let b = 0; b < k; b++) XtX[a][b] += Z[a][i] * Z[b][i];
    }
  }
  for (let a = 0; a < k; a++) XtX[a][a] += lam;
  const aug = XtX.map((row, i) => [...row, Xty[i]]);
  const beta = gauss(aug);
  const ab = beta.map(Math.abs);
  const s = ab.reduce((a, b) => a + b, 0) || 1;
  return ab.map((x) => x / s);
}

function mlpPermShare(Z: number[][], y: number[]): number[] {
  const k = Z.length;
  const n = y.length;
  const rnd = mulberry(7);
  const h = 6;
  const W1 = Array.from({ length: h }, () => Array.from({ length: k }, () => (rnd() - 0.5) * 0.6));
  const b1 = Array(h).fill(0);
  const W2 = Array.from({ length: h }, () => (rnd() - 0.5) * 0.6);
  let b2 = 0;
  const tanh = Math.tanh;
  const lr = 0.03;
  for (let ep = 0; ep < 160; ep++) {
    for (let i = 0; i < n; i++) {
      const hid: number[] = [];
      for (let u = 0; u < h; u++) {
        let s = b1[u];
        for (let j = 0; j < k; j++) s += W1[u][j] * Z[j][i];
        hid.push(tanh(s));
      }
      let yhat = b2;
      for (let u = 0; u < h; u++) yhat += W2[u] * hid[u];
      const err = yhat - y[i];
      for (let u = 0; u < h; u++) W2[u] -= lr * err * hid[u];
      b2 -= lr * err;
      for (let u = 0; u < h; u++) {
        const d = err * W2[u] * (1 - hid[u] * hid[u]);
        b1[u] -= lr * d;
        for (let j = 0; j < k; j++) W1[u][j] -= lr * d * Z[j][i];
      }
    }
  }
  const pred = (row: number[]) => {
    const hid: number[] = [];
    for (let u = 0; u < h; u++) {
      let s = b1[u];
      for (let j = 0; j < k; j++) s += W1[u][j] * row[j];
      hid.push(tanh(s));
    }
    let yhat = b2;
    for (let u = 0; u < h; u++) yhat += W2[u] * hid[u];
    return yhat;
  };
  let base = 0;
  for (let i = 0; i < n; i++) {
    const row = Z.map((c) => c[i]);
    const e = pred(row) - y[i];
    base += e * e;
  }
  base /= n;
  const perm = Z.map((col, j) => {
    const sh = col.slice();
    for (let i = sh.length - 1; i > 0; i--) {
      const r = Math.floor(rnd() * (i + 1));
      [sh[i], sh[r]] = [sh[r], sh[i]];
    }
    let s = 0;
    for (let i = 0; i < n; i++) {
      const row = Z.map((c, cidx) => (cidx === j ? sh[i] : c[i]));
      const e = pred(row) - y[i];
      s += e * e;
    }
    return Math.max(0, s / n - base);
  });
  const t = perm.reduce((a, b) => a + b, 0);
  if (!t) return Z.map(() => 1 / k);
  return perm.map((x) => x / t);
}

export function explainWeights(cols: Col[], rest: number): ExplainRow[] {
  const n = Math.min(...cols.map((c) => c.xs.length));
  if (n < 8) {
    const autos = cols.filter((c) => !c.pinch);
    const wEach = autos.length ? rest / autos.length : 0;
    return cols.map((c) => {
      const used = c.pinch ? 0 : wEach;
      const eq = autos.length ? 1 / autos.length : 0;
      return {
        id: c.id,
        name: c.name,
        ruleW: c.pinch ? 0 : wEach,
        ridgeW: c.pinch ? 0 : eq,
        mlpW: c.pinch ? 0 : eq,
        mixW: c.pinch ? 0 : eq,
        usedW: used,
      };
    });
  }
  const trimmed = cols.map((c) => ({ ...c, xs: c.xs.slice(-n) }));
  const Z = trimmed.map((c) => zcol(c.xs));
  const vary = trimmed.map((c, i) => (c.pinch ? -1 : i)).filter((i) => i >= 0);
  const y = Array.from({ length: n }, (_, i) => {
    let s = 0;
    for (const j of vary) s += Z[j][i];
    return vary.length ? s / vary.length : 0;
  });
  const ridge = ridgeShare(Z, y);
  const mlp = mlpPermShare(Z, y);
  const mix = ridge.map((r, i) => 0.5 * r + 0.5 * mlp[i]);
  const mixSum = mix.reduce((a, b) => a + b, 0) || 1;
  const mixN = mix.map((x) => x / mixSum);
  const autoMix = trimmed.map((c, i) => (c.pinch ? 0 : mixN[i]));
  const autoSum = autoMix.reduce((a, b) => a + b, 0) || 1;
  const autos = trimmed.filter((c) => !c.pinch);
  const ruleEach = autos.length ? rest / autos.length : 0;
  return trimmed.map((c, i) => ({
    id: c.id,
    name: c.name,
    ruleW: c.pinch ? 0 : ruleEach,
    ridgeW: ridge[i],
    mlpW: mlp[i],
    mixW: mixN[i],
    usedW: c.pinch ? 0 : (autoMix[i] / autoSum) * rest,
  }));
}
