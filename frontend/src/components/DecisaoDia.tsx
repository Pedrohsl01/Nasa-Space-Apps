// First fold on alert days: what happened, the recommended action and the data supporting the alert.
// On routine days the top goes back to the short routine strip (goals and XP live in Daily missions).
import { AlertTriangle, ArrowDownRight, Earth, Satellite, ShieldAlert } from "lucide-react";
import { tCategorias, tStatus } from "../i18n";
import type { Motivo } from "./motivosAlerta";

export interface EvidenciaAlerta extends Motivo {
  parte: string; // "Head", "Chest"... (where the body map shows it)
}

const STATUS_EVA = {
  INAPTO: { texto: "Extravehicular activity (EVA) suspended", cor: "text-red-200 border-red-500/70 bg-red-500/15" },
  RESTRICAO: { texto: "Extravehicular activity (EVA) restricted: light exertion only", cor: "text-amber-200 border-amber-500/70 bg-amber-500/10" },
  APTO: { texto: "Extravehicular activity (EVA) cleared", cor: "text-emerald-200 border-emerald-500/60 bg-emerald-500/10" },
} as const;

export function DecisaoDia({
  codigo,
  status,
  score,
  resumo,
  categorias,
  statusEva,
  motivosEva,
  acoes,
  tags,
  escalonamento,
  evidencias,
  onVerProtocolo,
  children,
}: {
  codigo: number;
  status?: string; // e.g. "CRITICO"
  score?: number | null;
  resumo?: string;
  categorias: string;
  statusEva?: "APTO" | "RESTRICAO" | "INAPTO";
  motivosEva: string[];
  acoes: string[];
  tags: string[];
  escalonamento: string;
  evidencias: EvidenciaAlerta[];
  onVerProtocolo: () => void;
  children?: React.ReactNode; // day selector (on the right)
}) {
  const critico = codigo >= 3;
  const cor = critico
    ? { borda: "border-red-500/70", fundo: "bg-red-950/40", texto: "text-[#EF4444]" }
    : { borda: "border-amber-500/60", fundo: "bg-amber-950/25", texto: "text-[#FBBF24]" };
  const eva = statusEva ? STATUS_EVA[statusEva] : null;
  const rotulo = (critico ? "Critical" : "Warning") + (score !== undefined && score !== null ? ` · ${score}/100` : "");

  return (
    <section
      className={`relative mb-4 rounded-md border-2 ${cor.borda} ${cor.fundo} p-4 backdrop-blur-md`}
      aria-labelledby="titulo-decisao"
      role="region"
    >
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 id="titulo-decisao" className={`flex flex-wrap items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] ${cor.texto}`}>
            <ShieldAlert className="h-4 w-4" />
            Today's decision
            <span className={`rounded border px-1.5 py-0.5 text-[10px] tracking-wider ${cor.borda}`} title={tStatus(status)}>
              {rotulo}
            </span>
          </h2>

          <div className="mt-3 grid gap-4 md:grid-cols-3">
            {/* 1. What happened */}
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">1 · What happened</p>
              <p className="mt-1 text-sm font-semibold leading-snug text-white">{resumo || `Alert in today's triage: ${tCategorias(categorias)}`}</p>
              <p className="mt-1 font-mono text-[10px] text-slate-400">Categories: {tCategorias(categorias)}</p>
            </div>

            {/* 2. Recommended action */}
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">2 · Recommended action</p>
              {eva && (
                <p className={`mt-1 inline-block rounded border px-2 py-0.5 text-xs font-semibold ${eva.cor}`} title={motivosEva.join("\n")}>
                  {statusEva === "INAPTO" ? "⛔ " : ""}
                  {eva.texto}
                </p>
              )}
              {tags.filter((t) => !/eva/i.test(t)).length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {tags
                    .filter((t) => !/eva/i.test(t))
                    .map((t) => (
                      <span key={t} className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cor.borda} ${cor.texto}`}>
                        {t}
                      </span>
                    ))}
                </div>
              )}
              {acoes.length > 0 && (
                <ol className="mt-1.5 space-y-0.5 text-xs text-slate-200">
                  {acoes.slice(0, 2).map((a, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="font-mono text-cyan-400">{String(i + 1).padStart(2, "0")}</span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ol>
              )}
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-300">
                {critico ? <Earth className="h-3.5 w-3.5 shrink-0" /> : <Satellite className="h-3.5 w-3.5 shrink-0" />}
                {escalonamento}
              </p>
              <button
                type="button"
                onClick={onVerProtocolo}
                className="mt-2 flex items-center gap-1 rounded border border-cyan-700 px-2 py-1 font-mono text-[10px] uppercase text-cyan-300 hover:bg-cyan-500/10"
              >
                Full protocol <ArrowDownRight className="h-3 w-3" />
              </button>
            </div>

            {/* 3. Data supporting the alert */}
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">3 · Supporting data</p>
              {evidencias.length ? (
                <ul className="mt-1 space-y-1">
                  {evidencias.map((e) => (
                    <li key={`${e.titulo}-${e.detalhe}`} className="flex items-start gap-1.5 text-xs">
                      <AlertTriangle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${e.nivel >= 3 ? "text-red-400" : "text-amber-400"}`} />
                      <span>
                        <span className="font-semibold text-slate-100">{e.titulo}</span>
                        <span className="text-slate-400"> · {e.parte}</span>
                        <span className="block font-mono text-[10px] text-slate-400">{e.detalhe}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-slate-400">Today's indicators are off baseline ({tCategorias(categorias)}).</p>
              )}
            </div>
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}
