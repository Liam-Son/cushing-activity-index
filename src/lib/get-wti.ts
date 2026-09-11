import { createServerFn } from "@tanstack/react-start";

export type WtiPoint = { t: number; c: number };

export type WtiSeries = {
  last: number | null;
  prev: number | null;
  points: WtiPoint[];
  note: string;
};

const TTL = 5 * 60 * 1000;
let cache: { at: number; data: WtiSeries } | null = null;

export const getWti = createServerFn({ method: "GET" }).handler(
  async (): Promise<WtiSeries> => {
    if (cache && Date.now() - cache.at < TTL) return cache.data;
    try {
      const url =
        "https://query1.finance.yahoo.com/v8/finance/chart/CL=F?interval=1wk&range=1y";
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; CAI-research/1.0; +https://github.com/Noah-TaeHwan/ls-crude)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as {
        chart?: {
          result?: {
            timestamp?: number[];
            indicators?: { quote?: { close?: (number | null)[] }[] };
          }[];
        };
      };
      const r = json.chart?.result?.[0];
      const ts = r?.timestamp ?? [];
      const cl = r?.indicators?.quote?.[0]?.close ?? [];
      const points: WtiPoint[] = [];
      for (let i = 0; i < ts.length; i++) {
        const c = cl[i];
        if (c != null && Number.isFinite(c)) points.push({ t: ts[i] * 1000, c });
      }
      const last = points.at(-1)?.c ?? null;
      const prev = points.at(-2)?.c ?? null;
      const data: WtiSeries = {
        last,
        prev,
        points: points.slice(-52),
        note: "CL=F 주간 종가 · Yahoo",
      };
      cache = { at: Date.now(), data };
      return data;
    } catch {
      const data: WtiSeries = {
        last: null,
        prev: null,
        points: [],
        note: "WTI 미연결",
      };
      return data;
    }
  },
);
