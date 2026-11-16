// Pop-up de alerta crítico de saúde: aparece quando 1 órgão está vermelho (crítico) ou 2+ estão laranja (atenção).
import { useEffect } from "react";
import { ShieldAlert } from "lucide-react";
import { ZONAS } from "./zonasCorpo";
import type { OrgaoEmAlerta } from "./motivosAlerta";

const TEXTO_EVA = {
  INAPTO: "⛔ Atividade extraveicular (EVA) suspensa",
  RESTRICAO: "Atividade extraveicular (EVA) restrita: só esforço leve",
  APTO: "Atividade extraveicular (EVA) liberada",
} as const;

export function AlertaCriticoPopup({ orgaos, tripulante, dia, statusEva, acoes = [], onFechar, onVerDecisao }: {
  orgaos: OrgaoEmAlerta[] | null;
  tripulante: string;
  dia: number | null;
  statusEva?: "APTO" | "RESTRICAO" | "INAPTO";
  acoes?: string[]; // contramedidas do protocolo, na ordem de prioridade
  onFechar: () => void;
  onVerDecisao?: () => void; // fecha e leva à Decisão do dia (dados que sustentam o alerta)
}) {
  useEffect(() => {
    if (!orgaos) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [orgaos, onFechar]);

  if (!orgaos) return null;
  const vermelhos = orgaos.filter((o) => o.nivel >= 3).length;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onFechar}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alerta-critico-titulo"
        onClick={(e) => e.stopPropagation()}
        className="relato-popup w-full max-w-md rounded-md border border-[#EF4444]/70 bg-(--card) p-5 backdrop-blur-md"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 animate-pulse items-center justify-center rounded-full border border-[#EF4444]/70 bg-[rgba(239,68,68,0.12)] text-[#EF4444]">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <p id="alerta-critico-titulo" className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-[#EF4444]">
              {vermelhos ? "Alerta crítico de saúde" : "Alerta de saúde"}
            </p>
            <p className="text-xs text-slate-400">
              {tripulante} • dia {dia ?? "—"} •{" "}
              {vermelhos ? `${vermelhos} órgão(s) em nível crítico` : `${orgaos.length} órgãos em atenção ao mesmo tempo`}
            </p>
          </div>
        </div>

        <ul className="mt-4 space-y-1.5">
          {orgaos.map((o) => {
            const cor = o.nivel >= 3 ? "#EF4444" : "#F59E0B";
            return (
              <li key={o.zona} className="flex items-start gap-2 rounded border border-slate-800 bg-(--subcard) px-3 py-2 text-xs">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: cor }} />
                <span className="min-w-0">
                  <span className="font-semibold text-white">{ZONAS[o.zona].orgao}</span>
                  <span className="ml-1.5 font-mono text-[10px] uppercase" style={{ color: cor }}>
                    {o.nivel >= 3 ? "crítico" : "atenção"}
                  </span>
                  <span className="block text-slate-300">
                    {o.motivo.titulo} — {o.motivo.detalhe}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>

        {/* O que fazer agora: o mesmo status de EVA do topo e as primeiras contramedidas do protocolo */}
        <div className="mt-4 rounded border border-[#EF4444]/50 bg-[rgba(239,68,68,0.08)] p-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-red-300">O que fazer agora</p>
          {statusEva && <p className="mt-1 text-sm font-semibold text-white">{TEXTO_EVA[statusEva]}</p>}
          {acoes.length > 0 ? (
            <ol className="mt-1.5 space-y-1 text-xs text-slate-200">
              {acoes.slice(0, 2).map((a, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="font-mono text-cyan-400">{String(i + 1).padStart(2, "0")}</span>
                  <span>{a}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-1 text-xs text-slate-300">Siga o protocolo de contramedidas do dia.</p>
          )}
          <p className="mt-1.5 text-[11px] text-slate-400">Comunique a equipe médica (cirurgiões de voo).</p>
        </div>

        <p className="mt-3 text-[11px] text-slate-500">Dados simulados — não substitui avaliação profissional.</p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {onVerDecisao && (
            <button
              onClick={onVerDecisao}
              className="rounded border border-cyan-700 px-4 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-cyan-300 hover:bg-cyan-500/10"
            >
              Ver por quê
            </button>
          )}
          <button
            onClick={onFechar}
            autoFocus
            className="rounded border border-[#EF4444]/70 px-5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-red-200 hover:bg-[rgba(239,68,68,0.12)]"
          >
            Ciente
          </button>
        </div>
      </div>
    </div>
  );
}
