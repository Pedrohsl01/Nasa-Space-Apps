import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Earth,
  RefreshCw,
  Satellite,
  ShieldAlert,
  Sparkles,
  Trophy,
} from "lucide-react";
import { BodyMap, type RegiaoSelecionada } from "./components/BodyMap";
import { motivosPorZona } from "./components/motivosAlerta";
import { META_TREINO, TendenciaChart } from "./components/TendenciaChart";
import { RegistroModal } from "./components/RegistroModal";
import { SpinoffModal } from "./components/SpinoffModal";
import { DispositivoWidget, TemperaturaExternaWidget } from "./components/Widgets";
import { Painel } from "./components/Painel";
import { GradeLayout } from "./components/GradeLayout";
import { WearablePlayer } from "./components/WearablePlayer";
import { CoachCompacto } from "./components/CoachCompacto";
import { ExamesPanel, PredicaoPanel } from "./components/PaineisAnalise";
import { ProntidaoHUD, type SinalResumo } from "./components/ProntidaoHUD";
import { LocalMissaoWidget } from "./components/LocalMissaoWidget";
import { LogoApp } from "./components/LogoApp";
import { RelatoEnviadoPopup } from "./components/RelatoEnviadoPopup";
import {
  ESTADO_VAZIO,
  XP_RELATO,
  calcularAptidaoEva,
  carregarHud,
  salvarHud,
  type EstadoTripulante,
} from "./components/prontidao";
import { analisarDia, listarAstronautas, registrarDia, telemetriaHoraria } from "./api";
import type { Analise, Astronauta, Desvio, Medicoes, RelatoDesconforto, TelemetriaHoraria } from "./types";

const NOME_AMBIENTE: Record<string, string> = {
  "Estacao Orbital": "Estação Orbital",
  "Transito para Marte": "Trânsito para Marte",
  "Base Marciana": "Base Marciana",
};

