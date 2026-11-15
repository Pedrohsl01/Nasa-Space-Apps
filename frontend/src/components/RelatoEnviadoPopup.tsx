// Pop-up de confirmação: o desconforto relatado foi enviado para análise da equipe médica.
import { useEffect } from "react";
import { Stethoscope } from "lucide-react";
import type { RelatoDesconforto } from "../types";

export function RelatoEnviadoPopup({ relato, onFechar }: { relato: RelatoDesconforto | null; onFechar: () => void }) {
  // Fecha sozinho depois de 6 s ou com Esc
  useEffect(() => {
    if (!relato) return;
    const t = setTimeout(onFechar, 6000);
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", tecla);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", tecla);
    };
  }, [relato, onFechar]);

  if (!relato) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onFechar}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="relato-enviado-titulo"
        onClick={(e) => e.stopPropagation()}
        className="relato-popup w-full max-w-sm rounded-md border border-violet-500/60 bg-(--card) backdrop-blur-md p-5 text-center"
      >
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-violet-400/60 bg-violet-500/15 text-violet-200">
          <Stethoscope className="h-6 w-6" />
        </div>
        <p id="relato-enviado-titulo" className="font-mono text-[10px] uppercase tracking-[0.25em] text-violet-300">
          Relato enviado
        </p>
        <p className="mt-2 text-sm leading-snug text-slate-100">
          Sua dor foi enviada para análise da <span className="font-semibold text-white">equipe médica</span>.
        </p>
        <p className="mt-2 rounded border border-slate-800 bg-(--subcard) px-3 py-1.5 font-mono text-[11px] text-slate-300">
          {relato.nome} • {relato.tipo} <span className="tabular-nums">{relato.intensidade}/5</span>
          {relato.detalhe && <span className="block truncate text-slate-500">“{relato.detalhe}”</span>}
        </p>
        <button
          onClick={onFechar}
          autoFocus
          className="mt-4 rounded border border-violet-500/70 px-5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-violet-200 hover:bg-violet-500/15"
        >
          OK
        </button>
      </div>
    </div>
  );
}
