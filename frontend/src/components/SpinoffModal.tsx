import { Earth, Rocket, X } from "lucide-react";

interface SpinoffModalProps {
  aberto: boolean;
  onFechar: () => void;
}

// Exemplos de tecnologias espaciais que chegaram à Terra.
// Fonte de referência: NASA Spinoff (https://spinoff.nasa.gov) — conferir cada item antes do pitch.
const DO_ESPACO_PARA_TERRA = [
  {
    titulo: "Termômetro de ouvido infravermelho",
    texto: "Sensores infravermelhos criados para medir temperatura de estrelas e planetas foram adaptados para medir febre em segundos.",
  },
  {
    titulo: "Câmeras de celular (sensor CMOS)",
    texto: "Sensores de imagem pequenos e de baixo consumo desenvolvidos para missões espaciais hoje estão em quase todo smartphone.",
  },
  {
    titulo: "Espuma viscoelástica",
    texto: "Material pensado para amortecer impactos em assentos de aeronaves e hoje usado em colchões e equipamentos hospitalares.",
  },
];

const DESTE_PROJETO_PARA_TERRA = [
  {
    titulo: "Estações isoladas",
    texto: "Bases na Antártida, plataformas de petróleo e navios passam meses longe de um médico. A mesma triagem por linha de base pessoal ajuda a perceber cedo quando algo muda.",
  },
  {
    titulo: "Telemedicina com internet instável",
    texto: "O motor de regras roda 100% local (Offline-First). A IA só é chamada quando há alerta, o que serve a comunidades rurais e ribeirinhas com conexão fraca.",
  },
  {
    titulo: "Acompanhamento de doenças crônicas",
    texto: "Comparar a pessoa com o próprio normal, e não com uma média geral, ajuda quem mede pressão e glicemia em casa a ver tendências antes de virar crise.",
  },
];

export function SpinoffModal({ aberto, onFechar }: SpinoffModalProps) {
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg border border-(--borda) bg-(--card) backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-cyan-900/60 px-5 py-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-400">Spinoff Terra ↔ Espaço</p>
            <h2 className="text-lg font-semibold text-slate-100">O que vem do espaço volta para a Terra</h2>
          </div>
          <button onClick={onFechar} className="p-1 text-slate-400 hover:text-white" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-5 p-5">
          <section>
            <h3 className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-sky-300">
              <Rocket className="w-4 h-4" /> Do espaço para a Terra
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
              <Earth className="w-4 h-4" /> Deste projeto para a Terra
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
          Referência dos exemplos: NASA Spinoff (spinoff.nasa.gov) — a confirmar pela equipe antes da apresentação.
        </p>
      </div>
    </div>
  );
}
