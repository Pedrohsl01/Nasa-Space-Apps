import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Thermometer, Watch } from "lucide-react";

// Moldura compacta dos widgets, no mesmo estilo dos painéis principais
function Widget({ titulo, icone, children }: { titulo: string; icone: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="relative flex flex-1 flex-col rounded-md border border-(--borda) bg-(--card) backdrop-blur-md p-3">
      <span className="pointer-events-none absolute -top-px -left-px h-2.5 w-2.5 border-t-2 border-l-2 border-(--canto)" />
      <span className="pointer-events-none absolute -bottom-px -right-px h-2.5 w-2.5 border-b-2 border-r-2 border-(--canto)" />
      <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
        {icone}
        {titulo}
      </h3>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Dispositivo de medição (smartwatch, smart ring, pulseira)           */
/* ------------------------------------------------------------------ */

type Dispositivo = {
  id: string;
  nome: string;
  posicao: string;
  sensores: string[];
  desenho: React.ReactNode;
};

const COR = "#22d3ee";

const DISPOSITIVOS: Dispositivo[] = [
  {
    id: "smartwatch",
    nome: "Smartwatch",
    posicao: "Pulso",
    sensores: ["FC", "Temp. pele", "Sono", "Atividade"],
    desenho: (
      <svg viewBox="0 0 64 64" className="h-14 w-14" aria-hidden="true">
        <rect x="22" y="4" width="20" height="12" rx="3" fill="none" stroke={COR} strokeOpacity=".5" strokeWidth="2" />
        <rect x="22" y="48" width="20" height="12" rx="3" fill="none" stroke={COR} strokeOpacity=".5" strokeWidth="2" />
        <rect x="16" y="15" width="32" height="34" rx="8" fill="#0b1a2b" stroke={COR} strokeWidth="2.5" />
        <polyline points="21,33 27,33 30,26 34,40 37,31 43,31" fill="none" stroke={COR} strokeWidth="2" strokeLinejoin="round" />
        <rect x="48" y="27" width="3" height="8" rx="1.5" fill={COR} />
      </svg>
    ),
  },
  {
    id: "smart-ring",
    nome: "Smart Ring",
    posicao: "Dedo",
    sensores: ["FC", "Temp. pele", "Sono", "SpO₂"],
    desenho: (
      <svg viewBox="0 0 64 64" className="h-14 w-14" aria-hidden="true">
        <ellipse cx="32" cy="36" rx="20" ry="20" fill="none" stroke={COR} strokeWidth="6" />
        <ellipse cx="32" cy="36" rx="20" ry="20" fill="none" stroke="#0b1a2b" strokeWidth="2" />
        <rect x="25" y="11" width="14" height="8" rx="3" fill="#0b1a2b" stroke={COR} strokeWidth="2" />
        <circle cx="32" cy="15" r="1.8" fill={COR} />
      </svg>
    ),
  },
  {
    id: "pulseira",
    nome: "Pulseira inteligente",
    posicao: "Antebraço",
    sensores: ["FC", "Passos", "Sono", "Atividade"],
    desenho: (
      <svg viewBox="0 0 64 64" className="h-14 w-14" aria-hidden="true">
        <rect x="8" y="24" width="48" height="16" rx="8" fill="none" stroke={COR} strokeOpacity=".5" strokeWidth="2" />
        <rect x="20" y="22" width="24" height="20" rx="6" fill="#0b1a2b" stroke={COR} strokeWidth="2.5" />
        <line x1="25" y1="32" x2="39" y2="32" stroke={COR} strokeWidth="2" strokeLinecap="round" />
        <circle cx="25" cy="32" r="1.6" fill={COR} />
      </svg>
    ),
  },
];

const CHAVE_DISPOSITIVO = "astrohealth:dispositivo";

export function DispositivoWidget() {
  const [indice, setIndice] = useState(() => {
    try {
      const salvo = localStorage.getItem(CHAVE_DISPOSITIVO);
      const i = DISPOSITIVOS.findIndex((d) => d.id === salvo);
      return i >= 0 ? i : 0;
    } catch {
      return 0;
    }
  });

  const trocar = (passo: number) => {
    const novo = (indice + passo + DISPOSITIVOS.length) % DISPOSITIVOS.length;
    setIndice(novo);
    try {
      localStorage.setItem(CHAVE_DISPOSITIVO, DISPOSITIVOS[novo].id);
    } catch {
      /* preferência opcional */
    }
  };

  const d = DISPOSITIVOS[indice];
  const seta = "rounded bg-slate-800/80 p-1 text-slate-300 hover:bg-cyan-500/20 hover:text-cyan-200";

  return (
    <Widget titulo="Dispositivo de medição" icone={<Watch className="h-3.5 w-3.5" />}>
      <div className="flex flex-1 items-center gap-2">
        <button onClick={() => trocar(-1)} className={seta} aria-label="Dispositivo anterior">
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <div className="flex flex-1 flex-col items-center text-center">
          <div className="drop-shadow-[0_0_8px_rgba(34,211,238,0.45)]">{d.desenho}</div>
          <p className="mt-1 text-sm font-semibold text-white">{d.nome}</p>
          <p className="font-mono text-[10px] text-slate-500">{d.posicao} • sincronizado (simulado)</p>
        </div>
        <button onClick={() => trocar(1)} className={seta} aria-label="Próximo dispositivo">
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-1">
        {d.sensores.map((s) => (
          <span key={s} className="rounded border border-cyan-900/70 px-1.5 py-0.5 font-mono text-[9px] uppercase text-cyan-300/80">
            {s}
          </span>
        ))}
      </div>
      <div className="mt-2 flex justify-center gap-1">
        {DISPOSITIVOS.map((x, i) => (
          <span key={x.id} className={`h-1 rounded-full transition-all ${i === indice ? "w-4 bg-cyan-400" : "w-1.5 bg-slate-700"}`} />
        ))}
      </div>
    </Widget>
  );
}

/* ------------------------------------------------------------------ */
/* Hora: UTC (padrão de controle de missão) e hora local               */
/* ------------------------------------------------------------------ */

export function RelogioWidget() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const utc = agora.toLocaleTimeString("pt-BR", { timeZone: "UTC", hour12: false });
  const local = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
  const data = agora.toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });

  return (
    <Widget titulo="Hora" icone={<Clock className="h-3.5 w-3.5" />}>
      <div className="flex flex-1 flex-col justify-center">
        <p className="font-mono text-3xl font-bold leading-none tracking-wider text-white">{utc}</p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-cyan-400">UTC • {data}</p>
        <p className="mt-1 font-mono text-[10px] text-slate-500">Local: {local}</p>
      </div>
    </Widget>
  );
}

