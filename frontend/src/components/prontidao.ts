// Gamified HUD state per crew member: applied countermeasures and mitigation points (XP).
// Readiness / EVA Fitness itself is cumulative and comes from the backend (POST /api/prontidao):
//   R(t) = clamp(R_base − D_acum(t) − P_agudo(t), 0, 100), with D integrated hour by hour since 00:00.

export interface EstadoTripulante {
  aplicadas: Record<string, string[]>; // mission day -> keys "hour|countermeasure text"
  xp: number;
}

export const ESTADO_VAZIO: EstadoTripulante = { aplicadas: {}, xp: 0 };

const CHAVE = "astrohealth:hud:v1";

export const XP_RELATO = 5;
export const XP_CONTRAMEDIDA = 10;

export function carregarHud(): Record<string, EstadoTripulante> {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? "{}");
    return salvo && typeof salvo === "object" ? salvo : {};
  } catch {
    return {};
  }
}

export function salvarHud(hud: Record<string, EstadoTripulante>) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(hud));
  } catch {
    /* browser without storage: valid for this session only */
  }
}

// ---------------- Applied countermeasures: "hour|text" ----------------
export const chaveContramedida = (hora: number, texto: string) => `${hora}|${texto}`;

/** Converts the saved keys into events for the cumulative model (old keys, without an hour, are ignored). */
export function contramedidasDoDia(chaves: string[]): { hora: number; texto: string }[] {
  const lista: { hora: number; texto: string }[] = [];
  for (const c of chaves) {
    const m = /^(\d{1,2})\|(.*)$/s.exec(c);
    if (m && Number(m[1]) <= 23) lista.push({ hora: Number(m[1]), texto: m[2].slice(0, 300) });
  }
  return lista;
}

/** Hour at which the countermeasure with this text was applied on the day, or null. */
export function horaAplicada(chaves: string[], texto: string): number | null {
  return contramedidasDoDia(chaves).find((c) => c.texto === texto)?.hora ?? null;
}
