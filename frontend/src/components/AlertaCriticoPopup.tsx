// Pop-up de alerta crítico de saúde: aparece quando 1 órgão está vermelho (crítico) ou 2+ estão laranja (atenção).
import { useEffect } from "react";
import { ShieldAlert } from "lucide-react";
import { ZONAS } from "./zonasCorpo";
import type { OrgaoEmAlerta } from "./motivosAlerta";

export function AlertaCriticoPopup({ orgaos, tripulante, dia, onFechar }: {
  orgaos: OrgaoEmAlerta[] | null;
  tripulante: string;
  dia: number | null;
  onFechar: () => void;
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
              Alerta crítico de saúde
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

        <p className="mt-3 text-[11px] text-slate-400">
          Siga o protocolo de contramedidas e comunique a equipe médica. Dados simulados — não substitui avaliação profissional.
        </p>
        <div className="mt-4 flex justify-end">
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
