import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Earth,
  Plus,
  Radio,
  RefreshCw,
  Satellite,
  ShieldAlert,
  Siren,
  Sparkles,
  Trophy,
  Wifi,
  WifiOff,
} from "lucide-react";
import { BodyMap, type Zona } from "./components/BodyMap";
import { RegistroModal } from "./components/RegistroModal";
import { SpinoffModal } from "./components/SpinoffModal";
import { analisarDia, listarAmbientes, listarAstronautas, registrarDia } from "./api";
import type { Analise, Astronauta, Desvio, Medicoes, PontoSerie } from "./types";

const AMBIENTES_PADRAO = ["Estacao Orbital", "Transito para Marte", "Base Marciana"];

const NOME_AMBIENTE: Record<string, string> = {
  "Estacao Orbital": "Estação Orbital",
  "Transito para Marte": "Trânsito para Marte",
  "Base Marciana": "Base Marciana",
};

const NOME_CENARIO: Record<string, string> = {
  sono_isolamento: "sono baixo e humor em queda (isolamento)",
  sans_neuro_ocular: "sintoma neuro-ocular (SANS)",
  febre_infeccao: "febre e FC alta (possível infecção)",
  hipertensao: "pressão arterial elevada",
  sedentarismo: "treino resistido muito abaixo da meta",
  tempestade_solar: "pico de radiação (tempestade solar)",
};

// Cada card de telemetria e a chave correspondente em indicadores_em_alerta (rules em risk_engine.py)
const CARDS: { chave: keyof Analise["telemetria_dia"]; rotulo: string; unidade: string; alerta: string }[] = [
  { chave: "pa_sistolica", rotulo: "PA sistólica", unidade: "mmHg", alerta: "pressao_arterial" },
  { chave: "pa_diastolica", rotulo: "PA diastólica", unidade: "mmHg", alerta: "pressao_arterial" },
  { chave: "fc_repouso", rotulo: "FC repouso", unidade: "bpm", alerta: "fc_repouso" },
  { chave: "glicemia_mg_dl", rotulo: "Glicemia", unidade: "mg/dL", alerta: "glicemia_mg_dl" },
  { chave: "temperatura_c", rotulo: "Temperatura", unidade: "°C", alerta: "temperatura_c" },
  { chave: "sono_horas", rotulo: "Sono", unidade: "h", alerta: "sono_horas" },
  { chave: "treino_resistido_min", rotulo: "Treino resistido", unidade: "min", alerta: "treino_resistido_min" },
  { chave: "humor", rotulo: "Humor", unidade: "/5", alerta: "humor" },
  { chave: "radiacao_acumulada_msv", rotulo: "Radiação acumulada", unidade: "mSv", alerta: "radiacao_acumulada_msv" },
];

const METRICAS_GRAFICO: { chave: string; base?: string; rotulo: string; unidade: string }[] = [
  { chave: "sono_horas", base: "base_sono", rotulo: "Sono", unidade: "h" },
  { chave: "pa_sistolica", base: "base_pa_sistolica", rotulo: "PA sistólica", unidade: "mmHg" },
  { chave: "fc_repouso", base: "base_fc_repouso", rotulo: "FC", unidade: "bpm" },
  { chave: "glicemia_mg_dl", base: "base_glicemia", rotulo: "Glicemia", unidade: "mg/dL" },
  { chave: "temperatura_c", base: "base_temperatura", rotulo: "Temperatura", unidade: "°C" },
  { chave: "treino_resistido_min", rotulo: "Treino", unidade: "min" },
  { chave: "humor", rotulo: "Humor", unidade: "/5" },
];

const META_TREINO = 60; // meta do projeto (min/dia), não critério clínico

function formatarDesvio(d: Desvio) {
  if (d.desvio === null || d.base === null) return null;
  const sinal = d.desvio > 0 ? "+" : "";
  const casas = Number.isInteger(d.base) && Number.isInteger(d.valor) ? 0 : 1;
  return `${sinal}${d.desvio.toFixed(casas)} (${sinal}${d.desvio_pct?.toFixed(0)}%)`;
}

