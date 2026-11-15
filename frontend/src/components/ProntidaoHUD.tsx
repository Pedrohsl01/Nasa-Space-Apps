// Barra de Prontidão de Missão (HUD): 20 segmentos, rank operacional, XP de mitigação e sinais vitais resumidos.
import type { Prontidao } from "./prontidao";

const COR = {
  apto: { seg: "bg-[#34D399]", texto: "text-[#34D399]", borda: "border-emerald-500/50" },
  atencao: { seg: "bg-[#FBBF24]", texto: "text-[#FBBF24]", borda: "border-amber-500/50" },
  critico: { seg: "bg-[#EF4444]", texto: "text-[#EF4444]", borda: "border-red-500/60" },
};

export interface SinalResumo {
  rotulo: string;
  valor: string;
  alerta?: boolean;
}

export function ProntidaoHUD({ prontidao, xp, ganho, sinais }: {
  prontidao: Prontidao;
  xp: number;
  ganho: { id: number; texto: string } | null;
  sinais: SinalResumo[];
}) {
  const cor = COR[prontidao.faixa];
  const acesos = Math.round(prontidao.valor / 5);
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {/* Barra segmentada */}
      <div className="relative min-w-64 flex-1">
        <div className="mb-1 flex items-baseline gap-2 font-mono text-[10px] uppercase tracking-[0.2em]">
          <span className="text-slate-400">Aptidão EVA</span>
          <span className={`text-sm font-bold tabular-nums ${cor.texto}`}>{prontidao.valor}%</span>
          <span className={`font-semibold ${cor.texto}`}>// {prontidao.rotulo}</span>
        </div>
        <div className="flex gap-[3px]" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={prontidao.valor} aria-label="Aptidão para EVA">
          {Array.from({ length: 20 }, (_, i) => (
            <span
              key={i}
              className={`h-2.5 flex-1 skew-x-[-20deg] rounded-[1px] transition-all duration-700 ${i < acesos ? cor.seg : "bg-slate-800"}`}
              style={{ transitionDelay: `${i * 25}ms` }}
            />
          ))}
        </div>
        {/* Fatores que pesam agora (resumo + lista completa no tooltip) */}
        <p
          className="mt-1 truncate font-mono text-[9px] text-slate-500"
          title={[`Base: ${prontidao.base}`, ...prontidao.fatores.map((f) => `${f.pontos > 0 ? "+" : ""}${f.pontos}% ${f.rotulo}`)].join("\n")}
        >
          Base: {prontidao.base}
          {prontidao.fatores.length === 0 && <span className="text-emerald-400/80"> | sem descontos</span>}
          {prontidao.fatores.slice(0, 3).map((f) => (
            <span key={f.rotulo} className={f.pontos > 0 ? "text-emerald-400/90" : "text-amber-300/90"}>
              {" "}| {f.pontos > 0 ? "+" : ""}
              {f.pontos}% {f.rotulo}
            </span>
          ))}
          {prontidao.fatores.length > 3 && <span> | +{prontidao.fatores.length - 3}</span>}
        </p>
        {/* Feedback do ganho: sobe e some */}
        {ganho && (
          <span
            key={ganho.id}
            className="hud-ganho pointer-events-none absolute -top-1 right-0 rounded border border-emerald-500/60 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-200"
          >
            {ganho.texto}
          </span>
        )}
      </div>

      {/* XP de mitigação */}
      <div className={`rounded border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${cor.borda}`}>
        <span className="text-slate-500">Mitigação</span> <span className="font-bold tabular-nums text-cyan-200">{xp} XP</span>
      </div>

      {/* Sinais vitais resumidos */}
      <div className="flex flex-wrap gap-1.5">
        {sinais.map((s) => (
          <span
            key={s.rotulo}
            className={`rounded border px-2 py-1 font-mono text-[10px] ${
              s.alerta ? "border-amber-500/60 bg-amber-500/10 text-amber-200" : "border-slate-800 bg-(--subcard) text-slate-300"
            }`}
          >
            <span className="text-slate-500">{s.rotulo}</span> <span className={`font-semibold tabular-nums ${s.alerta ? "" : "text-(--dados)"}`}>{s.valor}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
