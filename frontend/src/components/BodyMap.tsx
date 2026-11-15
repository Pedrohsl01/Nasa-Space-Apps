// Mapa corporal: astronauta de frente e de costas lado a lado.
// - Partes em alerta NÃO são pintadas por dentro: aparecem como cartões ao lado (órgão colorido + motivo),
//   ligados por uma linha até o ponto do corpo.
// - Hover: a figura escurece e só a parte apontada fica acesa, com um balão explicativo junto ao cursor.
// Contornos (<path>) vêm de corpoRegioes.ts (gerado por tools/gerar_mapa_corpo.py a partir da silhueta real).
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import imgFrente from "../assets/body/astronauta_frente.png";
import imgCostas from "../assets/body/astronauta_costas.png";
import { VISTAS_CORPO } from "./corpoRegioes";
import { OrgaoIcone } from "./OrgaoIcone";
import type { Motivo, ZonaCorpo } from "./motivosAlerta";

export type Zona = ZonaCorpo;
type Vista = "frente" | "costas";

interface BodyMapProps {
  motivos: Partial<Record<Zona, Motivo[]>>;
  zonaSelecionada: Zona | null;
  onSelectZona: (zona: Zona) => void;
}

export const ZONAS: Record<Zona, { nome: string; orgao: string; sistema: string; detalhe: string; perigo: string }> = {
  cabeca: {
    nome: "Cabeça",
    orgao: "Cérebro e olhos",
    sistema: "Neuro-ocular • Sono • Humor",
    detalhe:
      "Na microgravidade, os líquidos do corpo sobem para a cabeça e podem pressionar os olhos (SANS). Sono e humor sofrem com rotina apertada e confinamento.",
    perigo: "Gravidade alterada • Isolamento e confinamento",
  },
  peito: {
    nome: "Peito",
    orgao: "Coração",
    sistema: "Cardiovascular",
    detalhe:
      "Sem gravidade, o sangue se redistribui e o coração trabalha diferente. Pressão e frequência cardíaca são comparadas com a SUA linha de base.",
    perigo: "Gravidade alterada • Ambiente fechado",
  },
  pulmao: {
    nome: "Tórax",
    orgao: "Pulmões",
    sistema: "Cardiorrespiratório",
    detalhe: "FC muito acima da base ou queda de SpO₂ podem indicar esforço, febre, infecção ou problema no ar do habitat/traje.",
    perigo: "Ambiente fechado e hostil",
  },
  coluna: {
    nome: "Costas",
    orgao: "Coluna",
    sistema: "Musculoesquelético axial",
    detalhe: "Sem carga do peso do corpo, os músculos que sustentam a coluna enfraquecem. O treino resistido diário ajuda a proteger.",
    perigo: "Gravidade alterada",
  },
  pernas: {
    nome: "Pernas",
    orgao: "Ossos e músculos",
    sistema: "Ossos e músculos",
    detalhe: "Ossos e músculos das pernas perdem massa sem gravidade. A meta do projeto é ~60 min/dia de treino resistido.",
    perigo: "Gravidade alterada",
  },
  pele: {
    nome: "Braços",
    orgao: "Pele e imunidade",
    sistema: "Radiação • Imunidade",
    detalhe: "Fora da proteção da Terra, a dose de radiação se acumula. Febre pode indicar infecção, comum com o estresse imune no espaço.",
    perigo: "Radiação • Ambiente fechado",
  },
};

// Regiões de cada vista (ordem de desenho)
const REGIOES_POR_VISTA: Record<Vista, Zona[]> = {
  frente: ["pele", "pernas", "cabeca", "pulmao", "peito"],
  costas: ["pele", "pernas", "cabeca", "pulmao", "coluna"],
};
const IMAGENS: Record<Vista, string> = { frente: imgFrente, costas: imgCostas };

// Cartões da esquerda apontam para a figura de frente; os da direita, para a de costas
const LADO_ESQUERDO: Zona[] = ["cabeca", "peito", "pulmao"];
const LADO_DIREITO: Zona[] = ["coluna", "pele", "pernas"];

const COR = { hover: "#22d3ee", atencao: "#f59e0b", critico: "#ef4444" };
const corDoNivel = (n: number) => (n >= 3 ? COR.critico : COR.atencao);

