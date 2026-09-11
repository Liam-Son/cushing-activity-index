/** CFAM meme engine — one file. Not alpha. */

import { type ExplainRow } from "./cfam-ml";

export type { ExplainRow };

export type Leg = {
  id: string;
  name: string;
  score: number;
  w: number;
  note: string;
  contrib: number;
  auto?: boolean;
};

export type Pinch = {
  id: string;
  name: string;
  w: number;
  score: number | null;
  note: string;
};

export type FieldTape = {
  radioTitle: string;
  radioHustle: boolean;
  headlines: { title: string; date: string }[];
  adsbN: number;
  adsbLow: number;
  adsbClosestNm: number | null;
  cadTypes: string[];
  muniNote: string;
  aqi: number | null;
  pm25: number | null;
  aqiNote: string;
};

export type Board = {
  tsUtc: string;
  score: number;
  label: "quiet" | "normal" | "busy";
  legs: Leg[];
  dropped: { id: string; name: string; w: number; note: string }[];
  note: string;
  explain: ExplainRow[];
  explainNote: string;
  history: number[];
  tape?: FieldTape;
};

export const WIKI_PAGE = "Cushing,_Oklahoma";
export const EIA_LEAF =
  "https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=W_EPC0_SAX_YCUOK_MBBL&f=W";

export const PINCH: Pinch[] = [
  { id: "S", name: "091-S QSR", w: 0.15, score: null, note: "관찰 파일 없음" },
  { id: "U", name: "091-U 산업공고", w: 0.1, score: 50, note: "4/8" },
  { id: "V", name: "091-V 허가", w: 0.1, score: null, note: "원장 n 없음" },
  { id: "A", name: "091-A 숙박세", w: 0.05, score: 58, note: "FY24 마지막월 %" },
  { id: "H", name: "091-H 검색", w: 0.05, score: null, note: "Trends 미수출" },
  { id: "M", name: "091-M 시청공고", w: 0.05, score: 50, note: "3/6" },
  { id: "W", name: "091-W AQI", w: 0.05, score: null, note: "CAMS 대기" },
  { id: "Z", name: "091-Z 뉴스", w: 0.05, score: null, note: "7일 n 없음" },
  { id: "ADSB", name: "091-ADSB 저고도", w: 0.05, score: null, note: "박스 없음" },
  { id: "CAD", name: "091-CAD 산업", w: 0.05, score: null, note: "블로터 없음" },
  { id: "RADIO", name: "091-RADIO 허슬", w: 0.01, score: null, note: "지금곡 없음" },
  { id: "X", name: "091-X 스프레드", w: 0.01, score: null, note: "쌍 없음" },
  { id: "Y", name: "091-Y 펌프갭", w: 0.01, score: null, note: "표시가 없음" },
];

export function pctile(x: number, xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return (100 * s.filter((y) => y <= x).length) / s.length;
}

export function wikiFromItems(
  items: { timestamp: string; views: number }[],
): Leg | null {
  if (!items.length) return null;
  const series = items.map((x) => ({
    d: x.timestamp.slice(0, 8),
    v: x.views,
  }));
  const wmap = new Map(series.map((x) => [x.d, x.v]));
  const last = series[series.length - 1].d;

  function ymd(s: string, back: number) {
    const t = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
    const n = new Date(t - back * 86400000);
    const m = String(n.getUTCMonth() + 1).padStart(2, "0");
    const d = String(n.getUTCDate()).padStart(2, "0");
    return `${n.getUTCFullYear()}${m}${d}`;
  }

  function meanLast(n: number, end: string) {
    const xs: number[] = [];
    for (let k = 0; k < n; k++) {
      const v = wmap.get(ymd(end, k));
      if (v != null) xs.push(v);
    }
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  }

  const w7 = meanLast(7, last);
  if (w7 == null) return null;
  const hist: number[] = [];
  for (let k = 14; k < 90; k++) {
    const m = meanLast(7, ymd(last, k));
    if (m != null) hist.push(m);
  }
  const score = pctile(w7, hist);
  if (score == null) return null;
  return {
    id: "wiki",
    name: "WIKI 조회",
    score,
    w: 0,
    note: `7일 ${Math.round(w7)}`,
    contrib: 0,
    auto: true,
  };
}

