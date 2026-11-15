import type { Analise, Astronauta, Medicoes, TelemetriaHoraria } from "./types";

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

export const analisarDia = (id_astronauta: string, dia_missao: number, forcar_ia = false) =>
  pedir<Analise>("/analisar-ia", {
    method: "POST",
    body: JSON.stringify({ id_astronauta, dia_missao, forcar_ia }),
  });

export const telemetriaHoraria = (id_astronauta: string, dia_missao: number, hora: number, picos: number[]) =>
  pedir<TelemetriaHoraria>(
    `/telemetria-horaria/${encodeURIComponent(id_astronauta)}/${dia_missao}?hora=${hora}&picos=${picos.join(",")}`,
  );

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
