import { ClipboardList, Dumbbell, Flame, TrendingUp } from "lucide-react";
import { Painel } from "./Painel";
import type { CoachExercicio, ExameSugerido, PredicaoTendencia } from "../types";

/* ------------------------------------------------------------------ */
/* (a) Alerta de tendência preditiva e contramedidas                   */
/* ------------------------------------------------------------------ */

/** Alerta ATUAL do dia (triagem), para a tendência nunca soar como "sem risco" enquanto ele está ativo. */
export interface AlertaAtual {
  codigo: number; // 2 = atenção, 3 = crítico
  categorias: string[]; // ex.: ["Radiação"]
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
          ? "border-slate-500/60 text-slate-300" // sem piora, mas não "estável/verde" com alerta ativo
          : "border-emerald-600/60 text-emerald-300";
  const nomeNivel: Record<string, string> = {
    atencao: "ATENÇÃO",
    observacao: "OBSERVAR",
    estavel: alertaAtivo ? "SEM PIORA GRADUAL" : "ESTÁVEL",
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
      <p className="mb-3 text-xs text-slate-400">
        {semPiora && predicao.nivel !== "dados_insuficientes" ? "Sem piora gradual detectada na janela." : predicao.resumo} Este painel olha a <strong className="text-slate-300">tendência</strong> dos últimos dias, não o alerta de hoje.
      </p>

      {/* Alerta atual × tendência recente: um alerta ativo pode existir sem piora na série */}
      {alertaAtivo && (
        <div
          className={`mb-3 rounded border p-3 text-xs ${
            alertaAtual.codigo >= 3 ? "border-red-500/60 bg-red-500/10 text-red-200" : "border-amber-500/60 bg-amber-500/10 text-amber-200"
          }`}
        >
          <p className="font-semibold">
            ⚠ Alerta ativo hoje{alertaAtual.categorias.length ? ` (${alertaAtual.categorias.join(", ")})` : ""}: o risco continua presente.
          </p>
          <p className="mt-1 text-[11px] opacity-90">
            {semPiora ? "A ausência de piora gradual não reduz o alerta atual" : "As tendências abaixo somam-se ao alerta atual"}: siga o protocolo e
            as contramedidas do dia.
          </p>
          {radiacaoAtiva && (
            <p className="mt-1 text-[11px] opacity-90">
              Radiação é dose <strong>cumulativa</strong>
              {alertaAtual.radiacaoTotalMsv !== undefined && ` (${alertaAtual.radiacaoTotalMsv.toLocaleString("pt-BR")} mSv até hoje)`}: o
              dano biológico e o risco de câncer a longo prazo não regridem quando a taxa para de subir.
            </p>
          )}
        </div>
      )}

      {semPiora ? (
        alertaAtivo ? (
          <p className="rounded border border-slate-700 bg-(--subcard) p-3 text-xs text-slate-300">
            Sem piora gradual na janela (sono, FC, pressão, ritmo de radiação, treino e humor). Isso não significa ausência de risco.
          </p>
        ) : (
          <p className="rounded border border-emerald-900/60 bg-emerald-500/5 p-3 text-xs text-emerald-300">
            Sem tendência de piora: sono, FC, pressão, ritmo de radiação, treino e humor estáveis na janela.
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
        <ul className="space-y-2">
          {exames.map((e) => (
            <li key={e.exame} className="rounded border border-slate-800 bg-(--subcard) p-3">
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

        <div className="flex items-center gap-2 rounded border border-slate-800 bg-(--subcard) px-3 py-2">
          <Flame className="h-4 w-4 text-orange-400" />
          <span className="font-mono text-sm font-bold text-white">{coach.streak_dias}</span>
          <span className="text-[11px] text-slate-400">dia(s) seguidos na meta</span>
        </div>

        <p className={`rounded border-l-2 border-cyan-400 bg-(--subcard) p-2 text-xs text-slate-200`}>💬 {coach.recomendacao}</p>
        <p className="font-mono text-[9px] text-slate-600">Meta operacional do projeto: 60 min/dia contra atrofia muscular e perda óssea.</p>
      </div>
    </Painel>
  );
}