export function wikiWeekly(
  items: { timestamp: string; views: number }[],
): number[] {
  if (!items.length) return [];
  const wmap = new Map(items.map((x) => [x.timestamp.slice(0, 8), x.views]));
  const last = items[items.length - 1].timestamp.slice(0, 8);
  function ymd(s: string, back: number) {
    const t = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
    const n = new Date(t - back * 86400000);
    const m = String(n.getUTCMonth() + 1).padStart(2, "0");
    const d = String(n.getUTCDate()).padStart(2, "0");
    return `${n.getUTCFullYear()}${m}${d}`;
  }
  function meanLast(n: number, end: string) {
    const xs: number[] = [];
    for (let k = 0; k < n; k++) {
      const v = wmap.get(ymd(end, k));
      if (v != null) xs.push(v);
    }
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  }
  const out: number[] = [];
  for (let k = 14; k < 170; k += 7) {
    const end = ymd(last, k);
    const w7 = meanLast(7, end);
    const hist: number[] = [];
    for (let j = 14; j < 90; j++) {
      const m = meanLast(7, ymd(end, j));
      if (m != null) hist.push(m);
    }
    const s = w7 != null ? pctile(w7, hist) : null;
    if (s != null) out.push(s);
  }
  return out.reverse();
}

export function parseEiaPairs(html: string): { t: number; v: number }[] {
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const pairs: { t: number; v: number }[] = [];
  for (const r of rows) {
    const cells = [...r.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) =>
      m[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim(),
    );
    if (!cells[0] || !/^20\d{2}-[A-Za-z]{3}/.test(cells[0])) continue;
    const year = +cells[0].slice(0, 4);
    const rest = cells.slice(1);
    for (let i = 0; i + 1 < rest.length; i += 2) {
      const d = rest[i];
      const v = rest[i + 1];
      if (/^\d{2}\/\d{2}$/.test(d) && /^[\d,]+$/.test(v)) {
        const [mo, da] = d.split("/").map(Number);
        pairs.push({ t: Date.UTC(year, mo - 1, da), v: +v.replace(/,/g, "") });
      }
    }
  }
  pairs.sort((a, b) => a.t - b.t);
  const uniq: typeof pairs = [];
  const seen = new Set<number>();
  for (const p of pairs) {
    if (seen.has(p.t)) continue;
    seen.add(p.t);
    uniq.push(p);
  }
  return uniq;
}

export function eiaWeekly(html: string): { move: number[]; tight: number[] } {
  const uniq = parseEiaPairs(html);
  if (uniq.length < 3) return { move: [], tight: [] };
  const chg = uniq.slice(1).map((p, i) => ({
    t: p.t,
    abs: Math.abs(p.v - uniq[i].v),
    lvl: p.v,
  }));
  const move: number[] = [];
  const tight: number[] = [];
  for (let i = 0; i < chg.length; i++) {
    const last = chg[i];
    const moveHist = chg.slice(Math.max(0, i - 51), i + 1).map((c) => c.abs);
    const fiveY = uniq.filter((p) => last.t - p.t <= 365 * 5 * 86400000);
    const m = pctile(last.abs, moveHist);
    const t = pctile(
      last.lvl,
      fiveY.map((p) => p.v),
    );
    if (m != null) move.push(m);
    if (t != null) tight.push(100 - t);
  }
  return { move, tight };
}

