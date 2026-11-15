import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Earth,
  RefreshCw,
  Satellite,
  ShieldAlert,
  Sparkles,
  Trophy,
} from "lucide-react";
import { BodyMap, type Zona } from "./components/BodyMap";
import { META_TREINO, TendenciaChart } from "./components/TendenciaChart";
import { RegistroModal } from "./components/RegistroModal";
import { SpinoffModal } from "./components/SpinoffModal";
import { DispositivoWidget, RelogioWidget, TemperaturaExternaWidget } from "./components/Widgets";
import { Painel } from "./components/Painel";
import { WearablePlayer } from "./components/WearablePlayer";
import { CoachPanel, ExamesPanel, PredicaoPanel } from "./components/PaineisAnalise";
import { analisarDia, listarAmbientes, listarAstronautas, registrarDia, telemetriaHoraria } from "./api";
import type { Analise, Astronauta, Desvio, Medicoes, TelemetriaHoraria } from "./types";

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

// Cada card de telemetria e a chave correspondente em indicadores_em_alerta (regras em risk_engine.py)
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

const ALTURA_CARD = 92; // px — a grade mostra 2 linhas e meia de cards; o resto aparece rolando

function formatarDesvio(d: Desvio) {
  if (d.desvio === null || d.base === null) return null;
  const sinal = d.desvio > 0 ? "+" : "";
  const casas = Number.isInteger(d.base) && Number.isInteger(d.valor) ? 0 : 1;
  return `${sinal}${d.desvio.toFixed(casas)} (${sinal}${d.desvio_pct?.toFixed(0)}%)`;
}

