import { createFileRoute } from "@tanstack/react-router";
import * as Tabs from "@radix-ui/react-tabs";
import { ChevronDown, ArrowRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CaiGauge } from "@/components/cai-gauge";
import { CaiSpark } from "@/components/cai-spark";
import { FieldTape } from "@/components/field-tape";
import { MlWeightChart } from "@/components/ml-weight-chart";
import { WtiChart } from "@/components/wti-chart";
import { fallbackBoard, type Board } from "@/lib/cfam-engine";
import { getCfamBoard } from "@/lib/get-cfam-board";
import { getWti, type WtiSeries } from "@/lib/get-wti";
import {
  areaOf,
  koStamp,
  ledgerRows,
  scoreByKey,
  signed,
  weekDelta,
  type AreaId,
} from "@/lib/cai-view";
import { cn } from "@/lib/cn";

type TabId = "dashboard" | "research" | "history";
type HistFilter = "all" | "research" | "design";
type DataFilter = "전체" | "적용" | "미적용";

const EMPTY_WTI: WtiSeries = { last: null, prev: null, points: [], note: "WTI 미연결" };

export const Route = createFileRoute("/")({
  component: Home,
  loader: async () => {
    try {
      const [board, wti] = await Promise.all([getCfamBoard(), getWti()]);
      return { board, wti };
    } catch {
      return { board: fallbackBoard(), wti: EMPTY_WTI };
    }
  },
});

