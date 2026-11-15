// Grade dos painéis em CSS grid: cada quadro cresce com o conteúdo (sem rolagem interna).
// As posições ficam em .grade-painel (index.css), pela área de cada quadro.
import { Children, cloneElement, isValidElement, type ReactElement } from "react";

// Chave do quadro (key do filho) -> área da grade
const AREA: Record<string, string> = {
  wearable: "w",
  mapa: "m",
  protocolo: "p",
  temperatura: "t",
  dispositivo: "d",
  predicao: "pr",
  exames: "ex",
  tendencia: "te",
  telemetria: "tl",
};

export function GradeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grade-painel grid gap-4">
      {Children.map(children, (filho) => {
        if (!isValidElement(filho)) return filho;
        const el = filho as ReactElement<{ style?: React.CSSProperties }>;
        return cloneElement(el, { style: { ...el.props.style, gridArea: AREA[String(filho.key)] } });
      })}
    </div>
  );
}