// Botão do header: borda fina e brilho suave, mesmo visual para os quatro
function BotaoTopo({ children, onClick, disabled, cor }: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  cor: "cyan" | "red" | "emerald";
}) {
  const estilos = {
    cyan: "border-cyan-400/70 text-cyan-200 hover:bg-cyan-500/15 shadow-[0_0_10px_rgba(34,211,238,0.25)]",
    red: "border-red-400/70 text-red-200 hover:bg-red-500/15 shadow-[0_0_10px_rgba(248,113,113,0.25)]",
    emerald: "border-emerald-400/70 text-emerald-200 hover:bg-emerald-500/15 shadow-[0_0_10px_rgba(52,211,153,0.25)]",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`whitespace-nowrap rounded border bg-transparent px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition disabled:opacity-40 ${estilos[cor]}`}
    >
      {children}
    </button>
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
  const [zona, setZona] = useState<Zona | null>("peito");
  const [modalRegistro, setModalRegistro] = useState(false);
  const [modalSpinoff, setModalSpinoff] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [erroRegistro, setErroRegistro] = useState<string | null>(null);
  const listaTelemetria = useRef<HTMLDivElement>(null);
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
      setErro("Backend fora do ar em localhost:8000. Inicie o uvicorn na porta 8000.");
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

  // Espera 400 ms sem mudança de dia antes de analisar (cada análise de alerta pode gastar 1 requisição da Groq)
  useEffect(() => {
    if (diaMissao === null) return;
    if (pularProximaAnalise.current) {
      pularProximaAnalise.current = false;
      return;
    }
    const t = setTimeout(() => carregarAnalise(idAstronauta, diaMissao), 400);
    return () => clearTimeout(t);
  }, [idAstronauta, diaMissao, carregarAnalise]);

  // ---------------- Wearable 24 h: relógio virtual, play/pause e picos simulados ----------------
  const [horaVirtual, setHoraVirtual] = useState(() => new Date().getHours());
  const [tocando, setTocando] = useState(false);
  const [picosPorDia, setPicosPorDia] = useState<Record<string, number[]>>({});
  const [horaria, setHoraria] = useState<TelemetriaHoraria | null>(null);
  const [carregandoHoraria, setCarregandoHoraria] = useState(false);
  const chaveDia = `${idAstronauta}-${diaMissao}`;
  const picos = useMemo(() => picosPorDia[chaveDia] ?? [], [picosPorDia, chaveDia]);

  useEffect(() => {
    if (diaMissao === null) return;
    let cancelado = false;
    setCarregandoHoraria(true);
    const t = setTimeout(() => {
      telemetriaHoraria(idAstronauta, diaMissao, horaVirtual, picos)
        .then((r) => !cancelado && setHoraria(r))
        .catch(() => !cancelado && setHoraria(null))
        .finally(() => !cancelado && setCarregandoHoraria(false));
    }, 120);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [idAstronauta, diaMissao, horaVirtual, picos]);

  // Play: avança 1 hora a cada 1,5 s e para às 23:00
  useEffect(() => {
    if (!tocando) return;
    if (horaVirtual >= 23) {
      setTocando(false);
      return;
    }
    const t = setTimeout(() => setHoraVirtual((h) => Math.min(23, h + 1)), 1500);
    return () => clearTimeout(t);
  }, [tocando, horaVirtual]);

  const simularPico = () =>
    setPicosPorDia((atual) => ({ ...atual, [chaveDia]: [...new Set([...(atual[chaveDia] ?? []), horaVirtual])] }));

  // Avisos somem sozinhos depois de alguns segundos
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 7000);
    return () => clearTimeout(t);
  }, [aviso]);

  const trocarAstronauta = (id: string) => {
    const a = astronautas.find((x) => x.id_astronauta === id);
    setIdAstronauta(id);
    if (a) {
      setDiaMissao(a.ultimo_dia);
      setAmbienteRegistro(a.ambiente_atual);
    }
  };

  const mudarDia = (delta: number) => {
    if (diaMissao === null) return;
    setDiaMissao(Math.min(ultimoDia, Math.max(1, diaMissao + delta)));
  };

  const rolarTelemetria = (direcao: 1 | -1) =>
    listaTelemetria.current?.scrollBy({ top: direcao * (ALTURA_CARD + 10), behavior: "smooth" });

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
      const triagemNova = resp.payload_compacto.triagem_python;
      const origem =
        resp.origem === "manual"
          ? "registrado manualmente"
          : resp.cenario_simulado
            ? `simulado com anomalia: ${NOME_CENARIO[resp.cenario_simulado] ?? resp.cenario_simulado}`
            : "simulado (dia normal)";
      setAviso(`Dia ${resp.dia_registrado} ${origem} e salvo na base • Nível ${triagemNova.codigo_semaforo} (${triagemNova.categoria_risco})`);
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

  // Mapa corporal combina a triagem do dia com o alerta da hora do wearable (ex.: pico simulado)
  const pontoHora = horaria?.dia_missao === diaMissao ? horaria.ponto_atual : null;
  const alertaHora = pontoHora && pontoHora.semaforo_hora > 1 ? pontoHora : null;
  const partesMapa = useMemo(() => {
    const dia = (triagem?.partes_afetadas ?? "nenhuma").split(";").filter((p) => p && p !== "nenhuma");
    const hora = alertaHora ? alertaHora.partes_afetadas.split(";").filter((p) => p && p !== "nenhuma") : [];
    const todas = [...new Set([...dia, ...hora])];
    return todas.length ? todas.join(";") : "nenhuma";
  }, [triagem, alertaHora]);
  const codigoMapa = Math.max(codigo, alertaHora?.semaforo_hora ?? 1);

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

  const corNivel =
    codigo >= 3
      ? { texto: "text-red-300", borda: "border-red-500/60", fundo: "bg-red-500/10" }
      : codigo === 2
        ? { texto: "text-amber-300", borda: "border-amber-500/60", fundo: "bg-amber-500/10" }
        : { texto: "text-green-300", borda: "border-green-500/50", fundo: "bg-green-500/10" };

  const ambienteDia = payload?.contexto_missao.ambiente ?? "";
  const atrasoSinal =
    ambienteDia === "Estacao Orbital" ? "Comunicação com a Terra quase em tempo real" : "Atraso de sinal com a Terra de até ~20 min por trecho";

  const seletor = "rounded border border-cyan-900 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none";

  return (
    <div className="min-h-screen bg-[#03060c] pb-8 text-slate-200 font-sans">
      {/* Fundo com grade sutil */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(56,189,248,1) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,1) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* ============ HEADER (uma linha) ============ */}
      <header className="relative border-b border-cyan-900/50 bg-[#050a14]/95 px-4 py-2 lg:px-6">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-x-4 gap-y-2 xl:flex-nowrap">
          <h1 className="whitespace-nowrap text-lg font-bold tracking-tight text-white">
            AstroHealth <span className="text-cyan-400">Monitor</span>
          </h1>

          {/* Centro: tripulante, ambiente e status */}
          <div className="flex items-center gap-2">
            <select
              value={idAstronauta}
              onChange={(e) => trocarAstronauta(e.target.value)}
              className={seletor}
              aria-label="Tripulante"
              title="Tripulante"
            >
              {(astronautas.length
                ? astronautas
                : ([{ id_astronauta: "AST-01", nome: "" }, { id_astronauta: "AST-02", nome: "" }] as Astronauta[])
              ).map((a) => (
                <option key={a.id_astronauta} value={a.id_astronauta}>
                  {a.id_astronauta}
                  {a.nome ? ` • ${a.nome}` : ""}
                </option>
              ))}
            </select>
            <select
              value={ambienteRegistro}
              onChange={(e) => setAmbienteRegistro(e.target.value)}
              className={seletor}
              aria-label="Ambiente do próximo registro"
              title="Ambiente do próximo registro"
            >
              {ambientes.map((a) => (
                <option key={a} value={a}>
                  {NOME_AMBIENTE[a] ?? a}
                </option>
              ))}
            </select>
            <span
              title={iaOnline ? "IA Groq conectada" : "Offline-First: orientação gerada localmente"}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-wider ${
                backendOnline === false ? "border-red-800 text-red-400" : "border-green-900 text-green-400"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${backendOnline === false ? "bg-red-500" : "animate-pulse bg-green-500"}`} />
              Motor local {backendOnline === false ? "offline" : "online"}
              <span className={iaOnline ? "text-cyan-300" : "text-slate-500"}>• {iaOnline ? "IA" : "Local"}</span>
            </span>
          </div>

          {/* Direita: quatro botões compactos */}
          <div className="flex items-center gap-2">
            <BotaoTopo
              cor="cyan"
              disabled={!backendOnline || registrando}
              onClick={() => {
                setErroRegistro(null);
                setModalRegistro(true);
              }}
            >
              + Registrar próximo dia
            </BotaoTopo>
            <BotaoTopo cor="red" disabled={!backendOnline || registrando} onClick={() => executarRegistro({ simular_anomalia: true })}>
              🚨 {registrando ? "Simulando..." : "Simular dia de alerta"}
            </BotaoTopo>
            <BotaoTopo cor="emerald" onClick={() => setModalSpinoff(true)}>
              🌀 Spinoff
            </BotaoTopo>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-[1500px] px-4 py-4 lg:px-6">
        {erro && <div className="mb-4 rounded border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">{erro}</div>}

        {/* ============ MISSÕES DO DIA (com contador de dias à direita) ============ */}
        <Painel titulo="Missões do dia" icone={<Trophy className="h-4 w-4" />} className="mb-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-40 max-w-md flex-1">
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
                  title={`${m.dica} (meta do projeto, não clínica)`}
                  className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] ${
                    m.ok ? "border-emerald-600/60 bg-emerald-500/10 text-emerald-300" : "border-slate-700 text-slate-500"
                  }`}
                >
                  {m.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="h-3.5 w-3.5 rounded-full border border-slate-600" />}
                  {m.nome}
                </span>
              ))}
            </div>

            {/* Seletor compacto de dia: setas + número + trilha */}
            <div className="ml-auto w-64 rounded border border-cyan-800/60 bg-[#020611] px-3 py-2">
              <div className="flex items-center justify-end gap-2">
                <span className="mr-auto font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Dia da missão</span>
                <button
                  onClick={() => mudarDia(-1)}
                  disabled={!diaMissao || diaMissao <= 1}
                  className="rounded bg-slate-800/80 p-0.5 text-slate-300 hover:bg-cyan-500/20 hover:text-cyan-200 disabled:opacity-30"
                  aria-label="Dia anterior"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="w-10 text-center font-mono text-xl font-bold leading-none text-white">{diaMissao ?? "—"}</span>
                <button
                  onClick={() => mudarDia(1)}
                  disabled={!diaMissao || diaMissao >= ultimoDia}
                  className="rounded bg-slate-800/80 p-0.5 text-slate-300 hover:bg-cyan-500/20 hover:text-cyan-200 disabled:opacity-30"
                  aria-label="Próximo dia"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <input
                type="range"
                min={1}
                max={ultimoDia}
                value={diaMissao ?? 1}
                onChange={(e) => setDiaMissao(Number(e.target.value))}
                className="trilha-dia mt-2 w-full"
                aria-label="Dia da missão"
                style={{ ["--progresso" as string]: `${(((diaMissao ?? 1) - 1) / Math.max(1, ultimoDia - 1)) * 100}%` }}
              />
              <div className="mt-0.5 flex justify-between font-mono text-[9px] text-slate-500">
                <span>Dia 1</span>
                <span>Último registro: dia {ultimoDia}</span>
              </div>
            </div>
          </div>
        </Painel>

        {dados && tel && payload && triagem && (
          <main className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* ============ WEARABLE 24 H + COACH ============ */}
            <WearablePlayer
              className="lg:col-span-8"
              dados={horaria}
              hora={horaVirtual}
              tocando={tocando}
              carregando={carregandoHoraria}
              onHora={(h) => {
                setTocando(false);
                setHoraVirtual(h);
              }}
              onTocar={(t) => {
                if (t && horaVirtual >= 23) setHoraVirtual(0);
                setTocando(t);
              }}
              onPico={simularPico}
            />
            {horaria?.coach_exercicio ? (
              <CoachPanel className="lg:col-span-4" coach={horaria.coach_exercicio} />
            ) : (
              <div className="lg:col-span-4" />
            )}

            {/* ============ MAPA CORPORAL ============ */}
            <Painel
              titulo="Mapa corporal"
              icone={<Satellite className="h-4 w-4" />}
              className="lg:col-span-6"
              extra={<span className="font-mono text-[10px] text-slate-500">{NOME_AMBIENTE[ambienteDia] ?? ambienteDia}</span>}
            >
              <BodyMap partesAfetadas={partesMapa} codigoSemaforo={codigoMapa} zonaSelecionada={zona} onSelectZona={setZona} />
              <p className="mt-2 text-center font-mono text-[10px] text-slate-500">Categorias do dia: {triagem.categoria_risco}</p>
              {alertaHora && (
                <p className={`mt-1 text-center font-mono text-[10px] ${alertaHora.semaforo_hora >= 3 ? "text-red-300" : "text-amber-300"}`}>
                  ⚡ Wearable {alertaHora.rotulo}: {alertaHora.pico_simulado ? "pico simulado — " : ""}
                  {alertaHora.alertas.map((a) => a.texto).join(" • ")}
                </p>
              )}
            </Painel>

            {/* ============ SUPERIOR DIREITA: PROTOCOLO E CONTRAMEDIDAS ============ */}
            <Painel
              titulo="Protocolo e contramedidas"
              icone={<Sparkles className="h-4 w-4" />}
              className="flex flex-col lg:col-span-3"
              extra={
                <button
                  onClick={() => diaMissao && carregarAnalise(idAstronauta, diaMissao, true)}
                  disabled={carregando}
                  className="flex items-center gap-1 rounded border border-cyan-700 px-2 py-1 font-mono text-[10px] uppercase text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${carregando ? "animate-spin" : ""}`} />
                  {carregando ? "Analisando" : "Reanalisar"}
                </button>
              }
            >
              {/* Escalonamento: local vs. Terra */}
              <div className={`mb-4 rounded border p-3 ${corNivel.borda} ${corNivel.fundo}`}>
                <p className={`flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider ${corNivel.texto}`}>
                  {codigo >= 3 ? <Earth className="h-4 w-4" /> : codigo === 2 ? <Satellite className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  {codigo >= 3 ? "Escalonar: cirurgiões de voo na Terra" : codigo === 2 ? "Gerenciar a bordo: tripulação" : "Nominal: sem escalonamento"}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">{atrasoSinal}</p>
              </div>

              {ia && (
                <div className="flex flex-1 flex-col gap-4 text-sm">
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
                  <div className="mt-auto rounded border border-slate-800 bg-slate-950 p-3 text-xs">
                    <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">Nível de escalonamento</p>
                    <p className="text-slate-200">{ia.nivel_escalonamento}</p>
                  </div>
                </div>
              )}

              <div className="mt-3 space-y-0.5 border-t border-slate-800 pt-2 font-mono text-[10px] text-slate-500">
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
            {/* ============ SUPERIOR, EXTREMA DIREITA: WIDGETS ============ */}
            <div className="flex flex-col gap-3 lg:col-span-3">
              <DispositivoWidget />
              <RelogioWidget />
              <TemperaturaExternaWidget ambiente={ambienteDia} dia={diaMissao} />
            </div>

            {/* ============ TENDÊNCIA PREDITIVA + EXAMES SUGERIDOS ============ */}
            {/* Protegido: um backend antigo (sem esses blocos) não derruba a tela */}
            {dados.predicao_tendencia && <PredicaoPanel className="lg:col-span-6" predicao={dados.predicao_tendencia} />}
            <ExamesPanel
              className="lg:col-span-6"
              exames={(horaria?.dia_missao === diaMissao ? horaria.exames_sugeridos : dados.exames_sugeridos) ?? []}
            />

            {/* ============ INFERIOR ESQUERDA: TENDÊNCIA 7 DIAS ============ */}
            <Painel titulo="Tendência — últimos 7 dias" className="flex flex-col lg:col-span-6">
              <TendenciaChart serie={dados.serie_7_dias} />
            </Painel>

            {/* ============ INFERIOR DIREITA: TELEMETRIA (rolável) ============ */}
            <Painel
              titulo="Telemetria vs. linha de base"
              className="lg:col-span-6"
              extra={
                <span
                  className={`flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold ${corNivel.borda} ${corNivel.texto}`}
                >
                  {codigo >= 3 ? <ShieldAlert className="h-3 w-3" /> : codigo === 2 ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                  N{codigo}
                </span>
              }
            >
              <div className="flex gap-2">
                <div
                  ref={listaTelemetria}
                  className="rolagem-fina grid flex-1 auto-rows-min grid-cols-2 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-3"
                  style={{ height: ALTURA_CARD * 2.6 + 10 * 2 }}
                >
                  {CARDS.map((c) => {
                    const d = tel[c.chave] as Desvio;
                    const emAlerta = codigo > 1 && c.alerta in alertas;
                    const desvio = formatarDesvio(d);
                    return (
                      <div
                        key={c.chave}
                        style={{ height: ALTURA_CARD }}
                        className={`flex flex-col justify-between rounded border p-2.5 ${
                          emAlerta
                            ? codigo >= 3
                              ? "border-red-500/60 bg-red-500/10"
                              : "border-amber-500/60 bg-amber-500/10"
                            : "border-slate-800 bg-slate-900/60"
                        }`}
                      >
                        <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{c.rotulo}</p>
                        <p className="font-mono text-2xl font-bold leading-none text-white">
                          {d.valor}
                          <span className="ml-1.5 text-xs font-normal text-slate-500">{c.unidade}</span>
                        </p>
                        <p className="font-mono text-[10px] text-slate-400">
                          {d.base !== null ? (
                            <>
                              {c.chave === "treino_resistido_min" ? "meta" : "base"} {d.base} •{" "}
                              <span className={emAlerta ? (codigo >= 3 ? "text-red-300" : "text-amber-300") : "text-slate-300"}>{desvio}</span>
                            </>
                          ) : c.chave === "radiacao_acumulada_msv" ? (
                            <>
                              Δ7d:{" "}
                              {String((alertas.radiacao_acumulada_msv as { incremento_7_dias_msv?: number } | undefined)?.incremento_7_dias_msv ?? "—")} mSv
                            </>
                          ) : (
                            <>média 7d: {dados.medias_7_dias.humor}</>
                          )}
                        </p>
                      </div>
                    );
                  })}
                  <div
                    style={{ height: ALTURA_CARD }}
                    className={`flex flex-col justify-between rounded border p-2.5 font-mono text-[11px] ${
                      tel.sintoma_neuro_ocular !== "Nenhum" ? "border-red-500/60 bg-red-500/10 text-red-300" : "border-slate-800 bg-slate-900/60 text-slate-400"
                    }`}
                  >
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Sintoma neuro-ocular</p>
                    <p className="mt-1 text-sm">{tel.sintoma_neuro_ocular}</p>
                  </div>
                </div>

                {/* Trilho com setas ▲ ▼ */}
                <div className="flex flex-col items-center justify-between">
                  <button onClick={() => rolarTelemetria(-1)} className="rounded p-0.5 text-cyan-500/70 hover:text-cyan-300" aria-label="Rolar para cima">
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-px flex-1 bg-cyan-900/60" />
                  <button onClick={() => rolarTelemetria(1)} className="rounded p-0.5 text-cyan-500/70 hover:text-cyan-300" aria-label="Rolar para baixo">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </Painel>

          </main>
        )}
      </div>

      {/* Aviso de registro: flutuante, some sozinho */}
      {aviso && (
        <div className="fixed right-4 bottom-10 z-40 max-w-md rounded border border-cyan-700 bg-[#06111f]/95 p-3 text-xs text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.2)]">
          <div className="flex items-start gap-3">
            <span className="flex-1">{aviso}</span>
            <button onClick={() => setAviso(null)} className="text-cyan-400 hover:text-white" aria-label="Fechar aviso">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Aviso obrigatório: rodapé fino fixo, sem ocupar espaço no topo */}
      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-amber-900/40 bg-[#0b0803]/95 px-4 py-1 text-center text-[10px] text-amber-200/80">
        Protótipo de hackathon (NASA Space Apps 2026) • DADOS SIMULADOS • Não é dispositivo médico e não substitui avaliação profissional.
      </footer>

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
