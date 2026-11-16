// Panel grid in CSS grid: each frame grows with its content (no inner scrolling).
// Positions live in .grade-painel (index.css), by each frame's area.
import { Children, cloneElement, isValidElement, type ReactElement } from "react";

// Frame key (child key) -> grid area
const AREA: Record<string, string> = {
  wearable: "w",
  mapa: "m",
  missoes: "mi", // Daily missions, right below the body map
  protocolo: "p",
  temperatura: "t",
  dispositivo: "d",
  predicao: "pr",
  exames: "ex",
  tendencia: "te",
  telemetria: "tl",
};

// mapaLargo: the map has alert/discomfort cards and may grow up to 20% (only on screens ≥ 1500 px, see index.css)
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
