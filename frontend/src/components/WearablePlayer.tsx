// Wearable ao vivo: as leituras chegam uma hora por vez (como um smartwatch). A linha do tempo mostra só as
// horas já coletadas; as demais ficam em aberto até o relógio avançar.
import { useEffect, useState } from "react";
import { FastForward, Pause, Play, Radio, SkipForward, Zap } from "lucide-react";
import { Painel } from "./Painel";
import type { PontoHorario, TelemetriaHoraria } from "../types";

interface WearablePlayerProps {
  dados: TelemetriaHoraria | null; // estado ao vivo do dia (pontos = horas coletadas)
  tocando: boolean;
  velocidade: 1 | 2 | 5;
  coletando: boolean;
  erroSync: boolean;
  onTocar: (tocando: boolean) => void;
  onVelocidade: (v: 1 | 2 | 5) => void;
  onAvancar: () => void; // +1h: força a próxima leitura
  onPico: () => void; // próxima leitura com pico agudo simulado
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
  // Micro-oscilação só visual: deixa o "smartwatch" com cara de sinal ao vivo
  const [tique, setTique] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTique((x) => x + 1), 700);
    return () => clearInterval(t);
  }, []);

  const pontos = dados?.pontos ?? [];
  const horaAtual = dados?.hora ?? null;
  // Clicar numa hora já coletada mostra aquela leitura; "Ao vivo" volta para a última
  const [horaVista, setHoraVista] = useState<number | null>(null);
  useEffect(() => setHoraVista(null), [dados?.dia_missao, dados?.id_astronauta]);
  const vendoPassado = horaVista !== null && horaVista !== horaAtual;
  const ponto = (vendoPassado ? pontos.find((p) => p.hora === horaVista) : dados?.ponto_atual) ?? null;

  const alertasPorSinal = new Map<string, number>();
  ponto?.alertas.forEach((a) => alertasPorSinal.set(a.sinal, Math.max(a.nivel, alertasPorSinal.get(a.sinal) ?? 0)));

  const oscilar = (s: Sinal, i: number) => {
    const v = ponto?.[s.chave];
    if (typeof v !== "number") return "—";
    if (vendoPassado) return v.toFixed(s.casas); // leitura histórica: valor exato
    const ruido = Math.sin(tique * 1.7 + i * 2.3) * s.amplitude;
    return (v + ruido).toFixed(s.casas);
  };

  const botao = "rounded border border-cyan-800 p-1.5 text-cyan-300 hover:bg-cyan-500/15 disabled:opacity-30";
  const textoBotao =
    "flex items-center gap-1 whitespace-nowrap rounded border px-2 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider disabled:opacity-40";
  const fimDoDia = horaAtual !== null && horaAtual >= 23;
  // Dia já registrado (anterior ao último): leituras completas, sem coleta
  const historico = !!dados?.historico;
  const semColeta = !dados || historico;
  // Último dia da planilha: completo; o próximo avanço começa o primeiro dia novo às 00:00
  const ultimoDaPlanilha = !!dados && !historico && dados.coleta_ao_vivo === false;

  return (
    <Painel
      titulo="Wearable — telemetria ao vivo"
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
            ? "sem sincronia"
            : historico || ultimoDaPlanilha
              ? "dia registrado • 24/24 leituras"
              : dados
              ? `${dados.horas_coletadas ?? pontos.length}/24 leituras • ${tocando ? "coletando" : "pausado"}`
              : "aguardando 1ª leitura"}
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* Controles do smartwatch */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onTocar(!tocando)}
            disabled={semColeta}
            className="rounded border border-cyan-500/70 bg-cyan-500/15 p-1.5 text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-40"
            aria-label={tocando ? "Pausar coleta" : "Iniciar coleta automática"}
            title={tocando ? "Pausar coleta automática" : `Coleta automática: 1 hora a cada ${5 / velocidade} s`}
          >
            {tocando ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <div className="flex overflow-hidden rounded border border-cyan-900" role="group" aria-label="Velocidade da coleta">
            {VELOCIDADES.map((v) => (
              <button
                key={v}
                onClick={() => onVelocidade(v)}
                aria-pressed={velocidade === v}
                title={`1 hora a cada ${5 / v} s`}
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
            aria-label="Forçar leitura da próxima hora"
            title={
              ultimoDaPlanilha
                ? "Começa o próximo dia às 00:00 (registra o dia para a tripulação)"
                : fimDoDia
                  ? "Próxima leitura vira o dia (00:00 do dia seguinte)"
                  : "+1h: forçar a próxima leitura"
            }
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>
          <span className="rounded border border-cyan-900 bg-slate-950 px-2 py-0.5 font-mono text-lg font-bold text-white" aria-label="Hora da última leitura">
            {horaAtual === null ? "--:--" : hh(horaAtual)}
          </span>
        </div>

        {/* Atividade da hora */}
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
            <span className="ml-auto whitespace-nowrap font-mono text-[10px] text-emerald-300">{ponto.treino_min} min treino</span>
          )}
        </div>
      </div>

      {/* Ações de simulação */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button onClick={onAvancar} disabled={semColeta || coletando} className={`${textoBotao} border-cyan-700 text-cyan-200 hover:bg-cyan-500/15`}>
          <FastForward className="h-3 w-3" /> +1h forçar leitura
        </button>
        <button
          onClick={onPico}
          disabled={semColeta || coletando || fimDoDia}
          title="A próxima leitura chega com um pico agudo simulado"
          className={`${textoBotao} border-amber-400/70 text-amber-200 hover:bg-amber-500/15`}
        >
          <Zap className="h-3 w-3" /> Próxima leitura com pico
        </button>
        {historico && (
          <span className="font-mono text-[10px] text-slate-400">
            Dia já registrado: 24 leituras. A coleta ao vivo acontece no último dia da missão.
          </span>
        )}
        {ultimoDaPlanilha && (
          <span className="font-mono text-[10px] text-slate-400">
            Último dia da planilha (completo). Play ou +1h começa o dia {(dados?.dia_missao ?? 0) + 1} às 00:00, hora a hora.
          </span>
        )}
      </div>

      {/* Linha do tempo: só horas coletadas têm cor; o resto do dia fica em aberto */}
      <div className="mt-2 grid gap-0.5" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
        {Array.from({ length: 24 }, (_, h) => {
          const p = pontos.find((x) => x.hora === h);
          const selecionada = p && (vendoPassado ? h === horaVista : h === horaAtual);
          return p ? (
            <button
              key={h}
              onClick={() => setHoraVista(h === horaAtual ? null : h)}
              title={`${p.rotulo} • ${p.atividade}${p.sem_sinal ? " • sem sinal" : ""}${p.pico_simulado ? " • pico simulado" : ""}`}
              className={`relative h-4 rounded-sm ${corSemaforo(p.semaforo_hora, p.sem_sinal)} ${
                selecionada ? "ring-2 ring-cyan-300 ring-offset-1 ring-offset-[#070d18]" : "opacity-80 hover:opacity-100"
              }`}
              aria-label={`Ver leitura das ${hh(h)}`}
            >
              {p.pico_simulado && <span className="absolute inset-0 flex items-center justify-center text-[9px]">⚡</span>}
            </button>
          ) : (
            <span key={h} title={`${hh(h)} • ainda não coletado`} className="h-4 rounded-sm border border-dashed border-slate-700/80" />
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
          ← Vendo {hh(horaVista)} • voltar ao vivo ({horaAtual !== null ? hh(horaAtual) : "—"})
        </button>
      )}

      {/* Sinais vitais da leitura */}
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

      {/* Eventos que modularam a leitura (dor, contramedida, fadiga) */}
      {ponto?.efeitos && ponto.efeitos.length > 0 && (
        <p className="mt-1.5 font-mono text-[10px] text-cyan-200/80">↳ {ponto.efeitos.join(" • ")}</p>
      )}

      {/* Alertas da leitura (pico ou oscilação) */}
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
