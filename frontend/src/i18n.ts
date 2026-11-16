// Display translation (pt-BR -> en-US) for DATA VALUES that come from the dataset/API.
// The stored values (categoria_risco, ambiente, status, estado...) stay as they are: they are keys
// used by the rules. Only what is shown on screen is translated here.

export const CATEGORIA_EN: Record<string, string> = {
  Nominal: "Nominal",
  Cardiovascular: "Cardiovascular",
  Imunológico: "Immune",
  Metabólico: "Metabolic",
  Radiação: "Radiation",
  "Neuro-ocular": "Neuro-ocular",
  Comportamental: "Behavioral",
  Musculoesquelético: "Musculoskeletal",
};

/** "Imunológico;Radiação" -> "Immune, Radiation" (accepts ";" or "," separated values, or a list). */
export function tCategorias(categorias: string | string[] | null | undefined, sep = ", "): string {
  const itens = Array.isArray(categorias) ? categorias : String(categorias ?? "").split(/[;,]/);
  return itens
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => CATEGORIA_EN[c] ?? c)
    .join(sep);
}

export const AMBIENTE_EN: Record<string, string> = {
  "Estacao Orbital": "Orbital Station",
  "Transito para Marte": "Transit to Mars",
  "Base Marciana": "Mars Base",
};

export const tAmbiente = (ambiente: string | null | undefined) => AMBIENTE_EN[String(ambiente)] ?? String(ambiente ?? "");

export const STATUS_EN: Record<string, string> = { NORMAL: "NORMAL", ATENCAO: "WARNING", CRITICO: "CRITICAL" };

export const tStatus = (status: string | null | undefined) => STATUS_EN[String(status)] ?? String(status ?? "");

// Recovery state of the hour in the readiness model
export const ESTADO_EN: Record<string, string> = {
  sono: "sleep",
  repouso: "rest",
  contramedida: "countermeasure",
  estresse: "stress",
};

export const tEstado = (estado: string | null | undefined) => ESTADO_EN[String(estado)] ?? String(estado ?? "");

// EVA clearance level used in the block list ("INAPTO: reason")
export const NIVEL_EVA_EN: Record<string, string> = { APTO: "FIT", RESTRICAO: "RESTRICTED", INAPTO: "NOT FIT" };

export const tNivelEva = (nivel: string | null | undefined) => NIVEL_EVA_EN[String(nivel)] ?? String(nivel ?? "");
