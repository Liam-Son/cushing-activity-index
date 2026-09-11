import type { ReactNode } from "react";
import { Plane, Radio, Newspaper, Landmark, Wind } from "lucide-react";
import type { FieldTape } from "@/lib/cfam-engine";

function Card({
  icon,
  label,
  value,
  body,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  body: string;
}) {
  return (
    <article className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] tracking-wide text-muted">
          {icon}
          {label}
        </span>
        <span className="font-mono text-[11px] text-teal">{value}</span>
      </div>
      <p className="text-xs leading-relaxed text-ink">{body}</p>
    </article>
  );
}

export function FieldTape({ tape }: { tape: FieldTape }) {
  const closest =
    tape.adsbClosestNm != null ? `${tape.adsbClosestNm.toFixed(1)}nm` : "—";
  const news = tape.headlines[0]?.title ?? "헤드라인 없음";
  const cad = tape.cadTypes[0] ?? "산업 키워드 없음";
  const aqi = tape.aqi != null ? String(Math.round(tape.aqi)) : "—";
  return (
    <section className="rounded-xl border border-line bg-surface p-6" aria-labelledby="tape-heading">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 id="tape-heading" className="text-base font-bold tracking-tight">
            현장 테이프
          </h2>
          <p className="mt-1 text-[11px] text-muted">
            1600 KUSH · ADS-B · AQI · 산업 CAD · 시청 패킷. 범죄 인명 기록 없음. 유가 예측 아님.
          </p>
        </div>
        <span className="rounded border border-paper-line bg-paper px-2 py-1 text-[10px] text-warn">
          밈 핀치
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          icon={<Radio className="size-3.5" aria-hidden />}
          label="091-RADIO"
          value={tape.radioHustle ? "허슬" : "허슬 아님"}
          body={tape.radioTitle || "스트림 제목 없음"}
        />
        <Card
          icon={<Newspaper className="size-3.5" aria-hidden />}
          label="091-Z KUSH"
          value={`${tape.headlines.length}건`}
          body={news}
        />
        <Card
          icon={<Wind className="size-3.5" aria-hidden />}
          label="091-W AQI"
          value={aqi}
          body={tape.aqiNote || "CAMS 위성 모델. 쿠싱 시내 EPA 측정소는 없다."}
        />
        <Card
          icon={<Plane className="size-3.5" aria-hidden />}
          label="091-ADSB"
          value={`저고도 ${tape.adsbLow}`}
          body={`박스 ${tape.adsbN}대 · 최근접 ${closest}. 8nm·3500ft 미만만 현장으로 친다.`}
        />
        <Card
          icon={<Landmark className="size-3.5" aria-hidden />}
          label="091-CAD / M"
          value={tape.cadTypes.length ? `${tape.cadTypes.length}건` : "0"}
          body={`${cad}. ${tape.muniNote || "시청 패킷 대기"}`}
        />
      </div>
    </section>
  );
}