/** Ponto de ancoragem (centro do contorno). Em regiões duplas (braços, pernas, pulmões) escolhe o lado do cartão. */
function ancora(vista: Vista, zona: Zona, lado: "esq" | "dir"): { x: number; y: number } {
  const d = (VISTAS_CORPO[vista].regioes as Record<string, string>)[zona];
  const subcaminhos = d.split("M").filter(Boolean).map((s) => {
    const nums = (s.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  });
  subcaminhos.sort((a, b) => a.x - b.x);
  return lado === "esq" ? subcaminhos[0] : subcaminhos[subcaminhos.length - 1];
}

type Linha = { zona: Zona; x1: number; y1: number; x2: number; y2: number; cor: string };
type Balao = { zona: Zona; x: number; y: number };

export function BodyMap({ motivos, zonaSelecionada, onSelectZona }: BodyMapProps) {
  const [hover, setHover] = useState<Zona | null>(null);
  const [balao, setBalao] = useState<Balao | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const container = useRef<HTMLDivElement>(null);
  const svgs = useRef<Record<Vista, SVGSVGElement | null>>({ frente: null, costas: null });
  const cartoes = useRef<Map<Zona, HTMLElement>>(new Map());

  const nivelZona = (z: Zona) => Math.max(0, ...(motivos[z] ?? []).map((m) => m.nivel));
  const emAlerta = (z: Zona) => (motivos[z]?.length ?? 0) > 0;

  // Cartões de cada lado, ordenados pela altura do ponto no corpo (evita linhas cruzadas)
  const ordenar = (zonas: Zona[], vista: Vista, lado: "esq" | "dir") =>
    zonas.filter(emAlerta).sort((a, b) => ancora(vista, a, lado).y - ancora(vista, b, lado).y);
  const esquerda = ordenar(LADO_ESQUERDO, "frente", "esq");
  const direita = ordenar(LADO_DIREITO, "costas", "dir");
  const chaveAlertas = [...esquerda, ...direita].map((z) => `${z}${nivelZona(z)}`).join(",");

  // Mede cartões e figuras para desenhar as linhas-guia
  const medir = useCallback(() => {
    const c = container.current?.getBoundingClientRect();
    if (!c) return;
    const novas: Linha[] = [];
    const ligar = (zona: Zona, vista: Vista, lado: "esq" | "dir") => {
      const cartao = cartoes.current.get(zona);
      const svg = svgs.current[vista];
      const ctm = svg?.getScreenCTM();
      if (!cartao || !svg || !ctm) return;
      const a = ancora(vista, zona, lado);
      const p = new DOMPoint(a.x, a.y).matrixTransform(ctm);
      const r = cartao.getBoundingClientRect();
      novas.push({
        zona,
        x1: (lado === "esq" ? r.right : r.left) - c.left,
        y1: r.top + r.height / 2 - c.top,
        x2: p.x - c.left,
        y2: p.y - c.top,
        cor: corDoNivel(nivelZona(zona)),
      });
    };
    esquerda.forEach((z) => ligar(z, "frente", "esq"));
    direita.forEach((z) => ligar(z, "costas", "dir"));
    setLinhas(novas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveAlertas]);

  useLayoutEffect(() => {
    medir();
    const obs = new ResizeObserver(medir);
    if (container.current) obs.observe(container.current);
    window.addEventListener("resize", medir);
    return () => {
      obs.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, [medir]);

  const moverBalao = (zona: Zona, e: React.MouseEvent) => {
    const c = container.current?.getBoundingClientRect();
    if (!c) return;
    setBalao({ zona, x: e.clientX - c.left, y: e.clientY - c.top });
  };

  // ---------------- Figura (frente ou costas) ----------------
  const figura = (vista: Vista) => {
    const dados = VISTAS_CORPO[vista];
    const regioes = REGIOES_POR_VISTA[vista];
    const caminhos = dados.regioes as Record<string, string>;
    const hoverAqui = hover && regioes.includes(hover) ? hover : null;
    const escurecer = hover !== null;

    return (
      <figure className="flex flex-col items-center">
        <svg
          ref={(el) => {
            svgs.current[vista] = el;
          }}
          viewBox={`0 0 ${dados.largura} ${dados.altura}`}
          className="h-[20rem] w-auto overflow-visible"
          aria-label={`Mapa corporal do astronauta — ${vista === "frente" ? "vista frontal" : "vista de costas"}`}
          onMouseLeave={() => {
            setHover(null);
            setBalao(null);
          }}
        >
          <defs>
            <radialGradient id={`plataforma-${vista}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.45" />
              <stop offset="70%" stopColor="#0e7490" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#0e7490" stopOpacity="0" />
            </radialGradient>
            {hoverAqui && (
              <clipPath id={`recorte-${vista}`}>
                <path d={caminhos[hoverAqui]} />
              </clipPath>
            )}
          </defs>

          <ellipse
            cx={dados.largura / 2}
            cy={dados.altura - dados.altura * 0.025}
            rx={dados.largura * 0.5}
            ry={dados.altura * 0.035}
            fill={`url(#plataforma-${vista})`}
          />

          {/* Imagem base: escurece durante o hover para destacar a parte apontada */}
          <image
            href={IMAGENS[vista]}
            width={dados.largura}
            height={dados.altura}
            style={{
              filter: escurecer ? "brightness(0.35) saturate(0.4)" : "none",
              transition: "filter .25s ease",
            }}
          />
          {/* Parte apontada em brilho total (mesma imagem, recortada no contorno) */}
          {hoverAqui && (
            <image
              href={IMAGENS[vista]}
              width={dados.largura}
              height={dados.altura}
              clipPath={`url(#recorte-${vista})`}
              style={{ filter: "brightness(1.15) saturate(1.2)" }}
              pointerEvents="none"
            />
          )}

          {regioes.map((zona) => {
            const alerta = emAlerta(zona);
            const corAlerta = corDoNivel(nivelZona(zona));
            const emHover = hover === zona;
            const selecionada = zonaSelecionada === zona;
            // Em alerta: só um contorno tracejado (o destaque fica no cartão ao lado)
            const stroke = emHover ? (alerta ? corAlerta : COR.hover) : selecionada ? "#f8fafc" : alerta ? corAlerta : "#67e8f9";
            return (
              <path
                key={`${vista}-${zona}`}
                d={caminhos[zona]}
                fill={emHover ? (alerta ? corAlerta : COR.hover) : "transparent"}
                fillOpacity={emHover ? 0.18 : 0}
                stroke={stroke}
                strokeOpacity={emHover || selecionada ? 1 : alerta ? 0.7 : 0.15}
                strokeWidth={emHover ? 1.4 : selecionada ? 1.2 : alerta ? 0.9 : 0.5}
                strokeDasharray={alerta && !emHover ? "3 2" : undefined}
                strokeLinejoin="round"
                style={{
                  filter: emHover ? `drop-shadow(0 0 5px ${stroke})` : undefined,
                  transition: "stroke-opacity .2s, fill-opacity .2s",
                }}
                className="cursor-pointer"
                onMouseEnter={(e) => {
                  setHover(zona);
                  moverBalao(zona, e);
                }}
                onMouseMove={(e) => moverBalao(zona, e)}
                onClick={() => onSelectZona(zona)}
                role="button"
                aria-label={`${ZONAS[zona].orgao} (${vista === "frente" ? "frente" : "costas"})`}
              />
            );
          })}
        </svg>
        <figcaption className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
          {vista === "frente" ? "Frente" : "Costas"}
        </figcaption>
      </figure>
    );
  };

  // ---------------- Cartão de alerta ao lado do corpo ----------------
  const cartao = (zona: Zona, lado: "esq" | "dir") => {
    const lista = motivos[zona] ?? [];
    const principal = lista[0];
    const cor = corDoNivel(nivelZona(zona));
    const ativo = hover === zona || zonaSelecionada === zona;
    return (
      <button
        key={zona}
        ref={(el) => {
          if (el) cartoes.current.set(zona, el);
          else cartoes.current.delete(zona);
        }}
        onMouseEnter={() => setHover(zona)}
        onMouseLeave={() => setHover(null)}
        onClick={() => onSelectZona(zona)}
        className={`flex w-full items-start gap-2 rounded-md border bg-[#0a1220]/95 p-2 text-left transition ${
          lado === "dir" ? "flex-row-reverse text-right" : ""
        } ${ativo ? "scale-[1.03]" : ""}`}
        style={{ borderColor: cor, boxShadow: `0 0 ${ativo ? 18 : 10}px ${cor}${ativo ? "66" : "33"}` }}
      >
        <OrgaoIcone zona={zona} cor={cor} className={`h-11 w-11 shrink-0 ${nivelZona(zona) >= 3 ? "animate-pulse" : ""}`} />
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-widest text-slate-400">{ZONAS[zona].orgao}</p>
          <p className="text-[13px] font-bold leading-tight" style={{ color: cor }}>
            {principal.titulo}
          </p>
          <p className="mt-0.5 text-[10px] leading-snug text-slate-300">{principal.detalhe}</p>
          {lista.length > 1 && (
            <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
              + {lista.slice(1).map((m) => m.titulo.toLowerCase()).join(", ")}
            </p>
          )}
        </div>
      </button>
    );
  };

  const info = zonaSelecionada ? ZONAS[zonaSelecionada] : null;
  const motivosSelecionada = zonaSelecionada ? motivos[zonaSelecionada] ?? [] : [];
  const nenhumAlerta = esquerda.length === 0 && direita.length === 0;
  const balaoInfo = balao && hover === balao.zona ? balao : null;

  return (
    <div className="flex flex-col">
      <div ref={container} className="relative">
        {/* Grade de fundo estilo radar */}
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(rgba(56,189,248,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.25) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        />

        <div className="relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 py-1">
          <div className="flex flex-col gap-2">
            {esquerda.map((z) => cartao(z, "esq"))}
            {nenhumAlerta && (
              <p className="rounded border border-emerald-800/60 bg-emerald-500/5 p-2 text-center font-mono text-[10px] text-emerald-300">
                ✓ Nenhum órgão em alerta
              </p>
            )}
          </div>
          <div className="flex items-end gap-4">
            {figura("frente")}
            {figura("costas")}
          </div>
          <div className="flex flex-col gap-2">{direita.map((z) => cartao(z, "dir"))}</div>
        </div>

        {/* Linhas-guia do cartão até o ponto do corpo */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          {linhas.map((l) => {
            const xm = l.x1 + (l.x2 > l.x1 ? 14 : -14);
            const destaque = hover === l.zona;
            return (
              <g key={l.zona} style={{ opacity: hover && !destaque ? 0.35 : 1, transition: "opacity .2s" }}>
                <path
                  d={`M${l.x1},${l.y1} L${xm},${l.y1} L${l.x2},${l.y2}`}
                  fill="none"
                  stroke={l.cor}
                  strokeWidth={destaque ? 2 : 1.3}
                  strokeDasharray="4 3"
                  style={{ filter: `drop-shadow(0 0 3px ${l.cor})` }}
                />
                <circle cx={l.x2} cy={l.y2} r={3.5} fill={l.cor} />
                <circle cx={l.x2} cy={l.y2} r={4} fill="none" stroke={l.cor} strokeWidth={1.5}>
                  <animate attributeName="r" values="4;11;4" dur="1.8s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.9;0;0.9" dur="1.8s" repeatCount="indefinite" />
                </circle>
              </g>
            );
          })}
        </svg>

        {/* Balão do hover, junto ao cursor */}
        {balaoInfo && (
          <div
            className="pointer-events-none absolute z-20 w-52 rounded-md border bg-[#050b16]/95 p-2.5 shadow-xl backdrop-blur"
            style={{
              left: Math.min(balaoInfo.x + 16, (container.current?.clientWidth ?? 600) - 216),
              top: balaoInfo.y + 16,
              borderColor: emAlerta(balaoInfo.zona) ? corDoNivel(nivelZona(balaoInfo.zona)) : COR.hover,
            }}
          >
            <p className="font-mono text-[10px] uppercase tracking-widest text-cyan-300">{ZONAS[balaoInfo.zona].orgao}</p>
            <p className="text-[11px] text-slate-400">{ZONAS[balaoInfo.zona].sistema}</p>
            {emAlerta(balaoInfo.zona) ? (
              <p className="mt-1 text-xs font-semibold" style={{ color: corDoNivel(nivelZona(balaoInfo.zona)) }}>
                ⚠ {motivos[balaoInfo.zona]![0].titulo}
              </p>
            ) : (
              <p className="mt-1 text-xs font-semibold text-emerald-300">✓ Sem alertas</p>
            )}
            <p className="mt-1 text-[10px] text-slate-500">Clique para ver detalhes</p>
          </div>
        )}
      </div>

      {/* Legenda */}
      <div className="mt-1 flex justify-center gap-4 font-mono text-[10px] uppercase tracking-wider text-slate-400">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cyan-400" />Passe o mouse</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />Atenção</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" />Crítico</span>
      </div>

      {/* Explicação da região clicada */}
      <div className="mt-3 min-h-28 rounded border border-cyan-900/60 bg-cyan-950/20 p-3 text-xs">
        {info && zonaSelecionada ? (
          <>
            <div className="flex items-center justify-between">
              <p className="font-mono uppercase tracking-wider text-cyan-300">
                {info.nome} • {info.orgao}
              </p>
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                  motivosSelecionada.length
                    ? nivelZona(zonaSelecionada) >= 3
                      ? "bg-red-500/20 text-red-300"
                      : "bg-amber-500/20 text-amber-300"
                    : "bg-green-500/15 text-green-300"
                }`}
              >
                {motivosSelecionada.length ? "EM ALERTA" : "NOMINAL"}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400">{info.sistema}</p>
            {motivosSelecionada.length > 0 && (
              <ul className="mt-2 space-y-1">
                {motivosSelecionada.map((m, i) => (
                  <li key={i} className="text-[11px]" style={{ color: corDoNivel(m.nivel) }}>
                    ▸ <strong>{m.titulo}</strong> <span className="text-slate-400">— {m.detalhe}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 leading-relaxed text-slate-300">{info.detalhe}</p>
            <p className="mt-2 font-mono text-[10px] uppercase text-slate-500">Perigo NASA HRP: {info.perigo}</p>
          </>
        ) : (
          <p className="text-slate-500">Passe o mouse ou clique em uma parte do corpo para ver o que o espaço causa nela.</p>
        )}
      </div>
    </div>
  );
}
