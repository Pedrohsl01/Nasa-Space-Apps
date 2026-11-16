import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Earth,
  RefreshCw,
  Rocket,
  Satellite,
  ShieldAlert,
  Siren,
  Sparkles,
  Trophy,
} from "lucide-react";
import { BodyMap, type RegiaoSelecionada } from "./components/BodyMap";
import { exigeAlertaCritico, motivosPorZona, orgaosEmAlerta } from "./components/motivosAlerta";
import { META_TREINO, TendenciaChart } from "./components/TendenciaChart";
import { SpinoffModal } from "./components/SpinoffModal";
import { DispositivoWidget, TemperaturaExternaWidget } from "./components/Widgets";
import { Painel } from "./components/Painel";
import { GradeLayout } from "./components/GradeLayout";
import { WearablePlayer } from "./components/WearablePlayer";
import { CoachCompacto } from "./components/CoachCompacto";
import { ExamesPanel, PredicaoPanel } from "./components/PaineisAnalise";
import { ProntidaoHUD, type SinalResumo, type Sincronia } from "./components/ProntidaoHUD";
import { LocalMissaoWidget } from "./components/LocalMissaoWidget";
import { LogoApp } from "./components/LogoApp";
import { AlertaCriticoPopup } from "./components/AlertaCriticoPopup";
import { RelatoEnviadoPopup } from "./components/RelatoEnviadoPopup";
import { DecisaoDia, type EvidenciaAlerta } from "./components/DecisaoDia";
import {
  ESTADO_VAZIO,
  XP_CONTRAMEDIDA,
  XP_RELATO,
  carregarHud,
  chaveContramedida,
  contramedidasDoDia,
  horaAplicada,
  salvarHud,
  type EstadoTripulante,
} from "./components/prontidao";
import {
  API_URL,
  analisarDia,
  avancarHoraAoVivo,
  estadoAoVivo,
  listarAstronautas,
  registrarDia,
  type EventosAoVivo,
} from "./api";
import type {
  Analise,
  Astronauta,
  Desvio,
  ProntidaoCumulativa,
  RelatoDesconforto,
  TelemetriaHoraria,
  TripulanteRegistrado,
} from "./types";


const NOME_PARTE: Record<string, string> = {
  cabeca: "Cabeça",
  peito: "Peito",
  pulmao: "Pulmões",
  coluna: "Coluna",
  pernas: "Pernas",
  pele: "Pele",
};

const TEMA_AMBIENTE: Record<string, "mars" | "transit" | "station"> = {
  "Base Marciana": "mars",
  "Transito para Marte": "transit",
  "Estacao Orbital": "station",
};

// Vídeo de fundo por cenário (o dia selecionado define o local; sem dado ainda, fica a Base Marciana)
const VIDEO_AMBIENTE: Record<string, string> = {
  "Base Marciana": "/video/video_marte.mp4",
  "Transito para Marte": "/video/video_transito_marte.mp4",
  "Estacao Orbital": "/video/video_estacao_orbital.mp4",
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
function BotaoTopo({ children, onClick, disabled, cor, icone }: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  cor: "red" | "emerald";
  icone: React.ReactNode;
}) {
  const estilos = {
    red: "border-red-400/60 bg-red-500/10 text-red-200 hover:bg-red-500/20",
    emerald: "border-emerald-400/60 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 font-mono text-[10px] font-semibold uppercase tracking-wider transition disabled:opacity-40 ${estilos[cor]}`}
    >
      {icone}
      {children}
    </button>
  );
}