const TEMA_AMBIENTE: Record<string, "mars" | "transit" | "station"> = {
  "Base Marciana": "mars",
  "Transito para Marte": "transit",
  "Estacao Orbital": "station",
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
    cyan: "border-cyan-400/70 text-cyan-200 hover:bg-cyan-500/15",
    red: "border-red-400/70 text-red-200 hover:bg-red-500/15",
    emerald: "border-emerald-400/70 text-emerald-200 hover:bg-emerald-500/15",
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
  const [idAstronauta, setIdAstronauta] = useState("AST-01");
  const [diaMissao, setDiaMissao] = useState<number | null>(null);
  const [dados, setDados] = useState<Analise | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Pop-up "dor enviada para a equipe médica" logo depois de salvar um relato
  const [relatoEnviado, setRelatoEnviado] = useState<RelatoDesconforto | null>(null);
  const fecharRelatoEnviado = useCallback(() => setRelatoEnviado(null), []);
  const [regiaoSel, setRegiaoSel] = useState<RegiaoSelecionada | null>(null);

  // Relatos de desconforto por tripulante e dia ({ "AST-01|360": { "vista:regiao": relato } }), salvos no navegador
  const CHAVE_RELATOS = "astrohealth:relatos:v2"; // v2: relatos por tripulante E por dia
  const [relatos, setRelatos] = useState<Record<string, Record<string, RelatoDesconforto>>>(() => {
    try {
      return JSON.parse(localStorage.getItem(CHAVE_RELATOS) ?? "{}");
    } catch {
      return {};
    }
  });
  const atualizarRelatos = (novo: Record<string, Record<string, RelatoDesconforto>>) => {
    setRelatos(novo);
    try {
      localStorage.setItem(CHAVE_RELATOS, JSON.stringify(novo));
    } catch {
      /* navegador sem armazenamento: vale só nesta sessão */
    }
  };
  // HUD gamificado por tripulante: histórico do chat, protocolos aplicados e XP (salvos no navegador)
  const [hud, setHud] = useState<Record<string, EstadoTripulante>>(carregarHud);
  const mudarHud = (id: string, f: (e: EstadoTripulante) => EstadoTripulante) =>
    setHud((atual) => {
      const novo = { ...atual, [id]: f(atual[id] ?? ESTADO_VAZIO) };
      salvarHud(novo);
      return novo;
    });
  const [ganho, setGanho] = useState<{ id: number; texto: string } | null>(null);
  useEffect(() => {
    if (!ganho) return;
    const t = setTimeout(() => setGanho(null), 2600);
    return () => clearTimeout(t);
  }, [ganho]);
  const [modalRegistro, setModalRegistro] = useState(false);
  const [modalSpinoff, setModalSpinoff] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [erroRegistro, setErroRegistro] = useState<string | null>(null);
  // Evita uma segunda chamada logo depois de registrar (a resposta do registro já traz a análise)
  const pularProximaAnalise = useRef(false);

  const astronauta = astronautas.find((a) => a.id_astronauta === idAstronauta);
  const ultimoDia = astronauta?.ultimo_dia ?? 365;
  // Cada dia tem seus próprios relatos: trocar de dia esconde a dor; voltar ao dia mostra de novo
  const chaveRelatos = `${idAstronauta}|${diaMissao}`;
  const relatosAtuais = useMemo(() => relatos[chaveRelatos] ?? {}, [relatos, chaveRelatos]);
  // Trocar de dia ou de tripulante fecha o registro de desconforto aberto
  useEffect(() => setRegiaoSel(null), [chaveRelatos]);
  const listaRelatos = useMemo(() => Object.values(relatosAtuais), [relatosAtuais]);

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

  // Inicialização: tripulação e último dia registrado
  useEffect(() => {
    carregarAstronautas().then((lista) => {
      const primeiro = lista.find((a) => a.id_astronauta === "AST-01") ?? lista[0];
      if (primeiro) {
        setIdAstronauta(primeiro.id_astronauta);
        setDiaMissao(primeiro.ultimo_dia);
      }
    });
  }, [carregarAstronautas]);

  const carregarAnalise = useCallback(
    async (ast: string, dia: number, forcarIa = false, desconfortos: RelatoDesconforto[] = []): Promise<Analise | null> => {
    setCarregando(true);
    try {
      const resp = await analisarDia(ast, dia, forcarIa, desconfortos);
      setDados(resp);
      setBackendOnline(true);
      setErro(null);
      return resp;
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      if (e instanceof TypeError) setBackendOnline(false);
      return null;
    } finally {
      setCarregando(false);
    }
  },
    [],
  );

  // Espera 400 ms sem mudança de dia antes de analisar (cada análise de alerta pode gastar 1 requisição da Groq)
  useEffect(() => {
    if (diaMissao === null) return;
    if (pularProximaAnalise.current) {
      pularProximaAnalise.current = false;
      return;
    }
    // Os desconfortos relatados vão junto: a IA cruza sintomas subjetivos com os sinais vitais
    const t = setTimeout(() => carregarAnalise(idAstronauta, diaMissao, false, listaRelatos), 400);
    return () => clearTimeout(t);
  }, [idAstronauta, diaMissao, carregarAnalise, listaRelatos]);

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
    setRegiaoSel(null); // a região selecionada era do tripulante anterior
    if (a) setDiaMissao(a.ultimo_dia);
  };

  const mudarDia = (delta: number) => {
    if (diaMissao === null) return;
    setDiaMissao(Math.min(ultimoDia, Math.max(1, diaMissao + delta)));
  };


  const executarRegistro = async (opcoes: { medicoes?: Medicoes; simular_anomalia?: boolean }) => {
    setRegistrando(true);
    setErroRegistro(null);
    try {
      const resp = await registrarDia({ id_astronauta: idAstronauta, ...opcoes });
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
  const alertas = useMemo(() => payload?.indicadores_em_alerta ?? {}, [payload]);
  const iaOnline = ia ? ia.fonte_analise === "grok_live" || ia.fonte_analise === "grok_cache" : false;

  // Mapa corporal combina a triagem do dia com o alerta da hora do wearable (ex.: pico simulado)
  const pontoHora = horaria?.dia_missao === diaMissao ? horaria.ponto_atual : null;
  const alertaHora = pontoHora && pontoHora.semaforo_hora > 1 ? pontoHora : null;
  // Motivo de cada parte em alerta (ex.: peito -> "Pressão muito alta"), para os cartões ao lado do corpo
  const motivosMapa = useMemo(
    () =>
      motivosPorZona(
        alertas,
        triagem?.partes_afetadas ?? "nenhuma",
        triagem?.categoria_risco ?? "",
        codigo,
        alertaHora,
      ),
    [alertas, triagem, codigo, alertaHora],
  );

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
      ? { texto: "text-[#EF4444]", borda: "border-[#EF4444]/60", fundo: "bg-[rgba(239,68,68,0.12)]" }
      : codigo === 2
        ? { texto: "text-[#FBBF24]", borda: "border-[#FBBF24]/60", fundo: "bg-[#FBBF24]/10" }
        : { texto: "text-[#34D399]", borda: "border-[#34D399]/50", fundo: "bg-[#34D399]/10" };

  const ambienteDia = payload?.contexto_missao.ambiente ?? "";
  const atrasoSinal =
    ambienteDia === "Estacao Orbital" ? "Comunicação com a Terra quase em tempo real" : "Atraso de sinal com a Terra de até ~20 min por trecho";

  // ---------------- HUD: prontidão, chat de contramedidas e sinais resumidos ----------------
  const estadoHud = hud[idAstronauta] ?? ESTADO_VAZIO;
  const chaveDiaHud = String(diaMissao ?? 0);
  const aplicadasDia = estadoHud.aplicadas[chaveDiaHud] ?? [];
  const nAplicadas = aplicadasDia.length;
  // Aptidão para EVA: recalcula com o wearable da hora, os dados do dia, os alertas ativos,
  // os desconfortos do mapa corporal e as contramedidas aplicadas (todos do tripulante selecionado)
  const prontidao = useMemo(
    () => calcularAptidaoEva({ ponto: pontoHora, tel: tel ?? null, motivos: motivosMapa, relatos: listaRelatos, nAplicadas }),
    [pontoHora, tel, motivosMapa, listaRelatos, nAplicadas],
  );

  const mostrarGanho = (antes: number, depois: number, xpGanho: number) => {
    const delta = depois - antes;
    const xpTexto = `${xpGanho > 0 ? "+" : ""}${xpGanho} XP`;
    const partes = [
      delta !== 0 ? `${delta > 0 ? "+" : ""}${delta}% Prontidão Operacional` : "",
      xpGanho !== 0 ? xpTexto : "",
      delta === 0 && xpGanho > 0 ? "teto da faixa" : "",
    ].filter(Boolean);
    if (!partes.length) return;
    const texto = partes.join(" • ");
    setGanho({ id: Date.now(), texto });
  };

  const valorOu = (v: number | null | undefined, unidade: string) => (v === null || v === undefined ? "—" : `${v}${unidade}`);
  const sinais: SinalResumo[] = tel
    ? [
        { rotulo: "FC", valor: valorOu(pontoHora?.fc_bpm ?? tel.fc_repouso.valor, " bpm"), alerta: codigo > 1 && "fc_repouso" in alertas },
        { rotulo: "SpO₂", valor: valorOu(pontoHora?.spo2_pct, "%") },
        {
          rotulo: "PA",
          valor: `${pontoHora?.pa_sistolica ?? tel.pa_sistolica.valor}/${pontoHora?.pa_diastolica ?? tel.pa_diastolica.valor}`,
          alerta: codigo > 1 && "pressao_arterial" in alertas,
        },
        { rotulo: "Temp", valor: valorOu(pontoHora?.temperatura_c ?? tel.temperatura_c.valor, " °C"), alerta: codigo > 1 && "temperatura_c" in alertas },
        { rotulo: "Sono", valor: `${tel.sono_horas.valor} h`, alerta: codigo > 1 && "sono_horas" in alertas },
      ]
    : [];

  const seletor = "rounded border border-cyan-900 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none";

  return (
    // Tema de cores pelo cenário do dia: Base Marciana, Trânsito para Marte ou Estação Orbital
    <div data-theme={TEMA_AMBIENTE[ambienteDia] ?? "transit"} className="min-h-screen bg-[#03060c] pb-8 text-slate-200 font-sans">
      {/* Vídeo de fundo (Base Marciana em loop): mudo, sem controles, atrás de tudo */}
      <video
        className="pointer-events-none fixed inset-0 h-full w-full object-cover motion-reduce:hidden"
        src="/video/base_marciana_loop.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
      />
      {/* Camada escura por cima do vídeo para manter os painéis legíveis */}
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-[#03060c]/75 via-[#03060c]/65 to-[#03060c]/85" />

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
      <header className="sticky top-0 z-30 border-b border-(--borda) bg-(--card) px-4 py-2 backdrop-blur-md lg:px-6">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-x-4 gap-y-2 xl:flex-nowrap">
          <h1 className="flex items-center gap-2 whitespace-nowrap text-lg font-bold tracking-tight text-white">
            <LogoApp className="h-7 w-7 shrink-0" />
            <span>
              AstroHealth <span className="text-cyan-400">Monitor</span>
            </span>
          </h1>

          {/* Centro: tripulante e status */}
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
        {/* Barra de prontidão gamificada + sinais vitais resumidos */}
        {dados && tel && (
          <div className="mx-auto mt-2 max-w-[1500px] border-t border-(--borda) pt-2">
            <ProntidaoHUD prontidao={prontidao} xp={estadoHud.xp} ganho={ganho} sinais={sinais} />
          </div>
        )}
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
          {/* Coach de exercício (segue a hora do player do wearable) */}
          {horaria?.coach_exercicio && <CoachCompacto className="mt-3" coach={horaria.coach_exercicio} />}
        </Painel>

        {dados && tel && payload && triagem && (
          <GradeLayout>
            {/* ============ WEARABLE 24 H ============ */}
            <div key="wearable">
            <WearablePlayer
              className="h-full"
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
            </div>
            {/* ============ MAPA CORPORAL ============ */}
            <div key="mapa">
            <Painel
              titulo="Mapa corporal"
              icone={<Satellite className="h-4 w-4" />}
              className="h-full"
              extra={<LocalMissaoWidget ambiente={ambienteDia} dia={diaMissao} />}
            >
              {/* Personagem conforme o tripulante: sexo "F" usa o modelo feminino (ex.: Dra. Helena Vance) */}
              <BodyMap
                genero={astronauta?.sexo === "F" ? "F" : "M"}
                motivos={motivosMapa}
                relatos={relatosAtuais}
                selecionada={regiaoSel}
                onSelecionar={setRegiaoSel}
                onSalvarRelato={(relato) => {
                  const chave = `${relato.vista}:${relato.regiaoId}`;
                  const novos = { ...relatosAtuais, [chave]: relato };
                  atualizarRelatos({ ...relatos, [chaveRelatos]: novos });
                  // Relato novo rende XP; mudar a intensidade de um relato só mexe na prontidão
                  const xpRelato = chave in relatosAtuais ? 0 : XP_RELATO;
                  if (xpRelato) mudarHud(idAstronauta, (e) => ({ ...e, xp: e.xp + xpRelato }));
                  mostrarGanho(
                    prontidao.valor,
                    calcularAptidaoEva({ ponto: pontoHora, tel: tel ?? null, motivos: motivosMapa, relatos: Object.values(novos), nAplicadas }).valor,
                    xpRelato,
                  );
                  setRelatoEnviado(relato);
                }}
                onRemoverRelato={(chave) => {
                  const resto = { ...relatosAtuais };
                  delete resto[chave];
                  atualizarRelatos({ ...relatos, [chaveRelatos]: resto });
                }}
              />
              <p className="mt-2 text-center font-mono text-[10px] text-slate-500">Categorias do dia: {triagem.categoria_risco}</p>
              {alertaHora && (
                <p className={`mt-1 text-center font-mono text-[10px] ${alertaHora.semaforo_hora >= 3 ? "text-red-300" : "text-amber-300"}`}>
                  ⚡ Wearable {alertaHora.rotulo}: {alertaHora.pico_simulado ? "pico simulado — " : ""}
                  {alertaHora.alertas.map((a) => a.texto).join(" • ")}
                </p>
              )}
            </Painel>

            </div>

            {/* ============ PROTOCOLO E CONTRAMEDIDAS ============ */}
            <div key="protocolo">
            <Painel
              titulo="Protocolo e contramedidas"
              icone={<Sparkles className="h-4 w-4" />}
              className="flex h-full flex-col"
              extra={
                <div className="flex items-center gap-1.5">
                  {ia && (
                    <span
                      title={ia.fonte_descricao}
                      className={`whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                        iaOnline ? "border-cyan-600/70 text-cyan-300" : "border-slate-600 text-slate-400"
                      }`}
                    >
                      {iaOnline ? "Grok AI" : "Telemetria local"}
                    </span>
                  )}
                  <button
                    onClick={() => diaMissao && carregarAnalise(idAstronauta, diaMissao, true, listaRelatos)}
                    disabled={carregando}
                    className="flex items-center gap-1 rounded border border-cyan-700 px-2 py-1 font-mono text-[10px] uppercase text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${carregando ? "animate-spin" : ""}`} />
                    {carregando ? "Analisando" : "Reanalisar"}
                  </button>
                </div>
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
                  {(ia.tags_acao?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {ia.score_risco !== undefined && ia.score_risco !== null && (
                        <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${corNivel.borda} ${corNivel.texto}`}>
                          {ia.status} • {ia.score_risco}/100
                        </span>
                      )}
                      {ia.tags_acao.map((tag) => (
                        <span key={tag} className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${corNivel.borda} ${corNivel.fundo} ${corNivel.texto}`}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Contramedidas</p>
                    <ol className="mt-1.5 space-y-1.5">
                      {(ia.acao_imediata_astronauta ?? []).map((acao, i) => (
                        <li key={i} className="flex gap-2 rounded border-l-2 border-cyan-400 bg-(--subcard) p-2 text-xs text-slate-200">
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
                <p>Fonte: {ia?.fonte_descricao}</p>
                {dados.uso_groq && (
                  <p>
                    Groq nesta sessão: {dados.uso_groq.chamadas} chamada(s) • {dados.uso_groq.tokens_total} tokens
                    {dados.uso_groq.limites_restantes?.requisicoes_dia_restantes &&
                      ` • restam ${dados.uso_groq.limites_restantes.requisicoes_dia_restantes}/${dados.uso_groq.limites_restantes.requisicoes_dia_limite} hoje`}
                  </p>
                )}
              </div>
            </Painel>
            </div>

            {/* ============ WIDGETS (cada um é um quadro da grade) ============ */}
            <div key="dispositivo" className="flex flex-col">
              <DispositivoWidget />
            </div>
            <div key="temperatura" className="flex flex-col">
              <TemperaturaExternaWidget ambiente={ambienteDia} dia={diaMissao} />
            </div>

            {/* ============ TENDÊNCIA PREDITIVA + EXAMES SUGERIDOS ============ */}
            {/* Protegido: um backend antigo (sem esses blocos) não derruba a tela */}
            <div key="predicao">
              {dados.predicao_tendencia && <PredicaoPanel className="h-full" predicao={dados.predicao_tendencia} />}
            </div>
            <div key="exames">
            <ExamesPanel
              className="h-full"
              exames={(horaria?.dia_missao === diaMissao ? horaria.exames_sugeridos : dados.exames_sugeridos) ?? []}
            />

            </div>

            {/* ============ TENDÊNCIA 7 DIAS ============ */}
            <div key="tendencia">
            <Painel titulo="Tendência — últimos 7 dias" className="flex h-full flex-col">
              <TendenciaChart serie={dados.serie_7_dias} />
            </Painel>

            </div>

            {/* ============ TELEMETRIA (rolável) ============ */}
            {/* self-start: o quadro termina logo depois dos cards (não estica até a altura da Tendência ao lado) */}
            <div key="telemetria" className="self-start">
            <Painel
              titulo="Telemetria vs. linha de base"
              extra={
                <span
                  className={`flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold ${corNivel.borda} ${corNivel.texto}`}
                >
                  {codigo >= 3 ? <ShieldAlert className="h-3 w-3" /> : codigo === 2 ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                  N{codigo}
                </span>
              }
            >
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
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
                            : "border-slate-800 bg-(--subcard)"
                        }`}
                      >
                        <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{c.rotulo}</p>
                        <p className="font-mono text-2xl font-bold leading-none text-(--dados)">
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
                      tel.sintoma_neuro_ocular !== "Nenhum" ? "border-red-500/60 bg-red-500/10 text-red-300" : "border-slate-800 bg-(--subcard) text-slate-400"
                    }`}
                  >
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Sintoma neuro-ocular</p>
                    <p className="mt-1 text-sm">{tel.sintoma_neuro_ocular}</p>
                  </div>
              </div>
            </Painel>

            </div>
          </GradeLayout>
        )}
      </div>

      {/* Aviso de registro: flutuante, some sozinho */}
      {aviso && (
        <div className="fixed right-4 bottom-10 z-40 max-w-md rounded border border-cyan-700 bg-[#06111f]/95 p-3 text-xs text-cyan-100">
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
        ambiente={NOME_AMBIENTE[astronauta?.ambiente_atual ?? ""] ?? astronauta?.ambiente_atual ?? "—"}
        nomeAstronauta={astronauta ? `${astronauta.id_astronauta} • ${astronauta.nome}` : idAstronauta}
        referencia={tel ?? null}
        enviando={registrando}
        erro={erroRegistro}
        onFechar={() => setModalRegistro(false)}
        onRegistrar={(medicoes) => executarRegistro({ medicoes })}
        onSimularNormal={() => executarRegistro({ simular_anomalia: false })}
      />
      <SpinoffModal aberto={modalSpinoff} onFechar={() => setModalSpinoff(false)} />
      <RelatoEnviadoPopup relato={relatoEnviado} onFechar={fecharRelatoEnviado} />
    </div>
  );
}

export default App;