function Home() {
  const initial = Route.useLoaderData();
  const [board, setBoard] = useState<Board>(initial.board ?? fallbackBoard());
  const [wti, setWti] = useState<WtiSeries>(initial.wti ?? EMPTY_WTI);
  const [tab, setTab] = useState<TabId>("dashboard");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const h = window.location.hash.replace("#", "") as TabId | "";
    if (h === "research" || h === "history" || h === "dashboard") setTab(h);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      Promise.all([getCfamBoard(), getWti()])
        .then(([b, w]) => {
          setBoard(b);
          setWti(w);
          setErr(null);
        })
        .catch((e: unknown) => setErr(e instanceof Error ? e.message : "refresh failed"));
    }, 300000);
    return () => clearInterval(id);
  }, []);

  function go(next: TabId, anchor?: string) {
    setTab(next);
    window.history.replaceState(null, "", `#${anchor ?? next}`);
    if (anchor) {
      window.setTimeout(() => {
        document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  const stamp = koStamp(board.tsUtc);
  const ruleScore = scoreByKey(board, "ruleW");
  const delta = weekDelta(board);

  return (
    <div className="min-h-screen bg-bg text-ink">
      <a
        href="#workspace"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2.5 focus:left-4 focus:z-20 focus:rounded-md focus:border focus:border-teal focus:bg-surface focus:px-3.5 focus:py-2.5"
      >
        본문으로 이동
      </a>
      <header className="h-16 border-b border-line bg-surface">
        <div className="shell flex h-full items-center justify-between gap-4">
          <button
            type="button"
            className="flex items-center gap-2.5"
            onClick={() => go("dashboard")}
            aria-label="LS CRUDE 대시보드"
          >
            <span className="grid size-7 place-items-center rounded-md bg-ink text-xs font-extrabold tracking-tight text-surface">
              LS
            </span>
            <span className="text-sm font-extrabold tracking-[0.12em]">CRUDE</span>
            <span className="hidden h-5 border-l border-line sm:block" />
            <span className="hidden text-[10px] tracking-[0.12em] text-muted sm:inline">
              RESEARCH PORTFOLIO
            </span>
          </button>
          <span className="inline-flex items-center gap-1.5 rounded border border-paper-line bg-paper px-2 py-1 text-[10px] text-warn">
            <span className="size-1.5 rounded-full bg-warn" aria-hidden />
            v1 · 실측 엔진 · 예측 미학습
          </span>
        </div>
      </header>

      <main className="shell pb-10" id="workspace">
        <div className="flex items-start justify-between gap-5 py-7">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">쿠싱 액티비티 인덱스</h1>
            <p className="mt-1.5 text-sm text-muted">
              공개 관측으로 만든 쿠싱 활동 점수. 유가 예측이 아닙니다.
            </p>
          </div>
        </div>

        <Tabs.Root value={tab} onValueChange={(v) => go(v as TabId)}>
          <Tabs.List aria-label="CAI 탐색" className="mb-6 flex gap-7 border-b border-line">
            <TabTrigger value="dashboard">대시보드</TabTrigger>
            <TabTrigger value="research">연구·검증</TabTrigger>
            <TabTrigger value="history">히스토리</TabTrigger>
          </Tabs.List>

          <Tabs.Content value="dashboard" className="outline-none">
            <Dashboard
              board={board}
              wti={wti}
              stamp={stamp}
              delta={delta}
              onResearch={(id) => go("research", id)}
            />
          </Tabs.Content>
          <Tabs.Content value="research" className="outline-none">
            <Research board={board} ruleScore={ruleScore} />
          </Tabs.Content>
          <Tabs.Content value="history" className="outline-none">
            <HistoryTab />
          </Tabs.Content>
        </Tabs.Root>

        <footer className="mt-6 flex flex-wrap justify-between gap-4 py-6 text-[10px] text-muted">
          <span>
            <strong className="font-semibold text-teal">LS CRUDE</strong>
            {" / Research Portfolio · CAI v1"}
          </span>
          <span>
            {stamp.isoDate} · {board.note}
            {err ? ` · ${err}` : ""}
            {" · 투자 판단용 아님"}
          </span>
          <a href="/cfam.html" download="cfam.html" className="text-teal underline-offset-2 hover:underline">
            엔진 한 파일
          </a>
        </footer>
      </main>
    </div>
  );
}

function TabTrigger({ value, children }: { value: TabId; children: string }) {
  return (
    <Tabs.Trigger
      value={value}
      className="tab-underline min-h-12 border-b-2 border-transparent px-0.5 py-3 text-sm font-medium text-tab hover:text-ink"
    >
      {children}
    </Tabs.Trigger>
  );
}

function FoldHint() {
  return (
    <span className="flex items-center gap-1.5 text-[10px] font-normal opacity-70">
      <span className="when-closed">펼치기</span>
      <span className="when-open">접기</span>
      <ChevronDown className="chev-ico size-4 shrink-0 transition-transform duration-200" />
    </span>
  );
}

function Dashboard({
  board,
  wti,
  stamp,
  delta,
  onResearch,
}: {
  board: Board;
  wti: WtiSeries;
  stamp: { date: string; week: string; isoDate: string };
  delta: number | null;
  onResearch: (id: string) => void;
}) {
  const [period, setPeriod] = useState<4 | 12 | 52>(12);
  const points = wti.points.slice(-period);
  const last = wti.last;
  const prev = points.length >= 2 ? points[points.length - 2].c : wti.prev;
  const chg = last != null && prev != null ? last - prev : null;
  const chgPct = chg != null && prev ? (chg / prev) * 100 : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section
          className="flex min-w-0 flex-col rounded-xl border border-dark bg-dark p-6 text-on-dark"
          aria-labelledby="cai-heading"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="cai-heading" className="text-base font-bold tracking-tight">
              쿠싱 액티비티 인덱스
            </h2>
            <span className="font-mono text-[10px] text-on-dark-muted">적용 가중 · 관측</span>
            <a
              href="/cushing-activity-index-v1.zip"
              download="cushing-activity-index-v1.zip"
              className="rounded border border-mint/40 px-2 py-1 font-mono text-[10px] text-mint"
            >
              소스 zip
            </a>
          </div>
          <CaiGauge score={board.score} />
          <div className="mb-5 flex items-center justify-between gap-4 text-[10px] text-on-dark-muted">
            <span>핀치 고정 + 나머지 ridge·MLP</span>
            <span>
              {delta != null ? (
                <>
                  <strong className="mr-1 font-mono text-sm font-medium text-mint">{signed(delta)}점</strong>
                  이전 재구성주 대비
                </>
              ) : (
                "주간 대비 표본 부족"
              )}
            </span>
          </div>
          <div>
            <div className="mb-1 text-[10px] text-on-dark-muted">CAI · 최근 주 재구성</div>
            <CaiSpark values={board.history} />
          </div>
          <div className="mt-2 flex flex-wrap gap-5 text-[10px] text-on-dark-muted">
            <span>
              산출 시각 <b className="font-medium text-on-dark">{stamp.isoDate} · {stamp.week}</b>
            </span>
            <span className="border-l border-on-dark/15 pl-5">
              적용 다리 <b className="font-medium text-on-dark">{board.legs.length}개</b>
            </span>
            <span className="border-l border-on-dark/15 pl-5">
              미적용 <b className="font-medium text-on-dark">{board.dropped.length}개</b>
            </span>
          </div>
          <details className="mt-auto border-t border-on-dark/15 pt-1">
            <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-xs text-on-dark">
              <span>CAI란?</span>
              <FoldHint />
            </summary>
            <div className="space-y-3 pb-3 text-xs leading-relaxed text-on-dark-muted">
              <p>
                <strong className="font-semibold text-on-dark">CAI는 쿠싱 활동 신호를 0–100점으로 합성한 지수입니다.</strong>{" "}
                점수는 활동 수준이며 유가 상승 확률이 아닙니다. 공포·탐욕 척도도 아닙니다.
              </p>
              <p>
                지금 점수는 가상 10신호가 아닙니다. 적용 다리는 Wikimedia 조회, EIA Cushing 재고 |Δ|·타이트,
                091-U 산업공고, 091-A 숙박세, 091-M 시청, 091-Z KUSH 뉴스, 091-W AQI, 091-SPP 전력, 091-ADSB, 091-CAD, 091-RADIO입니다.
                없는 핀치는 0점이 아니라 빼고 나머지 몫을 재배분합니다.
              </p>
              <h3 className="pt-2 text-sm font-medium text-on-dark">어떤 활동을 관측하나요?</h3>
              <ul className="divide-y divide-on-dark/10">
                {board.legs.map((l) => (
                  <li key={l.id} className="flex min-h-12 items-center justify-between gap-3">
                    <span className="text-on-dark">{l.name}</span>
                    <span className="font-mono text-[11px] text-on-dark-muted">
                      {(l.w * 100).toFixed(1)}% · {Math.round(l.score)}점
                    </span>
                  </li>
                ))}
              </ul>
              <p>
                미적용: {board.dropped.map((d) => d.name).join(", ") || "없음"}. 예약 가중은 살아 있고, 점수가 생기면 다시 들어갑니다.
              </p>
              <p>
                나머지 약 80%는 변동 다리의 z평균을 잠재 바쁨으로 두고 ridge |β|와 얕은 MLP 순열중요도의 평균으로 나눕니다.
                핀치 U/A/M/Z/ADSB/CAD/RADIO는 밈 가중을 유지합니다. 유가 방향 학습이 아닙니다.
              </p>
              <button
                type="button"
                className="inline-flex min-h-10 items-center gap-2 font-semibold text-mint"
                onClick={() => onResearch("research-data")}
              >
                원천 데이터 · 확보 상태
                <ArrowRight className="size-4" />
              </button>
              <p className="border-t border-on-dark/15 pt-3 text-[10px] leading-relaxed">
                게이지 5색은 동일 폭 UI 구간입니다. 통계 등급·매매 신호가 아닙니다. 결측은 0이 아닙니다.
              </p>
            </div>
          </details>
        </section>

        <section
          className="flex min-h-full min-w-0 flex-col rounded-xl border border-line bg-surface p-6"
          aria-labelledby="forecast-heading"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="forecast-heading" className="text-base font-bold tracking-tight">
              다음 기간 WTI 방향
            </h2>
            <span className="rounded border border-line bg-bg px-1.5 py-0.5 text-[10px] text-muted">미학습</span>
          </div>
          <div className="flex flex-1 flex-col py-8">
            <strong className="text-2xl tracking-tight">아직 예측하지 않습니다.</strong>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              G3에서 타깃·분할을 동결하기 전에는 WTI 5거래일 방향을 학습 목표로 쓰지 않습니다. 학습 계수는 비공개가 아니라
              미학습입니다.
            </p>
            <div className="mt-6 h-2 rounded-full bg-line" aria-hidden />
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2">
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-teal"
              onClick={() => onResearch("research-validation")}
            >
              검증 상태 보기
              <ArrowRight className="size-4" />
            </button>
            <span className="text-[10px] text-muted">가상 상승확률 없음</span>
          </div>
        </section>
      </div>

      {board.tape ? <FieldTape tape={board.tape} /> : null}

      <section className="rounded-xl border border-line bg-surface p-6" aria-labelledby="market-heading">
        <div className="flex items-center justify-between gap-3">
          <h2 id="market-heading" className="text-base font-bold tracking-tight">
            WTI 가격 흐름
          </h2>
          <div className="flex gap-0.5 rounded-md bg-bg p-0.5" role="group" aria-label="WTI 차트 기간">
            {([4, 12, 52] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={period === p}
                onClick={() => setPeriod(p)}
                className={cn(
                  "min-h-8 rounded px-2.5 text-[10px] text-muted",
                  period === p && "bg-surface font-semibold text-ink shadow-sm",
                )}
              >
                {p === 52 ? "1년" : `${p}주`}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-baseline gap-3">
          <span className="font-mono text-3xl font-medium tracking-tight">
            {last != null ? `$${last.toFixed(2)}` : "—"}
          </span>
          <span className="text-[11px] text-teal">
            {chg != null && chgPct != null
              ? `${signed(chg, 2)} (${signed(chgPct, 1)}%) · 전주 대비`
              : "전주 대비 —"}
          </span>
        </div>
        <p className="text-[10px] text-muted">USD / 배럴 · {wti.note}</p>
        <div className="pt-2">
          <WtiChart points={points} />
        </div>
        <details className="mt-2 border-t border-line">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-xs text-muted">
            <span>가격 기준 · 출처</span>
            <FoldHint />
          </summary>
          <div className="space-y-2 pb-3 text-xs leading-relaxed text-muted">
            <p>
              가격은 Yahoo Finance <span className="font-mono">CL=F</span> 주간 종가입니다. 값이 없으면 — 로 두고 가상
              시계열을 넣지 않습니다.
            </p>
            <p>다음 5거래일 타깃은 아직 만들지 않습니다. 달력에 7일을 더해 평가일로 쓰지 않습니다.</p>
          </div>
        </details>
      </section>

      <div className="flex flex-wrap items-center gap-6 rounded-[11px] border border-line bg-surface px-6 py-4">
        <span className="text-[11px] text-muted">연구 상태</span>
        <div className="min-w-0 flex-1">
          <strong className="text-sm font-semibold">관측 지수 연결 · WTI 방향은 미학습</strong>
          <p className="mt-0.5 text-[10px] text-muted">
            091 장부의 적용 다리를 이 화면에 올렸습니다. 가상 10신호는 점수에 들어가지 않습니다.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-2 text-[11px] font-semibold text-teal"
          onClick={() => onResearch("research-data")}
        >
          연구·검증
          <ArrowRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

function Research({ board, ruleScore }: { board: Board; ruleScore: number }) {
  const [filter, setFilter] = useState<DataFilter>("전체");
  const rows = useMemo(() => {
    const all = ledgerRows(board);
    if (filter === "적용") return all.filter((r) => r.kind === "live");
    if (filter === "미적용") return all.filter((r) => r.kind === "dropped");
    return all;
  }, [board, filter]);

  const areas = useMemo(() => {
    const map = new Map<AreaId, number>();
    for (const l of board.legs) {
      const a = areaOf(l.id);
      map.set(a, (map.get(a) ?? 0) + 1);
    }
    return [...map.entries()];
  }, [board]);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-5">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">숫자보다, 검증 가능한 과정.</h2>
          <p className="mt-1.5 text-xs text-muted">무엇을 관측하고, 어떻게 합치고, 무엇과 비교할지 공개합니다.</p>
        </div>
        <span className="hidden font-mono text-[11px] text-muted sm:block">RESEARCH / v1</span>
      </div>

      <div className="mb-5 grid gap-4 rounded-xl border border-stage-line bg-stage px-6 py-5 sm:grid-cols-3">
        <div>
          <span className="font-mono text-[10px] tracking-wide text-teal">01 / DATA</span>
          <h3 className="mt-1.5 text-sm font-medium">원자료 연결</h3>
          <p className="mt-1 text-[11px] text-muted">Wiki · EIA · KUSH · ADS-B 실측 / 핀치 일부 고정</p>
        </div>
        <div className="sm:border-l sm:border-stage-line sm:pl-6">
          <span className="font-mono text-[10px] tracking-wide text-teal">02 / INDEX</span>
          <h3 className="mt-1.5 text-sm font-medium">지수 계산</h3>
          <p className="mt-1 text-[11px] text-muted">적용 가중 {board.score.toFixed(1)}점</p>
        </div>
        <div className="sm:border-l sm:border-stage-line sm:pl-6">
          <span className="font-mono text-[10px] tracking-wide text-teal">03 / MODEL</span>
          <h3 className="mt-1.5 text-sm font-medium">학습·검증</h3>
          <p className="mt-1 text-[11px] text-muted">WTI 방향 미학습</p>
        </div>
      </div>

      <section className="mb-5 rounded-[14px] border border-line bg-surface p-6" id="research-validation">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base tracking-tight">CAI를 넣으면 더 나아지는가?</h3>
            <p className="mt-1 text-[11px] text-muted">활동 점수 비교는 가능 · WTI 성과는 아직 없음</p>
          </div>
          <span className="rounded bg-paper px-2 py-1 text-[10px] text-warn">실측 성능 없음</span>
        </div>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="모델 비교">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-bg text-[10px] font-medium text-muted">
                <th className="px-3 py-2.5">구성</th>
                <th className="px-3 py-2.5">CAI</th>
                <th className="px-3 py-2.5">방향 정확도</th>
                <th className="px-3 py-2.5">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr>
                <td className="px-3 py-3.5">
                  규칙 나머지 1/n
                  <small className="mt-1 block text-[10px] text-muted">핀치 예약 + 자동 다리 균등</small>
                </td>
                <td className="px-3 py-3.5 font-mono">{ruleScore.toFixed(1)}</td>
                <td className="px-3 py-3.5 font-mono text-muted">—</td>
                <td className="px-3 py-3.5 text-[10px] text-muted">관측</td>
              </tr>
              <tr className="text-teal">
                <td className="px-3 py-3.5 font-semibold">
                  적용 가중 CAI
                  <small className="mt-1 block font-normal text-muted">ridge+|β| · MLP 순열 · 핀치 고정</small>
                </td>
                <td className="px-3 py-3.5 font-mono">{board.score.toFixed(1)}</td>
                <td className="px-3 py-3.5 font-mono text-muted">—</td>
                <td className="px-3 py-3.5 text-[10px] text-muted">관측 · WTI 미학습</td>
              </tr>
              <tr>
                <td className="px-3 py-3.5">
                  WTI 방향 학습 가중
                  <small className="mt-1 block text-[10px] text-muted">5거래일 상승 여부 · G3 전 미동결</small>
                </td>
                <td className="px-3 py-3.5 font-mono text-muted">—</td>
                <td className="px-3 py-3.5 font-mono text-muted">—</td>
                <td className="px-3 py-3.5 text-[10px] text-muted">미학습</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          평가 기간 · 표본 수: 아직 없음. 예측력 개선을 주장하지 않습니다. 적용 가중은 잠재 바쁨을 설명한 나머지 배분이며,
          유가 맞히기가 아닙니다.
        </p>
      </section>

      <section className="mb-5 rounded-[14px] border border-line bg-surface p-6" id="research-data">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base tracking-tight">원천 데이터 · 확보 상태</h3>
            <p className="mt-1 text-[11px] text-muted">091 장부. KUSH·ADS-B·CAD 테이프를 밈 핀치로 넣습니다. 가상 교통·조명 10개는 점수에 넣지 않습니다.</p>
          </div>
          <span className="text-[10px] text-muted">
            적용 {board.legs.length} · 미적용 {board.dropped.length}
          </span>
        </div>
        {areas.length ? (
          <p className="mb-3 text-[11px] text-muted">
            적용 영역: {areas.map(([a, n]) => `${a} ${n}`).join(" · ")}
          </p>
        ) : null}
        <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="확보 상태 필터">
          {(["전체", "적용", "미적용"] as DataFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "min-h-9 rounded-md border border-line bg-surface px-2.5 text-[11px] text-muted",
                filter === f && "border-teal/30 bg-stage font-semibold text-teal",
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="091 다리 목록">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-bg text-[10px] font-medium text-muted">
                <th className="px-3 py-2.5">다리</th>
                <th className="px-3 py-2.5">영역</th>
                <th className="px-3 py-2.5">가중</th>
                <th className="px-3 py-2.5">점수</th>
                <th className="px-3 py-2.5">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-3.5">
                    <span className={r.kind === "live" ? "font-medium text-teal" : ""}>{r.name}</span>
                    <small className="mt-1 block text-[10px] text-muted">{r.note}</small>
                  </td>
                  <td className="px-3 py-3.5">{r.area}</td>
                  <td className="px-3 py-3.5 font-mono">{(r.w * 100).toFixed(1)}%</td>
                  <td className="px-3 py-3.5 font-mono">{r.score != null ? Math.round(r.score) : "—"}</td>
                  <td className="px-3 py-3.5 text-[10px] text-muted">
                    {r.kind === "live" ? "적용" : "미적용 · 0점 아님"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          결측은 0으로 채우지 않습니다. 재고는 활동과 구분된 공개 다리로 들어와 있고, 야간조명(091-B)은 정량 투입에서
          빠졌습니다.
        </p>
      </section>

      {board.explain.length ? (
        <section className="mb-5 rounded-[14px] border border-line bg-surface p-6">
          <div className="mb-2">
            <h3 className="text-base tracking-tight">나머지 몫을 어떻게 나눴나</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{board.explainNote}</p>
          </div>
          <MlWeightChart rows={board.explain} />
          <p className="mt-2 text-[11px] text-muted">
            규칙=나머지 1/n+핀치 · Ridge=|β| · MLP=얕은망 순열 · 최종=핀치 고정+나머지 ML 평균
          </p>
        </section>
      ) : null}

      <details className="rounded-[11px] border border-line bg-surface px-5">
        <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 text-sm font-semibold">
          <span>가중치와 머신러닝의 역할</span>
          <FoldHint />
        </summary>
        <div className="space-y-3 border-t border-line py-4 text-xs leading-relaxed text-muted">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h4 className="mb-2 text-ink">관측용 CAI</h4>
              <p>핀치 예약 가중 + 나머지 자동 다리. 규칙 자체는 머신러닝이 아닙니다.</p>
              <p className="mt-2 rounded-md bg-stage px-3 py-2.5 font-mono text-teal">
                CAI = Σ(wᵢ × sᵢ)
                <br />
                wᵢ ≥ 0, Σwᵢ = 1
              </p>
            </div>
            <div>
              <h4 className="mb-2 text-ink">나머지 배분 설명</h4>
              <p>
                변동 다리 z평균을 잠재 바쁨으로 두고 ridge와 MLP 순열로 나머지를 나눕니다. WTI를 맞히라고 학습하지
                않았습니다.
              </p>
            </div>
          </div>
          <p>
            <strong className="text-ink">학습 계수는 비공개가 아니라 미학습입니다.</strong> WTI 5거래일 방향을 타깃으로
            쓰기 전에 G3에서 정답·분할을 고정합니다.
          </p>
        </div>
      </details>
    </div>
  );
}

const HISTORY: {
  date: string;
  tag: string;
  type: Exclude<HistFilter, "all">;
  title: string;
  body: string;
}[] = [
  {
    date: "09.08",
    tag: "091 장부",
    type: "research",
    title: "쿠싱 현장 대리변수 장부",
    body: "091-S QSR, U 산업공고, V 허가, A 숙박세, H 검색, M 시청공고, W AQI, Z 뉴스, X 스프레드, Y 펌프갭을 원장으로 남겼습니다. 현재 지수 구성과 탐색 장부는 구분합니다.",
  },
  {
    date: "09.08",
    tag: "기각",
    type: "research",
    title: "091-B 야간조명 정량 투입 실패",
    body: "장기간 배터리에서 WTI와의 r≈.05. 정량 입력에서 빼고 보류 이유로 보관합니다. 이름만 바꿔 되살리지 않습니다.",
  },
  {
    date: "09.10",
    tag: "적용",
    type: "research",
    title: "무료 공개 다리 적용",
    body: "Wikimedia Cushing,_Oklahoma 조회와 EIA PET.W_EPC0_SAX_YCUOK_MBBL |Δ|·타이트, 점수가 있는 핀치 U/A/M만 점수에 넣습니다. 결측 핀치는 0점이 아니라 재배분입니다.",
  },
  {
    date: "09.11",
    tag: "가중",
    type: "research",
    title: "나머지 80% ridge + 얕은 MLP",
    body: "잠재 바쁨 = 변동 다리 z평균. ridge |β|와 6-hidden tanh MLP 순열중요도 평균으로 나머지를 나눕니다. 유가 예측·알파가 아닙니다.",
  },
  {
    date: "09.11",
    tag: "테이프",
    type: "research",
    title: "KUSH · ADS-B · CAD · 시청 패킷 접목",
    body: "1600 KUSH RSS와 지금곡, adsb.lol 저고도, Payne 산업 CAD 표본, 시청 수압 패킷을 밈 핀치로 넣었다. 허슬곡은 0.01. 범죄 인명은 기록하지 않는다. 알파 아님.",
  },
  {
    date: "09.11",
    tag: "091-W",
    type: "research",
    title: "AQI는 시내 측정소가 아니라 위성 모델",
    body: "쿠싱 EPA/DEQ 지상 측정소는 없다. IQAir·웨더가 보여주는 실시간은 CAMS 위성 모델이다. Open-Meteo로 같은 값을 5분마다 읽어 091-W 0.05에 넣는다. AQI가 높을수록 바쁨으로 친다.",
  },
  {
    date: "09.11",
    tag: "091-SPP",
    type: "research",
    title: "SPP v3 그리드 스트레스를 핀치로 설치",
    body: "RTBM latest interval에서 CUSH/CUSHOIL/PAYNE 등 23노드 |MCC|를 본다. 가중 0.05. 그리드 스트레스는 펌핑이 아니다. 유가 IC는 라이브 점수에 넣지 않는다. 연구 엔진은 research/spp-cushing-v3.",
  },
  {
    date: "09.11",
    tag: "화면",
    type: "design",
    title: "v4 IA 채택",
    body: "대시보드 / 연구·검증 / 히스토리. 반원 계기판, CAI란? 접기, Desk 제거. LS CRUDE는 팀 서명만 남깁니다.",
  },
  {
    date: "09.11",
    tag: "v1",
    type: "design",
    title: "실측 엔진을 이 구조에 연결",
    body: "가상 10신호와 가상 상승확률 64%를 첫 화면에 두지 않습니다. 예측 카드는 미학습 빈 화면입니다.",
  },
  {
    date: "09.11",
    tag: "게이트",
    type: "research",
    title: "WTI 방향 학습은 G3 전 미동결",
    body: "동일 가중 vs 적용 가중 비교는 가능합니다. 다음 5거래일 상승 여부를 학습 타깃으로 고정하지 않았습니다. 계수는 미학습입니다.",
  },
];

function HistoryTab() {
  const [filter, setFilter] = useState<HistFilter>("all");
  const items = HISTORY.filter((h) => filter === "all" || h.type === filter);
  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-5">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">어떻게 여기까지 왔을까요?</h2>
          <p className="mt-1.5 text-xs text-muted">현재 지수와 과거 연구를 섞지 않고, 질문·결정·근거를 시간순으로 남깁니다.</p>
        </div>
        <span className="hidden font-mono text-[11px] text-muted sm:block">HISTORY</span>
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-3 border-y border-line py-4">
        <span className="text-[11px] text-teal">현재</span>
        <strong className="text-[15px] font-semibold">CAI v1 · 091 엔진 연결</strong>
        <small className="text-[11px] text-muted sm:ml-auto">예측 미학습 · 091 장부 유지</small>
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="히스토리 구분">
        {(
          [
            ["all", "전체"],
            ["research", "연구 맥락"],
            ["design", "화면 변경"],
          ] as [HistFilter, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            className={cn(
              "min-h-10 rounded-md border border-line bg-surface px-2.5 text-[11px] text-muted",
              filter === id && "border-teal/30 bg-stage font-semibold text-teal",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="history-rail">
        {items.map((h) => (
          <article
            key={h.title}
            className="relative grid grid-cols-1 gap-2 py-3 sm:grid-cols-[6.25rem_1fr] sm:gap-5 sm:py-4"
          >
            <span className="history-dot" aria-hidden />
            <div className="font-mono text-sm text-teal">
              {h.date}
              <span className="mt-1.5 block font-sans text-[10px] text-muted">{h.tag}</span>
            </div>
            <div>
              <h3 className="mb-2 text-[15px] font-medium">{h.title}</h3>
              <p className="text-xs leading-relaxed text-muted">{h.body}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
