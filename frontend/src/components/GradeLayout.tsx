// Grade editável dos painéis (react-grid-layout).
// No modo "Editar layout" cada quadro pode ser arrastado e redimensionado pelas bordas, encaixando numa grade de 12 colunas.
// As posições ficam salvas no navegador (localStorage) e podem voltar ao padrão.
import { Responsive, WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const Grade = WidthProvider(Responsive);

// Ao mudar o layout padrão, troque a versão da chave: layouts salvos de versões antigas são descartados
const CHAVE = "astrohealth:layout:v3"; // v3: sem o widget de relógio, wearable mais baixo

// Layout padrão (12 colunas; cada linha da grade = 20 px + 16 px de espaço)
export const LAYOUT_PADRAO: Layout[] = [
  { i: "wearable", x: 0, y: 0, w: 12, h: 7 },
  { i: "mapa", x: 0, y: 7, w: 6, h: 18 },
  { i: "protocolo", x: 6, y: 7, w: 3, h: 18 }, // conteúdo da IA varia: rola por dentro se passar
  { i: "dispositivo", x: 9, y: 7, w: 3, h: 8 },
  { i: "temperatura", x: 9, y: 15, w: 3, h: 10 },
  { i: "predicao", x: 0, y: 25, w: 6, h: 10 },
  { i: "exames", x: 6, y: 25, w: 6, h: 10 },
  { i: "tendencia", x: 0, y: 35, w: 6, h: 11 },
  { i: "telemetria", x: 6, y: 35, w: 6, h: 11 },
].map((item) => ({ ...item, minW: 2, minH: 4 }));

/** Lê o layout salvo; quadros novos (que não existiam no layout salvo) entram na posição padrão. */
export function carregarLayout(): Layout[] {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? "null") as Layout[] | null;
    if (!Array.isArray(salvo)) return LAYOUT_PADRAO;
    const porId = new Map(salvo.map((l) => [l.i, l]));
    return LAYOUT_PADRAO.map((padrao) => {
      const s = porId.get(padrao.i);
      return s ? { ...padrao, x: s.x, y: s.y, w: s.w, h: s.h } : padrao;
    });
  } catch {
    return LAYOUT_PADRAO;
  }
}

export function salvarLayout(layout: Layout[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }))));
  } catch {
    /* navegador sem armazenamento: o layout só vale nesta sessão */
  }
}

export function limparLayoutSalvo() {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* ignora */
  }
}

// Em telas estreitas os quadros ficam empilhados em uma coluna, na ordem do layout
function empilhado(layout: Layout[]): Layout[] {
  return [...layout]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((l, indice) => ({ i: l.i, x: 0, y: indice * 100, w: 1, h: l.h }));
}

interface GradeLayoutProps {
  editando: boolean;
  layout: Layout[];
  onMudar: (layout: Layout[]) => void;
  children: React.ReactNode;
}

export function GradeLayout({ editando, layout, onMudar, children }: GradeLayoutProps) {
  return (
    <Grade
      className={editando ? "grade-editando" : ""}
      layouts={{ lg: layout, sm: empilhado(layout) }}
      breakpoints={{ lg: 1024, sm: 0 }}
      cols={{ lg: 12, sm: 1 }}
      rowHeight={20}
      margin={[16, 16]}
      containerPadding={[0, 0]}
      isDraggable={editando}
      isResizable={editando}
      resizeHandles={["s", "e", "w", "n", "se", "sw", "ne", "nw"]}
      compactType="vertical"
      onLayoutChange={(_atual, todos) => {
        // Só grava o layout de tela larga, e só no modo de edição
        if (editando && todos.lg) onMudar(todos.lg);
      }}
    >
      {children}
    </Grade>
  );
}
