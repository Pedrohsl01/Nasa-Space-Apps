// Mapa corporal: astronauta de frente e de costas, 15 regiões anatômicas por vista (M e F).
// - Hover: as duas figuras escurecem levemente e só a região apontada fica acesa (recorte clipPath).
// - Clique trava a seleção (clicar de novo ou no fundo libera) e abre o registro de desconforto.
// - Alerta de telemetria: preenchimento âmbar/vermelho + retículo tracejado no centroide.
// - Desconforto relatado: contorno violeta + marcador sólido no centroide.
// - Cartões (alertas e relatos): nas laterais, ligados por linhas finas aos centroides, quando o quadro
//   tem largura para isso; em quadro estreito, numa grade abaixo das figuras e sem linhas.
// Contornos e centroides vêm de corpoRegioes.ts (gerado por tools/gerar_mapa_corpo.py).
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import imgMascFrente from "../assets/body/astronauta_masculino_frente.png";
import imgMascCostas from "../assets/body/astronauta_masculino_costas.png";
import imgFemFrente from "../assets/body/astronauta_feminino_frente.png";
import imgFemCostas from "../assets/body/astronauta_feminino_costas.png";
import { MAPA_CORPO, type Genero, type RegiaoCorpo, type Vista } from "./corpoRegioes";
import { OrgaoIcone } from "./OrgaoIcone";
import { RelatoForm } from "./RelatoForm";
import { ZONAS, ZONA_REGIOES, chaveRegiao, zonaDaRegiao } from "./zonasCorpo";
import type { Motivo, ZonaCorpo } from "./motivosAlerta";
import type { RelatoDesconforto } from "../types";

export type RegiaoSelecionada = { vista: Vista; id: string };

interface BodyMapProps {
  genero: Genero;
  motivos: Partial<Record<ZonaCorpo, Motivo[]>>;
  relatos: Record<string, RelatoDesconforto>; // chave "vista:id"
  selecionada: RegiaoSelecionada | null;
  onSelecionar: (regiao: RegiaoSelecionada | null) => void;
  onSalvarRelato: (relato: RelatoDesconforto) => void;
  onRemoverRelato: (chave: string) => void;
}

const IMAGENS: Record<Genero, Record<Vista, string>> = {
  M: { frente: imgMascFrente, costas: imgMascCostas },
  F: { frente: imgFemFrente, costas: imgFemCostas },
};
const NOME_VISTA: Record<Vista, string> = { frente: "Frente", costas: "Costas" };
const COR = { hover: "#22d3ee", atencao: "#f59e0b", critico: "#ef4444", relato: "#a78bfa" };
const corDoNivel = (n: number) => (n >= 3 ? COR.critico : COR.atencao);
// Largura mínima do quadro para os cartões ficarem nas laterais sem espremer: 2 colunas de cartão
// (250–320 px) + as duas figuras + espaços. Abaixo disso, cartões vão para uma grade sob as figuras.
const LARGURA_LATERAL = 820;

type Cartao =
  | { tipo: "alerta"; chave: string; zona: ZonaCorpo; motivos: Motivo[]; opcoes: Partial<Record<Vista, string[]>> }
  | { tipo: "relato"; chave: string; relato: RelatoDesconforto; opcoes: Partial<Record<Vista, string[]>> };
type CartaoPosto = Cartao & { lado: "esq" | "dir"; vista: Vista; regiao: RegiaoCorpo };
type Linha = { chave: string; x1: number; y1: number; x2: number; y2: number; cor: string };
type Balao = { vista: Vista; id: string; x: number; y: number };

function regiao(genero: Genero, vista: Vista, id: string): RegiaoCorpo | undefined {
  return MAPA_CORPO[genero][vista].regioes.find((r) => r.id === id);
}

