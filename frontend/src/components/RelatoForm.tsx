// Compact discomfort report card for the region selected on the body map.
import { useState } from "react";
import { X } from "lucide-react";
import { INTENSIDADES, TIPOS_DESCONFORTO } from "./zonasCorpo";
import type { RelatoDesconforto } from "../types";

interface RelatoFormProps {
  titulo: string; // e.g. "Right Shoulder (Front)"
  descricao: string;
  existente: RelatoDesconforto | null;
  onSalvar: (dados: { tipo: string; intensidade: number; detalhe: string }) => void;
  onRemover: () => void;
  onFechar: () => void;
}

export function RelatoForm({ titulo, descricao, existente, onSalvar, onRemover, onFechar }: RelatoFormProps) {
  // The component is recreated (key) when the region changes, so the initial state comes from the saved report
  const [tipo, setTipo] = useState(existente?.tipo ?? "");
  const [intensidade, setIntensidade] = useState(existente?.intensidade ?? 2);
  const [detalhe, setDetalhe] = useState(existente?.detalhe ?? "");

  return (
    <div
      className="rounded border border-violet-500/50 bg-violet-950/20 p-3 text-xs"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-violet-300">Discomfort report</p>
          <p className="text-sm font-semibold text-white">{titulo}</p>
        </div>
        <button onClick={onFechar} className="p-0.5 text-slate-400 hover:text-white" aria-label="Close and clear selection">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-0.5 text-[10px] text-slate-500">{descricao}</p>

      {/* Type: 1 click */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {TIPOS_DESCONFORTO.map((t) => (
          <button
            key={t}
            onClick={() => setTipo(t)}
            aria-pressed={tipo === t}
            className={`rounded-full border px-2 py-0.5 text-[11px] transition ${
              tipo === t ? "border-violet-400 bg-violet-500/25 text-violet-100" : "border-slate-700 text-slate-300 hover:border-violet-500/60"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Intensity 1 to 5 */}
      <div className="mt-2 flex items-center gap-1.5">
        <span className="font-mono text-[10px] uppercase text-slate-500">Intensity</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => setIntensidade(n)}
            title={INTENSIDADES[n - 1]}
            aria-pressed={intensidade === n}
            className={`h-6 w-6 rounded border font-mono text-[11px] transition ${
              intensidade === n
                ? n >= 4
                  ? "border-red-400 bg-red-500/25 text-red-100"
                  : "border-violet-400 bg-violet-500/25 text-violet-100"
                : "border-slate-700 text-slate-400 hover:border-violet-500/60"
            }`}
          >
            {n}
          </button>
        ))}
        <span className="text-[10px] text-slate-400">{INTENSIDADES[intensidade - 1]}</span>
      </div>

      <textarea
        value={detalhe}
        onChange={(e) => setDetalhe(e.target.value)}
        maxLength={160}
        rows={2}
        placeholder="Optional detail (e.g. worse when raising the arm)"
        className="mt-2 w-full resize-none rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 placeholder:text-slate-600 focus:border-violet-500 focus:outline-none"
      />

      <div className="mt-2 flex items-center justify-end gap-2">
        {existente && (
          <button onClick={onRemover} className="rounded border border-slate-600 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-slate-800">
            Remove
          </button>
        )}
        <button
          onClick={() => onSalvar({ tipo, intensidade, detalhe: detalhe.trim() })}
          disabled={!tipo}
          className="rounded bg-violet-500 px-3 py-1 text-[11px] font-semibold text-white hover:bg-violet-400 disabled:opacity-40"
        >
          Save Report
        </button>
      </div>
    </div>
  );
}
