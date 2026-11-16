import { ClipboardList, Dumbbell, Flame, TrendingUp } from "lucide-react";
import { Painel } from "./Painel";
import { tCategorias } from "../i18n";
import type { CoachExercicio, ExameSugerido, PredicaoTendencia } from "../types";

/* ------------------------------------------------------------------ */
/* (a) Predictive trend alert and countermeasures                   */
/* ------------------------------------------------------------------ */

/** CURRENT alert of the day (triage), so the trend never sounds like "no risk" while it is active. */
export interface AlertaAtual {
  codigo: number; // 2 = warning, 3 = critical
  categorias: string[]; // e.g. ["Radiação"]
  radiacaoTotalMsv?: number;
}

export function PredicaoPanel({ predicao, alertaAtual, className = "" }: {
  predicao: PredicaoTendencia;
  alertaAtual?: AlertaAtual;
  className?: string;
}) {
  const alertaAtivo = !!alertaAtual && alertaAtual.codigo >= 2;
  const semPiora = predicao.riscos.length === 0;
  const radiacaoAtiva = alertaAtivo && alertaAtual.categorias.includes("Radiação");
  const corNivel =
    predicao.nivel === "atencao"
      ? "border-amber-500/60 text-amber-300"
      : predicao.nivel === "observacao"
        ? "border-sky-500/60 text-sky-300"
        : alertaAtivo
          ? "border-slate-500/60 text-slate-300" // no worsening, but not "stable/green" with an active alert
          : "border-emerald-600/60 text-emerald-300";
  const nomeNivel: Record<string, string> = {
    atencao: "WARNING",
    observacao: "WATCH",
    estavel: alertaAtivo ? "NO GRADUAL WORSENING" : "STABLE",
    dados_insuficientes: "NOT ENOUGH DATA",
  };

  return (
    <Painel
      titulo="Predictive trend"
      icone={<TrendingUp className="h-4 w-4" />}
      className={className}
      extra={
        <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold ${corNivel}`}>
          {nomeNivel[predicao.nivel] ?? predicao.nivel}
          {predicao.inicio !== undefined && ` • days ${predicao.inicio}–${predicao.fim}`}
        </span>
      }
    >
      <p className="mb-3 text-xs text-slate-400">
        {semPiora && predicao.nivel !== "dados_insuficientes" ? "No gradual worsening detected in the window." : predicao.resumo} This panel looks at the <strong className="text-slate-300">trend</strong> of the last few days, not at today's alert.
      </p>

      {/* Current alert × recent trend: an active alert can exist with no worsening in the series */}
      {alertaAtivo && (
        <div
          className={`mb-3 rounded border p-3 text-xs ${
            alertaAtual.codigo >= 3 ? "border-red-500/60 bg-red-500/10 text-red-200" : "border-amber-500/60 bg-amber-500/10 text-amber-200"
          }`}
        >
          <p className="font-semibold">
            ⚠ Active alert today{alertaAtual.categorias.length ? ` (${tCategorias(alertaAtual.categorias)})` : ""}: the risk is still present.
          </p>
          <p className="mt-1 text-[11px] opacity-90">
            {semPiora ? "The absence of gradual worsening does not reduce the current alert" : "The trends below add to the current alert"}: follow the protocol and
            today's countermeasures.
          </p>
          {radiacaoAtiva && (
            <p className="mt-1 text-[11px] opacity-90">
              Radiation is a <strong>cumulative</strong> dose
              {alertaAtual.radiacaoTotalMsv !== undefined && ` (${alertaAtual.radiacaoTotalMsv.toLocaleString("en-US")} mSv to date)`}: 
              biological damage and long-term cancer risk do not go away when the rate stops rising.
            </p>
          )}
        </div>
      )}

      {semPiora ? (
        alertaAtivo ? (
          <p className="rounded border border-slate-700 bg-(--subcard) p-3 text-xs text-slate-300">
            No gradual worsening in the window (sleep, HR, blood pressure, radiation rate, workout and mood). This does not mean there is no risk.
          </p>
        ) : (
          <p className="rounded border border-emerald-900/60 bg-emerald-500/5 p-3 text-xs text-emerald-300">
            No worsening trend: sleep, HR, blood pressure, radiation rate, workout and mood are stable in the window.
          </p>
        )
      ) : (
        <ul className="space-y-2">
          {predicao.riscos.map((r) => (
            <li key={r.id} className="rounded border border-slate-800 bg-(--subcard) p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-white">{r.titulo}</p>
                <span
                  className={`whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${
                    r.severidade === "provavel" ? "bg-amber-500/20 text-amber-300" : "bg-sky-500/15 text-sky-300"
                  }`}
                >
                  {r.severidade === "provavel" ? "likely" : "emerging"}
                </span>
              </div>
              <p className="mt-0.5 font-mono text-[10px] text-slate-500">
                {r.categoria} • NASA hazard: {r.perigo_nasa}
              </p>
              <p className="mt-1 text-[11px] text-slate-300">📈 {r.evidencias.join(" • ")}</p>
              <ul className="mt-2 space-y-1">
                {r.contramedidas_preventivas.map((c) => (
                  <li key={c} className="flex gap-1.5 text-[11px] text-cyan-100">
                    <span className="text-cyan-400">▸</span>
                    {c}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Painel>
  );
}

/* ------------------------------------------------------------------ */
/* (b) Exams suggested due to data gaps                           */
/* ------------------------------------------------------------------ */

const COR_PRIORIDADE = {
  alta: "bg-red-500/20 text-red-300 border-red-500/50",
  media: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  baixa: "bg-slate-700/40 text-slate-300 border-slate-600",
};

const NOME_TIPO = { ausente: "missing data", inconsistente: "inconsistent data", inconclusivo: "inconclusive" };
const NOME_PRIORIDADE = { alta: "high", media: "medium", baixa: "low" };

export function ExamesPanel({ exames, className = "" }: { exames: ExameSugerido[]; className?: string }) {
  return (
    <Painel
      titulo="Suggested exams"
      icone={<ClipboardList className="h-4 w-4" />}
      className={className}
      extra={<span className="font-mono text-[10px] text-slate-500">due to information gaps</span>}
    >
      {exames.length === 0 ? (
        <p className="rounded border border-emerald-900/60 bg-emerald-500/5 p-3 text-xs text-emerald-300">
          Complete and consistent data: no additional exam suggested.
        </p>
      ) : (
        <ul className="space-y-2">
          {exames.map((e) => (
            <li key={e.exame} className="rounded border border-slate-800 bg-(--subcard) p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-white">{e.exame}</p>
                <span className={`whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${COR_PRIORIDADE[e.prioridade]}`}>
                  {NOME_PRIORIDADE[e.prioridade]}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-300">
                <span className="font-mono text-[9px] uppercase text-slate-500">{NOME_TIPO[e.tipo]} • </span>
                {e.motivo}
              </p>
              <p className="mt-1 text-[11px] text-cyan-100">
                <span className="text-cyan-400">▸ On board:</span> {e.procedimento}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Painel>
  );
}

/* ------------------------------------------------------------------ */
/* (c) Exercise coach                                              */
/* ------------------------------------------------------------------ */

const COR_STATUS = {
  meta_cumprida: { barra: "from-emerald-500 to-emerald-300", texto: "text-emerald-300", nome: "GOAL MET" },
  no_caminho: { barra: "from-cyan-500 to-emerald-400", texto: "text-cyan-300", nome: "ON TRACK" },
  atencao: { barra: "from-amber-500 to-amber-300", texto: "text-amber-300", nome: "WARNING" },
  critico: { barra: "from-red-500 to-amber-400", texto: "text-red-300", nome: "DEFICIT" },
};

export function CoachPanel({ coach, className = "" }: { coach: CoachExercicio; className?: string }) {
  const cor = COR_STATUS[coach.status];
  return (
    <Painel
      titulo="Exercise coach"
      icone={<Dumbbell className="h-4 w-4" />}
      className={className}
      extra={<span className={`font-mono text-[10px] font-bold ${cor.texto}`}>{cor.nome}</span>}
    >
      <div className="space-y-3">
        <div>
          <div className="mb-1 flex justify-between font-mono text-[11px] text-slate-400">
            <span>Today until {String(coach.hora).padStart(2, "0")}:00</span>
            <span className="text-white">
              {coach.concluido_min} / {coach.meta_diaria_min} min
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-800">
            <div className={`h-full rounded-full bg-gradient-to-r ${cor.barra} transition-all duration-500`} style={{ width: `${coach.progresso_dia_pct}%` }} />
          </div>
          <p className="mt-1 font-mono text-[10px] text-slate-500">
            {coach.deficit_min > 0 ? `${coach.deficit_min} min to go` : "daily goal reached"}
          </p>
        </div>

        <div>
          <div className="mb-1 flex justify-between font-mono text-[11px] text-slate-400">
            <span>Week (7 days)</span>
            <span className="text-white">
              {coach.semana_min} / {coach.meta_semana_min} min
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-cyan-500/80 transition-all duration-500" style={{ width: `${coach.progresso_semana_pct}%` }} />
          </div>
        </div>

        <div className="flex items-center gap-2 rounded border border-slate-800 bg-(--subcard) px-3 py-2">
          <Flame className="h-4 w-4 text-orange-400" />
          <span className="font-mono text-sm font-bold text-white">{coach.streak_dias}</span>
          <span className="text-[11px] text-slate-400">consecutive day(s) on goal</span>
        </div>

        <p className={`rounded border-l-2 border-cyan-400 bg-(--subcard) p-2 text-xs text-slate-200`}>💬 {coach.recomendacao}</p>
        <p className="font-mono text-[9px] text-slate-600">Project operational goal: 60 min/day against muscle atrophy and bone loss.</p>
      </div>
    </Painel>
  );
}
