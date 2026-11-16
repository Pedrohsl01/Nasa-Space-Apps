// One-line exercise coach (sits at the bottom of "Daily missions").
import type { CoachExercicio } from "../types";

const COR_COACH: Record<CoachExercicio["status"], { barra: string; texto: string; nome: string }> = {
  meta_cumprida: { barra: "bg-emerald-400", texto: "text-emerald-300", nome: "Goal met" },
  no_caminho: { barra: "bg-cyan-400", texto: "text-cyan-300", nome: "On track" },
  atencao: { barra: "bg-amber-400", texto: "text-amber-300", nome: "Warning" },
  critico: { barra: "bg-red-400", texto: "text-red-300", nome: "Deficit" },
};

export function CoachCompacto({ coach, className = "" }: { coach: CoachExercicio; className?: string }) {
  const cor = COR_COACH[coach.status];
  return (
    <div
      className={`flex items-center gap-3 rounded border border-slate-800 bg-(--subcard) px-2.5 py-1.5 font-mono text-[10px] text-slate-400 ${className}`}
      title={`Exercise coach: ${coach.recomendacao}`}
    >
      <span className="shrink-0 font-semibold uppercase tracking-wider text-cyan-300">🏋 Exercise Coach</span>
      {/* Day progress up to the hour selected in the wearable player */}
      <div className="flex shrink-0 items-center gap-1.5">
        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-800">
          <div className={`h-full rounded-full ${cor.barra}`} style={{ width: `${coach.progresso_dia_pct}%` }} />
        </div>
        <span className="text-slate-200">
          {coach.concluido_min}/{coach.meta_diaria_min} min
        </span>
      </div>
      <span className="shrink-0">
        Week <span className="text-slate-200">{coach.semana_min}/{coach.meta_semana_min}</span>
      </span>
      <span className="shrink-0 text-orange-300">🔥 {coach.streak_dias}d</span>
      <span className={`shrink-0 font-semibold uppercase ${cor.texto}`}>{cor.nome}</span>
      <span className="min-w-0 flex-1 truncate text-slate-300">{coach.recomendacao}</span>
    </div>
  );
}
