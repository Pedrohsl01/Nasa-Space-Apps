import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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

// Gráfico de tendência dos últimos 7 dias com a linha de base (base_*) ou meta do projeto
export function TendenciaChart({ serie }: { serie: PontoSerie[] }) {
  const [metrica, setMetrica] = useState("sono_horas");
  const atual = METRICAS.find((m) => m.chave === metrica) ?? METRICAS[0];
  const base = atual.base && serie.length ? serie[serie.length - 1][atual.base] : undefined;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap gap-1.5">
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
      </div>

      <div className="min-h-56 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={serie} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#0f2a44" strokeDasharray="3 3" />
            <XAxis dataKey="dia_missao" stroke="#475569" fontSize={11} tickLine={false} />
            <YAxis stroke="#475569" fontSize={11} tickLine={false} domain={["auto", "auto"]} />
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
    </div>
  );
}
