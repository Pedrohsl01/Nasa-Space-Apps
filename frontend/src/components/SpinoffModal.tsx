import { Earth, Rocket, X } from "lucide-react";

interface SpinoffModalProps {
  aberto: boolean;
  onFechar: () => void;
}

// Examples of space technologies that made it to Earth.
// Reference source: NASA Spinoff (https://spinoff.nasa.gov); check each item before the pitch.
const DO_ESPACO_PARA_TERRA = [
  {
    titulo: "Infrared ear thermometer",
    texto: "Infrared sensors created to measure the temperature of stars and planets were adapted to measure fever in seconds.",
  },
  {
    titulo: "Phone cameras (CMOS sensor)",
    texto: "Small, low-power image sensors developed for space missions are now in almost every smartphone.",
  },
  {
    titulo: "Memory foam",
    texto: "A material designed to cushion impacts in aircraft seats, now used in mattresses and hospital equipment.",
  },
];

const DESTE_PROJETO_PARA_TERRA = [
  {
    titulo: "Isolated stations",
    texto: "Antarctic bases, oil rigs and ships spend months away from a doctor. The same triage against a personal baseline helps spot early when something changes.",
  },
  {
    titulo: "Telemedicine with unstable internet",
    texto: "The rules engine runs 100% locally (Offline-First). The AI is only called when there is an alert, which suits rural and riverside communities with weak connections.",
  },
  {
    titulo: "Chronic disease follow-up",
    texto: "Comparing people with their own normal, not with a general average, helps those who measure blood pressure and glucose at home see trends before they become a crisis.",
  },
];

export function SpinoffModal({ aberto, onFechar }: SpinoffModalProps) {
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg border border-(--borda) bg-(--card) backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-cyan-900/60 px-5 py-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-400">Spinoff Earth ↔ Space</p>
            <h2 className="text-lg font-semibold text-slate-100">What comes from space returns to Earth</h2>
          </div>
          <button onClick={onFechar} className="p-1 text-slate-400 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-5 p-5">
          <section>
            <h3 className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-sky-300">
              <Rocket className="w-4 h-4" /> From space to Earth
            </h3>
            <ul className="space-y-3">
              {DO_ESPACO_PARA_TERRA.map((item) => (
                <li key={item.titulo} className="rounded border border-slate-800 bg-(--subcard) p-3">
                  <p className="text-sm font-semibold text-slate-100">{item.titulo}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.texto}</p>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-emerald-300">
              <Earth className="w-4 h-4" /> From this project to Earth
            </h3>
            <ul className="space-y-3">
              {DESTE_PROJETO_PARA_TERRA.map((item) => (
                <li key={item.titulo} className="rounded border border-slate-800 bg-(--subcard) p-3">
                  <p className="text-sm font-semibold text-slate-100">{item.titulo}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.texto}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <p className="border-t border-slate-800 px-5 py-3 text-[11px] text-slate-500">
          Reference for the examples: NASA Spinoff (spinoff.nasa.gov), to be confirmed by the team before the presentation.
        </p>
      </div>
    </div>
  );
}
