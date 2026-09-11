import { createServerFn } from "@tanstack/react-start";
import {
  combine,
  EIA_LEAF,
  eiaFromHtml,
  eiaWeekly,
  FALLBACK_AUTO,
  PINCH,
  WIKI_PAGE,
  wikiFromItems,
  wikiWeekly,
  type Board,
  type Leg,
} from "./cfam-engine";
import { explainWeights } from "./cfam-ml";
import { collectField, overlayPinches, emptyTape } from "./cfam-field";

const TTL_MS = 5 * 60 * 1000; // field tape + AQI + SPP cache
let cache: { at: number; board: Board } | null = null;

async function pull(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "cfam-meme/1.0 (research board)" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.text();
}

async function wikiPayload(): Promise<{
  items?: { timestamp: string; views: number }[];
}> {
  const end = new Date();
  const start = new Date(end.getTime() - 180 * 86400000);
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const url =
    "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/" +
    encodeURIComponent(WIKI_PAGE) +
    `/daily/${fmt(start)}/${fmt(end)}`;
  return JSON.parse(await pull(url)) as {
    items?: { timestamp: string; views: number }[];
  };
}

export const getCfamBoard = createServerFn({ method: "GET" }).handler(
  async (): Promise<Board> => {
    if (cache && Date.now() - cache.at < TTL_MS) return cache.board;
    const auto: Leg[] = [];
    let wikiXs: number[] = [];
    let eiaMove: number[] = [];
    let eiaTight: number[] = [];

    const wikiJob = wikiPayload()
      .then((json) => {
        const items = json.items ?? [];
        const w = wikiFromItems(items);
        return { leg: w, xs: wikiWeekly(items) };
      })
      .catch(() => ({ leg: FALLBACK_AUTO[0], xs: [] as number[] }));

    const eiaJob = pull(EIA_LEAF)
      .then((html) => {
        const wk = eiaWeekly(html);
        return { legs: eiaFromHtml(html), move: wk.move, tight: wk.tight };
      })
      .catch(() => ({
        legs: [FALLBACK_AUTO[1], FALLBACK_AUTO[2]],
        move: [] as number[],
        tight: [] as number[],
      }));

    const fieldJob = collectField().catch(() => null);

    const [wikiOut, eiaOut, field] = await Promise.all([wikiJob, eiaJob, fieldJob]);
    if (wikiOut.leg) auto.push(wikiOut.leg);
    wikiXs = wikiOut.xs;
    auto.push(...eiaOut.legs);
    eiaMove = eiaOut.move;
    eiaTight = eiaOut.tight;

    if (auto.length < 3) {
      for (const f of FALLBACK_AUTO) {
        if (!auto.some((a) => a.id === f.id)) auto.push(f);
      }
    }
    const pinches = field ? overlayPinches(PINCH, field) : PINCH.map((p) => ({ ...p }));
    const liveP = pinches.filter((p) => p.score != null);
    const rest = Math.max(0, 1 - liveP.reduce((s, p) => s + p.w, 0));
    const wikiScore = auto.find((a) => a.id === "wiki")?.score ?? FALLBACK_AUTO[0].score;
    if (wikiXs.length < 4 && eiaMove.length >= 4) {
      wikiXs = eiaMove.map(() => wikiScore);
    }
    const cols = [
      { id: "wiki", name: "WIKI 조회", xs: wikiXs },
      { id: "eia_move", name: "EIA |Δ|", xs: eiaMove.slice(-80) },
      { id: "eia_tight", name: "EIA 타이트", xs: eiaTight.slice(-80) },
    ].filter((c) => auto.some((a) => a.id === c.id));
    const explain = explainWeights(cols, rest);
    const board = combine(auto, pinches, explain);
    const n = Math.min(12, wikiXs.length, eiaMove.length, eiaTight.length);
    const history: number[] = [];
    if (n >= 4) {
      const w = wikiXs.slice(-n);
      const m = eiaMove.slice(-n);
      const t = eiaTight.slice(-n);
      for (let i = 0; i < n; i++) {
        const snap = combine(
          [
            { ...FALLBACK_AUTO[0], score: w[i] },
            { ...FALLBACK_AUTO[1], score: m[i] },
            { ...FALLBACK_AUTO[2], score: t[i] },
          ],
          pinches,
          explain,
        );
        history.push(snap.score);
      }
    }
    const out: Board = {
      ...board,
      history,
      tape: field?.tape ?? emptyTape(),
    };
    cache = { at: Date.now(), board: out };
    return out;
  },
);
