import type { Board, Leg } from "./cfam-engine";

export type AreaId = "관심" | "재고" | "시설·현장" | "지역 소비" | "환경" | "시장 구조" | "기타";

const AREA: Record<string, AreaId> = {
  wiki: "관심",
  eia_move: "재고",
  eia_tight: "재고",
  U: "시설·현장",
  M: "시설·현장",
  V: "시설·현장",
  S: "시설·현장",
  A: "지역 소비",
  H: "관심",
  Z: "관심",
  RADIO: "관심",
  ADSB: "시설·현장",
  CAD: "시설·현장",
  W: "환경",
  X: "시장 구조",
  Y: "시장 구조",
};

export function areaOf(id: string): AreaId {
  return AREA[id] ?? "기타";
}

export function isoWeek(d: Date): { year: number; week: number } {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((+x - +yearStart) / 86400000 + 1) / 7);
  return { year: x.getUTCFullYear(), week };
}

export function koDate(d: Date): string {
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

export function koStamp(iso: string): { date: string; week: string; isoDate: string } {
  const d = new Date(iso);
  const { week } = isoWeek(d);
  const isoDate = d.toISOString().slice(0, 10);
  return {
    date: koDate(d),
    week: `W${String(week).padStart(2, "0")}`,
    isoDate,
  };
}

export function scoreByKey(board: Board, key: "ruleW" | "usedW"): number {
  if (!board.legs.length) return 0;
  const wmap = new Map(board.explain.map((e) => [e.id, e]));
  let tot = 0;
  let tw = 0;
  for (const leg of board.legs) {
    const row = wmap.get(leg.id);
    const w = key === "usedW" ? leg.w : (row?.ruleW ?? 0);
    tot += w * leg.score;
    tw += w;
  }
  if (!tw) {
    const n = board.legs.length;
    return board.legs.reduce((s, l) => s + l.score / n, 0);
  }
  return tot / tw;
}

export function weekDelta(board: Board): number | null {
  const h = board.history;
  if (h.length < 2) return null;
  return +(board.score - h[h.length - 2]).toFixed(1);
}

export function signed(n: number, digits = 1): string {
  const mag = Math.abs(n).toFixed(digits);
  if (n > 0) return `+${mag}`;
  if (n < 0) return `−${mag}`;
  return mag;
}

export type RowKind = "live" | "dropped";

export type LedgerRow = {
  id: string;
  name: string;
  area: AreaId;
  kind: RowKind;
  w: number;
  score: number | null;
  note: string;
  contrib: number | null;
  auto?: boolean;
};

export function ledgerRows(board: Board): LedgerRow[] {
  const live: LedgerRow[] = board.legs.map((l: Leg) => ({
    id: l.id,
    name: l.name,
    area: areaOf(l.id),
    kind: "live",
    w: l.w,
    score: l.score,
    note: l.note,
    contrib: l.contrib,
    auto: l.auto,
  }));
  const dropped: LedgerRow[] = board.dropped.map((d) => ({
    id: d.id,
    name: d.name,
    area: areaOf(d.id),
    kind: "dropped",
    w: d.w,
    score: null,
    note: d.note,
    contrib: null,
  }));
  return [...live, ...dropped].sort((a, b) => b.w - a.w);
}