/* ------------------------------------------------------------------ */
/* Temperatura externa (ilustrativa, por ambiente)                     */
/* ------------------------------------------------------------------ */

// Valores ILUSTRATIVOS para a demo. Ordem de grandeza comumente citada pela NASA — a confirmar.
const CLIMA: Record<string, { min: number; max: number; ciclo: string; nota: string }> = {
  "Estacao Orbital": { min: -157, max: 121, ciclo: "dia/noite orbital ~90 min", nota: "Superfície externa ao sol vs. sombra" },
  "Transito para Marte": { min: -150, max: 120, ciclo: "rotação da nave ~60 min", nota: "Casco: face ao Sol vs. face oposta" },
  "Base Marciana": { min: -90, max: 0, ciclo: "sol marciano ~24 h 40 min", nota: "Superfície de Marte, perto da base" },
};

export function TemperaturaExternaWidget({ ambiente, dia }: { ambiente: string; dia: number | null }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  const clima = CLIMA[ambiente] ?? CLIMA["Base Marciana"];
  // Oscilação suave entre mínimo e máximo, só para dar vida ao widget (simulado)
  const periodoMin = ambiente === "Estacao Orbital" ? 90 : ambiente === "Transito para Marte" ? 60 : 1480;
  const fase = ((agora / 60000) % periodoMin) / periodoMin + (dia ?? 0) * 0.07;
  const fator = (Math.sin(fase * 2 * Math.PI) + 1) / 2;
  const temp = Math.round(clima.min + (clima.max - clima.min) * fator);
  const quente = temp > 0;

  return (
    <Widget titulo="Temperatura externa" icone={<Thermometer className="h-3.5 w-3.5" />}>
      <div className="flex flex-1 flex-col justify-center">
        <p className={`font-mono text-3xl font-bold leading-none ${quente ? "text-orange-300" : "text-sky-300"}`}>
          {temp > 0 ? "+" : ""}
          {temp} °C
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gradient-to-r from-sky-500 via-slate-600 to-orange-400">
          <div className="relative h-full" style={{ width: `${fator * 100}%` }}>
            <span className="absolute -top-0.5 right-0 h-2.5 w-0.5 rounded bg-white" />
          </div>
        </div>
        <div className="mt-0.5 flex justify-between font-mono text-[9px] text-slate-500">
          <span>{clima.min} °C</span>
          <span>+{clima.max} °C</span>
        </div>
        <p className="mt-1 text-[10px] text-slate-400">{clima.nota}</p>
        <p className="font-mono text-[9px] text-slate-600">{clima.ciclo} • valor ilustrativo (simulado)</p>
      </div>
    </Widget>
  );
}
