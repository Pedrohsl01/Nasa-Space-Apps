// Estado gamificado do HUD por tripulante: contramedidas aplicadas e pontos de mitigação (XP).
// A Prontidão / Aptidão EVA em si é cumulativa e vem do backend (POST /api/prontidao):
//   R(t) = clamp(R_base − D_acum(t) − P_agudo(t), 0, 100), com D integrado hora a hora desde 00:00.

export interface EstadoTripulante {
  aplicadas: Record<string, string[]>; // dia da missão -> chaves "hora|texto da contramedida"
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
    /* navegador sem armazenamento: vale só nesta sessão */
  }
}

// ---------------- Contramedidas aplicadas: "hora|texto" ----------------
export const chaveContramedida = (hora: number, texto: string) => `${hora}|${texto}`;

/** Converte as chaves salvas em eventos para o modelo cumulativo (chaves antigas, sem hora, são ignoradas). */
export function contramedidasDoDia(chaves: string[]): { hora: number; texto: string }[] {
  const lista: { hora: number; texto: string }[] = [];
  for (const c of chaves) {
    const m = /^(\d{1,2})\|(.*)$/s.exec(c);
    if (m && Number(m[1]) <= 23) lista.push({ hora: Number(m[1]), texto: m[2].slice(0, 300) });
  }
  return lista;
}

/** Hora em que a contramedida com esse texto foi aplicada no dia, ou null. */
export function horaAplicada(chaves: string[], texto: string): number | null {
  return contramedidasDoDia(chaves).find((c) => c.texto === texto)?.hora ?? null;
}