export function eiaFromHtml(html: string): Leg[] {
  const uniq = parseEiaPairs(html);
  if (uniq.length < 2) return [];
  const chg = uniq.slice(1).map((p, i) => ({
    abs: Math.abs(p.v - uniq[i].v),
    lvl: p.v,
    t: p.t,
  }));
  const last = chg[chg.length - 1];
  const moveHist = chg.slice(-52).map((c) => c.abs);
  const fiveY = uniq.filter((p) => last.t - p.t <= 365 * 5 * 86400000);
  const move = pctile(last.abs, moveHist);
  const tight = pctile(
    last.lvl,
    fiveY.map((p) => p.v),
  );
  const out: Leg[] = [];
  if (move != null)
    out.push({
      id: "eia_move",
      name: "EIA |Δ|",
      score: move,
      w: 0,
      note: `${last.abs} kbbl`,
      contrib: 0,
      auto: true,
    });
  if (tight != null)
    out.push({
      id: "eia_tight",
      name: "EIA 타이트",
      score: 100 - tight,
      w: 0,
      note: `${last.lvl.toLocaleString()} kbbl`,
      contrib: 0,
      auto: true,
    });
  return out;
}

export const FALLBACK_AUTO: Leg[] = [
  {
    id: "wiki",
    name: "WIKI 조회",
    score: 11.84,
    w: 0,
    note: "캐시 7일 66",
    contrib: 0,
    auto: true,
  },
  {
    id: "eia_move",
    name: "EIA |Δ|",
    score: 38.46,
    w: 0,
    note: "684 kbbl",
    contrib: 0,
    auto: true,
  },
  {
    id: "eia_tight",
    name: "EIA 타이트",
    score: 86.97,
    w: 0,
    note: "21,824 kbbl",
    contrib: 0,
    auto: true,
  },
];

export function combine(
  auto: Leg[],
  pinches: Pinch[] = PINCH,
  explain: ExplainRow[] = [],
): Board {
  const liveA = auto.filter((a) => a.score != null);
  const liveP = pinches.filter((p) => p.score != null);
  const wP = liveP.reduce((s, p) => s + p.w, 0);
  const rest = Math.max(0, 1 - wP);
  const wEach = liveA.length ? rest / liveA.length : 0;
  const used = new Map(explain.map((e) => [e.id, e.usedW]));
  const legs: Leg[] = [];
  let total = 0;
  let tw = 0;
  for (const a of liveA) {
    const w = +(used.get(a.id) ?? wEach).toFixed(4);
    const contrib = +(w * a.score).toFixed(2);
    legs.push({ ...a, w, contrib });
    total += w * a.score;
    tw += w;
  }
  for (const p of liveP) {
    const contrib = +((p.w as number) * (p.score as number)).toFixed(2);
    legs.push({
      id: p.id,
      name: p.name,
      score: p.score as number,
      w: p.w,
      note: p.note,
      contrib,
      auto: false,
    });
    total += p.w * (p.score as number);
    tw += p.w;
  }
  const score = tw ? total / tw : 0;
  const label: Board["label"] =
    score < 40 ? "quiet" : score >= 60 ? "busy" : "normal";
  legs.sort((a, b) => b.w - a.w);
  const pinchExplain: ExplainRow[] = liveP.map((p) => ({
    id: p.id,
    name: p.name,
    ruleW: p.w,
    ridgeW: 0,
    mlpW: 0,
    mixW: 0,
    usedW: p.w,
  }));
  const allExplain = [
    ...explain.filter((e) => liveA.some((a) => a.id === e.id)),
    ...pinchExplain,
  ].sort((a, b) => b.usedW - a.usedW);
  return {
    tsUtc: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    score: +score.toFixed(1),
    label,
    legs,
    dropped: pinches
      .filter((p) => p.score == null)
      .map((p) => ({ id: p.id, name: p.name, w: p.w, note: p.note })),
    note: "위키·EIA·KUSH·ADS-B 재조회. 나머지 몫은 ridge+MLP 순열. 알파 아님.",
    explain: allExplain,
    explainNote:
      "유가 예측 아님. 잠재 바쁨(변동 다리 z평균)을 ridge와 얕은 MLP 순열중요도로 나눠 나머지 몫을 배분. 핀치(U/A/M/Z/W/ADSB/CAD/RADIO)는 밈 고정.",
    history: [],
  };
}

export function fallbackBoard(): Board {
  return combine(FALLBACK_AUTO);
}