function Painel({ titulo, icone, children, extra, className = "" }: {
  titulo: string;
  icone?: React.ReactNode;
  children: React.ReactNode;
  extra?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`relative rounded-md border border-cyan-900/50 bg-[#070d18]/90 p-4 ${className}`}>
      {/* Cantos estilo console */}
      <span className="pointer-events-none absolute -top-px -left-px h-3 w-3 border-t-2 border-l-2 border-cyan-500/70" />
      <span className="pointer-events-none absolute -bottom-px -right-px h-3 w-3 border-b-2 border-r-2 border-cyan-500/70" />
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
          {icone}
          {titulo}
        </h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

export function App() {
  const [astronautas, setAstronautas] = useState<Astronauta[]>([]);
  const [ambientes, setAmbientes] = useState<string[]>(AMBIENTES_PADRAO);
  const [idAstronauta, setIdAstronauta] = useState("AST-01");
  const [diaMissao, setDiaMissao] = useState<number | null>(null);
  const [ambienteRegistro, setAmbienteRegistro] = useState("Base Marciana");
  const [dados, setDados] = useState<Analise | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [zona, setZona] = useState<Zona | null>("cabeca");
  const [metrica, setMetrica] = useState("sono_horas");
  const [modalRegistro, setModalRegistro] = useState(false);
  const [modalSpinoff, setModalSpinoff] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [erroRegistro, setErroRegistro] = useState<string | null>(null);
  // Evita uma segunda chamada logo depois de registrar (a resposta do registro já traz a análise)
  const pularProximaAnalise = useRef(false);

  const astronauta = astronautas.find((a) => a.id_astronauta === idAstronauta);
  const ultimoDia = astronauta?.ultimo_dia ?? 365;

  const carregarAstronautas = useCallback(async () => {
    try {
      const lista = await listarAstronautas();
      setAstronautas(lista);
      setBackendOnline(true);
      return lista;
    } catch {
      setBackendOnline(false);
      setErro("Backend fora do ar em localhost:8000. Inicie o uvicorn (veja o README).");
      return [];
    }
  }, []);

  // Inicialização: tripulação, ambientes e último dia registrado
  useEffect(() => {
    carregarAstronautas().then((lista) => {
      const primeiro = lista.find((a) => a.id_astronauta === "AST-01") ?? lista[0];
      if (primeiro) {
        setIdAstronauta(primeiro.id_astronauta);
        setDiaMissao(primeiro.ultimo_dia);
        setAmbienteRegistro(primeiro.ambiente_atual);
      }
    });
    listarAmbientes().then(setAmbientes).catch(() => undefined);
  }, [carregarAstronautas]);

  const carregarAnalise = useCallback(async (ast: string, dia: number, forcarIa = false) => {
    setCarregando(true);
    try {
      setDados(await analisarDia(ast, dia, forcarIa));
      setBackendOnline(true);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      if (e instanceof TypeError) setBackendOnline(false);
    } finally {
      setCarregando(false);
    }
  }, []);

  // Espera o slider parar 400 ms antes de analisar (cada análise de alerta pode gastar 1 requisição da Groq)
  useEffect(() => {
    if (diaMissao === null) return;
    if (pularProximaAnalise.current) {
      pularProximaAnalise.current = false;
      return;
    }
    const t = setTimeout(() => carregarAnalise(idAstronauta, diaMissao), 400);
    return () => clearTimeout(t);
  }, [idAstronauta, diaMissao, carregarAnalise]);

  const trocarAstronauta = (id: string) => {
    const a = astronautas.find((x) => x.id_astronauta === id);
    setIdAstronauta(id);
    if (a) {
      setDiaMissao(a.ultimo_dia);
      setAmbienteRegistro(a.ambiente_atual);
    }
  };

  const executarRegistro = async (opcoes: { medicoes?: Medicoes; simular_anomalia?: boolean }) => {
    setRegistrando(true);
    setErroRegistro(null);
    try {
      const resp = await registrarDia({ id_astronauta: idAstronauta, ambiente: ambienteRegistro, ...opcoes });
      pularProximaAnalise.current = true;
      setDados(resp);
      setDiaMissao(resp.dia_registrado ?? null);
      await carregarAstronautas();
      setModalRegistro(false);
      const triagem = resp.payload_compacto.triagem_python;
      const origem =
        resp.origem === "manual"
          ? "registrado manualmente"
          : resp.cenario_simulado
            ? `simulado com anomalia: ${NOME_CENARIO[resp.cenario_simulado] ?? resp.cenario_simulado}`
            : "simulado (dia normal)";
      setAviso(`Dia ${resp.dia_registrado} ${origem} e salvo na base • Nível ${triagem.codigo_semaforo} (${triagem.categoria_risco})`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (modalRegistro) setErroRegistro(msg);
      else setErro(msg);
    } finally {
      setRegistrando(false);
    }
  };

  const payload = dados?.payload_compacto;
  const triagem = payload?.triagem_python;
  const codigo = triagem?.codigo_semaforo ?? 1;
  const ia = dados?.orientacao_ia;
  const tel = dados?.telemetria_dia;
  const alertas = payload?.indicadores_em_alerta ?? {};
  const iaOnline = ia ? ia.fonte_analise.startsWith("Copiloto IA") : false;

  // Gamificação: metas diárias simples e transparentes (metas do projeto, não clínicas)
  const missoes = useMemo(() => {
    if (!tel) return [];
    return [
      { nome: "Sono reparador", ok: tel.sono_horas.valor >= (tel.sono_horas.base ?? 7) - 0.5, dica: "≥ base − 0,5 h" },
      { nome: "Treino resistido", ok: tel.treino_resistido_min.valor >= META_TREINO, dica: `≥ ${META_TREINO} min` },
      { nome: "Humor positivo", ok: tel.humor.valor >= 4, dica: "≥ 4 de 5" },
      { nome: "Sinais na linha de base", ok: codigo === 1, dica: "semáforo verde" },
    ];
  }, [tel, codigo]);
  const xp = missoes.filter((m) => m.ok).length * 25;
  const sequencia = useMemo(() => {
    // Dias seguidos (até 7, terminando no dia atual) cumprindo sono + treino
    const serie = [...(dados?.serie_7_dias ?? [])].reverse();
    let n = 0;
    for (const p of serie) {
      if (p.sono_horas >= p.base_sono - 0.5 && p.treino_resistido_min >= META_TREINO) n += 1;
      else break;
    }
    return n;
  }, [dados]);

  const metricaAtual = METRICAS_GRAFICO.find((m) => m.chave === metrica) ?? METRICAS_GRAFICO[0];
  const serie: PontoSerie[] = dados?.serie_7_dias ?? [];
  const baseGrafico = metricaAtual.base && serie.length ? serie[serie.length - 1][metricaAtual.base] : undefined;

  const corNivel =
    codigo >= 3
      ? { texto: "text-red-300", borda: "border-red-500/60", fundo: "bg-red-500/10" }
      : codigo === 2
        ? { texto: "text-amber-300", borda: "border-amber-500/60", fundo: "bg-amber-500/10" }
        : { texto: "text-green-300", borda: "border-green-500/50", fundo: "bg-green-500/10" };

  const ambienteDia = payload?.contexto_missao.ambiente ?? "";
  const atrasoSinal =
    ambienteDia === "Estacao Orbital" ? "Comunicação com a Terra quase em tempo real" : "Atraso de sinal com a Terra de até ~20 min por trecho";

  return (
    <div className="min-h-screen bg-[#03060c] text-slate-200 font-sans">
      {/* Fundo com grade sutil */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(56,189,248,1) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,1) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Aviso obrigatório */}
      <div className="relative border-b border-amber-700/40 bg-amber-950/50 px-4 py-1.5 text-center text-[11px] text-amber-200">
        Protótipo de hackathon (NASA Space Apps 2026) • DADOS SIMULADOS • Não é dispositivo médico e não substitui avaliação profissional.
      </div>

      {/* ============ HEADER ============ */}
      <header className="relative border-b border-cyan-900/50 bg-[#050a14]/95 px-4 py-3 lg:px-6">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-3">
          <div className="mr-auto">
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-cyan-400">
              <Radio className="h-3.5 w-3.5" /> Mission Control • NASA HRP
            </p>
            <h1 className="text-xl font-bold tracking-tight text-white">
              AstroHealth <span className="text-cyan-400">Monitor</span>
            </h1>
          </div>

          <label className="flex flex-col gap-0.5">
            <span className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Tripulante</span>
            <select
              value={idAstronauta}
              onChange={(e) => trocarAstronauta(e.target.value)}
              className="rounded border border-cyan-900 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
            >
              {(astronautas.length ? astronautas : [{ id_astronauta: "AST-01", nome: "", sexo: "" } as Astronauta, { id_astronauta: "AST-02", nome: "", sexo: "" } as Astronauta]).map((a) => (
                <option key={a.id_astronauta} value={a.id_astronauta}>
                  {a.id_astronauta}
                  {a.nome ? ` • ${a.nome}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-0.5">
            <span className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Ambiente do próximo registro</span>
            <select
              value={ambienteRegistro}
              onChange={(e) => setAmbienteRegistro(e.target.value)}
              className="rounded border border-cyan-900 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
            >
              {ambientes.map((a) => (
                <option key={a} value={a}>
                  {NOME_AMBIENTE[a] ?? a}
                </option>
              ))}
            </select>
          </label>

          {/* Status Offline-First */}
          <div className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-wider">
            <span className={`flex items-center gap-1.5 ${backendOnline === false ? "text-red-400" : "text-green-400"}`}>
              <Cpu className="h-3.5 w-3.5" />
              Motor local {backendOnline === false ? "offline" : "online"}
              <span className={`h-1.5 w-1.5 rounded-full ${backendOnline === false ? "bg-red-500" : "bg-green-500 animate-pulse"}`} />
            </span>
            <span className={`flex items-center gap-1.5 ${iaOnline ? "text-cyan-300" : "text-slate-400"}`}>
              {iaOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {iaOnline ? "IA Groq conectada" : "Offline-First: orientação local"}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setErroRegistro(null);
                setModalRegistro(true);
              }}
              disabled={!backendOnline || registrando}
              className="flex items-center gap-1.5 rounded border border-cyan-500/70 bg-cyan-500/15 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" /> Registrar Próximo Dia
            </button>
            <button
              onClick={() => executarRegistro({ simular_anomalia: true })}
              disabled={!backendOnline || registrando}
              className="flex items-center gap-1.5 rounded border border-red-500/70 bg-red-500/15 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-red-200 hover:bg-red-500/25 disabled:opacity-40"
            >
              <Siren className="h-4 w-4" /> {registrando ? "Simulando..." : "Simular Dia de Alerta"}
            </button>
            <button
              onClick={() => setModalSpinoff(true)}
              className="flex items-center gap-1.5 rounded border border-emerald-600/60 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/10"
            >
              <Earth className="h-4 w-4" /> Spinoff
            </button>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-[1500px] px-4 py-5 lg:px-6">
        {erro && <div className="mb-4 rounded border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">{erro}</div>}
        {aviso && (
          <div className="mb-4 flex items-center justify-between rounded border border-cyan-800 bg-cyan-950/40 p-3 text-sm text-cyan-100">
            <span>{aviso}</span>
            <button onClick={() => setAviso(null)} className="text-xs text-cyan-400 hover:text-white">fechar</button>
          </div>
        )}

        {/* ============ LINHA DO TEMPO ============ */}
        <div className="mb-5 flex flex-wrap items-center gap-4 rounded-md border border-cyan-900/50 bg-[#070d18]/90 px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => diaMissao && setDiaMissao(Math.max(1, diaMissao - 1))}
              className="rounded border border-slate-700 p-1 text-slate-300 hover:bg-slate-800"
              aria-label="Dia anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-mono text-xs uppercase tracking-widest text-slate-500">Sol / Dia</span>
            <span className="w-14 text-center font-mono text-2xl font-bold text-cyan-300">{diaMissao ?? "—"}</span>
            <button
              onClick={() => diaMissao && setDiaMissao(Math.min(ultimoDia, diaMissao + 1))}
              className="rounded border border-slate-700 p-1 text-slate-300 hover:bg-slate-800"
              aria-label="Próximo dia"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <input
            type="range"
            min={1}
            max={ultimoDia}
            value={diaMissao ?? 1}
            onChange={(e) => setDiaMissao(Number(e.target.value))}
            className="min-w-40 flex-1 accent-cyan-400"
            aria-label="Dia da missão"
          />
          <span className="font-mono text-[11px] text-slate-500">último registro: dia {ultimoDia}</span>
          {payload && (
            <span className="flex items-center gap-1.5 rounded border border-slate-700 px-2 py-1 font-mono text-[11px] text-slate-300">
              <Satellite className="h-3.5 w-3.5 text-cyan-400" /> {NOME_AMBIENTE[ambienteDia] ?? ambienteDia}
            </span>
          )}
          {triagem && (
            <span className={`flex items-center gap-1.5 rounded border px-3 py-1 font-mono text-xs font-bold ${corNivel.borda} ${corNivel.fundo} ${corNivel.texto}`}>
              {codigo >= 3 ? <ShieldAlert className="h-4 w-4" /> : codigo === 2 ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              NÍVEL {codigo} — {codigo >= 3 ? "CRÍTICO" : codigo === 2 ? "ATENÇÃO" : "NOMINAL"}
            </span>
          )}
        </div>

        {dados && tel && payload && triagem && (
          <>
            {/* ============ GAMIFICAÇÃO ============ */}
            <Painel
              titulo="Missões do dia"
              icone={<Trophy className="h-4 w-4" />}
              className="mb-5"
              extra={<span className="font-mono text-[10px] text-slate-500">metas do projeto, não clínicas</span>}
            >
              <div className="flex flex-wrap items-center gap-4">
                <div className="min-w-56 flex-1">
                  <div className="mb-1 flex justify-between font-mono text-[11px] text-slate-400">
                    <span>XP do dia</span>
                    <span className="text-cyan-300">{xp} / 100</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-700"
                      style={{ width: `${xp}%` }}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {missoes.map((m) => (
                    <span
                      key={m.nome}
                      title={m.dica}
                      className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] ${
                        m.ok ? "border-emerald-600/60 bg-emerald-500/10 text-emerald-300" : "border-slate-700 text-slate-500"
                      }`}
                    >
                      {m.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="h-3.5 w-3.5 rounded-full border border-slate-600" />}
                      {m.nome}
                    </span>
                  ))}
                </div>
                <span className="font-mono text-[11px] text-amber-300">🔥 {sequencia} dia(s) seguidos com sono + treino</span>
              </div>
            </Painel>

            <main className="grid grid-cols-1 gap-5 xl:grid-cols-12">
              {/* ============ MAPA CORPORAL ============ */}
              <Painel titulo="Mapa corporal" icone={<Satellite className="h-4 w-4" />} className="xl:col-span-3">
                <BodyMap
                  partesAfetadas={triagem.partes_afetadas}
                  codigoSemaforo={codigo}
                  zonaSelecionada={zona}
                  onSelectZona={setZona}
                />
                <p className="mt-2 font-mono text-[10px] text-slate-500">Categorias: {triagem.categoria_risco}</p>
              </Painel>

              <div className="flex flex-col gap-5 xl:col-span-5">
                {/* ============ TELEMETRIA ============ */}
                <Painel
                  titulo="Telemetria vs. linha de base"
                  extra={<span className="font-mono text-[10px] text-slate-500">valor do dia • desvio de base_*</span>}
                >
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {CARDS.map((c) => {
                      const d = tel[c.chave] as Desvio;
                      const emAlerta = codigo > 1 && c.alerta in alertas;
                      const desvio = formatarDesvio(d);
                      return (
                        <div
                          key={c.chave}
                          className={`rounded border p-2.5 ${
                            emAlerta ? (codigo >= 3 ? "border-red-500/60 bg-red-500/10" : "border-amber-500/60 bg-amber-500/10") : "border-slate-800 bg-slate-900/60"
                          }`}
                        >
                          <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{c.rotulo}</p>
                          <p className="mt-0.5 font-mono text-lg font-bold text-white">
                            {d.valor}
                            <span className="ml-1 text-[11px] font-normal text-slate-500">{c.unidade}</span>
                          </p>
                          <p className="font-mono text-[10px] text-slate-400">
                            {d.base !== null ? (
                              <>
                                {c.chave === "treino_resistido_min" ? "meta" : "base"} {d.base} •{" "}
                                <span className={emAlerta ? (codigo >= 3 ? "text-red-300" : "text-amber-300") : "text-slate-300"}>{desvio}</span>
                              </>
                            ) : c.chave === "radiacao_acumulada_msv" ? (
                              <>Δ7d: {String((alertas.radiacao_acumulada_msv as { incremento_7_dias_msv?: number } | undefined)?.incremento_7_dias_msv ?? "—")} mSv</>
                            ) : (
                              <>média 7d: {dados.medias_7_dias.humor}</>
                            )}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <p className={`mt-2 font-mono text-[11px] ${tel.sintoma_neuro_ocular !== "Nenhum" ? "text-red-300" : "text-slate-500"}`}>
                    Sintoma neuro-ocular: {tel.sintoma_neuro_ocular}
                  </p>
                </Painel>

                {/* ============ TENDÊNCIA 7 DIAS ============ */}
                <Painel titulo="Tendência — últimos 7 dias" className="flex-1">
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {METRICAS_GRAFICO.map((m) => (
                      <button
                        key={m.chave}
                        onClick={() => setMetrica(m.chave)}
                        className={`rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wider ${
                          metrica === m.chave ? "bg-cyan-500/25 text-cyan-200 border border-cyan-500/60" : "border border-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {m.rotulo}
                      </button>
                    ))}
                  </div>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={serie} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                        <CartesianGrid stroke="#0f2a44" strokeDasharray="3 3" />
                        <XAxis dataKey="dia_missao" stroke="#475569" fontSize={11} tickLine={false} />
                        <YAxis stroke="#475569" fontSize={11} tickLine={false} domain={["auto", "auto"]} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#020617", borderColor: "#155e75", fontSize: 12 }}
                          labelFormatter={(v) => `Dia ${v}`}
                          formatter={(v) => [`${v} ${metricaAtual.unidade}`, metricaAtual.rotulo]}
                        />
                        {baseGrafico !== undefined && (
                          <ReferenceLine
                            y={baseGrafico}
                            stroke="#22c55e"
                            strokeDasharray="5 5"
                            label={{ value: `base ${baseGrafico}`, fill: "#22c55e", fontSize: 10, position: "insideTopRight" }}
                          />
                        )}
                        {metrica === "treino_resistido_min" && (
                          <ReferenceLine y={META_TREINO} stroke="#22c55e" strokeDasharray="5 5" label={{ value: "meta 60", fill: "#22c55e", fontSize: 10, position: "insideTopRight" }} />
                        )}
                        <Line type="monotone" dataKey={metrica} stroke="#22d3ee" strokeWidth={2.5} dot={{ r: 3, fill: "#22d3ee" }} activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Painel>
              </div>

              {/* ============ PROTOCOLO / CONTRAMEDIDAS ============ */}
              <Painel
                titulo="Protocolo e contramedidas"
                icone={<Sparkles className="h-4 w-4" />}
                className="xl:col-span-4"
                extra={
                  <button
                    onClick={() => diaMissao && carregarAnalise(idAstronauta, diaMissao, true)}
                    disabled={carregando}
                    className="flex items-center gap-1 rounded border border-cyan-700 px-2 py-1 font-mono text-[10px] uppercase text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${carregando ? "animate-spin" : ""}`} />
                    {carregando ? "Analisando" : "Reanalisar com IA"}
                  </button>
                }
              >
                {/* Escalonamento: local vs. Terra */}
                <div className={`mb-4 rounded border p-3 ${corNivel.borda} ${corNivel.fundo}`}>
                  <p className={`flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider ${corNivel.texto}`}>
                    {codigo >= 3 ? <Earth className="h-4 w-4" /> : codigo === 2 ? <Satellite className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                    {codigo >= 3
                      ? "Escalonar: cirurgiões de voo na Terra"
                      : codigo === 2
                        ? "Gerenciar a bordo: tripulação"
                        : "Nominal: sem escalonamento"}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">{atrasoSinal}</p>
                </div>

                {ia && (
                  <div className="space-y-4 text-sm">
                    <p className="font-semibold leading-snug text-white">{ia.resumo_alerta}</p>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Por que isso acontece no espaço?</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-300">{ia.explicacao_fisiologica}</p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Contramedidas</p>
                      <ol className="mt-1.5 space-y-1.5">
                        {(ia.acao_imediata_astronauta ?? []).map((acao, i) => (
                          <li key={i} className="flex gap-2 rounded border-l-2 border-cyan-400 bg-slate-900/70 p-2 text-xs text-slate-200">
                            <span className="font-mono text-cyan-400">{String(i + 1).padStart(2, "0")}</span>
                            {acao}
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div className="rounded border border-slate-800 bg-slate-950 p-3 text-xs">
                      <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">Nível de escalonamento</p>
                      <p className="text-slate-200">{ia.nivel_escalonamento}</p>
                    </div>
                  </div>
                )}

                <div className="mt-4 space-y-0.5 border-t border-slate-800 pt-3 font-mono text-[10px] text-slate-500">
                  <p>Fonte: {ia?.fonte_analise}</p>
                  {dados.uso_groq && (
                    <p>
                      Groq nesta sessão: {dados.uso_groq.chamadas} chamada(s) • {dados.uso_groq.tokens_total} tokens
                      {dados.uso_groq.limites_restantes?.requisicoes_dia_restantes &&
                        ` • restam ${dados.uso_groq.limites_restantes.requisicoes_dia_restantes}/${dados.uso_groq.limites_restantes.requisicoes_dia_limite} hoje`}
                    </p>
                  )}
                </div>
              </Painel>
            </main>
          </>
        )}
      </div>

      <RegistroModal
        aberto={modalRegistro}
        proximoDia={ultimoDia + 1}
        ambiente={NOME_AMBIENTE[ambienteRegistro] ?? ambienteRegistro}
        nomeAstronauta={astronauta ? `${astronauta.id_astronauta} • ${astronauta.nome}` : idAstronauta}
        referencia={tel ?? null}
        enviando={registrando}
        erro={erroRegistro}
        onFechar={() => setModalRegistro(false)}
        onRegistrar={(medicoes) => executarRegistro({ medicoes })}
        onSimularNormal={() => executarRegistro({ simular_anomalia: false })}
      />
      <SpinoffModal aberto={modalSpinoff} onFechar={() => setModalSpinoff(false)} />
    </div>
  );
}

export default App;
