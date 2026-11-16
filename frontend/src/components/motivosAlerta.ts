// Traduz os alertas do dia (indicadores_em_alerta do motor) e da hora (wearable) em frases curtas
// por parte do corpo, para os cartões ao lado do astronauta. Ex.: peito -> "Pressão muito alta".
import type { PontoHorario } from "../types";

export type ZonaCorpo = "cabeca" | "peito" | "pulmao" | "coluna" | "pernas" | "pele";

export interface Motivo {
  titulo: string;
  detalhe: string;
  nivel: number; // 2 = atenção, 3 = crítico
  origem: "dia" | "wearable";
  secundario?: boolean; // efeito indireto naquela parte (fica depois do motivo principal)
}

type Indicadores = Record<string, unknown>;
type Obj = Record<string, string | number | undefined>;

const num = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v ?? "")));

export function motivosPorZona(
  indicadores: Indicadores,
  partesDoDia: string,
  categoriaDoDia: string,
  codigoDoDia: number,
  alertaHora: PontoHorario | null,
): Partial<Record<ZonaCorpo, Motivo[]>> {
  const saida: Partial<Record<ZonaCorpo, Motivo[]>> = {};
  const add = (zona: ZonaCorpo, m: Motivo) => {
    (saida[zona] ??= []).push(m);
  };
  const partes = new Set(partesDoDia.split(";").map((p) => p.trim()).filter((p) => p && p !== "nenhuma"));

  // ---------------- Alertas do dia (só valem para as partes marcadas na triagem do dia) ----------------
  if (codigoDoDia > 1) {
    const n = codigoDoDia;
    const dia = (zona: ZonaCorpo, titulo: string, detalhe: string, secundario = false) => {
      if (partes.has(zona)) add(zona, { titulo, detalhe, nivel: n, origem: "dia", secundario });
    };

    const pa = indicadores.pressao_arterial as Obj | undefined;
    if (pa) {
      const titulo = n >= 3 ? "Pressão muito alta" : "Pressão alta";
      dia("peito", titulo, `${pa.valor_dia} • base ${pa.linha_base}`);
      dia("cabeca", titulo, `${pa.valor_dia} • risco de desvio de fluidos`, true);
    }
    const fc = indicadores.fc_repouso as Obj | undefined;
    if (fc) {
      dia("peito", "Frequência cardíaca alta", `${fc.valor_dia} bpm (${fc.variacao_dia}) • base ${fc.linha_base}`);
      dia("pulmao", "Coração e pulmões sob esforço", `FC ${fc.valor_dia} bpm em repouso (${fc.variacao_dia})`, true);
    }
    const temp = indicadores.temperatura_c as Obj | undefined;
    if (temp) {
      const febre = num(temp.valor_dia) >= 38.1;
      dia("pele", febre ? "Febre" : "Temperatura elevada", `${temp.valor_dia} °C • base ${temp.linha_base} °C`);
      dia("peito", febre ? "Febre" : "Temperatura elevada", `${temp.valor_dia} °C • possível infecção`, true);
    }
    const glic = indicadores.glicemia_mg_dl as Obj | undefined;
    if (glic) {
      const alta = !String(glic.variacao_dia).startsWith("-");
      dia("peito", alta ? "Glicemia alta" : "Glicemia baixa", `${glic.valor_dia} mg/dL (${glic.variacao_dia}) • base ${glic.linha_base}`);
    }
    const treino = indicadores.treino_resistido_min as Obj | undefined;
    if (treino) {
      const det = `${treino.media_ultimos_7_dias} min/dia em 7 dias • meta 60`;
      dia("pernas", "Treino abaixo da meta", det);
      dia("coluna", "Coluna sem carga suficiente", det);
    }
    const sono = indicadores.sono_horas as Obj | undefined;
    if (sono) dia("cabeca", "Sono insuficiente", `${sono.valor_dia} h • base ${sono.linha_base} h (${sono.variacao_7_dias} em 7 dias)`);
    const humor = indicadores.humor as Obj | undefined;
    if (humor && num(humor.valor_dia) <= 2) dia("cabeca", "Humor baixo", `${humor.valor_dia}/5 hoje • média ${humor.media_ultimos_7_dias}`);
    const ocular = indicadores.sintoma_neuro_ocular;
    if (typeof ocular === "string") {
      dia("cabeca", ocular === "Visao turva" ? "Visão turva" : "Pressão ocular", "Possível síndrome neuro-ocular (SANS)");
    }
    const rad = indicadores.radiacao_acumulada_msv as Obj | undefined;
    if (rad) {
      const pico = num(rad.incremento_7_dias_msv) >= 15;
      const det = `+${rad.incremento_7_dias_msv} mSv em 7 dias • total ${rad.valor_dia} mSv`;
      dia("pele", pico ? "Pico de radiação" : "Dose de radiação alta", det);
      dia("peito", pico ? "Pico de radiação" : "Dose de radiação alta", det, true);
    }

    // Parte marcada na triagem sem indicador correspondente: mostra a categoria
    partes.forEach((p) => {
      const z = p as ZonaCorpo;
      if (!saida[z]) add(z, { titulo: "Alerta na triagem do dia", detalhe: categoriaDoDia, nivel: n, origem: "dia" });
    });
  }

  // ---------------- Alertas da hora (wearable) ----------------
  if (alertaHora && alertaHora.semaforo_hora > 1) {
    const TITULO: Record<string, string> = {
      fc_bpm: "Taquicardia",
      pa_sistolica: "Pico de pressão",
      spo2_pct: "Saturação de O₂ baixa",
      temperatura_c: "Febre aguda",
      hrv_ms: "Variabilidade cardíaca muito baixa",
      estresse_wearable: "Estresse agudo",
    };
    const ZONAS_SINAL: Record<string, ZonaCorpo[]> = {
      fc_bpm: ["peito"],
      pa_sistolica: ["peito"],
      spo2_pct: ["pulmao"],
      temperatura_c: ["pele"],
      hrv_ms: ["peito"],
      estresse_wearable: ["cabeca"],
    };
    for (const a of alertaHora.alertas) {
      const zonas = [...(ZONAS_SINAL[a.sinal] ?? [])];
      if (a.sinal === "pa_sistolica" && a.nivel >= 3) zonas.push("cabeca");
      for (const z of zonas) {
        add(z, { titulo: TITULO[a.sinal] ?? a.sinal, detalhe: `Wearable ${alertaHora.rotulo}: ${a.texto}`, nivel: a.nivel, origem: "wearable" });
      }
    }
  }

  // Mais grave primeiro dentro de cada parte
  for (const z of Object.keys(saida) as ZonaCorpo[]) saida[z]!.sort((a, b) => b.nivel - a.nivel || Number(!!a.secundario) - Number(!!b.secundario));
  return saida;
}

