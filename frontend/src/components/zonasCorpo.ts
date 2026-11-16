// Link between the telemetry alert "zones" (motivosAlerta.ts) and the 15 anatomical regions per view.
import type { Vista } from "./corpoRegioes";
import type { ZonaCorpo } from "./motivosAlerta";

export const ZONAS: Record<ZonaCorpo, { orgao: string; sistema: string; detalhe: string; perigo: string }> = {
  cabeca: {
    orgao: "Brain and eyes",
    sistema: "Neuro-ocular • Sleep • Mood",
    detalhe: "In microgravity, fluids move up to the head and can press on the eyes (SANS). Sleep and mood suffer under confinement.",
    perigo: "Altered gravity • Isolation and confinement",
  },
  peito: {
    orgao: "Heart",
    sistema: "Cardiovascular",
    detalhe: "Without gravity, blood is redistributed and the heart works differently. Blood pressure and HR are compared with YOUR baseline.",
    perigo: "Altered gravity • Closed environment",
  },
  pulmao: {
    orgao: "Lungs",
    sistema: "Cardiorespiratory",
    detalhe: "HR far above baseline or a drop in SpO₂ may point to exertion, fever, infection or a problem with the habitat/suit air.",
    perigo: "Hostile closed environment",
  },
  coluna: {
    orgao: "Spine",
    sistema: "Axial musculoskeletal",
    detalhe: "Without body-weight load, the muscles that support the spine weaken. Daily resistance training helps protect it.",
    perigo: "Altered gravity",
  },
  pernas: {
    orgao: "Bones and muscles",
    sistema: "Bones and muscles",
    detalhe: "Leg bones and muscles lose mass without gravity. The project goal is ~60 min/day of resistance training.",
    perigo: "Altered gravity",
  },
  pele: {
    orgao: "Skin and immunity",
    sistema: "Radiation • Immunity",
    detalhe: "Outside Earth's protection, the radiation dose builds up. Fever may point to infection, common under immune stress in space.",
    perigo: "Radiation • Closed environment",
  },
};

/** Anatomical regions where each alert zone shows up, per view. */
export const ZONA_REGIOES: Record<ZonaCorpo, Partial<Record<Vista, string[]>>> = {
  cabeca: { frente: ["cabeca"], costas: ["cabeca"] },
  peito: { frente: ["torax"] },
  pulmao: { frente: ["torax"], costas: ["costas_sup"] },
  coluna: { costas: ["costas_sup", "lombar"] },
  pernas: { frente: ["perna_dir", "perna_esq"], costas: ["perna_dir", "perna_esq"] },
  pele: { frente: ["braco_dir", "braco_esq"], costas: ["braco_dir", "braco_esq"] },
};

/** Zone (system) each region belongs to: used for the icon and the explanatory text. */
export function zonaDaRegiao(regiaoId: string): ZonaCorpo {
  if (["cabeca", "pescoco", "nuca"].includes(regiaoId)) return "cabeca";
  if (["torax", "abdomen"].includes(regiaoId)) return "peito";
  if (["costas_sup", "lombar"].includes(regiaoId)) return "coluna";
  if (regiaoId.startsWith("perna") || regiaoId.startsWith("pe_") || regiaoId === "pelve") return "pernas";
  return "pele"; // shoulders, arms and hands
}

export const TIPOS_DESCONFORTO = ["Pain", "Fatigue / Heaviness", "Tingling", "Stiffness", "Pressure / Nausea"] as const;
export const INTENSIDADES = ["Mild", "Mild+", "Moderate", "Strong", "Severe"] as const;

export const chaveRegiao = (vista: Vista, id: string) => `${vista}:${id}`;
