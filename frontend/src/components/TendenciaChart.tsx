import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PontoSerie } from "../types";

export const META_TREINO = 60; // meta do projeto (min/dia), não critério clínico

const METRICAS: { chave: string; base?: string; rotulo: string; unidade: string }[] = [
  { chave: "sono_horas", base: "base_sono", rotulo: "Sono", unidade: "h" },
  { chave: "pa_sistolica", base: "base_pa_sistolica", rotulo: "PA sist.", unidade: "mmHg" },
  { chave: "pa_diastolica", base: "base_pa_diastolica", rotulo: "PA diast.", unidade: "mmHg" },
  { chave: "fc_repouso", base: "base_fc_repouso", rotulo: "FC", unidade: "bpm" },
  { chave: "glicemia_mg_dl", base: "base_glicemia", rotulo: "Glicemia", unidade: "mg/dL" },
  { chave: "temperatura_c", base: "base_temperatura", rotulo: "Temp.", unidade: "°C" },
  { chave: "treino_resistido_min", rotulo: "Treino", unidade: "min" },
  { chave: "humor", rotulo: "Humor", unidade: "/5" },
  { chave: "radiacao_acumulada_msv", rotulo: "Radiação", unidade: "mSv" },
];

// Faixa fisiológica ideal (referência geral para adultos em repouso; a confirmar com a equipe médica).
// A comparação principal continua sendo com a linha de base individual (base_*).
const FAIXA_IDEAL: Record<string, { min: number; max: number; rotulo: string }> = {
  fc_repouso: { min: 55, max: 85, rotulo: "55–85 bpm" },
  sono_horas: { min: 7, max: 9, rotulo: "7–9 h" },
};

// Gráfico de tendência dos últimos 7 dias com a linha de base (base_*) ou meta do projeto
export function TendenciaChart({ serie }: { serie: PontoSerie[] }) {
  const [metrica, setMetrica] = useState("sono_horas");
  const atual = METRICAS.find((m) => m.chave === metrica) ?? METRICAS[0];
  const base = atual.base && serie.length ? serie[serie.length - 1][atual.base] : undefined;
  const faixa = FAIXA_IDEAL[metrica];

  // Mín/Máx do período e eixo Y que sempre mostra a faixa ideal inteira
  const valores = serie.map((p) => p[metrica]).filter((v): v is number => typeof v === "number");
  const minimo = valores.length ? Math.min(...valores) : undefined;
  const maximo = valores.length ? Math.max(...valores) : undefined;
  const casas = valores.some((v) => !Number.isInteger(v)) ? 1 : 0;
  const limites = [...valores, ...(faixa ? [faixa.min, faixa.max] : []), ...(typeof base === "number" ? [base] : [])];
  const margem = limites.length ? Math.max(0.5, (Math.max(...limites) - Math.min(...limites)) * 0.12) : 1;
  const dominio: [number, number] | ["auto", "auto"] = limites.length
    ? [Number((Math.min(...limites) - margem).toFixed(1)), Number((Math.max(...limites) + margem).toFixed(1))]
    : ["auto", "auto"];

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {METRICAS.map((m) => (
          <button
            key={m.chave}
            onClick={() => setMetrica(m.chave)}
            className={`rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wider ${
              metrica === m.chave
                ? "border border-cyan-500/60 bg-cyan-500/25 text-cyan-200"
                : "border border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            {m.rotulo}
          </button>
        ))}
        {/* Rótulo da faixa ideal no canto superior direito */}
        {faixa && (
          <span
            title="Referência geral para adultos em repouso (a confirmar). A comparação principal é com a sua linha de base."
            className="ml-auto rounded border border-green-700/60 bg-green-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-green-300"
          >
            Faixa ideal {faixa.rotulo}
          </span>
        )}
      </div>

      <div className="min-h-56 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={serie} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#0f2a44" strokeDasharray="3 3" />
            <XAxis dataKey="dia_missao" stroke="#475569" fontSize={11} tickLine={false} />
            <YAxis stroke="#475569" fontSize={11} tickLine={false} domain={dominio} allowDataOverflow />
            {/* Faixa verde translúcida da zona fisiológica ideal */}
            {faixa && (
              <ReferenceArea y1={faixa.min} y2={faixa.max} fill="#22c55e" fillOpacity={0.12} stroke="#22c55e" strokeOpacity={0.25} ifOverflow="extendDomain" />
            )}
            <Tooltip
              contentStyle={{ backgroundColor: "#020617", borderColor: "#155e75", fontSize: 12 }}
              labelFormatter={(v) => `Dia ${v}`}
              formatter={(v) => [`${v} ${atual.unidade}`, atual.rotulo]}
            />
            {base !== undefined && (
              <ReferenceLine
                y={base}
                stroke="#22c55e"
                strokeDasharray="5 5"
                label={{ value: `base ${base}`, fill: "#22c55e", fontSize: 10, position: "insideTopRight" }}
              />
            )}
            {metrica === "treino_resistido_min" && (
              <ReferenceLine
                y={META_TREINO}
                stroke="#22c55e"
                strokeDasharray="5 5"
                label={{ value: `meta ${META_TREINO}`, fill: "#22c55e", fontSize: 10, position: "insideTopRight" }}
              />
            )}
            <Line type="monotone" dataKey={metrica} stroke="#22d3ee" strokeWidth={2.5} dot={{ r: 3, fill: "#22d3ee" }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* Mín e Máx do período, com unidade */}
      {minimo !== undefined && maximo !== undefined && (
        <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-400">
          <span>
            Mín <strong className="text-slate-200">{minimo.toFixed(casas)} {atual.unidade}</strong>
          </span>
          <span>
            Máx <strong className="text-slate-200">{maximo.toFixed(casas)} {atual.unidade}</strong>
          </span>
        </div>
      )}
    </div>
  );
}
