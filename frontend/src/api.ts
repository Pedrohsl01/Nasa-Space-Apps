import type { Analise, Astronauta, Medicoes, ProntidaoCumulativa, RelatoDesconforto, TelemetriaHoraria } from "./types";

// Default: local backend on port 8000. Can be changed with VITE_API_URL (e.g. frontend/.env.local)
export const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

async function pedir<T>(caminho: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${caminho}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    // FastAPI returns { detail: "..." } or, on a validation error, { detail: [ {msg, loc}, ... ] }
    let mensagem = `Error ${res.status}`;
    try {
      const corpo = await res.json();
      if (typeof corpo.detail === "string") mensagem = corpo.detail;
      else if (Array.isArray(corpo.detail))
        mensagem = corpo.detail.map((d: { loc: string[]; msg: string }) => `${d.loc[d.loc.length - 1]}: ${d.msg}`).join(" • ");
    } catch {
      /* body without JSON */
    }
    throw new Error(mensagem);
  }
  return res.json() as Promise<T>;
}

export const listarAstronautas = () => pedir<Astronauta[]>("/astronautas");

export const listarAmbientes = () => pedir<string[]>("/ambientes");

export const analisarDia = (
  id_astronauta: string,
  dia_missao: number,
  forcar_ia = false,
  desconfortos: RelatoDesconforto[] = [],
  pergunta?: string, // question from the Countermeasures Chat
) =>
  pedir<Analise>("/analisar-ia", {
    method: "POST",
    body: JSON.stringify({
      id_astronauta,
      dia_missao,
      forcar_ia,
      pergunta,
      // Symptoms reported by the astronaut, for the AI to cross-check with the vital signs
      desconfortos: desconfortos.map(({ regiaoId, vista, nome, tipo, intensidade, detalhe }) => ({
        regiao: regiaoId,
        nome,
        vista,
        tipo,
        intensidade,
        detalhe,
      })),
    }),
  });

export const telemetriaHoraria = (id_astronauta: string, dia_missao: number, hora: number, picos: number[], aoVivo = false) =>
  pedir<TelemetriaHoraria>(
    `/telemetria-horaria/${encodeURIComponent(id_astronauta)}/${dia_missao}?hora=${hora}&picos=${picos.join(",")}${aoVivo ? "&ao_vivo=true" : ""}`,
  );

export const calcularProntidao = (corpo: {
  id_astronauta: string;
  dia_missao: number;
  hora: number;
  picos: number[];
  desconfortos: RelatoDesconforto[];
  contramedidas: { hora: number; texto: string }[];
  horaPadrao: number; // hour used for old reports, saved without an hour
}) =>
  pedir<ProntidaoCumulativa>("/prontidao", {
    method: "POST",
    body: JSON.stringify({
      id_astronauta: corpo.id_astronauta,
      dia_missao: corpo.dia_missao,
      hora: corpo.hora,
      picos: corpo.picos,
      contramedidas: corpo.contramedidas,
      desconfortos: corpo.desconfortos.map(({ regiaoId, vista, nome, tipo, intensidade, detalhe, hora }) => ({
        regiao: regiaoId,
        nome,
        vista,
        tipo,
        intensidade,
        detalhe,
        hora: hora ?? corpo.horaPadrao,
      })),
    }),
  });

// ---------------- Live wearable (one reading per hour) ----------------
export interface EventosAoVivo {
  id_astronauta: string;
  dia_missao: number;
  desconfortos: RelatoDesconforto[];
  contramedidas: { hora: number; texto: string }[];
  horaPadrao: number; // hour used for old reports, saved without an hour
}

const corpoEventos = (e: EventosAoVivo) => ({
  id_astronauta: e.id_astronauta,
  dia_missao: e.dia_missao,
  contramedidas: e.contramedidas,
  desconfortos: e.desconfortos.map(({ regiaoId, vista, nome, tipo, intensidade, detalhe, hora }) => ({
    regiao: regiaoId,
    nome,
    vista,
    tipo,
    intensidade,
    detalhe,
    hora: hora ?? e.horaPadrao,
  })),
});

/** Starts the day at 00:00 with one reading (proximo=true closes the day and opens the next one). */
export const reiniciarDiaAoVivo = (e: EventosAoVivo, proximo = false) =>
  pedir<TelemetriaHoraria>("/dia/reiniciar", { method: "POST", body: JSON.stringify({ ...corpoEventos(e), proximo }) });

/** Generates only the next hour's reading (after 23:00, rolls the day over). */
export const avancarHoraAoVivo = (e: EventosAoVivo, pico = false) =>
  pedir<TelemetriaHoraria>("/telemetria/avancar-hora", { method: "POST", body: JSON.stringify({ ...corpoEventos(e), pico }) });

/** Live state with the body map/chat events applied, without generating a reading. */
export const estadoAoVivo = (e: EventosAoVivo) =>
  pedir<TelemetriaHoraria>("/telemetria/estado", { method: "POST", body: JSON.stringify(corpoEventos(e)) });

export const registrarDia = (corpo: {
  id_astronauta: string;
  ambiente?: string;
  medicoes?: Medicoes;
  simular_anomalia?: boolean;
}) =>
  pedir<Analise>("/registrar-dia", {
    method: "POST",
    body: JSON.stringify(corpo),
  });