// ---------------- Alerta crítico de saúde (pop-up) ----------------
export interface OrgaoEmAlerta {
  zona: ZonaCorpo;
  nivel: number; // 2 = laranja (atenção), 3 = vermelho (crítico)
  motivo: Motivo;
}

/** Órgãos coloridos no mapa corporal (mesma regra de cor do BodyMap: o maior nível de cada zona). */
export function orgaosEmAlerta(motivos: Partial<Record<ZonaCorpo, Motivo[]>>): OrgaoEmAlerta[] {
  return (Object.entries(motivos) as [ZonaCorpo, Motivo[] | undefined][])
    .filter(([, lista]) => lista && lista.length > 0)
    .map(([zona, lista]) => {
      const principal = [...lista!].sort((a, b) => b.nivel - a.nivel || Number(!!a.secundario) - Number(!!b.secundario))[0];
      return { zona, nivel: principal.nivel, motivo: principal };
    })
    .sort((a, b) => b.nivel - a.nivel);
}

/** Regra do alerta crítico: pelo menos 1 órgão vermelho ou pelo menos 2 órgãos laranja. */
export function exigeAlertaCritico(orgaos: OrgaoEmAlerta[]) {
  return orgaos.some((o) => o.nivel >= 3) || orgaos.filter((o) => o.nivel === 2).length >= 2;
}
