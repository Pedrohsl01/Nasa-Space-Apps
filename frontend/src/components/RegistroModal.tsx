import { useState } from "react";
import { X } from "lucide-react";
import type { Medicoes, TelemetriaDia } from "../types";

interface RegistroModalProps {
  aberto: boolean;
  proximoDia: number;
  ambiente: string;
  nomeAstronauta: string;
  referencia: TelemetriaDia | null; // usado para pré-preencher com a linha de base
  enviando: boolean;
  erro: string | null;
  onFechar: () => void;
  onRegistrar: (medicoes: Medicoes) => void;
  onSimularNormal: () => void;
}

type Campo = {
  chave: keyof Omit<Medicoes, "sintoma_neuro_ocular" | "radiacao_dia_msv">;
  rotulo: string;
  unidade: string;
  passo: number;
};

const CAMPOS: Campo[] = [
  { chave: "pa_sistolica", rotulo: "Pressão sistólica", unidade: "mmHg", passo: 1 },
  { chave: "pa_diastolica", rotulo: "Pressão diastólica", unidade: "mmHg", passo: 1 },
  { chave: "fc_repouso", rotulo: "FC em repouso", unidade: "bpm", passo: 1 },
  { chave: "glicemia_mg_dl", rotulo: "Glicemia", unidade: "mg/dL", passo: 1 },
  { chave: "temperatura_c", rotulo: "Temperatura", unidade: "°C", passo: 0.1 },
  { chave: "sono_horas", rotulo: "Sono", unidade: "h", passo: 0.1 },
  { chave: "humor", rotulo: "Humor (1 a 5)", unidade: "", passo: 1 },
  { chave: "treino_resistido_min", rotulo: "Treino resistido", unidade: "min", passo: 1 },
];

function valoresIniciais(ref: TelemetriaDia | null): Medicoes {
  // Pré-preenche com a linha de base (base_*) do astronauta; o astronauta só ajusta o que mudou
  const b = (d: { base: number | null; valor: number } | undefined, padrao: number) =>
    d ? (d.base ?? d.valor) : padrao;
  return {
    pa_sistolica: b(ref?.pa_sistolica, 120),
    pa_diastolica: b(ref?.pa_diastolica, 80),
    fc_repouso: b(ref?.fc_repouso, 65),
    glicemia_mg_dl: b(ref?.glicemia_mg_dl, 90),
    temperatura_c: b(ref?.temperatura_c, 36.6),
    sono_horas: b(ref?.sono_horas, 7.5),
    humor: 4,
    treino_resistido_min: 60,
    sintoma_neuro_ocular: "Nenhum",
    radiacao_dia_msv: null,
  };
}

export function RegistroModal(props: RegistroModalProps) {
  const { aberto, proximoDia, ambiente, nomeAstronauta, referencia, enviando, erro, onFechar, onRegistrar, onSimularNormal } = props;
  const [form, setForm] = useState<Medicoes>(() => valoresIniciais(referencia));
  const [refUsada, setRefUsada] = useState<TelemetriaDia | null>(referencia);

  // Reabre com a base do astronauta atual
  if (referencia !== refUsada) {
    setRefUsada(referencia);
    setForm(valoresIniciais(referencia));
  }

  if (!aberto) return null;

  const mudar = (chave: keyof Medicoes, valor: string) =>
    setForm((f) => ({
      ...f,
      [chave]: chave === "sintoma_neuro_ocular" ? valor : valor === "" ? (chave === "radiacao_dia_msv" ? null : 0) : Number(valor),
    }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border border-(--borda) bg-(--card) backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-cyan-900/60 px-5 py-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-400">Check-in diário</p>
            <h2 className="text-lg font-semibold text-slate-100">
              Registrar dia {proximoDia} • {nomeAstronauta}
            </h2>
            <p className="text-xs text-slate-400">Ambiente: {ambiente} • valores pré-preenchidos com a sua linha de base</p>
          </div>
          <button onClick={onFechar} className="p-1 text-slate-400 hover:text-white" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          className="p-5"
          onSubmit={(e) => {
            e.preventDefault();
            onRegistrar(form);
          }}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {CAMPOS.map((c) => (
              <label key={c.chave} className="flex flex-col gap-1 text-xs text-slate-400">
                <span>
                  {c.rotulo} {c.unidade && <span className="text-slate-600">({c.unidade})</span>}
                </span>
                <input
                  type="number"
                  step={c.passo}
                  required
                  value={form[c.chave]}
                  onChange={(e) => mudar(c.chave, e.target.value)}
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                />
              </label>
            ))}
            <label className="col-span-2 flex flex-col gap-1 text-xs text-slate-400">
              Sintoma neuro-ocular
              <select
                value={form.sintoma_neuro_ocular}
                onChange={(e) => mudar("sintoma_neuro_ocular", e.target.value)}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
              >
                <option value="Nenhum">Nenhum</option>
                <option value="Leve pressao ocular">Leve pressão ocular</option>
                <option value="Visao turva">Visão turva</option>
              </select>
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-xs text-slate-400">
              <span>
                Dose de radiação do dia <span className="text-slate-600">(mSv, opcional)</span>
              </span>
              <input
                type="number"
                step={0.01}
                placeholder="média dos últimos 7 dias"
                value={form.radiacao_dia_msv ?? ""}
                onChange={(e) => mudar("radiacao_dia_msv", e.target.value)}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
              />
            </label>
          </div>

          {erro && <p className="mt-4 rounded border border-red-800 bg-red-950/50 p-2 text-xs text-red-200">{erro}</p>}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
            <button
              type="button"
              onClick={onSimularNormal}
              disabled={enviando}
              className="rounded border border-slate-600 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            >
              Simular dia normal automaticamente
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={onFechar} className="rounded px-3 py-2 text-xs text-slate-400 hover:text-white">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={enviando}
                className="rounded bg-cyan-500 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
              >
                {enviando ? "Registrando..." : `Registrar dia ${proximoDia}`}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
