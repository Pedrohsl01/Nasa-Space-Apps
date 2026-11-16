// Small widget with the mission location on the selected day (from the dataset: each day's "ambiente" column).
import { Mountain, Orbit, Rocket } from "lucide-react";

const LOCAIS: Record<string, { nome: string; sinal: string; icone: React.ReactNode }> = {
  "Estacao Orbital": {
    nome: "Orbital Station",
    sinal: "Near real-time signal with Earth",
    icone: <Orbit className="h-5 w-5" />,
  },
  "Transito para Marte": {
    nome: "Transit to Mars",
    sinal: "Growing signal delay with Earth",
    icone: <Rocket className="h-5 w-5" />,
  },
  "Base Marciana": {
    nome: "Mars Base",
    sinal: "Signal delay of up to ~20 min each way",
    icone: <Mountain className="h-5 w-5" />,
  },
};

export function LocalMissaoWidget({ ambiente, dia }: { ambiente: string; dia: number | null }) {
  const local = LOCAIS[ambiente];
  if (!local) return null;
  return (
    <div className={`flex items-center gap-2.5 rounded-md border border-(--canto) bg-(--subcard) px-3 py-1.5 text-(--destaque)`} title={local.sinal}>
      {local.icone}
      <div className="leading-tight">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] opacity-70">Location • day {dia ?? "—"}</p>
        <p className="text-sm font-bold">{local.nome}</p>
      </div>
    </div>
  );
}