/** Resumo, no aviso, do dia simulado para o resto da tripulação (sem pop-up: só o tripulante selecionado abre pop-up). */
function textoTripulacao(lista?: TripulanteRegistrado[] | null) {
  if (!lista?.length) return "";
  const itens = lista.map((t) =>
    t.erro ? `${t.nome}: falhou (${t.erro})` : `${t.nome}: dia ${t.dia_registrado}${t.cenario_simulado ? " com anomalia" : ""} (nível ${t.codigo_semaforo})`,
  );
  return ` • Também simulado: ${itens.join("; ")}`;
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
  const [modalSpinoff, setModalSpinoff] = useState(false);
  const [registrando, setRegistrando] = useState(false);
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
      setErro(`Motor de triagem fora do ar (${API_URL}). Inicie o backend (uvicorn).`);
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

  // ---------------- Wearable ao vivo: uma leitura por hora, como um smartwatch ----------------
  const [tocando, setTocando] = useState(false);
  const [velocidade, setVelocidade] = useState<1 | 2 | 5>(1);
  const [horaria, setHoraria] = useState<TelemetriaHoraria | null>(null);
  const [coletando, setColetando] = useState(false);
  const [erroSync, setErroSync] = useState(false);
  // Pop-up de alerta crítico só no momento de uma ALTERAÇÃO (leitura nova do wearable ou dia registrado),
  // nunca ao navegar entre dias ou tripulantes. Até esse instante (ms) um alerta novo pode abrir o pop-up.
  const liberarAlertaAte = useRef(0);
  const JANELA_ALERTA_MS = 8000;

  // Avisos somem sozinhos depois de alguns segundos
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 7000);
    return () => clearTimeout(t);
  }, [aviso]);

  const trocarAstronauta = (id: string) => {
    liberarAlertaAte.current = 0; // navegação não dispara pop-up
    const a = astronautas.find((x) => x.id_astronauta === id);
    setIdAstronauta(id);
    setRegiaoSel(null); // a região selecionada era do tripulante anterior
    if (a) setDiaMissao(a.ultimo_dia);
  };

  const mudarDia = (delta: number) => {
    if (diaMissao === null) return;
    liberarAlertaAte.current = 0; // navegação não dispara pop-up
    setDiaMissao(Math.min(ultimoDia, Math.max(1, diaMissao + delta)));
  };


  // Simula o dia seguinte (para toda a tripulação) e ABRE o dia simulado, completo, com a simulação dele
  const executarRegistro = async (opcoes: { simular_anomalia?: boolean }): Promise<boolean> => {
    setRegistrando(true);
    setTocando(false); // o play não deve sair do dia simulado para abrir outro
    try {
      const resp = await registrarDia({ id_astronauta: idAstronauta, ...opcoes });
      pularProximaAnalise.current = true;
      liberarAlertaAte.current = Date.now() + JANELA_ALERTA_MS; // dia novo registrado: alerta dele pode abrir o pop-up
      setDados(resp);
      setDiaMissao(resp.dia_registrado ?? null);
      await carregarAstronautas();
      const triagemNova = resp.payload_compacto.triagem_python;
      const origem =
        resp.origem === "manual"
          ? "registrado manualmente"
          : resp.cenario_simulado
            ? `simulado com anomalia: ${NOME_CENARIO[resp.cenario_simulado] ?? resp.cenario_simulado}`
            : "simulado (dia normal)";
      setAviso(
        `Dia ${resp.dia_registrado} ${origem} e salvo na base • Nível ${triagemNova.codigo_semaforo} (${triagemNova.categoria_risco})${textoTripulacao(resp.tripulacao_registrada)}`,
      );
      return true;
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      return false;
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
  const iaOnline = ia ? ia.fonte_analise === "groq_live" || ia.fonte_analise === "groq_cache" : false;

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

  // Alerta crítico de saúde: 1 órgão vermelho ou 2+ órgãos laranja no mapa corporal.
  // Cada combinação (tripulante, dia, órgãos e níveis) aparece uma vez; depois de "Ciente" só volta se o quadro mudar.
  const orgaosAlerta = useMemo(() => orgaosEmAlerta(motivosMapa), [motivosMapa]);
  const assinaturaAlerta = exigeAlertaCritico(orgaosAlerta)
    ? `${idAstronauta}|${diaMissao}|${orgaosAlerta.map((o) => `${o.zona}:${o.nivel}`).join(",")}`
    : null;
  // Quadro crítico NOVO: abre o pop-up só se veio de uma alteração (leitura nova ou dia registrado);
  // se apareceu por navegação, fica só no mapa e conta como já visto.
  const [alertasVistos, setAlertasVistos] = useState<Set<string>>(() => new Set());
  const [alertaAberto, setAlertaAberto] = useState<string | null>(null);
  useEffect(() => {
    if (!assinaturaAlerta || alertasVistos.has(assinaturaAlerta)) return;
    if (Date.now() <= liberarAlertaAte.current) setAlertaAberto(assinaturaAlerta);
    setAlertasVistos((vistos) => new Set(vistos).add(assinaturaAlerta));
  }, [assinaturaAlerta, alertasVistos]);
  const mostrarAlertaCritico = alertaAberto !== null && alertaAberto === assinaturaAlerta;
  const fecharAlertaCritico = useCallback(() => setAlertaAberto(null), []);

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
  const videoFundo = VIDEO_AMBIENTE[ambienteDia] ?? VIDEO_AMBIENTE["Base Marciana"];
  const atrasoSinal =
    ambienteDia === "Estacao Orbital" ? "Comunicação com a Terra quase em tempo real" : "Atraso de sinal com a Terra de até ~20 min por trecho";

  // ---------------- HUD: prontidão, chat de contramedidas e sinais resumidos ----------------
  const estadoHud = hud[idAstronauta] ?? ESTADO_VAZIO;
  const chaveDiaHud = String(diaMissao ?? 0);
  // Assinatura estável (string) para os hooks não recalcularem a cada render
  const assinaturaAplicadas = JSON.stringify(estadoHud.aplicadas[chaveDiaHud] ?? []);
  const aplicadasDia = useMemo(() => JSON.parse(assinaturaAplicadas) as string[], [assinaturaAplicadas]);
  const contramedidas = useMemo(() => contramedidasDoDia(aplicadasDia), [aplicadasDia]);

  // Relógio = hora da última leitura coletada do dia ao vivo
  const aoVivoDoDia = horaria?.id_astronauta === idAstronauta && horaria?.dia_missao === diaMissao ? horaria : null;
  const horaAtual = aoVivoDoDia?.hora ?? 0;
  // Prontidão / Aptidão EVA CUMULATIVA: o backend roda um passo do integrador a cada leitura nova
  const prontidao: ProntidaoCumulativa | null = aoVivoDoDia?.prontidao ?? null;
  const ganhoPendente = useRef<{ antes: number; xp: number } | null>(null);

  // Eventos do dia (mapa corporal e contramedidas) vão em toda chamada ao vivo: valem a partir da hora em que ocorreram
  const eventosRef = useRef<EventosAoVivo | null>(null);
  eventosRef.current =
    diaMissao === null
      ? null
      : { id_astronauta: idAstronauta, dia_missao: diaMissao, desconfortos: listaRelatos, contramedidas, horaPadrao: horaAtual };
  const horariaRef = useRef<TelemetriaHoraria | null>(null);
  horariaRef.current = horaria;
  // Chamadas ao vivo em fila (uma por vez): um tick nunca atropela o outro
  const filaAoVivo = useRef<Promise<unknown>>(Promise.resolve());
  const chamarAoVivo = useCallback(
    // alteracao=true: a chamada gera uma leitura nova (tick/pico/virada) e pode abrir o pop-up de alerta
    (pedido: (e: EventosAoVivo) => Promise<TelemetriaHoraria>, alteracao = false) => {
      filaAoVivo.current = filaAoVivo.current.then(async () => {
        const ev = eventosRef.current;
        if (!ev) return;
        setColetando(true);
        try {
          const r = await pedido(ev);
          if (alteracao) liberarAlertaAte.current = Date.now() + JANELA_ALERTA_MS;
          setHoraria(r);
          setErroSync(false);
          if (r.virada) {
            // Depois das 23:00 o backend abre o dia seguinte às 00:00 (e grava um dia simulado se ele não existia)
            setDiaMissao(r.dia_missao);
            if (r.virada.registrado) {
              carregarAstronautas();
              setAviso(`Dia ${r.virada.para} simulado (dia normal) e salvo na base${textoTripulacao(r.virada.tripulacao)}`);
            }
          }
        } catch (e) {
          setErroSync(true);
          setTocando(false);
          setErro(e instanceof Error ? e.message : String(e));
        } finally {
          setColetando(false);
        }
      });
      return filaAoVivo.current;
    },
    [carregarAstronautas],
  );

  // Trocar de tripulante/dia: retoma a sessão ao vivo desse dia ou começa às 00:00 com uma leitura
  useEffect(() => {
    if (diaMissao === null) return;
    const h = horariaRef.current;
    if (h?.id_astronauta === idAstronauta && h?.dia_missao === diaMissao) return;
    chamarAoVivo(estadoAoVivo);
  }, [idAstronauta, diaMissao, chamarAoVivo]);

  // Relato no mapa ou contramedida aplicada: recalcula a prontidão na hora atual (sem gerar leitura)
  const assinaturaEventos = JSON.stringify([listaRelatos, contramedidas]);
  const eventosSincronizados = useRef(assinaturaEventos);
  useEffect(() => {
    if (eventosSincronizados.current === assinaturaEventos) return;
    eventosSincronizados.current = assinaturaEventos;
    const h = horariaRef.current;
    if (!h || h.id_astronauta !== idAstronauta || h.dia_missao !== diaMissao) return;
    const t = setTimeout(() => chamarAoVivo(estadoAoVivo), 150);
    return () => clearTimeout(t);
  }, [assinaturaEventos, idAstronauta, diaMissao, chamarAoVivo]);

  // Play: coleta 1 hora a cada 5 s (1x), 2,5 s (2x) ou 1 s (5x) até o operador pausar; vira o dia sozinho
  useEffect(() => {
    if (!tocando || !aoVivoDoDia || aoVivoDoDia.historico) return; // dias anteriores já estão completos
    const t = setTimeout(() => chamarAoVivo(avancarHoraAoVivo, true), 5000 / velocidade);
    return () => clearTimeout(t);
  }, [tocando, aoVivoDoDia, velocidade, chamarAoVivo]);

  const avancarUmaHora = () => chamarAoVivo(avancarHoraAoVivo, true);
  const simularPico = () => chamarAoVivo((e) => avancarHoraAoVivo(e, true), true);

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
  // O novo valor chega do backend: mostra o ganho/perda assim que a resposta pedida pela interação volta
  useEffect(() => {
    if (!prontidao || !ganhoPendente.current) return;
    const { antes, xp: xpGanho } = ganhoPendente.current;
    ganhoPendente.current = null;
    mostrarGanho(antes, prontidao.aptidao_eva, xpGanho);
  }, [prontidao]);

  // Contramedida aplicada na hora do relógio virtual (de novo = desfaz): acelera a recuperação a partir dela
  const alternarContramedida = (texto: string) => {
    if (diaMissao === null) return;
    const hora = horaAplicada(aplicadasDia, texto);
    // Desfazer devolve o XP (aplicar/desfazer em sequência não acumula pontos)
    const xpGanho = hora === null ? XP_CONTRAMEDIDA : -XP_CONTRAMEDIDA;
    ganhoPendente.current = { antes: prontidao?.aptidao_eva ?? 0, xp: xpGanho };
    mudarHud(idAstronauta, (e) => {
      const atuais = e.aplicadas[chaveDiaHud] ?? [];
      const novas =
        hora === null ? [...atuais, chaveContramedida(horaAtual, texto)] : atuais.filter((c) => c !== chaveContramedida(hora, texto));
      return { ...e, xp: Math.max(0, e.xp + xpGanho), aplicadas: { ...e.aplicadas, [chaveDiaHud]: novas } };
    });
  };

  // Tags do protocolo com o MESMO status de EVA do topo (prontidão): nunca "Apto para EVA" no protocolo
  // enquanto o topo suspende, nem "Suspender EVA" enquanto o topo libera.
  const tagsProtocolo = (() => {
    const tags = ia?.tags_acao ?? [];
    const status = prontidao?.status_eva;
    if (!status || ambienteDia !== "Base Marciana") return tags;
    const semEva = tags.filter((t) => !/apto para eva|suspender eva|restringir eva/i.test(t));
    const eva = status === "INAPTO" ? "Suspender EVA" : status === "RESTRICAO" ? "Restringir EVA" : "Apto para EVA";
    return [eva, ...semEva].slice(0, 3);
  })();

  // ---------------- Primeira dobra: decisão em dia de alerta, metas em dia de rotina ----------------
  const diaDeAlerta = codigo >= 2 || prontidao?.status_eva === "INAPTO";
  const irParaProtocolo = () => document.getElementById("painel-protocolo")?.scrollIntoView({ block: "start" });
  // Dados que sustentam o alerta: motivo principal de cada parte do mapa corporal, mais grave primeiro
  const evidencias: EvidenciaAlerta[] = (() => {
    const vistos = new Set<string>();
    const lista: EvidenciaAlerta[] = [];
    for (const [zona, motivos] of Object.entries(motivosMapa)) {
      for (const m of motivos ?? []) {
        if (m.secundario || vistos.has(m.titulo)) continue;
        vistos.add(m.titulo);
        lista.push({ ...m, parte: NOME_PARTE[zona] ?? zona });
      }
    }
    return lista.sort((x, y) => y.nivel - x.nivel).slice(0, 4);
  })();

  const seletorDia = (
    <div className="ml-auto w-64 shrink-0 rounded border border-cyan-800/60 bg-[#020611] px-3 py-2">
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
        onChange={(e) => {
          liberarAlertaAte.current = 0; // navegação não dispara pop-up
          setDiaMissao(Number(e.target.value));
        }}
        className="trilha-dia mt-2 w-full"
        aria-label="Dia da missão"
        style={{ ["--progresso" as string]: `${(((diaMissao ?? 1) - 1) / Math.max(1, ultimoDia - 1)) * 100}%` }}
      />
      <div className="mt-0.5 flex justify-between font-mono text-[9px] text-slate-500">
        <span>Dia 1</span>
        <span>Último registro: dia {ultimoDia}</span>
      </div>
    </div>
  );

  const painelMissoes = (titulo: string, className: string) => (
    <Painel titulo={titulo} icone={<Trophy className="h-4 w-4" />} className={className}>
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
      </div>
      {/* Coach de exercício (segue a hora do player do wearable) */}
      {horaria?.coach_exercicio && <CoachCompacto className="mt-3" coach={horaria.coach_exercicio} />}
    </Painel>
  );

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

  const sincronia: Sincronia = erroSync
    ? { estado: "erro", texto: "Sem sincronia com o wearable" }
    : !aoVivoDoDia
      ? { estado: "coletando", texto: "Conectando ao wearable…" }
      : aoVivoDoDia.historico || aoVivoDoDia.coleta_ao_vivo === false
        ? { estado: "ok", texto: "Dia registrado • 24 leituras" }
        : {
          estado: coletando ? "coletando" : "ok",
          texto: `${coletando ? "Coletando" : "Sincronizado"} • Última leitura: ${aoVivoDoDia.ultima_leitura ?? aoVivoDoDia.ponto_atual.rotulo}`,
        };

  return (
    // Tema de cores pelo cenário do dia: Base Marciana, Trânsito para Marte ou Estação Orbital
    <div data-theme={TEMA_AMBIENTE[ambienteDia] ?? "transit"} className="min-h-screen bg-[#03060c] pb-8 text-slate-200 font-sans">
      {/* Vídeo de fundo do cenário do dia, em loop: mudo, sem controles, atrás de tudo */}
      <video
        key={videoFundo}
        className="pointer-events-none fixed inset-0 h-full w-full origin-top-left scale-[1.12] object-cover motion-reduce:hidden" /* ampliado 12% a partir do canto superior esquerdo: a marca d'água original do vídeo sai da tela (o selo fixo fica no lugar) */
        src={videoFundo}
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
        {/* Celular: marca, ações e tripulante empilhados e centralizados. Tablet: marca e ações na 1ª linha,
            tripulante embaixo. Desktop: 3 colunas, tripulante centralizado. */}
        <div className="mx-auto grid max-w-[1500px] grid-cols-1 items-center justify-items-center gap-x-4 gap-y-2 sm:grid-cols-[1fr_auto] sm:justify-items-stretch lg:grid-cols-[1fr_auto_1fr]">
          <h1 className="flex items-center gap-2 whitespace-nowrap text-lg font-bold tracking-tight text-white">
            <LogoApp className="h-7 w-7 shrink-0" />
            <span className="flex flex-col leading-tight">
              <span>
                AstroHealth <span className="text-cyan-400">Monitor</span>
              </span>
              {/* Aviso discreto: o logotipo foi gerado por IA */}
              <span className="font-mono text-[8px] font-normal tracking-wider text-slate-500">MARCA GERADA POR IA</span>
            </span>
          </h1>

          {/* Centro: tripulante e status do motor num único bloco */}
          <div className="order-last col-span-full flex h-9 max-w-full min-w-0 items-stretch justify-self-center overflow-hidden rounded-md border border-cyan-900/80 bg-slate-950/70 lg:order-none lg:col-span-1">
            <select
              value={idAstronauta}
              onChange={(e) => trocarAstronauta(e.target.value)}
              className="min-w-0 cursor-pointer truncate bg-transparent pr-2 pl-3 text-xs font-semibold text-slate-100 focus:bg-cyan-500/10 focus:outline-none [&>option]:bg-slate-950"
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
              className={`flex items-center gap-1.5 whitespace-nowrap border-l border-cyan-900/80 px-3 font-mono text-[10px] uppercase tracking-wider ${
                backendOnline === false ? "text-red-400" : "text-green-400"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${backendOnline === false ? "bg-red-500" : "animate-pulse bg-green-500"}`} />
              <span className="hidden sm:inline">Motor {backendOnline === false ? "offline" : "online"}</span>
              <span className={iaOnline ? "text-cyan-300" : "text-slate-500"}>
                <span className="hidden sm:inline">• </span>
                {iaOnline ? "IA" : "Local"}
              </span>
            </span>
          </div>

          {/* Direita: ações */}
          <div className="flex items-center gap-2 sm:justify-self-end">
            <BotaoTopo
              cor="red"
              icone={<Siren className="h-3.5 w-3.5" />}
              disabled={!backendOnline || registrando}
              onClick={() => executarRegistro({ simular_anomalia: true })}
            >
              {registrando ? "Simulando..." : "Simular dia de alerta"}
            </BotaoTopo>
            <BotaoTopo cor="emerald" icone={<Rocket className="h-3.5 w-3.5" />} onClick={() => setModalSpinoff(true)}>
              Spinoff
            </BotaoTopo>
          </div>
        </div>
        {/* Barra de prontidão gamificada + sinais vitais resumidos */}
        {dados && tel && (
          <div className="mx-auto mt-2 max-w-[1500px] border-t border-(--borda) pt-2">
            <ProntidaoHUD
              prontidao={prontidao}
              xp={estadoHud.xp}
              ganho={ganho}
              sinais={sinais}
              sincronia={sincronia}
              onVerProtocolo={irParaProtocolo}
            />
          </div>
        )}
      </header>

      <div className="relative mx-auto max-w-[1500px] px-4 py-4 lg:px-6">
        {erro && <div className="mb-4 rounded border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">{erro}</div>}

        {/* ============ PRIMEIRA DOBRA ============
            Dia de alerta: decisão (o que aconteceu, ação indicada, dados que sustentam) antes de tudo;
            as metas e o XP descem para depois dos painéis. Dia de rotina: Missões do dia no topo. */}
        {diaDeAlerta && ia ? (
          <DecisaoDia
            codigo={codigo}
            status={ia.status}
            score={ia.score_risco}
            resumo={ia.resumo_alerta}
            categorias={triagem?.categoria_risco ?? ""}
            statusEva={ambienteDia === "Base Marciana" ? prontidao?.status_eva : undefined}
            motivosEva={(prontidao?.bloqueios ?? []).map((x) => x.motivo)}
            acoes={ia.acao_imediata_astronauta ?? []}
            tags={tagsProtocolo}
            escalonamento={codigo >= 3 ? "Escalonar para os cirurgiões de voo na Terra" : "Gerenciar a bordo com a tripulação"}
            evidencias={evidencias}
            onVerProtocolo={irParaProtocolo}
          >
            {seletorDia}
          </DecisaoDia>
        ) : !dados || !triagem ? (
          // Sem dados (motor fora do ar ou carregando): nunca afirmar "sem alerta"
          <section className="mb-4 flex flex-wrap items-center gap-4 rounded-md border border-slate-600 bg-(--card) p-3 backdrop-blur-md">
            <p className="flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-300">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
              {backendOnline === false
                ? "Sem dados do dia: o motor de triagem está fora do ar. Situação de saúde desconhecida, não presuma que está tudo bem."
                : "Carregando a triagem do dia…"}
            </p>
            {seletorDia}
          </section>
        ) : (
          // Dia de rotina: faixa curta com o status e o seletor de dia (as Missões ficam abaixo do mapa corporal)
          <section className="mb-4 flex flex-wrap items-center gap-4 rounded-md border border-(--borda) bg-(--card) p-3 backdrop-blur-md">
            <p className="flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#34D399]" />
              <span>
                <span className="font-semibold text-[#34D399]">Dia de rotina</span> · sem alerta ativo na triagem do dia. Metas e XP nas{" "}
                <span className="text-cyan-300">Missões do dia</span>, abaixo do mapa corporal.
              </span>
            </p>
            {seletorDia}
          </section>
        )}

        {dados && tel && payload && triagem && (
          <GradeLayout mapaLargo={Object.values(motivosMapa).some((l) => (l?.length ?? 0) > 0) || listaRelatos.length > 0}>
            {/* ============ WEARABLE 24 H ============ */}
            <div key="wearable">
            <WearablePlayer
              className="h-full"
              dados={aoVivoDoDia}
              tocando={tocando}
              velocidade={velocidade}
              coletando={coletando}
              erroSync={erroSync}
              onTocar={setTocando}
              onVelocidade={setVelocidade}
              onAvancar={avancarUmaHora}
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
              {/* Personagem conforme o tripulante: sexo "F" usa o modelo feminino (ex.: Dra. Lucia Caminos) */}
              <BodyMap
                genero={astronauta?.sexo === "F" ? "F" : "M"}
                motivos={motivosMapa}
                relatos={relatosAtuais}
                selecionada={regiaoSel}
                onSelecionar={setRegiaoSel}
                onSalvarRelato={(novoRelato) => {
                  const chave = `${novoRelato.vista}:${novoRelato.regiaoId}`;
                  // A dor passa a pesar a partir da hora do relógio virtual em que foi relatada (editar mantém a hora)
                  const relato = { ...novoRelato, hora: relatosAtuais[chave]?.hora ?? horaAtual };
                  const novos = { ...relatosAtuais, [chave]: relato };
                  atualizarRelatos({ ...relatos, [chaveRelatos]: novos });
                  // Relato novo rende XP; mudar a intensidade de um relato só mexe na prontidão
                  const xpRelato = chave in relatosAtuais ? 0 : XP_RELATO;
                  if (xpRelato) mudarHud(idAstronauta, (e) => ({ ...e, xp: e.xp + xpRelato }));
                  ganhoPendente.current = { antes: prontidao?.aptidao_eva ?? 0, xp: xpRelato };
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
            {/* ============ MISSÕES DO DIA (abaixo do mapa corporal) ============ */}
            <div key="missoes">
              {painelMissoes(diaDeAlerta && ia ? "Missões do dia · metas de rotina" : "Missões do dia", "h-full")}
            </div>

            <div key="protocolo" id="painel-protocolo" className="scroll-mt-40">
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
                      {iaOnline ? "Groq AI" : "Telemetria local"}
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
                  {tagsProtocolo.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {ia.score_risco !== undefined && ia.score_risco !== null && (
                        <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${corNivel.borda} ${corNivel.texto}`}>
                          {ia.status} • {ia.score_risco}/100
                        </span>
                      )}
                      {tagsProtocolo.map((tag) => (
                        <span key={tag} className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${corNivel.borda} ${corNivel.fundo} ${corNivel.texto}`}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Contramedidas</p>
                    <ol className="mt-1.5 space-y-1.5">
                      {(ia.acao_imediata_astronauta ?? []).map((acao, i) => {
                        const hora = horaAplicada(aplicadasDia, acao);
                        return (
                          <li key={i} className="flex items-start gap-2 rounded border-l-2 border-cyan-400 bg-(--subcard) p-2 text-xs text-slate-200">
                            <span className="font-mono text-cyan-400">{String(i + 1).padStart(2, "0")}</span>
                            <span className="flex-1">{acao}</span>
                            <button
                              onClick={() => alternarContramedida(acao)}
                              title={
                                hora === null
                                  ? `Marcar como aplicada às ${String(horaAtual).padStart(2, "0")}:00 (acelera a recuperação a partir dessa hora)`
                                  : "Desfazer"
                              }
                              className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                                hora === null
                                  ? "border-cyan-700 text-cyan-300 hover:bg-cyan-500/10"
                                  : "border-emerald-600/70 bg-emerald-500/10 text-emerald-300"
                              }`}
                            >
                              {hora === null ? "Aplicar" : `✓ ${String(hora).padStart(2, "0")}:00`}
                            </button>
                          </li>
                        );
                      })}
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
              {dados.predicao_tendencia && <PredicaoPanel
                  className="h-full"
                  predicao={dados.predicao_tendencia}
                  alertaAtual={{
                    codigo,
                    categorias: (triagem.categoria_risco ?? "").split(";").map((c) => c.trim()).filter((c) => c && c !== "Nominal"),
                    radiacaoTotalMsv: tel.radiacao_acumulada_msv?.valor,
                  }}
                />}
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
            {/* O quadro termina logo depois dos cards; no espaço que sobra embaixo fica o selo de IA,
                alinhado com a base do quadro de Tendência ao lado */}
            <div key="telemetria" className="flex flex-col gap-4">
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
              {/* Selo de conteúdo de IA (maior) */}
              <div className="mt-auto flex justify-end">
                <div className="flex items-center gap-2.5 text-white/85 select-none" aria-label="Conteúdo criado com IA">
                  <span className="text-3xl font-black leading-none">IA</span>
                  <span className="leading-tight">
                    <span className="block text-sm font-semibold uppercase tracking-wide">Conteúdo criado com IA</span>
                    <span className="block text-[9px] uppercase tracking-[0.15em] text-white/60">Inteligência artificial</span>
                  </span>
                </div>
              </div>
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
      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-amber-900/40 bg-[#0b0803]/95 py-1 pr-52 pl-4 text-center text-[10px] text-amber-200/80">
        <span>Protótipo de hackathon (NASA Space Apps 2026) • DADOS SIMULADOS • Não é dispositivo médico e não substitui avaliação profissional.</span>
        {/* Selo do vídeo de fundo (gerado com IA), fixo no canto direito do rodapé */}
        <span className="absolute top-1/2 right-4 flex -translate-y-1/2 items-center gap-1.5 text-white/80 select-none" aria-label="Conteúdo criado com IA">
          <span className="text-sm font-black leading-none">IA</span>
          <span className="text-left leading-none">
            <span className="block text-[9px] font-semibold uppercase tracking-wide">Conteúdo criado com IA</span>
            <span className="block text-[7px] uppercase tracking-[0.15em] text-white/55">Inteligência artificial</span>
          </span>
        </span>
      </footer>

      <SpinoffModal aberto={modalSpinoff} onFechar={() => setModalSpinoff(false)} />
      <RelatoEnviadoPopup relato={relatoEnviado} onFechar={fecharRelatoEnviado} />
      <AlertaCriticoPopup
        orgaos={mostrarAlertaCritico && !relatoEnviado ? orgaosAlerta : null}
        tripulante={astronauta ? astronauta.nome : idAstronauta}
        dia={diaMissao}
        statusEva={prontidao?.status_eva}
        acoes={ia?.acao_imediata_astronauta ?? []}
        onFechar={fecharAlertaCritico}
        onVerDecisao={() => {
          fecharAlertaCritico();
          window.scrollTo({ top: 0 }); // a Decisão do dia fica no topo
        }}
      />
    </div>
  );
}

export default App;
