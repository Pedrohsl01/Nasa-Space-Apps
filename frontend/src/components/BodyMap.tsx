// Mapa corporal SVG clicável, pintado por partes_afetadas + codigo_semaforo (colunas do dataset)

export type Zona = "cabeca" | "peito" | "pulmao" | "coluna" | "pernas" | "pele";

interface BodyMapProps {
  partesAfetadas: string; // Ex.: "cabeca;pernas" ou "nenhuma"
  codigoSemaforo: number; // 1 = Nominal, 2 = Atenção, 3 = Crítico
  zonaSelecionada: Zona | null;
  onSelectZona: (zona: Zona) => void;
}

export const ZONAS: Record<Zona, { nome: string; sistema: string; detalhe: string; perigo: string }> = {
  cabeca: {
    nome: "Cabeça",
    sistema: "Neuro-ocular • Sono • Humor",
    detalhe:
      "Na microgravidade, os líquidos do corpo sobem para a cabeça e podem pressionar os olhos (SANS). Sono e humor sofrem com rotina apertada e confinamento.",
    perigo: "Gravidade alterada • Isolamento e confinamento",
  },
  peito: {
    nome: "Peito / Coração",
    sistema: "Cardiovascular",
    detalhe:
      "Sem gravidade, o sangue se redistribui e o coração trabalha diferente. Pressão e frequência cardíaca são comparadas com a SUA linha de base.",
    perigo: "Gravidade alterada • Ambiente fechado",
  },
  pulmao: {
    nome: "Pulmões",
    sistema: "Cardiorrespiratório",
    detalhe: "Frequência cardíaca muito acima da base pode indicar esforço, febre ou infecção no ambiente fechado da nave.",
    perigo: "Ambiente fechado e hostil",
  },
  coluna: {
    nome: "Coluna",
    sistema: "Musculoesquelético axial",
    detalhe: "Sem carga do peso do corpo, os músculos que sustentam a coluna enfraquecem. O treino resistido diário ajuda a proteger.",
    perigo: "Gravidade alterada",
  },
  pernas: {
    nome: "Pernas",
    sistema: "Ossos e músculos",
    detalhe: "Ossos e músculos das pernas perdem massa sem gravidade. A meta do projeto é ~60 min/dia de treino resistido.",
    perigo: "Gravidade alterada",
  },
  pele: {
    nome: "Pele / Imunidade",
    sistema: "Radiação • Imunidade",
    detalhe: "Fora da proteção da Terra, a dose de radiação se acumula. Febre pode indicar infecção, comum com o estresse imune no espaço.",
    perigo: "Radiação • Ambiente fechado",
  },
};

const COR = {
  nominal: "#22c55e",
  atencao: "#f59e0b",
  critico: "#ef4444",
};

export function BodyMap({ partesAfetadas, codigoSemaforo, zonaSelecionada, onSelectZona }: BodyMapProps) {
  const afetadas = partesAfetadas
    .split(";")
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p && p !== "nenhuma");

  const cor = (zona: Zona) => {
    if (!afetadas.includes(zona)) return COR.nominal;
    if (codigoSemaforo >= 3) return COR.critico;
    if (codigoSemaforo === 2) return COR.atencao;
    return COR.nominal;
  };

  // Propriedades comuns a todas as regiões clicáveis
  const regiao = (zona: Zona) => {
    const afetada = afetadas.includes(zona);
    const selecionada = zonaSelecionada === zona;
    return {
      fill: cor(zona),
      fillOpacity: afetada ? 0.85 : 0.35,
      stroke: selecionada ? "#e0f2fe" : cor(zona),
      strokeWidth: selecionada ? 2.5 : 1,
      className: `cursor-pointer transition-all duration-300 hover:brightness-125 ${afetada && codigoSemaforo >= 3 ? "animate-pulse" : ""}`,
      onClick: () => onSelectZona(zona),
      role: "button" as const,
      "aria-label": ZONAS[zona].nome,
    };
  };

  const info = zonaSelecionada ? ZONAS[zonaSelecionada] : null;
  const afetadaSelecionada = zonaSelecionada ? afetadas.includes(zonaSelecionada) : false;

  return (
    <div className="flex flex-col">
      <div className="relative flex justify-center py-2">
        {/* Grade de fundo estilo radar */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(56,189,248,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.25) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        />
        <svg viewBox="0 0 220 430" className="relative w-52 h-[22rem]" aria-label="Mapa corporal do astronauta">
          {/* Silhueta */}
          <path
            d="M110,18 C128,18 140,33 140,53 C140,70 128,84 110,84 C92,84 80,70 80,53 C80,33 92,18 110,18 Z
               M72,94 L148,94 L172,215 L152,220 L138,132 L138,255 L154,405 L128,405 L110,275 L92,405 L66,405 L82,255 L82,132 L68,220 L48,215 Z"
            fill="#0b1220"
            stroke="#1e3a5f"
            strokeWidth="2"
          />

          {/* Cabeça */}
          <circle cx="110" cy="51" r="21" {...regiao("cabeca")} />

          {/* Pulmões */}
          <ellipse cx="93" cy="140" rx="12" ry="22" {...regiao("pulmao")} />
          <ellipse cx="127" cy="140" rx="12" ry="22" {...regiao("pulmao")} />

          {/* Peito / coração */}
          <circle cx="112" cy="134" r="10" {...regiao("peito")} />

          {/* Coluna */}
          <rect x="105" y="168" width="10" height="80" rx="5" {...regiao("coluna")} />

          {/* Pele (antebraços) */}
          <rect x="52" y="140" width="13" height="64" rx="6" transform="rotate(11 52 140)" {...regiao("pele")} />
          <rect x="155" y="140" width="13" height="64" rx="6" transform="rotate(-11 168 140)" {...regiao("pele")} />

          {/* Pernas */}
          <rect x="80" y="285" width="16" height="100" rx="7" {...regiao("pernas")} />
          <rect x="124" y="285" width="16" height="100" rx="7" {...regiao("pernas")} />
        </svg>
      </div>

      {/* Legenda */}
      <div className="flex justify-center gap-4 text-[10px] font-mono uppercase tracking-wider text-slate-400">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" />Nominal</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" />Atenção</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />Crítico</span>
      </div>

      {/* Explicação da região clicada */}
      <div className="mt-3 min-h-28 rounded border border-cyan-900/60 bg-cyan-950/20 p-3 text-xs">
        {info ? (
          <>
            <div className="flex items-center justify-between">
              <p className="font-mono uppercase tracking-wider text-cyan-300">{info.nome}</p>
              <span
                className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                  afetadaSelecionada
                    ? codigoSemaforo >= 3
                      ? "bg-red-500/20 text-red-300"
                      : "bg-amber-500/20 text-amber-300"
                    : "bg-green-500/15 text-green-300"
                }`}
              >
                {afetadaSelecionada ? "EM ALERTA" : "NOMINAL"}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">{info.sistema}</p>
            <p className="text-slate-300 mt-2 leading-relaxed">{info.detalhe}</p>
            <p className="text-[10px] text-slate-500 mt-2 font-mono uppercase">Perigo NASA HRP: {info.perigo}</p>
          </>
        ) : (
          <p className="text-slate-500">Clique em uma região do corpo para ver o que o espaço causa nela.</p>
        )}
      </div>
    </div>
  );
}
