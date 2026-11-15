// Estado gamificado do HUD por tripulante: protocolos aplicados, pontos de mitigação (XP)
// e a Aptidão para EVA.
import type { PontoHorario, RelatoDesconforto, TelemetriaDia } from "../types";
import type { Motivo, ZonaCorpo } from "./motivosAlerta";

export interface EstadoTripulante {
  aplicadas: Record<string, string[]>; // dia da missão -> chaves "idMensagem:texto da ação"
  xp: number;
}

export const ESTADO_VAZIO: EstadoTripulante = { aplicadas: {}, xp: 0 };

const CHAVE = "astrohealth:hud:v1";

export const XP_RELATO = 5;

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

// ---------------- Aptidão para EVA (função pura, recalculada a cada mudança de estado) ----------------
// Pontuação de demonstração (a confirmar com a equipe médica): parte de 100% e desconta por fator.

export interface FatorAptidao {
  rotulo: string;
  pontos: number; // negativo = desconta, positivo = recupera
}

export interface Prontidao {
  valor: number; // 0–100
  rotulo: string;
  faixa: "apto" | "atencao" | "critico";
  base: string; // fontes usadas, ex.: "Wearable 14:00 + Sono do dia"
  fatores: FatorAptidao[];
}

export interface EntradaAptidao {
  ponto: PontoHorario | null; // leitura do wearable na hora do player
  tel: TelemetriaDia | null; // dados do dia (planilha/API)
  motivos: Partial<Record<ZonaCorpo, Motivo[]>>; // alertas ativos (motivosAlerta.ts)
  relatos: RelatoDesconforto[]; // desconfortos do mapa corporal
  nAplicadas: number; // contramedidas marcadas como aplicadas no dia
}

const RECUPERA_POR_PROTOCOLO = 5;

export function calcularAptidaoEva({ ponto, tel, motivos, relatos, nAplicadas }: EntradaAptidao): Prontidao {
  const fatores: FatorAptidao[] = [];
  // Alertas ativos (título -> nível). Um sinal já coberto por alerta não é descontado de novo.
  const vistos = new Map<string, number>();
  for (const lista of Object.values(motivos)) {
    for (const m of lista ?? []) {
      if (m.secundario) continue;
      vistos.set(m.titulo, Math.max(vistos.get(m.titulo) ?? 0, m.nivel));
    }
  }
  const titulos = [...vistos.keys()].join(" | ");
  const tira = (rotulo: string, pontos: number, cobertoPor?: RegExp) => {
    if (pontos <= 0 || (cobertoPor && cobertoPor.test(titulos))) return;
    fatores.push({ rotulo, pontos: -pontos });
  };
  const fontes: string[] = [];

  // Wearable (muda com a hora do player e com a leitura ao vivo)
  if (ponto && !ponto.sem_sinal) {
    fontes.push(`Wearable ${ponto.rotulo}`);
    const esp = ponto.esperado;
    if (ponto.fc_bpm !== null && esp.fc_bpm) {
      const d = Math.abs(ponto.fc_bpm - esp.fc_bpm) / esp.fc_bpm;
      tira(`FC ${ponto.fc_bpm} bpm`, d > 0.25 ? 15 : d > 0.15 ? 8 : 0, /fc|card|frequ/i);
    }
    if (ponto.hrv_ms !== null && esp.hrv_ms) {
      const queda = (esp.hrv_ms - ponto.hrv_ms) / esp.hrv_ms;
      tira("Fadiga HRV", queda > 0.35 ? 12 : queda > 0.2 ? 8 : 0, /hrv|fadiga/i);
    }
    if (ponto.spo2_pct !== null) tira(`SpO₂ ${ponto.spo2_pct}%`, ponto.spo2_pct < 92 ? 20 : ponto.spo2_pct < 95 ? 10 : 0, /spo|oxig|satura/i);
    if (ponto.temperatura_c !== null)
      tira(`Temp ${ponto.temperatura_c} °C`, ponto.temperatura_c >= 38.5 ? 20 : ponto.temperatura_c >= 37.8 ? 10 : 0, /febre|temp/i);
    if (ponto.pa_sistolica !== null && ponto.pa_diastolica !== null) {
      const { pa_sistolica: s, pa_diastolica: d } = ponto;
      tira(`PA ${s}/${d}`, s >= 160 || d >= 100 ? 20 : s >= 140 || d >= 90 ? 10 : 0, /press/i);
    }
    if (ponto.estresse_wearable !== null) tira("Estresse alto", ponto.estresse_wearable > 75 ? 6 : 0, /estresse/i);
  } else if (ponto?.sem_sinal) {
    fontes.push("Wearable sem sinal");
  }

  // Dados do dia
  if (tel) {
    fontes.push("Sono do dia");
    const sono = tel.sono_horas.valor;
    tira(`Sono ${sono} h`, sono < 5 ? 15 : sono < 6 ? 10 : 0, /sono/i);
    tira("Humor baixo", tel.humor.valor <= 2 ? 5 : 0, /humor/i);
    tira(`Neuro-ocular: ${tel.sintoma_neuro_ocular}`, tel.sintoma_neuro_ocular === "Visao turva" ? 20 : tel.sintoma_neuro_ocular !== "Nenhum" ? 10 : 0, /ocular|vis|sans/i);
  }

  // Alertas ativos: um desconto por alerta principal (sem repetir o mesmo título em zonas diferentes), até 30
  let alertas = 0;
  for (const [titulo, nivel] of vistos) {
    const p = nivel >= 3 ? 12 : 6;
    if (alertas + p > 30) break;
    alertas += p;
    tira(titulo, p);
  }

  // Desconfortos relatados: 3 pontos por nível de intensidade, até 35
  let desconforto = 0;
  for (const r of [...relatos].sort((a, b) => b.intensidade - a.intensidade)) {
    const p = Math.min(r.intensidade * 3, 35 - desconforto);
    if (p <= 0) break;
    desconforto += p;
    tira(`${r.tipo} ${r.nome} ${r.intensidade}/5`, p);
  }

  // Contramedidas aplicadas recuperam até metade do que foi descontado
  const penalidade = -fatores.reduce((t, f) => t + f.pontos, 0);
  const recupera = Math.min(nAplicadas * RECUPERA_POR_PROTOCOLO, Math.floor(penalidade / 2));
  if (recupera > 0) fatores.push({ rotulo: `${nAplicadas} contramedida(s)`, pontos: recupera });

  const valor = Math.max(0, Math.min(100, Math.round(100 + fatores.reduce((t, f) => t + f.pontos, 0))));
  const faixa = valor >= 75 ? "apto" : valor >= 45 ? "atencao" : "critico";
  const rotulo = faixa === "apto" ? "APTO PARA EVA" : faixa === "atencao" ? "RESTRIÇÃO PARCIAL" : "EVA SUSPENSA";
  fatores.sort((a, b) => a.pontos - b.pontos);
  return { valor, rotulo, faixa, base: fontes.join(" + ") || "Sem dados", fatores };
}
