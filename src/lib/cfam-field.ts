/** Cushing field tape. Meme legs, not alpha. No personal names. */

import type { FieldTape, Pinch } from "./cfam-engine";

export const KUSH_FEED = "https://www.1600kush.com/feed/";
export const KUSH_STREAM = "https://crystalout.surfernetwork.com:8001/KUSH_MP3";
export const ADSB_URL =
  "https://api.adsb.lol/v2/lat/35.982/lon/-96.767/dist/40";
export const CITY_AGENDA =
  "https://public.destinyhosted.com/agenda_publish.cfm?id=28744";
export const AQI_URL =
  "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=35.982&longitude=-96.767&current=us_aqi,pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,ozone&timezone=America/Chicago";
export const SPP_URL =
  "https://portal.spp.org/file-browser-api/download/rtbm-lmp-by-bus?path=%2FRTBM-LMP-B-latestInterval.csv";

const BUSY =
  /\b(tank farm|tank|truck|pipeline|oil|pump|flare|industrial|refinery|storage|booster|enbridge|plains|enterprise|keystone|railcar|hiring|overtime|construction|water pressure|noise complaint|idling)\b/i;
const HUSTLE =
  /\b(hustle|grind|overtime|workin'?|working man|diesel|trucker|oilfield|oil field|rig |payday|night shift|blue collar|hard hat|18[- ]wheeler|pumpjack)\b/i;
const GOSPEL = /\b(jesus|gospel|praise|worship|holy|amen|church|inspirational)\b/i;
const CUSHING = /\bcushing\b/i;

export type Headline = { title: string; date: string };
export type CadHit = { type: string; where: string; when: string };

export type FieldResult = {
  pinches: Record<string, { score: number; note: string }>;
  tape: FieldTape;
};

/** Seed industrial tape from the meme pipeline. Types only, no names. */
export const SEED_CAD: CadHit[] = [
  {
    type: "NOISE COMPLAINT",
    where: "Highway 33 / Tank Farm Rd",
    when: "2026-09-08",
  },
  {
    type: "INDUSTRIAL DISTURBANCE",
    where: "N Cushing Rd",
    when: "2026-09-09",
  },
];

export const SEED_MUNI =
  "BOARD OF PUBLIC UTILITIES — SPECIAL SESSION MINUTES Date: August 14, 2026 Item 4.2: Industrial Water Line Pressure Fluctuations Director of Public Works noted a 14% drop in static pressure across the southern industrial feeder grid during peak mid-week pumping cycles. Enbridge and Enterprise representatives confirmed synchronization of high-capacity mainline booster pumps. Municipal supply threshold is operating near yellow-alert capacity.";

export function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

export function daysAgo(iso: string, now = Date.now()): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 999;
  return (now - t) / 86400000;
}

export function scoreRadio(title: string | null): { score: number; note: string; hustle: boolean } {
  const t = (title ?? "").trim();
  if (!t) return { score: 20, note: "지금곡 없음", hustle: false };
  if (HUSTLE.test(t)) return { score: 88, note: t.slice(0, 72), hustle: true };
  if (GOSPEL.test(t)) return { score: 14, note: t.slice(0, 72), hustle: false };
  return { score: 24, note: t.slice(0, 72), hustle: false };
}

export function scoreNews(items: Headline[], now = Date.now()): { score: number; note: string; n7: number; busy: number } {
  const week = items.filter((h) => daysAgo(h.date, now) <= 7);
  const busy = week.filter((h) => BUSY.test(h.title)).length;
  const cush = week.filter((h) => CUSHING.test(h.title)).length;
  const score = clamp(8 + busy * 22 + Math.min(cush, 6) * 6 + Math.min(week.length, 8) * 3);
  return {
    score,
    note: `KUSH 7일 ${week.length}건 · 산업 ${busy}`,
    n7: week.length,
    busy,
  };
}

export type AdsbAc = {
  dst?: number;
  alt_baro?: number | string;
  flight?: string;
  t?: string;
};

export function scoreAdsb(ac: AdsbAc[]): { score: number; note: string; n: number; low: number; closest: number | null } {
  const alt = (a: AdsbAc) =>
    typeof a.alt_baro === "number" ? a.alt_baro : a.alt_baro === "ground" ? 0 : 99999;
  const low = ac.filter((a) => (a.dst ?? 99) <= 8 && alt(a) < 3500);
  const near = ac.filter((a) => (a.dst ?? 99) <= 15 && alt(a) < 8000);
  const dists = ac.map((a) => a.dst).filter((d): d is number => typeof d === "number");
  const closest = dists.length ? Math.min(...dists) : null;
  const score = clamp(12 + low.length * 32 + near.length * 10);
  return {
    score,
    note: `저고도 ${low.length} · 근거리 ${near.length}${closest != null ? ` · 최근 ${closest.toFixed(1)}nm` : ""}`,
    n: ac.length,
    low: low.length,
    closest,
  };
}

