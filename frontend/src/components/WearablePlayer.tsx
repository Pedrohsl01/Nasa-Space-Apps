// Live wearable: readings arrive one hour at a time (like a smartwatch). The timeline shows only the
// hours already collected; the rest stay open until the clock advances.
import { useEffect, useState } from "react";
import { FastForward, Pause, Play, Radio, SkipForward, Zap } from "lucide-react";
import { Painel } from "./Painel";
import type { PontoHorario, TelemetriaHoraria } from "../types";

interface WearablePlayerProps {
  dados: TelemetriaHoraria | null; // live state of the day (pontos = collected hours)
  tocando: boolean;
  velocidade: 1 | 2 | 5;
  coletando: boolean;
  erroSync: boolean;
  onTocar: (tocando: boolean) => void;
  onVelocidade: (v: 1 | 2 | 5) => void;
  onAvancar: () => void; // +1h: forces the next reading
  onPico: () => void; // next reading with a simulated acute spike
  className?: string;
}

const ICONE_PERFIL: Record<string, string> = {
  sono: "🌙",
  repouso: "☕",
  trabalho: "🛠️",
  resistido: "🏋️",
  aerobico: "🚴",
  eva: "🧑‍🚀",
  pre_resp: "🫁",
  comunicacao: "📡",
  lazer: "🎧",
};

const NOME_PICO: Record<string, string> = {
  taquicardia: "acute tachycardia",
  dessaturacao: "oxygen desaturation (SpO₂)",
  hipertensao: "hypertensive spike",
  febre: "acute temperature rise",
  estresse_agudo: "acute stress (very low HRV)",
};

type Sinal = {
  chave: keyof PontoHorario;
  rotulo: string;
  unidade: string;
  amplitude: number; // visual micro-oscillation (does not change the data)
  casas: number;
};

const SINAIS: Sinal[] = [
  { chave: "fc_bpm", rotulo: "HR", unidade: "bpm", amplitude: 1.5, casas: 0 },
  { chave: "pa_sistolica", rotulo: "BP", unidade: "mmHg", amplitude: 1.2, casas: 0 },
  { chave: "temperatura_c", rotulo: "Temp.", unidade: "°C", amplitude: 0.04, casas: 1 },
  { chave: "spo2_pct", rotulo: "SpO₂", unidade: "%", amplitude: 0.3, casas: 1 },
  { chave: "hrv_ms", rotulo: "HRV", unidade: "ms", amplitude: 2, casas: 0 },
  { chave: "estresse_wearable", rotulo: "Stress", unidade: "/100", amplitude: 1.5, casas: 0 },
];

const VELOCIDADES: (1 | 2 | 5)[] = [1, 2, 5];

function corSemaforo(n: number, semSinal = false) {
  if (semSinal) return "bg-slate-700/60";
  if (n >= 3) return "bg-red-500";
  if (n === 2) return "bg-amber-500";
  return "bg-emerald-600/70";
}

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

