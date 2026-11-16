// Mission Readiness bar (HUD): EVA fitness in 20 segments, breakdown of the cumulative score
// (Base − Accumulated wear − Acute penalty, with the day's Recovery), 00:00→now curve,
// mitigation XP and summarized vital signs.
import { tEstado, tNivelEva } from "../i18n";
import type { PontoProntidao, ProntidaoCumulativa } from "../types";

const COR = {
  apto: { seg: "bg-[#34D399]", texto: "text-[#34D399]", borda: "border-emerald-500/50", linha: "#34D399" },
  atencao: { seg: "bg-[#FBBF24]", texto: "text-[#FBBF24]", borda: "border-amber-500/50", linha: "#FBBF24" },
  critico: { seg: "bg-[#EF4444]", texto: "text-[#EF4444]", borda: "border-red-500/60", linha: "#EF4444" },
};

export interface SinalResumo {
  rotulo: string;
  valor: string;
  alerta?: boolean;
}

const fmt = (v: number) => (Math.round(v * 10) / 10).toLocaleString("en-US");

/** Readiness curve of the day (00:00–23:00): line up to the current hour, 75% and 45% bands in the background. */
function CurvaDia({ historico, cor }: { historico: PontoProntidao[]; cor: string }) {
  const L = 168;
  const A = 34;
  const x = (h: number) => 2 + (h / 23) * (L - 4);
  const y = (v: number) => 2 + (1 - v / 100) * (A - 4);
  const pts = historico.map((p) => `${x(p.hora).toFixed(1)},${y(p.prontidao).toFixed(1)}`).join(" ");
  const ultimo = historico[historico.length - 1];
  const contramedidas = historico.filter((p) => p.estado === "contramedida");
  return (
    <svg width={L} height={A} viewBox={`0 0 ${L} ${A}`} className="shrink-0" role="img" aria-label="Readiness curve over the day">
      <title>{historico.map((p) => `${p.rotulo}  ${Math.round(p.prontidao)}%  (wear ${fmt(p.desgaste)}, ${tEstado(p.estado)})`).join("\n")}</title>
      <rect x={0} y={0} width={L} height={A} rx={2} className="fill-slate-900/70" />
      <line x1={2} x2={L - 2} y1={y(75)} y2={y(75)} stroke="#34D399" strokeOpacity={0.25} strokeDasharray="2 3" />
      <line x1={2} x2={L - 2} y1={y(45)} y2={y(45)} stroke="#EF4444" strokeOpacity={0.25} strokeDasharray="2 3" />
      {contramedidas.map((p) => (
        <rect key={p.hora} x={x(p.hora) - 2} y={1} width={4} height={A - 2} fill="#22D3EE" fillOpacity={0.15} />
      ))}
      {historico.length > 1 && <polyline points={pts} fill="none" stroke={cor} strokeWidth={1.6} strokeLinejoin="round" />}
      {ultimo && <circle cx={x(ultimo.hora)} cy={y(ultimo.prontidao)} r={2.6} fill={cor} />}
    </svg>
  );
}

export interface Sincronia {
  estado: "ok" | "coletando" | "erro";
  texto: string; // e.g. "Synced • Last reading: 07:00"
}

const COR_SYNC = {
  ok: "bg-green-500",
  coletando: "animate-ping bg-cyan-400",
  erro: "bg-red-500",
};

