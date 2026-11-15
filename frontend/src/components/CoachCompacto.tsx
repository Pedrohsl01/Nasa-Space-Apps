// Coach de exercício em uma linha (fica na parte inferior de "Missões do dia").
import type { CoachExercicio } from "../types";

const COR_COACH: Record<CoachExercicio["status"], { barra: string; texto: string; nome: string }> = {
  meta_cumprida: { barra: "bg-emerald-400", texto: "text-emerald-300", nome: "Meta cumprida" },
  no_caminho: { barra: "bg-cyan-400", texto: "text-cyan-300", nome: "No caminho" },
  atencao: { barra: "bg-amber-400", texto: "text-amber-300", nome: "Atenção" },
  critico: { barra: "bg-red-400", texto: "text-red-300", nome: "Déficit" },
};

export function CoachCompacto({ coach, className = "" }: { coach: CoachExercicio; className?: string }) {
  const cor = COR_COACH[coach.status];
  return (
    <div
      className={`flex items-center gap-3 rounded border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 font-mono text-[10px] text-slate-400 ${className}`}
      title={`Coach de exercício: ${coach.recomendacao}`}
    >
      <span className="shrink-0 font-semibold uppercase tracking-wider text-cyan-300">🏋 Coach de Exercícios</span>
      {/* Progresso do dia até a hora selecionada no player do wearable */}
      <div className="flex shrink-0 items-center gap-1.5">
        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-800">
          <div className={`h-full rounded-full ${cor.barra}`} style={{ width: `${coach.progresso_dia_pct}%` }} />
        </div>
        <span className="text-slate-200">
          {coach.concluido_min}/{coach.meta_diaria_min} min
        </span>
      </div>
      <span className="shrink-0">
        Semana <span className="text-slate-200">{coach.semana_min}/{coach.meta_semana_min}</span>
      </span>
      <span className="shrink-0 text-orange-300">🔥 {coach.streak_dias}d</span>
      <span className={`shrink-0 font-semibold uppercase ${cor.texto}`}>{cor.nome}</span>
      <span className="min-w-0 flex-1 truncate text-slate-300">{coach.recomendacao}</span>
    </div>
  );
}