export function WearablePlayer({
  dados,
  tocando,
  velocidade,
  coletando,
  erroSync,
  onTocar,
  onVelocidade,
  onAvancar,
  onPico,
  className = "",
}: WearablePlayerProps) {
  // Visual-only micro-oscillation: makes the "smartwatch" look like a live signal
  const [tique, setTique] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTique((x) => x + 1), 700);
    return () => clearInterval(t);
  }, []);

  const pontos = dados?.pontos ?? [];
  const horaAtual = dados?.hora ?? null;
  // Clicking an already collected hour shows that reading; "back to live" returns to the last one
  const [horaVista, setHoraVista] = useState<number | null>(null);
  useEffect(() => setHoraVista(null), [dados?.dia_missao, dados?.id_astronauta]);
  const vendoPassado = horaVista !== null && horaVista !== horaAtual;
  const ponto = (vendoPassado ? pontos.find((p) => p.hora === horaVista) : dados?.ponto_atual) ?? null;

  const alertasPorSinal = new Map<string, number>();
  ponto?.alertas.forEach((a) => alertasPorSinal.set(a.sinal, Math.max(a.nivel, alertasPorSinal.get(a.sinal) ?? 0)));

  const oscilar = (s: Sinal, i: number) => {
    const v = ponto?.[s.chave];
    if (typeof v !== "number") return "—";
    if (vendoPassado) return v.toFixed(s.casas); // historical reading: exact value
    const ruido = Math.sin(tique * 1.7 + i * 2.3) * s.amplitude;
    return (v + ruido).toFixed(s.casas);
  };

  const botao = "rounded border border-cyan-800 p-1.5 text-cyan-300 hover:bg-cyan-500/15 disabled:opacity-30";
  const textoBotao =
    "flex items-center gap-1 whitespace-nowrap rounded border px-2 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider disabled:opacity-40";
  const fimDoDia = horaAtual !== null && horaAtual >= 23;
  // Day already recorded (before the last one): complete readings, no collection
  const historico = !!dados?.historico;
  const semColeta = !dados || historico;
  // Last dataset day: complete; the next advance starts the first new day at 00:00
  const ultimoDaPlanilha = !!dados && !historico && dados.coleta_ao_vivo === false;

  return (
    <Painel
      titulo="Wearable: live telemetry"
      icone={<Radio className="h-4 w-4" />}
      className={className}
      extra={
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-slate-500">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              erroSync ? "bg-red-500" : coletando ? "animate-ping bg-cyan-400" : tocando ? "animate-pulse bg-green-500" : "bg-slate-500"
            }`}
          />
          {erroSync
            ? "out of sync"
            : historico || ultimoDaPlanilha
              ? "recorded day • 24/24 readings"
              : dados
              ? `${dados.horas_coletadas ?? pontos.length}/24 readings • ${tocando ? "collecting" : "paused"}`
              : "waiting for 1st reading"}
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* Smartwatch controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onTocar(!tocando)}
            disabled={semColeta}
            className="rounded border border-cyan-500/70 bg-cyan-500/15 p-1.5 text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-40"
            aria-label={tocando ? "Pause collection" : "Start automatic collection"}
            title={tocando ? "Pause automatic collection" : `Automatic collection: 1 hour every ${5 / velocidade} s`}
          >
            {tocando ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <div className="flex overflow-hidden rounded border border-cyan-900" role="group" aria-label="Collection speed">
            {VELOCIDADES.map((v) => (
              <button
                key={v}
                onClick={() => onVelocidade(v)}
                aria-pressed={velocidade === v}
                title={`1 hour every ${5 / v} s`}
                className={`px-1.5 py-1 font-mono text-[10px] ${velocidade === v ? "bg-cyan-500/25 text-cyan-100" : "text-slate-400 hover:bg-cyan-500/10"}`}
              >
                {v}x
              </button>
            ))}
          </div>
          <button
            onClick={onAvancar}
            disabled={semColeta || coletando}
            className={botao}
            aria-label="Force the next hour reading"
            title={
              ultimoDaPlanilha
                ? "Starts the next day at 00:00 (records the day for the crew)"
                : fimDoDia
                  ? "The next reading rolls over to the next day (00:00)"
                  : "+1h: force the next reading"
            }
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>
          <span className="rounded border border-cyan-900 bg-slate-950 px-2 py-0.5 font-mono text-lg font-bold text-white" aria-label="Time of the last reading">
            {horaAtual === null ? "--:--" : hh(horaAtual)}
          </span>
        </div>

        {/* Activity of the hour */}
        <div className="flex min-w-48 flex-1 items-center gap-2 rounded border border-slate-800 bg-(--subcard) px-3 py-1">
          <span className="text-xl" aria-hidden="true">{ponto ? ICONE_PERFIL[ponto.perfil] ?? "•" : "•"}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {vendoPassado && <span className="mr-1 font-mono text-[10px] text-amber-300">{ponto?.rotulo} •</span>}
              {ponto?.atividade ?? "—"}
            </p>
            <p className="truncate text-[11px] text-slate-400">{ponto?.descricao}</p>
          </div>
          {ponto && ponto.treino_min > 0 && (
            <span className="ml-auto whitespace-nowrap font-mono text-[10px] text-emerald-300">{ponto.treino_min} min workout</span>
          )}
        </div>
      </div>

      {/* Simulation actions */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button onClick={onAvancar} disabled={semColeta || coletando} className={`${textoBotao} border-cyan-700 text-cyan-200 hover:bg-cyan-500/15`}>
          <FastForward className="h-3 w-3" /> +1h force reading
        </button>
        <button
          onClick={onPico}
          disabled={semColeta || coletando || fimDoDia}
          title="The next reading arrives with a simulated acute spike"
          className={`${textoBotao} border-amber-400/70 text-amber-200 hover:bg-amber-500/15`}
        >
          <Zap className="h-3 w-3" /> Next reading with spike
        </button>
        {historico && (
          <span className="font-mono text-[10px] text-slate-400">
            Day already recorded: 24 readings. Live collection happens on the last mission day.
          </span>
        )}
        {ultimoDaPlanilha && (
          <span className="font-mono text-[10px] text-slate-400">
            Last day in the dataset (complete). Play or +1h starts day {(dados?.dia_missao ?? 0) + 1} at 00:00, hour by hour.
          </span>
        )}
      </div>

      {/* Timeline: only collected hours are colored; the rest of the day stays open */}
      <div className="mt-2 grid gap-0.5" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
        {Array.from({ length: 24 }, (_, h) => {
          const p = pontos.find((x) => x.hora === h);
          const selecionada = p && (vendoPassado ? h === horaVista : h === horaAtual);
          return p ? (
            <button
              key={h}
              onClick={() => setHoraVista(h === horaAtual ? null : h)}
              title={`${p.rotulo} • ${p.atividade}${p.sem_sinal ? " • no signal" : ""}${p.pico_simulado ? " • simulated spike" : ""}`}
              className={`relative h-4 rounded-sm ${corSemaforo(p.semaforo_hora, p.sem_sinal)} ${
                selecionada ? "ring-2 ring-cyan-300 ring-offset-1 ring-offset-[#070d18]" : "opacity-80 hover:opacity-100"
              }`}
              aria-label={`View the ${hh(h)} reading`}
            >
              {p.pico_simulado && <span className="absolute inset-0 flex items-center justify-center text-[9px]">⚡</span>}
            </button>
          ) : (
            <span key={h} title={`${hh(h)} • not collected yet`} className="h-4 rounded-sm border border-dashed border-slate-700/80" />
          );
        })}
      </div>
      <div className="flex justify-between font-mono text-[9px] leading-tight text-slate-600">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:00</span>
      </div>
      {vendoPassado && (
        <button onClick={() => setHoraVista(null)} className="mt-1 font-mono text-[10px] text-cyan-300 hover:underline">
          ← Viewing {hh(horaVista)} • back to live ({horaAtual !== null ? hh(horaAtual) : "—"})
        </button>
      )}

      {/* Vital signs of the reading */}
      <div className="mt-1.5 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {SINAIS.map((s, i) => {
          const nivel = alertasPorSinal.get(s.chave as string) ?? 0;
          const esperado = ponto?.esperado?.[s.chave as string];
          return (
            <div
              key={s.chave as string}
              className={`rounded border px-2 py-1 ${
                nivel >= 3 ? "border-red-500/70 bg-red-500/10" : nivel === 2 ? "border-amber-500/70 bg-amber-500/10" : "border-slate-800 bg-(--subcard)"
              }`}
            >
              <p className="font-mono text-[9px] uppercase tracking-wider text-slate-500">{s.rotulo}</p>
              <p className="font-mono text-lg font-bold leading-tight text-(--dados)">
                {oscilar(s, i)}
                {s.chave === "pa_sistolica" && typeof ponto?.pa_diastolica === "number" && (
                  <span className="text-sm text-slate-300">/{ponto.pa_diastolica}</span>
                )}
                <span className="ml-1 text-[10px] font-normal text-slate-500">{s.unidade}</span>
              </p>
              {esperado !== undefined && <p className="font-mono text-[9px] text-slate-500">expected {esperado}</p>}
            </div>
          );
        })}
      </div>

      {/* Events that modulated the reading (pain, countermeasure, fatigue) */}
      {ponto?.efeitos && ponto.efeitos.length > 0 && (
        <p className="mt-1.5 font-mono text-[10px] text-cyan-200/80">↳ {ponto.efeitos.join(" • ")}</p>
      )}

      {/* Alerts of the reading (spike or swing) */}
      {ponto && (ponto.alertas.length > 0 || ponto.sem_sinal) && (
        <div
          className={`mt-1.5 rounded border px-2 py-1 text-xs ${
            ponto.sem_sinal
              ? "border-slate-700 text-slate-400"
              : ponto.semaforo_hora >= 3
                ? "border-red-500/60 bg-red-500/10 text-red-200"
                : "border-amber-500/60 bg-amber-500/10 text-amber-200"
          }`}
        >
          {ponto.sem_sinal ? (
            <>Wearable has no signal at this time. Check the battery and sensor contact.</>
          ) : (
            <>
              <strong className="font-mono">{ponto.rotulo}</strong>
              {ponto.pico_simulado && <> • simulated spike: {NOME_PICO[ponto.pico_simulado] ?? ponto.pico_simulado}</>} •{" "}
              {ponto.alertas.map((a) => a.texto).join(" • ")}
            </>
          )}
        </div>
      )}
    </Painel>
  );
}
