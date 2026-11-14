interface BodyMapProps {
  partesAfetadas: string; // Ex: "cabeca;pernas" ou "nenhuma"
  codigoSemaforo: number; // 1 = Verde, 2 = Amarelo, 3 = Vermelho
  zonaSelecionada: string | null;
  onSelectZona: (zona: string) => void;
}

const DESCRICOES_ZONAS: Record<string, { titulo: string; detalhe: string }> = {
  cabeca: {
    titulo: "Cabeça / Sistema Neuro-ocular & Cognitivo",
    detalhe: "Monitora sinais de SANS (deslocamento de fluidos para o crânio), qualidade do sono (ARCHeR) e humor.",
  },
  peito: {
    titulo: "Peito / Sistema Cardiovascular",
    detalhe: "Monitora pressão arterial e frequência cardíaca em repouso frente à redistribuição sanguínea na microgravidade.",
  },
  pulmao: {
    titulo: "Pulmão / Capacidade Cardiorrespiratória",
    detalhe: "Avalia sobrecarga metabólica e eficiência respiratória em ambientes fechados e pressões reduzidas.",
  },
  coluna: {
    titulo: "Coluna / Estrutura Axial (Spinal Health)",
    detalhe: "Acompanha o alongamento e enfraquecimento dos músculos estabilizadores da coluna sem gravidade.",
  },
  pernas: {
    titulo: "Pernas / Densidade Óssea e Massa Muscular",
    detalhe: "Verifica adesão aos exercícios resistidos diários (Zero T2) para evitar perda de ~1% de massa óssea/mês.",
  },
  pele: {
    titulo: "Pele & Imunidade / Exposição à Radiação",
    detalhe: "Monitora dose acumulada (CANS) e sinais de reativação viral ou infecções em ambiente confinado.",
  },
};

export function BodyMap({
  partesAfetadas,
  codigoSemaforo,
  zonaSelecionada,
  onSelectZona,
}: BodyMapProps) {
  const listaAfetadas = partesAfetadas
    .split(";")
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p && p !== "nenhuma");

  const getZoneColor = (zona: string) => {
    if (!listaAfetadas.includes(zona)) return "#10b981"; // Verde (Nominal)
    if (codigoSemaforo === 3) return "#ef4444"; // Vermelho (Crítico)
    if (codigoSemaforo === 2) return "#f59e0b"; // Amarelo (Atenção)
    return "#10b981";
  };

  const infoAtual = zonaSelecionada ? DESCRICOES_ZONAS[zonaSelecionada] : null;

  return (
    <div className="flex flex-col items-center bg-slate-900/90 p-5 rounded-2xl border border-slate-800">
      <div className="w-full flex justify-between items-center mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Gêmeo Biométrico
        </h3>
        <span className="text-xs text-slate-400">Clique em uma região</span>
      </div>

      <svg viewBox="0 0 220 430" className="w-56 h-96 drop-shadow-xl">
        {/* Silhueta Humana Base */}
        <path
          d="M110,18 C128,18 140,33 140,53 C140,70 128,84 110,84 C92,84 80,70 80,53 C80,33 92,18 110,18 Z
             M72,94 L148,94 L172,215 L152,220 L138,132 L138,255 L154,405 L128,405 L110,275 L92,405 L66,405 L82,255 L82,132 L68,220 L48,215 Z"
          fill="#1e293b"
          stroke="#334155"
          strokeWidth="2"
        />

        {/* 1. CABEÇA (Neuro-ocular / Sono / Humor) */}
        <circle
          cx="110"
          cy="50"
          r="19"
          fill={getZoneColor("cabeca")}
          stroke={zonaSelecionada === "cabeca" ? "#ffffff" : "none"}
          strokeWidth="2.5"
          className="cursor-pointer transition-all hover:opacity-85"
          onClick={() => onSelectZona("cabeca")}
        />

        {/* 2. PULMÃO (Região Torácica Lateral) */}
        <ellipse
          cx="95"
          cy="138"
          rx="11"
          ry="20"
          fill={getZoneColor("pulmao")}
          stroke={zonaSelecionada === "pulmao" ? "#ffffff" : "none"}
          strokeWidth="2.5"
          className="cursor-pointer transition-all hover:opacity-85"
          onClick={() => onSelectZona("pulmao")}
        />
        <ellipse
          cx="125"
          cy="138"
          rx="11"
          ry="20"
          fill={getZoneColor("pulmao")}
          stroke={zonaSelecionada === "pulmao" ? "#ffffff" : "none"}
          strokeWidth="2.5"
          className="cursor-pointer transition-all hover:opacity-85"
          onClick={() => onSelectZona("pulmao")}
        />

        {/* 3. PEITO / CORAÇÃO (Centro Torácico) */}
        <circle
          cx="114"
          cy="136"
          r="11"
          fill={getZoneColor("peito")}
          stroke={zonaSelecionada === "peito" ? "#ffffff" : "none"}
          strokeWidth="2.5"
          className="cursor-pointer transition-all hover:opacity-85"
          onClick={() => onSelectZona("peito")}
        />

        {/* 4. COLUNA (Eixo Central Lombar/Torácico) */}
        <rect
          x="105"
          y="165"
          width="10"
          height="78"
          rx="5"
          fill={getZoneColor("coluna")}
          stroke={zonaSelecionada === "coluna" ? "#ffffff" : "none"}
          strokeWidth="2.5"
          className="cursor-pointer transition-all hover:opacity-85"
          onClick={() => onSelectZona("coluna")}
        />

        {/* 5. PELE / IMUNIDADE & RADIAÇÃO (Antebraço) */}
        <rect
          x="53"
          y="142"
          width="13"
          height="62"
          rx="6"
          transform="rotate(11 53 142)"
          fill={getZoneColor("pele")}
          stroke={zonaSelecionada === "pele" ? "#ffffff" : "none"}
          strokeWidth="2.5"
          className="cursor-pointer transition-all hover:opacity-85"
          onClick={() => onSelectZona("pele")}
        />

        {/* 6. PERNAS (Musculoesquelético / Perda Óssea) */}
        <rect
          x="81"
          y="285"
          width="15"
          height="95"
          rx="7"
          fill={getZoneColor("pernas")}
          stroke={zonaSelecionada === "pernas" ? "#ffffff" : "none"}
          strokeWidth="2.5"
          className="cursor-pointer transition-all hover:opacity-85"
          onClick={() => onSelectZona("pernas")}
        />
        <rect
          x="124"
          y="285"
          width="15"
          height="95"
          rx="7"
          fill={getZoneColor("pernas")}
          stroke={zonaSelecionada === "pernas" ? "#ffffff" : "none"}
          strokeWidth="2.5"
          className="cursor-pointer transition-all hover:opacity-85"
          onClick={() => onSelectZona("pernas")}
        />
      </svg>

      {/* Legenda de Cores */}
      <div className="flex gap-4 mt-3 text-xs text-slate-300">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>1 Nominal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>2 Atenção
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>3 Crítico
        </span>
      </div>

      {/* Card Didático ao Clicar na Parte do Corpo */}
      {infoAtual && (
        <div className="mt-4 w-full bg-slate-800/90 p-3 rounded-xl border border-slate-700 text-xs">
          <p className="font-semibold text-sky-400 mb-1">{infoAtual.titulo}</p>
          <p className="text-slate-300 leading-relaxed">{infoAtual.detalhe}</p>
        </div>
      )}
    </div>
  );
}
