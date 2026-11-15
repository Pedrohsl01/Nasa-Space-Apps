// Ligação entre as "zonas" dos alertas de telemetria (motivosAlerta.ts) e as 15 regiões anatômicas por vista.
import type { Vista } from "./corpoRegioes";
import type { ZonaCorpo } from "./motivosAlerta";

export const ZONAS: Record<ZonaCorpo, { orgao: string; sistema: string; detalhe: string; perigo: string }> = {
  cabeca: {
    orgao: "Cérebro e olhos",
    sistema: "Neuro-ocular • Sono • Humor",
    detalhe: "Na microgravidade, os líquidos sobem para a cabeça e podem pressionar os olhos (SANS). Sono e humor sofrem com o confinamento.",
    perigo: "Gravidade alterada • Isolamento e confinamento",
  },
  peito: {
    orgao: "Coração",
    sistema: "Cardiovascular",
    detalhe: "Sem gravidade, o sangue se redistribui e o coração trabalha diferente. Pressão e FC são comparadas com a SUA linha de base.",
    perigo: "Gravidade alterada • Ambiente fechado",
  },
  pulmao: {
    orgao: "Pulmões",
    sistema: "Cardiorrespiratório",
    detalhe: "FC muito acima da base ou queda de SpO₂ podem indicar esforço, febre, infecção ou problema no ar do habitat/traje.",
    perigo: "Ambiente fechado e hostil",
  },
  coluna: {
    orgao: "Coluna",
    sistema: "Musculoesquelético axial",
    detalhe: "Sem carga do peso do corpo, os músculos que sustentam a coluna enfraquecem. O treino resistido diário ajuda a proteger.",
    perigo: "Gravidade alterada",
  },
  pernas: {
    orgao: "Ossos e músculos",
    sistema: "Ossos e músculos",
    detalhe: "Ossos e músculos das pernas perdem massa sem gravidade. A meta do projeto é ~60 min/dia de treino resistido.",
    perigo: "Gravidade alterada",
  },
  pele: {
    orgao: "Pele e imunidade",
    sistema: "Radiação • Imunidade",
    detalhe: "Fora da proteção da Terra, a dose de radiação se acumula. Febre pode indicar infecção, comum com o estresse imune no espaço.",
    perigo: "Radiação • Ambiente fechado",
  },
};

/** Regiões anatômicas onde cada zona de alerta aparece, por vista. */
export const ZONA_REGIOES: Record<ZonaCorpo, Partial<Record<Vista, string[]>>> = {
  cabeca: { frente: ["cabeca"], costas: ["cabeca"] },
  peito: { frente: ["torax"] },
  pulmao: { frente: ["torax"], costas: ["costas_sup"] },
  coluna: { costas: ["costas_sup", "lombar"] },
  pernas: { frente: ["perna_dir", "perna_esq"], costas: ["perna_dir", "perna_esq"] },
  pele: { frente: ["braco_dir", "braco_esq"], costas: ["braco_dir", "braco_esq"] },
};

/** Zona (sistema) a que cada região pertence: usada para o ícone e o texto explicativo. */
export function zonaDaRegiao(regiaoId: string): ZonaCorpo {
  if (["cabeca", "pescoco", "nuca"].includes(regiaoId)) return "cabeca";
  if (["torax", "abdomen"].includes(regiaoId)) return "peito";
  if (["costas_sup", "lombar"].includes(regiaoId)) return "coluna";
  if (regiaoId.startsWith("perna") || regiaoId.startsWith("pe_") || regiaoId === "pelve") return "pernas";
  return "pele"; // ombros, braços e mãos
}

export const TIPOS_DESCONFORTO = ["Dor", "Fadiga / Peso", "Formigamento", "Rigidez", "Pressão / Náusea"] as const;
export const INTENSIDADES = ["Leve", "Leve+", "Moderada", "Forte", "Intensa"] as const;

export const chaveRegiao = (vista: Vista, id: string) => `${vista}:${id}`;