export function BodyMap({ genero, motivos, relatos, selecionada, onSelecionar, onSalvarRelato, onRemoverRelato }: BodyMapProps) {
  const [hover, setHover] = useState<RegiaoSelecionada | null>(null);
  const [balao, setBalao] = useState<Balao | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [lateral, setLateral] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const svgs = useRef<Record<Vista, SVGSVGElement | null>>({ frente: null, costas: null });
  const cartoes = useRef<Map<string, HTMLElement>>(new Map());

  // Alerta de cada região (vista:id) a partir das zonas de telemetria
  const alertaRegiao = useMemo(() => {
    const mapa = new Map<string, { nivel: number; motivos: Motivo[] }>();
    (Object.keys(motivos) as ZonaCorpo[]).forEach((zona) => {
      const lista = motivos[zona] ?? [];
      if (!lista.length) return;
      const nivel = Math.max(...lista.map((m) => m.nivel));
      (Object.entries(ZONA_REGIOES[zona]) as [Vista, string[]][]).forEach(([vista, ids]) =>
        ids.forEach((id) => {
          const k = chaveRegiao(vista, id);
          const atual = mapa.get(k);
          mapa.set(k, { nivel: Math.max(nivel, atual?.nivel ?? 0), motivos: [...(atual?.motivos ?? []), ...lista] });
        }),
      );
    });
    return mapa;
  }, [motivos]);

  // Cartões: alertas (por zona) e relatos (por região), equilibrados entre os lados.
  // Esquerda aponta para a figura de frente; direita, para a de costas.
  const postos = useMemo(() => {
    const lista: Cartao[] = [
      ...(Object.keys(motivos) as ZonaCorpo[])
        .filter((z) => (motivos[z]?.length ?? 0) > 0)
        .map((z) => ({ tipo: "alerta" as const, chave: `alerta:${z}`, zona: z, motivos: motivos[z]!, opcoes: ZONA_REGIOES[z] })),
      ...Object.entries(relatos).map(([chave, relato]) => ({
        tipo: "relato" as const,
        chave: `relato:${chave}`,
        relato,
        opcoes: { [relato.vista]: [relato.regiaoId] } as Partial<Record<Vista, string[]>>,
      })),
    ];
    const esq: CartaoPosto[] = [];
    const dir: CartaoPosto[] = [];
    const colocar = (c: Cartao, lado: "esq" | "dir") => {
      const vista: Vista = lado === "esq" ? "frente" : "costas";
      const regs = (c.opcoes[vista] ?? []).map((id) => regiao(genero, vista, id)).filter(Boolean) as RegiaoCorpo[];
      if (!regs.length) return false;
      // regiões em par (braços, pernas): usa a do lado de fora, mais perto do cartão
      const r = regs.reduce((a, b) => (lado === "esq" ? (b.anchor.x < a.anchor.x ? b : a) : b.anchor.x > a.anchor.x ? b : a));
      (lado === "esq" ? esq : dir).push({ ...c, lado, vista, regiao: r });
      return true;
    };
    const duplos: Cartao[] = [];
    for (const c of lista) {
      const temF = !!c.opcoes.frente?.length;
      const temC = !!c.opcoes.costas?.length;
      if (temF && temC) duplos.push(c);
      else colocar(c, temF ? "esq" : "dir");
    }
    for (const c of duplos) {
      const preferido = esq.length <= dir.length ? "esq" : "dir";
      if (!colocar(c, preferido)) colocar(c, preferido === "esq" ? "dir" : "esq");
    }
    esq.sort((a, b) => a.regiao.anchor.y - b.regiao.anchor.y);
    dir.sort((a, b) => a.regiao.anchor.y - b.regiao.anchor.y);
    return { esq, dir };
  }, [motivos, relatos, genero]);

  const chaveLinhas = genero + "|" + [...postos.esq, ...postos.dir].map((p) => `${p.chave}@${p.vista}:${p.regiao.id}`).join(",");

  const medir = useCallback(() => {
    const c = container.current?.getBoundingClientRect();
    if (!c) return;
    // A largura do QUADRO (não da janela) decide: o mapa fica num painel de metade da tela no desktop
    const largo = c.width >= LARGURA_LATERAL;
    setLateral(largo);
    if (!largo) {
      setLinhas([]); // sem linhas conectoras com os cartões empilhados
      return;
    }
    const novas: Linha[] = [];
    for (const p of [...postos.esq, ...postos.dir]) {
      const el = cartoes.current.get(p.chave);
      const ctm = svgs.current[p.vista]?.getScreenCTM();
      if (!el || !ctm) continue;
      const pt = new DOMPoint(p.regiao.anchor.x, p.regiao.anchor.y).matrixTransform(ctm);
      const r = el.getBoundingClientRect();
      novas.push({
        chave: p.chave,
        x1: (p.lado === "esq" ? r.right : r.left) - c.left,
        y1: r.top + r.height / 2 - c.top,
        x2: pt.x - c.left,
        y2: pt.y - c.top,
        cor: p.tipo === "relato" ? COR.relato : corDoNivel(Math.max(...p.motivos.map((m) => m.nivel))),
      });
    }
    setLinhas(novas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveLinhas]);

  useLayoutEffect(() => {
    medir();
  }, [medir, lateral]); // trocar de modo muda a posição dos cartões: mede de novo

  useLayoutEffect(() => {
    const obs = new ResizeObserver(medir);
    if (container.current) obs.observe(container.current);
    window.addEventListener("resize", medir);
    return () => {
      obs.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, [medir]);

  const moverBalao = (vista: Vista, id: string, e: React.MouseEvent) => {
    const c = container.current?.getBoundingClientRect();
    if (!c) return;
    setBalao({ vista, id, x: e.clientX - c.left, y: e.clientY - c.top });
  };

  const alternarSelecao = (vista: Vista, id: string) => {
    if (selecionada && selecionada.vista === vista && selecionada.id === id) onSelecionar(null);
    else onSelecionar({ vista, id });
  };

  // ---------------- Figura ----------------
  const figura = (vista: Vista) => {
    const dados = MAPA_CORPO[genero][vista];
    const escurecer = hover !== null;
    // Regiões acesas nesta vista: a apontada e a selecionada
    const acesas = dados.regioes.filter(
      (r) => (hover?.vista === vista && hover.id === r.id) || (selecionada?.vista === vista && selecionada.id === r.id),
    );
    const idClip = (id: string) => `clip-${genero}-${vista}-${id}`;

    return (
      <figure className={lateral ? "flex flex-col items-center" : "flex min-w-0 flex-1 flex-col items-center"}>
        <svg
          ref={(el) => {
            svgs.current[vista] = el;
          }}
          viewBox={`0 0 ${dados.largura} ${dados.altura}`}
          className={
            lateral
              ? "h-[clamp(16rem,34cqw,26rem)] w-auto overflow-visible"
              : "h-auto max-h-[26rem] w-full max-w-[210px] overflow-visible"
          }
          aria-label={`Mapa corporal do astronauta — vista ${vista === "frente" ? "frontal" : "de costas"}`}
          onMouseLeave={() => {
            setHover(null);
            setBalao(null);
          }}
        >
          <defs>
            <radialGradient id={`plataforma-${genero}-${vista}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.45" />
              <stop offset="70%" stopColor="#0e7490" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#0e7490" stopOpacity="0" />
            </radialGradient>
            {acesas.map((r) => (
              <clipPath key={r.id} id={idClip(r.id)}>
                <path d={r.d} />
              </clipPath>
            ))}
          </defs>

          <ellipse
            cx={dados.largura / 2}
            cy={dados.altura * 0.975}
            rx={dados.largura * 0.5}
            ry={dados.altura * 0.035}
            fill={`url(#plataforma-${genero}-${vista})`}
          />

          {/* Imagem base: escurece levemente durante o hover */}
          <image
            href={IMAGENS[genero][vista]}
            width={dados.largura}
            height={dados.altura}
            style={{ filter: escurecer ? "brightness(0.55) saturate(0.6)" : "none", transition: "filter .2s ease" }}
          />
          {/* Regiões acesas em brilho total, recortadas no próprio contorno */}
          {acesas.map((r) => (
            <image
              key={`luz-${r.id}`}
              href={IMAGENS[genero][vista]}
              width={dados.largura}
              height={dados.altura}
              clipPath={`url(#${idClip(r.id)})`}
              style={{ filter: "brightness(1.12) saturate(1.15)" }}
              pointerEvents="none"
            />
          ))}

          {dados.regioes.map((r) => {
            const chave = chaveRegiao(vista, r.id);
            const alerta = alertaRegiao.get(chave);
            const relato = relatos[chave];
            const emHover = hover?.vista === vista && hover.id === r.id;
            const sel = selecionada?.vista === vista && selecionada.id === r.id;
            const corAlerta = alerta ? corDoNivel(alerta.nivel) : undefined;
            const stroke = sel ? "#f8fafc" : relato ? COR.relato : emHover ? COR.hover : corAlerta ?? "#67e8f9";
            return (
              <path
                key={r.id}
                d={r.d}
                fill={corAlerta ?? (emHover ? COR.hover : "transparent")}
                fillOpacity={corAlerta ? (emHover || sel ? 0.18 : 0.28) : emHover ? 0.12 : 0}
                stroke={stroke}
                strokeOpacity={sel || relato || emHover ? 0.95 : alerta ? 0.55 : 0.12}
                strokeWidth={sel ? 1.1 : relato || emHover ? 0.9 : 0.4}
                strokeLinejoin="round"
                style={{ transition: "fill-opacity .2s, stroke-opacity .2s" }}
                className="cursor-pointer"
                onMouseEnter={(e) => {
                  setHover({ vista, id: r.id });
                  moverBalao(vista, r.id, e);
                }}
                onMouseMove={(e) => moverBalao(vista, r.id, e)}
                onClick={(e) => {
                  e.stopPropagation();
                  alternarSelecao(vista, r.id);
                }}
                role="button"
                aria-pressed={sel}
                aria-label={`${r.nome} — ${NOME_VISTA[vista]}`}
              />
            );
          })}

          {/* Marcadores nos centroides: retículo (alerta) e ponto sólido (desconforto relatado) */}
          {dados.regioes.map((r) => {
            const chave = chaveRegiao(vista, r.id);
            const alerta = alertaRegiao.get(chave);
            const relato = relatos[chave];
            if (!alerta && !relato) return null;
            return (
              <g key={`m-${r.id}`} pointerEvents="none">
                {alerta && (
                  <>
                    <circle cx={r.anchor.x} cy={r.anchor.y} r={4.5} fill="none" stroke={corDoNivel(alerta.nivel)} strokeWidth={0.9} strokeDasharray="2 1.5" />
                    <circle cx={r.anchor.x} cy={r.anchor.y} r={0.9} fill={corDoNivel(alerta.nivel)} />
                  </>
                )}
                {relato && (
                  <circle cx={r.anchor.x + (alerta ? 5.5 : 0)} cy={r.anchor.y} r={2.2} fill={COR.relato} stroke="#0b1220" strokeWidth={0.6} />
                )}
              </g>
            );
          })}
        </svg>
        <figcaption className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{NOME_VISTA[vista]}</figcaption>
      </figure>
    );
  };

  // ---------------- Cartões laterais ----------------
  const cartao = (p: CartaoPosto) => {
    const ativo =
      (hover?.vista === p.vista && hover.id === p.regiao.id) || (selecionada?.vista === p.vista && selecionada.id === p.regiao.id);
    const ref = (el: HTMLElement | null) => {
      if (el) cartoes.current.set(p.chave, el);
      else cartoes.current.delete(p.chave);
    };
    const comum = {
      ref,
      onMouseEnter: () => setHover({ vista: p.vista, id: p.regiao.id }),
      onMouseLeave: () => setHover(null),
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelecionar({ vista: p.vista, id: p.regiao.id });
      },
    };
    // Mesmo layout em todos os cartões: cabeçalho (ícone + categoria/título) e descrição em largura total abaixo
    const classe = `flex h-auto w-full flex-col gap-1.5 rounded-md border bg-[#0a1220]/95 px-4 py-3 text-left leading-[1.4] transition ${
      ativo ? "scale-[1.02]" : ""
    }`;

    if (p.tipo === "alerta") {
      const nivel = Math.max(...p.motivos.map((m) => m.nivel));
      const cor = corDoNivel(nivel);
      return (
        <button key={p.chave} {...comum} className={classe} style={{ borderColor: cor, boxShadow: `0 0 ${ativo ? 18 : 10}px ${cor}${ativo ? "66" : "33"}` }}>
          <span className="flex items-center gap-2.5">
            <OrgaoIcone zona={p.zona} cor={cor} className={`h-8 w-8 shrink-0 ${nivel >= 3 ? "animate-pulse" : ""}`} />
            <span className="min-w-0">
              <span className="block font-mono text-[9px] uppercase tracking-widest text-slate-400">{ZONAS[p.zona].orgao}</span>
              <span className="block text-[13px] font-bold leading-[1.3]" style={{ color: cor }}>
                {p.motivos[0].titulo}
              </span>
            </span>
          </span>
          <span className="block text-[11px] text-slate-300">{p.motivos[0].detalhe}</span>
          {p.motivos.length > 1 && (
            <span className="block text-[11px] text-slate-500">+ {p.motivos.slice(1).map((m) => m.titulo.toLowerCase()).join(", ")}</span>
          )}
        </button>
      );
    }
    const rel = p.relato;
    return (
      <button key={p.chave} {...comum} className={classe} style={{ borderColor: COR.relato, boxShadow: `0 0 ${ativo ? 16 : 8}px ${COR.relato}${ativo ? "55" : "26"}` }}>
        <span className="flex items-center gap-2.5">
          <OrgaoIcone zona={zonaDaRegiao(rel.regiaoId)} cor={COR.relato} className="h-8 w-8 shrink-0" />
          <span className="min-w-0">
            <span className="block font-mono text-[9px] uppercase tracking-widest text-violet-300">Desconforto relatado</span>
            <span className="block text-[13px] font-bold leading-[1.3] text-violet-200">
              {rel.tipo} • {rel.intensidade}/5
            </span>
          </span>
        </span>
        <span className="block text-[11px] text-slate-300">
          {rel.nome} ({NOME_VISTA[rel.vista]}){rel.detalhe ? ` — ${rel.detalhe}` : ""}
        </span>
      </button>
    );
  };

  // ---------------- Balão e formulário ----------------
  const balaoReg = balao && hover && balao.vista === hover.vista && balao.id === hover.id ? regiao(genero, balao.vista, balao.id) : undefined;
  const balaoChave = balao ? chaveRegiao(balao.vista, balao.id) : "";
  const selReg = selecionada ? regiao(genero, selecionada.vista, selecionada.id) : undefined;
  const selChave = selecionada ? chaveRegiao(selecionada.vista, selecionada.id) : "";
  const nenhumCartao = postos.esq.length === 0 && postos.dir.length === 0;
  const semAlertas = (
    <p className="rounded border border-emerald-800/60 bg-emerald-500/5 p-2 text-center font-mono text-[10px] text-emerald-300">
      ✓ Nenhum alerta ou desconforto
    </p>
  );
  const figuras = (
    <div className={`flex items-end ${lateral ? "gap-3" : "justify-center gap-2 sm:gap-4"}`}>
      {figura("frente")}
      {/* Marca d'água entre as figuras: as imagens dos astronautas foram geradas com IA */}
      <div
        className="pointer-events-none flex shrink-0 -translate-y-2 select-none flex-col items-center gap-1 self-center text-white/35"
        role="note"
        aria-label="Imagens criadas com IA"
      >
        <span className="text-lg font-black leading-none">IA</span>
        <span className="text-center font-mono text-[9px] font-semibold uppercase leading-tight tracking-wider">
          Imagem criada
          <br />
          com IA
        </span>
      </div>
      {figura("costas")}
    </div>
  );

  return (
    <div className="flex flex-col">
      {/* Clicar no fundo vazio libera a seleção */}
      <div ref={container} className="@container relative" onClick={() => selecionada && onSelecionar(null)}>
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(rgba(56,189,248,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.25) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        />

        {lateral ? (
          // Quadro largo: cartões nas laterais (260–320 px), figuras no centro, sem sobreposição
          <div className="relative grid grid-cols-[minmax(250px,320px)_auto_minmax(250px,320px)] items-center justify-center gap-3 py-1">
            <div className="flex flex-col gap-2.5">
              {postos.esq.map(cartao)}
              {nenhumCartao && semAlertas}
            </div>
            {figuras}
            <div className="flex flex-col gap-2.5">{postos.dir.map(cartao)}</div>
          </div>
        ) : (
          // Quadro estreito (tablet, celular e o painel de meia tela): figuras em cima, cartões numa grade abaixo
          <div className="relative flex flex-col gap-3 py-1">
            {figuras}
            {nenhumCartao ? (
              semAlertas
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-2.5">
                {[...postos.esq, ...postos.dir].sort((x, y) => x.regiao.anchor.y - y.regiao.anchor.y).map(cartao)}
              </div>
            )}
          </div>
        )}

        {/* Linhas finas dos cartões até os centroides */}
        <svg className={`pointer-events-none absolute inset-0 h-full w-full overflow-visible ${lateral ? "" : "hidden"}`}>
          {linhas.map((l) => {
            const xm = l.x1 + (l.x2 > l.x1 ? 14 : -14);
            return (
              <g key={l.chave}>
                <path d={`M${l.x1},${l.y1} L${xm},${l.y1} L${l.x2},${l.y2}`} fill="none" stroke={l.cor} strokeWidth={1.1} strokeDasharray="4 3" opacity={0.85} />
                <circle cx={l.x2} cy={l.y2} r={2.2} fill={l.cor} />
              </g>
            );
          })}
        </svg>

        {/* Balão junto ao cursor (abaixo e à direita) */}
        {balao && balaoReg && (
          <div
            className="pointer-events-none absolute z-20 w-56 rounded-md border bg-[#050b16]/95 p-2.5 shadow-xl backdrop-blur"
            style={{
              left: Math.min(balao.x + 16, (container.current?.clientWidth ?? 600) - 232),
              top: balao.y + 16,
              borderColor: relatos[balaoChave] ? COR.relato : alertaRegiao.get(balaoChave) ? corDoNivel(alertaRegiao.get(balaoChave)!.nivel) : COR.hover,
            }}
          >
            <p className="font-mono text-[10px] uppercase tracking-widest text-cyan-300">
              {balaoReg.nome} — {NOME_VISTA[balao.vista]}
            </p>
            {alertaRegiao.get(balaoChave) && (
              <p className="mt-1 text-[11px] font-semibold" style={{ color: corDoNivel(alertaRegiao.get(balaoChave)!.nivel) }}>
                ⚠ {alertaRegiao.get(balaoChave)!.motivos[0].titulo}
              </p>
            )}
            <p className={`mt-1 text-[11px] ${relatos[balaoChave] ? "text-violet-300" : "text-slate-400"}`}>
              {relatos[balaoChave]
                ? `Desconforto: ${relatos[balaoChave].tipo} • ${relatos[balaoChave].intensidade}/5`
                : "Sem desconforto registrado"}
            </p>
            <p className="mt-1 text-[10px] text-slate-500">Clique para relatar desconforto</p>
          </div>
        )}
      </div>

      {/* Legenda */}
      <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-slate-400">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cyan-400" />Passe o mouse</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />Atenção</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" />Crítico</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-400" />Desconforto</span>
      </div>

      {/* Registro de desconforto da região selecionada */}
      <div className="mt-3">
        {selecionada && selReg ? (
          <RelatoForm
            key={`${genero}-${selChave}`}
            titulo={`${selReg.nome} (${NOME_VISTA[selecionada.vista]})`}
            descricao={`${ZONAS[zonaDaRegiao(selReg.id)].sistema} • Perigo NASA HRP: ${ZONAS[zonaDaRegiao(selReg.id)].perigo}`}
            existente={relatos[selChave] ?? null}
            // Salvar ou remover fecha o registro (libera a seleção da região)
            onSalvar={({ tipo, intensidade, detalhe }) => {
              onSalvarRelato({
                regiaoId: selReg.id,
                vista: selecionada.vista,
                nome: selReg.nome,
                tipo,
                intensidade,
                detalhe,
                criadoEm: new Date().toISOString(),
              });
              onSelecionar(null);
            }}
            onRemover={() => {
              onRemoverRelato(selChave);
              onSelecionar(null);
            }}
            onFechar={() => onSelecionar(null)}
          />
        ) : (
          <p className="rounded border border-cyan-900/60 bg-cyan-950/20 p-3 text-xs text-slate-500">
            Passe o mouse para ver cada parte do corpo. Clique em uma região para relatar um desconforto (dor, fadiga, formigamento…).
          </p>
        )}
      </div>
    </div>
  );
}
