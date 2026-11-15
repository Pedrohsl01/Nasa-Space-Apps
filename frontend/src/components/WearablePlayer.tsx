import { useEffect, useState } from "react";
import { Pause, Play, Radio, SkipBack, SkipForward, Zap } from "lucide-react";
import { Painel } from "./Painel";
import type { PontoHorario, TelemetriaHoraria } from "../types";

interface WearablePlayerProps {
  dados: TelemetriaHoraria | null;
  hora: number;
  tocando: boolean;
  carregando: boolean;
  onHora: (hora: number) => void;
  onTocar: (tocando: boolean) => void;
  onPico: () => void;
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
  taquicardia: "taquicardia aguda",
  dessaturacao: "queda de saturação (SpO₂)",
  hipertensao: "pico hipertensivo",
  febre: "elevação aguda de temperatura",
  estresse_agudo: "estresse agudo (HRV muito baixa)",
};

type Sinal = {
  chave: keyof PontoHorario;
  rotulo: string;
  unidade: string;
  amplitude: number; // micro-oscilação visual (não altera o dado)
  casas: number;
};

const SINAIS: Sinal[] = [
  { chave: "fc_bpm", rotulo: "FC", unidade: "bpm", amplitude: 1.5, casas: 0 },
  { chave: "pa_sistolica", rotulo: "PA", unidade: "mmHg", amplitude: 1.2, casas: 0 },
  { chave: "temperatura_c", rotulo: "Temp.", unidade: "°C", amplitude: 0.04, casas: 1 },
  { chave: "spo2_pct", rotulo: "SpO₂", unidade: "%", amplitude: 0.3, casas: 1 },
  { chave: "hrv_ms", rotulo: "HRV", unidade: "ms", amplitude: 2, casas: 0 },
  { chave: "estresse_wearable", rotulo: "Estresse", unidade: "/100", amplitude: 1.5, casas: 0 },
];

function corSemaforo(n: number, semSinal = false) {
  if (semSinal) return "bg-slate-700/60";
  if (n >= 3) return "bg-red-500";
  if (n === 2) return "bg-amber-500";
  return "bg-emerald-600/70";
}