export function scoreCad(hits: CadHit[], now = Date.now()): { score: number; note: string; types: string[] } {
  const week = hits.filter((h) => daysAgo(h.when, now) <= 7 && BUSY.test(`${h.type} ${h.where}`));
  const score = clamp(15 + week.length * 32);
  return {
    score,
    note: week.length ? `산업 ${week.length}건 · ${week.map((h) => h.type).join(" · ")}` : "7일 산업 키워드 0",
    types: week.map((h) => `${h.type} · ${h.where}`),
  };
}

export function scoreAqi(
  aqi: number | null,
  pm25: number | null,
): { score: number; note: string } {
  if (aqi == null) return { score: 20, note: "AQI 없음" };
  const pm = pm25 != null ? ` · PM2.5 ${pm25.toFixed(1)}µg` : "";
  return {
    score: clamp(aqi),
    note: `CAMS AQI ${Math.round(aqi)}${pm} · 시내 측정소 아님`,
  };
}

export type SppRow = {
  pnode: string;
  lmp: number;
  mec: number;
  mcc: number;
  mlc: number;
};

export function isCushingPnode(p: string): boolean {
  const u = p.toUpperCase();
  if (u.includes("CUSH")) return true;
  if (u.includes("PAYNE")) return true;
  if (u.includes("STILLWATER")) return true;
  if (u.includes("STROUD")) return true;
  if (u.includes("OKGETIGER")) return true;
  if (u.startsWith("CSWS") && u.includes("YALE")) return true;
  return false;
}

export function parseSppCsv(text: string): SppRow[] {
  const lines = text.split(/\r?\n/);
  if (!lines.length) return [];
  const head = lines[0].split(",").map((s) => s.trim());
  const idx = (name: string) =>
    head.findIndex((h) => h.toUpperCase() === name.toUpperCase());
  const iP = idx("Pnode");
  const iL = idx("LMP");
  const iE = idx("MEC");
  const iC = idx("MCC");
  const iM = idx("MLC");
  if ([iP, iL, iE, iC, iM].some((i) => i < 0)) return [];
  const out: SppRow[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const c = line.split(",");
    const pnode = (c[iP] ?? "").trim();
    const lmp = Number(c[iL]);
    const mec = Number(c[iE]);
    const mcc = Number(c[iC]);
    const mlc = Number(c[iM]);
    if (!pnode || ![lmp, mec, mcc, mlc].every(Number.isFinite)) continue;
    out.push({ pnode, lmp, mec, mcc, mlc });
  }
  return out;
}

export function scoreSpp(rows: SppRow[]): {
  score: number;
  note: string;
  n: number;
  mcc: number | null;
} {
  const good = rows.filter(
    (r) => Math.abs(r.lmp - (r.mec + r.mcc + r.mlc)) <= 0.05,
  );
  const cush = good.filter((r) => isCushingPnode(r.pnode));
  if (!cush.length) return { score: 20, note: "CUSH PNode 없음", n: 0, mcc: null };
  const allAbs = good.map((r) => Math.abs(r.mcc));
  const cushAbs = cush.map((r) => Math.abs(r.mcc)).sort((a, b) => a - b);
  const med = cushAbs[Math.floor(cushAbs.length / 2)] ?? 0;
  const pct = allAbs.length
    ? (100 * allAbs.filter((x) => x <= med).length) / allAbs.length
    : 0;
  const absS = clamp((med / 15) * 100);
  return {
    score: clamp(0.6 * pct + 0.4 * absS),
    note: `CUSH ${cush.length}노드 · |MCC| ${med.toFixed(2)} · vs SPP p${pct.toFixed(0)}`,
    n: cush.length,
    mcc: med,
  };
}

export function scoreMuni(text: string): { score: number; note: string } {
  const hits = (text.match(BUSY) ? text.toLowerCase().match(/\b(tank|truck|pipeline|oil|pump|flare|industrial|booster|enbridge|enterprise|pressure|yellow-alert)\b/g) : []) ?? [];
  const uniq = [...new Set(hits)];
  const score = clamp(28 + uniq.length * 8);
  const pressure = text.match(/(\d+)\s*%\s*drop/i);
  const note = pressure
    ? `수압 ${pressure[1]}% 하락 · 키워드 ${uniq.length}`
    : uniq.length
      ? `시청 산업 키워드 ${uniq.length}`
      : "시청 패킷 산업어 없음";
  return { score, note };
}

export function overlayPinches(base: Pinch[], field: FieldResult): Pinch[] {
  return base.map((p) => {
    const hit = field.pinches[p.id];
    if (!hit) return { ...p };
    return { ...p, score: hit.score, note: hit.note };
  });
}

export function emptyTape(): FieldTape {
  return {
    radioTitle: "",
    radioHustle: false,
    headlines: [],
    adsbN: 0,
    adsbLow: 0,
    adsbClosestNm: null,
    cadTypes: [],
    muniNote: "",
    aqi: null,
    pm25: null,
    aqiNote: "",
    sppN: 0,
    sppMcc: null,
    sppNote: "",
  };
}

