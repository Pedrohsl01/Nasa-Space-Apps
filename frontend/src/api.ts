import type { Analise, Astronauta, Medicoes, ProntidaoCumulativa, RelatoDesconforto, TelemetriaHoraria } from "./types";

// Padrão: backend local na porta 8000. Pode ser trocado com VITE_API_URL (ex.: frontend/.env.local)
export const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

async function pedir<T>(caminho: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${caminho}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    // FastAPI devolve { detail: "..." } ou, em erro de validação, { detail: [ {msg, loc}, ... ] }
    let mensagem = `Erro ${res.status}`;
    try {
      const corpo = await res.json();
      if (typeof corpo.detail === "string") mensagem = corpo.detail;
      else if (Array.isArray(corpo.detail))
        mensagem = corpo.detail.map((d: { loc: string[]; msg: string }) => `${d.loc[d.loc.length - 1]}: ${d.msg}`).join(" • ");
    } catch {
      /* corpo sem JSON */
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
  pergunta?: string, // pergunta do Chat de Contramedidas
) =>
  pedir<Analise>("/analisar-ia", {
    method: "POST",
    body: JSON.stringify({
      id_astronauta,
      dia_missao,
      forcar_ia,
      pergunta,
      // Sintomas relatados pelo astronauta, para a IA cruzar com os sinais vitais
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
  horaPadrao: number; // hora usada para relatos antigos, salvos sem hora
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

// ---------------- Wearable ao vivo (uma leitura por hora) ----------------
export interface EventosAoVivo {
  id_astronauta: string;
  dia_missao: number;
  desconfortos: RelatoDesconforto[];
  contramedidas: { hora: number; texto: string }[];
  horaPadrao: number; // hora usada para relatos antigos, salvos sem hora
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

/** Começa o dia às 00:00 com uma leitura (proximo=true fecha o dia e abre o seguinte). */
export const reiniciarDiaAoVivo = (e: EventosAoVivo, proximo = false) =>
  pedir<TelemetriaHoraria>("/dia/reiniciar", { method: "POST", body: JSON.stringify({ ...corpoEventos(e), proximo }) });

/** Gera só a leitura da próxima hora (depois das 23:00, vira o dia). */
export const avancarHoraAoVivo = (e: EventosAoVivo, pico = false) =>
  pedir<TelemetriaHoraria>("/telemetria/avancar-hora", { method: "POST", body: JSON.stringify({ ...corpoEventos(e), pico }) });

/** Estado ao vivo com os eventos do mapa/chat aplicados, sem gerar leitura. */
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