export function WearablePlayer({ dados, hora, tocando, carregando, onHora, onTocar, onPico, className = "" }: WearablePlayerProps) {
  // Micro-oscilação só visual: deixa o "smartwatch" com cara de sinal ao vivo
  const [tique, setTique] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTique((x) => x + 1), 700);
    return () => clearInterval(t);
  }, []);

  const ponto = dados?.pontos[hora] ?? null;
  const alertasPorSinal = new Map<string, number>();
  ponto?.alertas.forEach((a) => alertasPorSinal.set(a.sinal, Math.max(a.nivel, alertasPorSinal.get(a.sinal) ?? 0)));
  const jaTemPico = !!ponto?.pico_simulado;

  const oscilar = (s: Sinal, i: number) => {
    const v = ponto?.[s.chave];
    if (typeof v !== "number") return "—";
    const ruido = Math.sin(tique * 1.7 + i * 2.3) * s.amplitude;
    return (v + ruido).toFixed(s.casas);
  };

  const botao = "rounded border border-cyan-800 p-1.5 text-cyan-300 hover:bg-cyan-500/15 disabled:opacity-30";

  return (
    <Painel
      titulo="Wearable — telemetria 24 h"
      icone={<Radio className="h-4 w-4" />}
      className={className}
      extra={
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-slate-500">
          <span className={`h-1.5 w-1.5 rounded-full ${ponto?.sem_sinal ? "bg-slate-500" : "animate-pulse bg-green-500"}`} />
          {ponto?.sem_sinal ? "sem sinal" : ponto?.ao_vivo ? `leitura ao vivo ${ponto.lido_em}` : "ao vivo (simulado)"}
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* Controles do relógio virtual */}
        <div className="flex items-center gap-1.5">
          <button onClick={() => onHora(Math.max(0, hora - 1))} disabled={hora <= 0} className={botao} aria-label="Hora anterior">
            <SkipBack className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onTocar(!tocando)}
            className="rounded border border-cyan-500/70 bg-cyan-500/15 p-1.5 text-cyan-200 hover:bg-cyan-500/25"
            aria-label={tocando ? "Pausar" : "Reproduzir"}
          >
            {tocando ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button onClick={() => onHora(Math.min(23, hora + 1))} disabled={hora >= 23} className={botao} aria-label="Próxima hora">
            <SkipForward className="h-3.5 w-3.5" />
          </button>
          <select
            value={hora}
            onChange={(e) => onHora(Number(e.target.value))}
            className="rounded border border-cyan-900 bg-slate-950 px-2 py-1 font-mono text-lg font-bold text-white focus:border-cyan-500 focus:outline-none"
            aria-label="Hora do relógio virtual"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </div>

        {/* Atividade atual da rotina */}
        <div className="flex min-w-48 flex-1 items-center gap-2 rounded border border-slate-800 bg-(--subcard) px-3 py-1">
          <span className="text-xl" aria-hidden="true">{ponto ? ICONE_PERFIL[ponto.perfil] ?? "•" : "•"}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{ponto?.atividade ?? "—"}</p>
            <p className="truncate text-[11px] text-slate-400">{ponto?.descricao}</p>
          </div>
          {ponto && ponto.treino_min > 0 && (
            <span className="ml-auto whitespace-nowrap font-mono text-[10px] text-emerald-300">{ponto.treino_min} min treino</span>
          )}
        </div>

        <button
          onClick={onPico}
          disabled={!ponto || jaTemPico || carregando}
          className="flex items-center gap-1.5 whitespace-nowrap rounded border border-amber-400/70 px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-200 hover:bg-amber-500/15 disabled:opacity-40"
        >
          <Zap className="h-3.5 w-3.5" /> Simular pico wearable
        </button>
      </div>

      {/* Linha do tempo de 24 h: cor = semáforo da hora */}
      <div className="mt-2 grid gap-0.5" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
        {(dados?.pontos ?? Array.from({ length: 24 }, () => null)).map((p, h) => (
          <button
            key={h}
            onClick={() => onHora(h)}
            title={p ? `${p.rotulo} • ${p.atividade}${p.sem_sinal ? " • sem sinal" : ""}${p.pico_simulado ? " • pico simulado" : ""}` : ""}
            className={`relative h-4 rounded-sm ${p ? corSemaforo(p.semaforo_hora, p.sem_sinal) : "bg-slate-800"} ${
              h === hora ? "ring-2 ring-cyan-300 ring-offset-1 ring-offset-[#070d18]" : "opacity-80 hover:opacity-100"
            }`}
            aria-label={`Ir para ${String(h).padStart(2, "0")}:00`}
          >
            {p?.pico_simulado && <span className="absolute inset-0 flex items-center justify-center text-[9px]">⚡</span>}
          </button>
        ))}
      </div>
      <div className="flex justify-between font-mono text-[9px] leading-tight text-slate-600">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:00</span>
      </div>

      {/* Sinais vitais do wearable na hora selecionada */}
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
              {esperado !== undefined && <p className="font-mono text-[9px] text-slate-500">esperado {esperado}</p>}
            </div>
          );
        })}
      </div>

      {/* Alertas da hora (pico ou oscilação) */}
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
            <>Wearable sem sinal neste horário — verifique bateria e contato do sensor.</>
          ) : (
            <>
              <strong className="font-mono">{ponto.rotulo}</strong>
              {ponto.pico_simulado && <> • pico simulado: {NOME_PICO[ponto.pico_simulado] ?? ponto.pico_simulado}</>} •{" "}
              {ponto.alertas.map((a) => a.texto).join(" • ")}
            </>
          )}
        </div>
      )}
    </Painel>
  );
}