export function ProntidaoHUD({ prontidao, xp, ganho, sinais, sincronia, onVerProtocolo }: {
  prontidao: ProntidaoCumulativa | null;
  xp: number;
  ganho: { id: number; texto: string } | null;
  sinais: SinalResumo[];
  sincronia: Sincronia;
  onVerProtocolo?: () => void; // goes to the protocol panel (reason and countermeasures)
}) {
  const cor = COR[prontidao?.faixa ?? "apto"];
  const aptidao = prontidao?.aptidao_eva ?? 0;
  const acesos = Math.round(aptidao / 5);
  const detalhe = prontidao
    ? [
        `Readiness ${prontidao.prontidao_atual}% at ${String(prontidao.hora).padStart(2, "0")}:00 (state: ${tEstado(prontidao.estado_atual)})`,
        `Daily base ${fmt(prontidao.base.valor)}%`,
        ...prontidao.base.fatores.map((f) => `   ${fmt(f.pontos)}  ${f.rotulo}`),
        `Accumulated wear −${fmt(prontidao.desgaste_acumulado)} (exertion ${fmt(prontidao.desgaste_esforco)} • load ${fmt(prontidao.desgaste_carga)})`,
        `Recovery today +${fmt(prontidao.recuperacao_acumulada)}`,
        `Acute penalty −${fmt(prontidao.penalidade_aguda)}`,
        ...prontidao.fatores_agudos.map((f) => `   ${fmt(f.pontos)}  ${f.rotulo}`),
        ...(prontidao.bloqueios.length ? ["EVA limits:", ...prontidao.bloqueios.map((b) => `   ${tNivelEva(b.nivel)}: ${b.motivo}`)] : []),
        prontidao.nota,
      ].join("\n")
    : "";
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {/* Segmented bar (EVA fitness) */}
      <div className="relative min-w-64 flex-1">
        <div className="mb-1 flex flex-wrap items-baseline gap-x-2 font-mono text-[10px] uppercase tracking-[0.2em]">
          {/* First appearance of the acronym on screen: spelled out */}
          <span className="text-slate-400">
            Extravehicular activity <span className="text-slate-300">(EVA)</span> fitness
          </span>
          <span className={`text-sm font-bold tabular-nums ${cor.texto}`}>{prontidao ? `${aptidao}%` : "—"}</span>
          {prontidao && prontidao.status_eva === "INAPTO" ? (
            // Single suspension message: the same status the protocol panel shows
            <button
              type="button"
              onClick={onVerProtocolo}
              title={prontidao.bloqueios.map((b) => `${tNivelEva(b.nivel)}: ${b.motivo}`).join("\n")}
              className="rounded border border-red-500/70 bg-red-500/15 px-2 py-0.5 font-semibold normal-case tracking-normal text-red-200 hover:bg-red-500/25"
            >
              ⛔ Extravehicular activity suspended · <span className="underline underline-offset-2">see reason and protocol</span>
            </button>
          ) : (
            prontidao && <span className={`font-semibold ${cor.texto}`}>// {prontidao.rotulo_eva}</span>
          )}
          {prontidao && prontidao.aptidao_eva < prontidao.prontidao_atual && (
            <span className="normal-case tracking-normal text-slate-500">(readiness {prontidao.prontidao_atual}%, with safety cap)</span>
          )}
          {/* Live smartwatch telemetry */}
          <span
            className={`ml-auto flex items-center gap-1 normal-case tracking-normal ${sincronia.estado === "erro" ? "text-red-300" : "text-slate-400"}`}
            role="status"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${COR_SYNC[sincronia.estado]}`} />
            {sincronia.texto}
          </span>
        </div>
        <div className="flex gap-[3px]" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={aptidao} aria-label="EVA fitness">
          {Array.from({ length: 20 }, (_, i) => (
            <span
              key={i}
              className={`h-2.5 flex-1 skew-x-[-20deg] rounded-[1px] transition-all duration-700 ${i < acesos ? cor.seg : "bg-slate-800"}`}
              style={{ transitionDelay: `${i * 25}ms` }}
            />
          ))}
        </div>
        {/* Cumulative score breakdown (full list in the tooltip) */}
        {prontidao ? (
          <p className="mt-1 truncate font-mono text-[9px] text-slate-500" title={detalhe}>
            <span className="text-slate-300">Base {fmt(prontidao.base.valor)}</span>
            <span className="text-amber-300/90"> − Wear {fmt(prontidao.desgaste_acumulado)}</span>
            {prontidao.penalidade_aguda > 0 && <span className="text-red-300/90"> − Acute {fmt(prontidao.penalidade_aguda)}</span>}
            <span className="text-emerald-400/90"> | Recovered +{fmt(prontidao.recuperacao_acumulada)}</span>
            {prontidao.contramedidas_consideradas > 0 && <span className="text-cyan-300/90"> | {prontidao.contramedidas_consideradas} countermeasure(s)</span>}
            {prontidao.bloqueios[0] && <span className="text-red-300/90"> | {prontidao.bloqueios[0].motivo}</span>}
          </p>
        ) : (
          <p className="mt-1 font-mono text-[9px] text-slate-500">Calculating cumulative readiness…</p>
        )}
        {/* Gain feedback: rises and fades */}
        {ganho && (
          <span
            key={ganho.id}
            className="hud-ganho pointer-events-none absolute -top-1 right-0 rounded border border-emerald-500/60 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-200"
          >
            {ganho.texto}
          </span>
        )}
      </div>

      {/* Readiness curve 00:00 → current hour */}
      {prontidao && prontidao.historico_prontidao.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-slate-500">Readiness today</span>
          <CurvaDia historico={prontidao.historico_prontidao} cor={cor.linha} />
        </div>
      )}

      {/* Mitigation XP */}
      <div className={`rounded border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${cor.borda}`}>
        <span className="text-slate-500">Mitigation</span> <span className="font-bold tabular-nums text-cyan-200">{xp} XP</span>
      </div>

      {/* Summarized vital signs */}
      <div className="flex flex-wrap gap-1.5">
        {sinais.map((s) => (
          <span
            key={s.rotulo}
            className={`rounded border px-2 py-1 font-mono text-[10px] ${
              s.alerta ? "border-amber-500/60 bg-amber-500/10 text-amber-200" : "border-slate-800 bg-(--subcard) text-slate-300"
            }`}
          >
            <span className="text-slate-500">{s.rotulo}</span> <span className={`font-semibold tabular-nums ${s.alerta ? "" : "text-(--dados)"}`}>{s.valor}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
