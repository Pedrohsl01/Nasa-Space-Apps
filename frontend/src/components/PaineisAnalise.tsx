import { ClipboardList, Dumbbell, Flame, TrendingUp } from "lucide-react";
import { Painel } from "./Painel";
import type { CoachExercicio, ExameSugerido, PredicaoTendencia } from "../types";

/* ------------------------------------------------------------------ */
/* (a) Alerta de tendência preditiva e contramedidas                   */
/* ------------------------------------------------------------------ */

export function PredicaoPanel({ predicao, className = "" }: { predicao: PredicaoTendencia; className?: string }) {
  const corNivel =
    predicao.nivel === "atencao"
      ? "border-amber-500/60 text-amber-300"
      : predicao.nivel === "observacao"
        ? "border-sky-500/60 text-sky-300"
        : "border-emerald-600/60 text-emerald-300";
  const nomeNivel: Record<string, string> = {
    atencao: "ATENÇÃO",
    observacao: "OBSERVAR",
    estavel: "ESTÁVEL",
    dados_insuficientes: "POUCOS DADOS",
  };

  return (
    <Painel
      titulo="Tendência preditiva"
      icone={<TrendingUp className="h-4 w-4" />}
      className={className}
      extra={
        <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold ${corNivel}`}>
          {nomeNivel[predicao.nivel] ?? predicao.nivel}
          {predicao.inicio !== undefined && ` • dias ${predicao.inicio}–${predicao.fim}`}
        </span>
      }
    >
      <p className="mb-3 text-xs text-slate-400">{predicao.resumo} Riscos que ainda não viraram alerta vermelho.</p>
      {predicao.riscos.length === 0 ? (
        <p className="rounded border border-emerald-900/60 bg-emerald-500/5 p-3 text-xs text-emerald-300">
          Sem tendência de piora: sono, FC, pressão, radiação, treino e humor estáveis na janela.
        </p>
      ) : (
        <ul className="rolagem-fina max-h-72 space-y-2 overflow-y-auto pr-1">
          {predicao.riscos.map((r) => (
            <li key={r.id} className="rounded border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-white">{r.titulo}</p>
                <span
                  className={`whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${
                    r.severidade === "provavel" ? "bg-amber-500/20 text-amber-300" : "bg-sky-500/15 text-sky-300"
                  }`}
                >
                  {r.severidade === "provavel" ? "provável" : "emergente"}
                </span>
              </div>
              <p className="mt-0.5 font-mono text-[10px] text-slate-500">
                {r.categoria} • perigo NASA: {r.perigo_nasa}
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
/* (b) Exames sugeridos por déficit de dados                           */
/* ------------------------------------------------------------------ */

const COR_PRIORIDADE = {
  alta: "bg-red-500/20 text-red-300 border-red-500/50",
  media: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  baixa: "bg-slate-700/40 text-slate-300 border-slate-600",
};

const NOME_TIPO = { ausente: "dado ausente", inconsistente: "dado inconsistente", inconclusivo: "inconclusivo" };

export function ExamesPanel({ exames, className = "" }: { exames: ExameSugerido[]; className?: string }) {
  return (
    <Painel
      titulo="Exames sugeridos"
      icone={<ClipboardList className="h-4 w-4" />}
      className={className}
      extra={<span className="font-mono text-[10px] text-slate-500">por déficit de informação</span>}
    >
      {exames.length === 0 ? (
        <p className="rounded border border-emerald-900/60 bg-emerald-500/5 p-3 text-xs text-emerald-300">
          Dados completos e consistentes: nenhum exame complementar sugerido.
        </p>
      ) : (
        <ul className="rolagem-fina max-h-72 space-y-2 overflow-y-auto pr-1">
          {exames.map((e) => (
            <li key={e.exame} className="rounded border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-white">{e.exame}</p>
                <span className={`whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${COR_PRIORIDADE[e.prioridade]}`}>
                  {e.prioridade}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-300">
                <span className="font-mono text-[9px] uppercase text-slate-500">{NOME_TIPO[e.tipo]} • </span>
                {e.motivo}
              </p>
              <p className="mt-1 text-[11px] text-cyan-100">
                <span className="text-cyan-400">▸ A bordo:</span> {e.procedimento}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Painel>
  );
}

/* ------------------------------------------------------------------ */
/* (c) Coach de exercício                                              */
/* ------------------------------------------------------------------ */

const COR_STATUS = {
  meta_cumprida: { barra: "from-emerald-500 to-emerald-300", texto: "text-emerald-300", nome: "META CUMPRIDA" },
  no_caminho: { barra: "from-cyan-500 to-emerald-400", texto: "text-cyan-300", nome: "NO CAMINHO" },
  atencao: { barra: "from-amber-500 to-amber-300", texto: "text-amber-300", nome: "ATENÇÃO" },
  critico: { barra: "from-red-500 to-amber-400", texto: "text-red-300", nome: "DÉFICIT" },
};

export function CoachPanel({ coach, className = "" }: { coach: CoachExercicio; className?: string }) {
  const cor = COR_STATUS[coach.status];
  return (
    <Painel
      titulo="Coach de exercício"
      icone={<Dumbbell className="h-4 w-4" />}
      className={className}
      extra={<span className={`font-mono text-[10px] font-bold ${cor.texto}`}>{cor.nome}</span>}
    >
      <div className="space-y-3">
        <div>
          <div className="mb-1 flex justify-between font-mono text-[11px] text-slate-400">
            <span>Hoje até {String(coach.hora).padStart(2, "0")}:00</span>
            <span className="text-white">
              {coach.concluido_min} / {coach.meta_diaria_min} min
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-800">
            <div className={`h-full rounded-full bg-gradient-to-r ${cor.barra} transition-all duration-500`} style={{ width: `${coach.progresso_dia_pct}%` }} />
          </div>
          <p className="mt-1 font-mono text-[10px] text-slate-500">
            {coach.deficit_min > 0 ? `faltam ${coach.deficit_min} min` : "meta do dia atingida"}
          </p>
        </div>

        <div>
          <div className="mb-1 flex justify-between font-mono text-[11px] text-slate-400">
            <span>Semana (7 dias)</span>
            <span className="text-white">
              {coach.semana_min} / {coach.meta_semana_min} min
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-cyan-500/80 transition-all duration-500" style={{ width: `${coach.progresso_semana_pct}%` }} />
          </div>
        </div>

        <div className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900/60 px-3 py-2">
          <Flame className="h-4 w-4 text-orange-400" />
          <span className="font-mono text-sm font-bold text-white">{coach.streak_dias}</span>
          <span className="text-[11px] text-slate-400">dia(s) seguidos na meta</span>
        </div>

        <p className={`rounded border-l-2 border-cyan-400 bg-slate-900/70 p-2 text-xs text-slate-200`}>💬 {coach.recomendacao}</p>
        <p className="font-mono text-[9px] text-slate-600">Meta operacional do projeto: 60 min/dia contra atrofia muscular e perda óssea.</p>
      </div>
    </Painel>
  );
}
