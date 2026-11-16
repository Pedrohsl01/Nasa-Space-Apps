// Turns the day's alerts (the engine's indicadores_em_alerta) and the hourly ones (wearable) into short phrases
// per body part, for the cards beside the astronaut. E.g. chest -> "Very high blood pressure".
import { tCategorias } from "../i18n";
import type { PontoHorario } from "../types";

export type ZonaCorpo = "cabeca" | "peito" | "pulmao" | "coluna" | "pernas" | "pele";

export interface Motivo {
  titulo: string;
  detalhe: string;
  nivel: number; // 2 = warning, 3 = critical
  origem: "dia" | "wearable";
  secundario?: boolean; // indirect effect on that part (comes after the main reason)
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

  // ---------------- Daily alerts (only for the parts flagged in the day's triage) ----------------
  if (codigoDoDia > 1) {
    const n = codigoDoDia;
    const dia = (zona: ZonaCorpo, titulo: string, detalhe: string, secundario = false) => {
      if (partes.has(zona)) add(zona, { titulo, detalhe, nivel: n, origem: "dia", secundario });
    };

    const pa = indicadores.pressao_arterial as Obj | undefined;
    if (pa) {
      const titulo = n >= 3 ? "Very high blood pressure" : "High blood pressure";
      dia("peito", titulo, `${pa.valor_dia} • baseline ${pa.linha_base}`);
      dia("cabeca", titulo, `${pa.valor_dia} • risk of fluid shift`, true);
    }
    const fc = indicadores.fc_repouso as Obj | undefined;
    if (fc) {
      dia("peito", "High heart rate", `${fc.valor_dia} bpm (${fc.variacao_dia}) • baseline ${fc.linha_base}`);
      dia("pulmao", "Heart and lungs under strain", `HR ${fc.valor_dia} bpm at rest (${fc.variacao_dia})`, true);
    }
    const temp = indicadores.temperatura_c as Obj | undefined;
    if (temp) {
      const febre = num(temp.valor_dia) >= 38.1;
      dia("pele", febre ? "Fever" : "Elevated temperature", `${temp.valor_dia} °C • baseline ${temp.linha_base} °C`);
      dia("peito", febre ? "Fever" : "Elevated temperature", `${temp.valor_dia} °C • possible infection`, true);
    }
    const glic = indicadores.glicemia_mg_dl as Obj | undefined;
    if (glic) {
      const alta = !String(glic.variacao_dia).startsWith("-");
      dia("peito", alta ? "High blood glucose" : "Low blood glucose", `${glic.valor_dia} mg/dL (${glic.variacao_dia}) • baseline ${glic.linha_base}`);
    }
    const treino = indicadores.treino_resistido_min as Obj | undefined;
    if (treino) {
      const det = `${treino.media_ultimos_7_dias} min/day over 7 days • goal 60`;
      dia("pernas", "Workout below goal", det);
      dia("coluna", "Spine not loaded enough", det);
    }
    const sono = indicadores.sono_horas as Obj | undefined;
    if (sono) dia("cabeca", "Not enough sleep", `${sono.valor_dia} h • baseline ${sono.linha_base} h (${sono.variacao_7_dias} over 7 days)`);
    const humor = indicadores.humor as Obj | undefined;
    if (humor && num(humor.valor_dia) <= 2) dia("cabeca", "Low mood", `${humor.valor_dia}/5 today • average ${humor.media_ultimos_7_dias}`);
    const ocular = indicadores.sintoma_neuro_ocular;
    if (typeof ocular === "string") {
      dia("cabeca", ocular === "Visao turva" ? "Blurred vision" : "Eye pressure", "Possible neuro-ocular syndrome (SANS)");
    }
    const rad = indicadores.radiacao_acumulada_msv as Obj | undefined;
    if (rad) {
      const pico = num(rad.incremento_7_dias_msv) >= 15;
      const det = `+${rad.incremento_7_dias_msv} mSv in 7 days • total ${rad.valor_dia} mSv`;
      dia("pele", pico ? "Radiation spike" : "High radiation dose", det);
      dia("peito", pico ? "Radiation spike" : "High radiation dose", det, true);
    }

    // Part flagged in the triage with no matching indicator: shows the category
    partes.forEach((p) => {
      const z = p as ZonaCorpo;
      if (!saida[z]) add(z, { titulo: "Alert in today's triage", detalhe: tCategorias(categoriaDoDia), nivel: n, origem: "dia" });
    });
  }

  // ---------------- Hourly alerts (wearable) ----------------
  if (alertaHora && alertaHora.semaforo_hora > 1) {
    const TITULO: Record<string, string> = {
      fc_bpm: "Tachycardia",
      pa_sistolica: "Blood pressure spike",
      spo2_pct: "Low O₂ saturation",
      temperatura_c: "Acute fever",
      hrv_ms: "Very low heart rate variability",
      estresse_wearable: "Acute stress",
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

  // Most severe first within each part
  for (const z of Object.keys(saida) as ZonaCorpo[]) saida[z]!.sort((a, b) => b.nivel - a.nivel || Number(!!a.secundario) - Number(!!b.secundario));
  return saida;
}

// ---------------- Critical health alert (pop-up) ----------------
export interface OrgaoEmAlerta {
  zona: ZonaCorpo;
  nivel: number; // 2 = orange (warning), 3 = red (critical)
  motivo: Motivo;
}

/** Organs colored on the body map (same color rule as BodyMap: the highest level of each zone). */
export function orgaosEmAlerta(motivos: Partial<Record<ZonaCorpo, Motivo[]>>): OrgaoEmAlerta[] {
  return (Object.entries(motivos) as [ZonaCorpo, Motivo[] | undefined][])
    .filter(([, lista]) => lista && lista.length > 0)
    .map(([zona, lista]) => {
      const principal = [...lista!].sort((a, b) => b.nivel - a.nivel || Number(!!a.secundario) - Number(!!b.secundario))[0];
      return { zona, nivel: principal.nivel, motivo: principal };
    })
    .sort((a, b) => b.nivel - a.nivel);
}

/** Critical alert rule: at least 1 red organ or at least 2 orange organs. */
export function exigeAlertaCritico(orgaos: OrgaoEmAlerta[]) {
  return orgaos.some((o) => o.nivel >= 3) || orgaos.filter((o) => o.nivel === 2).length >= 2;
}