export async function pullText(url: string, ms = 12000): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "cfam-meme/1.0 (research board)" },
    signal: AbortSignal.timeout(ms),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.text();
}

export function parseRss(xml: string): Headline[] {
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  const out: Headline[] = [];
  for (const b of blocks) {
    const title = (b.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] ?? "")
      .replace(/&#038;|&/g, "&")
      .replace(/<[^>]+>/g, "")
      .trim();
    const date = b.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() ?? "";
    if (title) out.push({ title, date });
  }
  return out;
}

export async function readIcyTitle(): Promise<string | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 7000);
  try {
    const res = await fetch(KUSH_STREAM, {
      headers: {
        "Icy-MetaData": "1",
        "User-Agent": "cfam-meme/1.0",
      },
      signal: ac.signal,
    });
    const metaint = Number(res.headers.get("icy-metaint") || 0);
    if (!res.body || !metaint) return res.headers.get("icy-name");
    const reader = res.body.getReader();
    const need = metaint + 1 + 4096;
    const chunks: Uint8Array[] = [];
    let n = 0;
    while (n < need) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      n += value.length;
    }
    await reader.cancel().catch(() => undefined);
    const buf = new Uint8Array(n);
    let off = 0;
    for (const c of chunks) {
      buf.set(c, off);
      off += c.length;
    }
    if (buf.length <= metaint) return null;
    const metaLen = buf[metaint] * 16;
    const meta = new TextDecoder("latin1").decode(buf.slice(metaint + 1, metaint + 1 + metaLen));
    return meta.match(/StreamTitle='([^']*)'/)?.[1] ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function collectField(): Promise<FieldResult> {
  const newsJob = pullText(KUSH_FEED)
    .then(parseRss)
    .catch(() => [] as Headline[]);
  const icyJob = readIcyTitle();
  const adsbJob = (async () => {
    for (let i = 0; i < 2; i++) {
      try {
        const res = await fetch(ADSB_URL, {
          headers: { "User-Agent": "Mozilla/5.0 cfam-meme/1.0" },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) continue;
        const j = (await res.json()) as { ac?: AdsbAc[]; aircraft?: AdsbAc[] };
        const list = j.ac ?? j.aircraft ?? [];
        if (list.length || i === 1) return list;
      } catch {
        if (i === 1) return [] as AdsbAc[];
      }
    }
    return [] as AdsbAc[];
  })();
  const agendaJob = pullText(CITY_AGENDA, 8000).catch(() => "");
  const aqiJob = fetch(AQI_URL, {
    headers: { "User-Agent": "cfam-meme/1.0" },
    signal: AbortSignal.timeout(10000),
  })
    .then((r) => r.json() as Promise<{ current?: { us_aqi?: number; pm2_5?: number } }>)
    .then((j) => ({
      aqi: j.current?.us_aqi ?? null,
      pm25: j.current?.pm2_5 ?? null,
    }))
    .catch(() => ({ aqi: null as number | null, pm25: null as number | null }));
  const sppJob = pullText(SPP_URL, 20000)
    .then(parseSppCsv)
    .catch(() => [] as SppRow[]);

  const [headlines, title, ac, agenda, air, sppRows] = await Promise.all([
    newsJob,
    icyJob,
    adsbJob,
    agendaJob,
    aqiJob,
    sppJob,
  ]);

  const z = scoreNews(headlines);
  const radio = scoreRadio(title);
  const adsb = scoreAdsb(ac);
  const cad = scoreCad(SEED_CAD);
  const muniText = `${SEED_MUNI}\n${agenda}`;
  const muni = scoreMuni(muniText);
  const airScore = scoreAqi(air.aqi, air.pm25);
  const spp = scoreSpp(sppRows);

  const pinches: FieldResult["pinches"] = {
    Z: { score: z.score, note: z.note },
    RADIO: { score: radio.score, note: radio.note },
    ADSB: { score: adsb.score, note: adsb.note },
    CAD: { score: cad.score, note: cad.note },
    M: { score: muni.score, note: muni.note },
    W: { score: airScore.score, note: airScore.note },
  };
  if (spp.n) pinches.SPP = { score: spp.score, note: spp.note };

  return {
    pinches,
    tape: {
      radioTitle: radio.note,
      radioHustle: radio.hustle,
      headlines: headlines.slice(0, 6),
      adsbN: adsb.n,
      adsbLow: adsb.low,
      adsbClosestNm: adsb.closest,
      cadTypes: cad.types,
      muniNote: muni.note,
      aqi: air.aqi,
      pm25: air.pm25,
      aqiNote: airScore.note,
      sppN: spp.n,
      sppMcc: spp.mcc,
      sppNote: spp.note,
    },
  };
}
