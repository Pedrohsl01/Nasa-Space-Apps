// Grade dos painéis em CSS grid: cada quadro cresce com o conteúdo (sem rolagem interna).
// As posições ficam em .grade-painel (index.css), pela área de cada quadro.
import { Children, cloneElement, isValidElement, type ReactElement } from "react";

// Chave do quadro (key do filho) -> área da grade
const AREA: Record<string, string> = {
  wearable: "w",
  mapa: "m",
  missoes: "mi", // Missões do dia, logo abaixo do mapa corporal
  protocolo: "p",
  temperatura: "t",
  dispositivo: "d",
  predicao: "pr",
  exames: "ex",
  tendencia: "te",
  telemetria: "tl",
};

// mapaLargo: o mapa tem cartões de alerta/desconforto e pode crescer até 20% (só em tela ≥ 1500 px, ver index.css)
export function GradeLayout({ children, mapaLargo = false }: { children: React.ReactNode; mapaLargo?: boolean }) {
  return (
    <div className={`grade-painel grid gap-4 ${mapaLargo ? "mapa-largo" : ""}`}>
      {Children.map(children, (filho) => {
        if (!isValidElement(filho)) return filho;
        const el = filho as ReactElement<{ style?: React.CSSProperties; "data-area"?: string }>;
        const area = AREA[String(filho.key)];
        return cloneElement(el, { style: { ...el.props.style, gridArea: area }, "data-area": area });
      })}
    </div>
  );
}
