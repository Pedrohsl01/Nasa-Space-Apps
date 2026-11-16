"""
Analyses that look beyond the snapshot of the day:
  - predicao_tendencia: emerging risks in the 5–7 day rolling window (before they become a red alert)
  - exames_sugeridos: information gaps (missing, inconsistent or inconclusive data)
  - coach_exercicio: daily/weekly progress toward the 60-min workout goal

Fixed, readable rules. Thresholds and countermeasures are design choices for the demo
(to be confirmed with a flight surgeon), not official clinical protocols.
"""
from i18n import STATUS_EN, ambiente_en, categoria_en, sintoma_en
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

META_TREINO_MIN = 60
META_SEMANAL_MIN = META_TREINO_MIN * 7

COLUNAS_VITAIS = [
    "pa_sistolica", "pa_diastolica", "fc_repouso", "glicemia_mg_dl",
    "temperatura_c", "sono_horas", "humor", "treino_resistido_min", "sintoma_neuro_ocular",
]

# Plausibility ranges only to detect recording errors (they are not clinical ranges)
PLAUSIVEL = {
    "pa_sistolica": (60, 250),
    "pa_diastolica": (30, 150),
    "fc_repouso": (25, 220),
    "glicemia_mg_dl": (30, 500),
    "temperatura_c": (33.0, 43.0),
    "sono_horas": (0, 16),
    "humor": (1, 5),
    "treino_resistido_min": (0, 300),
}


def _janela(df_ast: pd.DataFrame, dia: int, tamanho: int = 7) -> pd.DataFrame:
    return df_ast[(df_ast["dia_missao"] > dia - tamanho) & (df_ast["dia_missao"] <= dia)].sort_values("dia_missao")


def _inclinacao(serie: pd.Series) -> Optional[float]:
    """Slope (units per day) of the trend line. None if there are fewer than 3 valid points."""
    s = pd.to_numeric(serie, errors="coerce").dropna()
    if len(s) < 3:
        return None
    x = np.arange(len(s), dtype=float)
    return float(np.polyfit(x, s.to_numpy(dtype=float), 1)[0])


def _dias_seguidos_abaixo(valores: List[float], limite: float) -> int:
    n = 0
    for v in reversed(valores):
        if v < limite:
            n += 1
        else:
            break
    return n


# ---------------------------------------------------------------------------
# 1. Longitudinal risk prediction
# ---------------------------------------------------------------------------

def predicao_tendencia(df_ast: pd.DataFrame, dia: int) -> Dict[str, Any]:
    jan = _janela(df_ast, dia, 7)
    if len(jan) < 5:
        return {
            "janela_dias": len(jan),
            "riscos": [],
            "nivel": "dados_insuficientes",
            "resumo": "At least 5 recorded days are needed to analyze the trend.",
        }

    atual = jan.iloc[-1]
    riscos: List[Dict[str, Any]] = []

    def risco(id_: str, titulo: str, categoria: str, perigo: str, evidencias: List[str], contramedidas: List[str], forte: bool):
        riscos.append({
            "id": id_,
            "titulo": titulo,
            "categoria": categoria,
            "perigo_nasa": perigo,
            "severidade": "provavel" if forte else "emergente",
            "evidencias": evidencias,
            "contramedidas_preventivas": contramedidas,
        })

    # Gradually declining sleep
    base_sono = float(atual["base_sono"])
    incl_sono = _inclinacao(jan["sono_horas"])
    media3_sono = float(jan["sono_horas"].tail(3).mean())
    ev = []
    if incl_sono is not None and incl_sono <= -0.15:
        ev.append(f"sleep dropping {abs(incl_sono):.2f} h/day over the last {len(jan)} days")
    if media3_sono <= base_sono - 0.8:
        ev.append(f"3-day average {media3_sono:.1f} h vs. baseline {base_sono:.1f} h")
    if ev:
        risco("sono_progressivo", "Progressive sleep debt", "Behavioral", "Isolation and confinement", ev, [
            "Adjust the light cycle: blue-enriched light on waking and amber light 2 h before bed",
            "Keep a fixed sleep schedule and cut evening tasks for 3 days",
            "Sleep and stress check-in (ARCHeR) with the crew",
        ], len(ev) > 1)

    # Rising resting HR
    base_fc = float(atual["base_fc_repouso"])
    incl_fc = _inclinacao(jan["fc_repouso"])
    ev = []
    if incl_fc is not None and incl_fc >= 0.8:
        ev.append(f"resting HR rising {incl_fc:.1f} bpm/day")
    if float(jan["fc_repouso"].tail(3).mean()) >= base_fc + 6:
        ev.append(f"3-day average {jan['fc_repouso'].tail(3).mean():.0f} bpm vs. baseline {base_fc:.0f} bpm")
    if ev:
        risco("fc_subindo", "Resting HR on the rise", "Cardiovascular", "Hostile closed environment", ev, [
            "Electrolyte hydration (sodium and potassium replacement per the onboard protocol)",
            "Reduce workout intensity for 24–48 h and repeat the measurement at rest",
            "Track temperature twice a day to rule out infection",
        ], len(ev) > 1)

    # Rising blood pressure: possible fluid shift toward the head
    base_pas = float(atual["base_pa_sistolica"])
    incl_pas = _inclinacao(jan["pa_sistolica"])
    ev = []
    if incl_pas is not None and incl_pas >= 1.0:
        ev.append(f"systolic BP rising {incl_pas:.1f} mmHg/day")
    if float(jan["pa_sistolica"].tail(3).mean()) >= base_pas + 8:
        ev.append(f"3-day average {jan['pa_sistolica'].tail(3).mean():.0f} mmHg vs. baseline {base_pas:.0f}")
    if ev:
        risco("fluidos_cefalicos", "Rising blood pressure: possible fluid shift toward the head", "Neuro-ocular",
              "Altered gravity", ev, [
                  "Thigh Cuff protocol to keep fluid in the legs",
                  "Preventive eye exam before symptoms appear",
                  "Hydration and less salt in the diet for a few days",
              ], len(ev) > 1)

    # Radiation building up faster than usual (rate, not total)
    delta_rad = float(jan["radiacao_acumulada_msv"].iloc[-1] - jan["radiacao_acumulada_msv"].iloc[0])
    taxa_rad = delta_rad / max(1, len(jan) - 1)
    ev = []
    if 10 <= delta_rad < 25:
        ev.append(f"+{delta_rad:.1f} mSv in {len(jan)} days (rate of {taxa_rad:.2f} mSv/day)")
    if ev:
        risco("radiacao_ritmo", "Radiation building up faster than usual", "Radiation", "Space radiation", ev, [
            "Plan to shelter in the most shielded module in case of a solar storm alert",
            "Postpone EVAs and time spent in less shielded areas",
            "Check the personal dosimeter and log the daily dose",
        ], False)

    # Workout: days below the goal
    treinos = [float(v) for v in jan["treino_resistido_min"]]
    abaixo = sum(1 for v in treinos if v < META_TREINO_MIN)
    seguidos = _dias_seguidos_abaixo(treinos, META_TREINO_MIN)
    ev = []
    if abaixo >= 3:
        ev.append(f"{abaixo} of {len(treinos)} days below {META_TREINO_MIN} min")
    if seguidos >= 2:
        ev.append(f"{seguidos} consecutive days below the goal")
    if ev:
        risco("treino_adesao", "Declining workout adherence: risk of bone and muscle loss", "Musculoskeletal",
              "Altered gravity", ev, [
                  "Resume 60 min/day of resistance + aerobic training",
                  "Prioritize exercises that load the spine and legs",
                  "Split the goal into two 30-min blocks if the schedule is full",
              ], len(ev) > 1)

    # Declining mood
    incl_humor = _inclinacao(jan["humor"])
    ev = []
    if incl_humor is not None and incl_humor <= -0.15:
        ev.append(f"mood dropping {abs(incl_humor):.2f} point/day")
    if float(jan["humor"].tail(3).mean()) <= 3.0:
        ev.append(f"average mood {jan['humor'].tail(3).mean():.1f}/5 over the last 3 days")
    if ev:
        risco("humor_queda", "Declining mood", "Behavioral", "Isolation and confinement", ev, [
            "Schedule a call with family or psychological support from Earth",
            "Group leisure activity and a break in the routine",
        ], len(ev) > 1)

    # Slowly rising temperature
    incl_temp = _inclinacao(jan["temperatura_c"])
    if incl_temp is not None and incl_temp >= 0.08 and float(atual["temperatura_c"]) < 38.1:
        risco("temperatura_subindo", "Gradually rising temperature", "Immune", "Hostile closed environment",
              [f"temperature rising {incl_temp:.2f} °C/day"], [
                  "Measure temperature twice a day",
                  "Reinforce hygiene and consider preventive isolation if fever appears",
              ], False)

    # Drifting blood glucose
    incl_glic = _inclinacao(jan["glicemia_mg_dl"])
    if incl_glic is not None and abs(incl_glic) >= 1.5:
        direcao = "rising" if incl_glic > 0 else "dropping"
        risco("glicemia_deriva", f"Blood glucose gradually {direcao}", "Metabolic", "Hostile closed environment",
              [f"blood glucose {direcao} {abs(incl_glic):.1f} mg/dL/day"], [
                  "Review meal times and the meal plan",
                  "Measure fasting capillary glucose for 3 days",
              ], False)

    nivel = "atencao" if any(r["severidade"] == "provavel" for r in riscos) else ("observacao" if riscos else "estavel")
    return {
        "janela_dias": len(jan),
        "inicio": int(jan["dia_missao"].iloc[0]),
        "fim": int(jan["dia_missao"].iloc[-1]),
        "riscos": riscos,
        "nivel": nivel,
        "resumo": (
            f"{len(riscos)} emerging risk(s) in the {len(jan)}-day window."
            # "no gradual worsening" (trend), not "no risk": a daily alert may still be active
            if riscos else f"No gradual worsening detected over the last {len(jan)} days."
        ),
    }


# ---------------------------------------------------------------------------
# 2. Information gaps and suggested exams
# ---------------------------------------------------------------------------

EXAME_POR_COLUNA = {
    "glicemia_mg_dl": ("Capillary glucose / metabolic panel", "Blood glucose not measured"),
    "pa_sistolica": ("Manual blood pressure measurement", "Blood pressure not recorded"),
    "pa_diastolica": ("Manual blood pressure measurement", "Diastolic pressure not recorded"),
    "fc_repouso": ("12-lead ECG", "Heart rate not recorded"),
    "temperatura_c": ("Oral or tympanic thermometry", "Temperature not recorded"),
    "sono_horas": ("Sleep actigraphy (wearable)", "Sleep hours not recorded"),
    "humor": ("Mood and stress questionnaire (ARCHeR)", "Mood not recorded"),
    "treino_resistido_min": ("Check the workout equipment log", "Workout minutes not recorded"),
    "sintoma_neuro_ocular": ("Visual symptoms questionnaire", "Neuro-ocular symptom not recorded"),
}


def exames_sugeridos(df_ast: pd.DataFrame, dia: int, telemetria: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    jan = _janela(df_ast, dia, 7)
    atual = jan.iloc[-1]
    exames: Dict[str, Dict[str, Any]] = {}

    def sugerir(exame: str, motivo: str, procedimento: str, prioridade: str, tipo: str):
        if exame in exames:
            # Keeps the most severe reason and accumulates the others
            if motivo not in exames[exame]["motivo"]:
                exames[exame]["motivo"] += f"; {motivo}"
            ordem = {"alta": 0, "media": 1, "baixa": 2}
            if ordem[prioridade] < ordem[exames[exame]["prioridade"]]:
                exames[exame]["prioridade"] = prioridade
            return
        exames[exame] = {"exame": exame, "motivo": motivo, "procedimento": procedimento, "prioridade": prioridade, "tipo": tipo}

    # (a) Data missing over the last 7 days
    for col in COLUNAS_VITAIS:
        faltando = jan[jan[col].isna() | (jan[col].astype(str).str.strip() == "")]["dia_missao"].tolist()
        if faltando:
            exame, motivo = EXAME_POR_COLUNA[col]
            dias = ", ".join(str(int(d)) for d in faltando)
            sugerir(exame, f"{motivo} (day {dias})", "Measure today and log it at check-in", "media", "ausente")

    # (b) Inconsistent values (outside the plausible range or diastolic BP >= systolic)
    for col, (lo, hi) in PLAUSIVEL.items():
        v = pd.to_numeric(jan[col], errors="coerce")
        ruins = jan[(v < lo) | (v > hi)]["dia_missao"].tolist()
        if ruins:
            sugerir(f"Repeat the {col} measurement", f"Value outside the plausible range on day {', '.join(map(str, ruins))}",
                    "Repeat the measurement with another device and correct the record", "media", "inconsistente")
    pa_inv = jan[pd.to_numeric(jan["pa_diastolica"], errors="coerce") >= pd.to_numeric(jan["pa_sistolica"], errors="coerce")]
    if not pa_inv.empty:
        sugerir("Manual blood pressure measurement", "Diastolic greater than or equal to systolic (inconsistent record)",
                "Repeat with a manual sphygmomanometer", "media", "inconsistente")

    # (c) Inconclusive: sleep dropping or blood pressure rising with no recorded eye exam
    sono_queda = float(jan["sono_horas"].tail(3).mean()) <= float(atual["base_sono"]) - 1.0
    pa_alta = float(atual["pa_sistolica"]) >= float(atual["base_pa_sistolica"]) + 10
    sem_sintoma = (jan["sintoma_neuro_ocular"].astype(str) == "Nenhum").all()
    if (sono_queda or pa_alta) and sem_sintoma:
        gatilho = "sleep loss" if sono_queda else "blood pressure above baseline"
        sugerir("Tonometry and ocular OCT", f"Investigate SANS: {gatilho} with no recent objective neuro-ocular exam",
                "Measure intraocular pressure and perform OCT/fundoscopy on board", "media", "inconclusivo")
    if str(atual["sintoma_neuro_ocular"]) != "Nenhum":
        sugerir("Tonometry and ocular OCT", f"Symptom reported today: {sintoma_en(atual['sintoma_neuro_ocular'])}",
                "Measure intraocular pressure and perform OCT/fundoscopy on board", "alta", "inconclusivo")

    # HR swinging
    var_fc = (float(atual["fc_repouso"]) - float(atual["base_fc_repouso"])) / float(atual["base_fc_repouso"]) * 100
    horas_fc = []
    if telemetria:
        horas_fc = [p["rotulo"] for p in telemetria["pontos"] if any(a["sinal"] == "fc_bpm" for a in p.get("alertas", []))]
    if abs(var_fc) >= 15 or len(horas_fc) >= 1:
        motivo = f"Resting HR {var_fc:+.0f}% vs. baseline" if abs(var_fc) >= 15 else f"HR swings on the wearable at {', '.join(horas_fc)}"
        sugerir("12-lead ECG", f"Confirm HR swings: {motivo}", "ECG at rest and repeat after 1 h",
                "alta" if abs(var_fc) >= 28 or len(horas_fc) >= 2 else "media", "inconclusivo")

    # Blood glucose off baseline
    var_glic = (float(atual["glicemia_mg_dl"]) - float(atual["base_glicemia"])) / float(atual["base_glicemia"]) * 100
    if abs(var_glic) >= 15:
        sugerir("Capillary glucose / metabolic panel", f"Blood glucose {var_glic:+.0f}% vs. baseline",
                "Capillary glucose while fasting and 2 h after a meal", "media", "inconclusivo")

    # Elevated temperature: look for a source
    if float(atual["temperatura_c"]) >= 37.5:
        sugerir("Infection source assessment", f"Temperature {atual['temperatura_c']} °C",
                "Guided physical exam and a measurement every 4 h", "alta" if float(atual["temperatura_c"]) >= 38.1 else "media", "inconclusivo")

    # Hourly telemetry: low SpO₂ (especially post-EVA) and signal gaps
    if telemetria:
        pontos = telemetria["pontos"]
        baixas = [p for p in pontos if p.get("spo2_pct") is not None and p["spo2_pct"] < 94]
        if baixas:
            pos_eva = any(p["perfil"] == "eva" for p in baixas) or telemetria["ambiente"] == "Base Marciana"
            exame = "Post-EVA oximetry and capnography" if pos_eva else "Continuous pulse oximetry"
            sugerir(exame, f"Lowest SpO₂ {min(p['spo2_pct'] for p in baixas)}% at {', '.join(p['rotulo'] for p in baixas)}",
                    "Fingertip oximeter at rest + check suit/habitat CO₂", "alta", "inconclusivo")
        lacunas = [p["rotulo"] for p in pontos if p.get("sem_sinal")]
        if lacunas:
            sugerir("Check the wearable and measure manually", f"Telemetry gap at {', '.join(lacunas)}",
                    "Check the battery and sensor contact; measure HR and SpO₂ manually", "baixa", "ausente")

    ordem = {"alta": 0, "media": 1, "baixa": 2}
    return sorted(exames.values(), key=lambda e: ordem[e["prioridade"]])


# ---------------------------------------------------------------------------
# 3. Exercise coach
# ---------------------------------------------------------------------------

def coach_exercicio(df_ast: pd.DataFrame, dia: int, hora: int, telemetria: Dict[str, Any]) -> Dict[str, Any]:
    pontos = telemetria["pontos"]
    hora = max(0, min(23, hora))
    concluido = int(pontos[hora]["treino_min_acumulado"])
    deficit = max(0, META_TREINO_MIN - concluido)
    pct_dia = min(100, round(concluido / META_TREINO_MIN * 100))

    # Week: 6 previous days (full record) + today up to the current hour
    anteriores = _janela(df_ast, dia - 1, 6)
    semana_min = int(anteriores["treino_resistido_min"].sum()) + concluido
    dias_semana = len(anteriores) + 1
    meta_semana = META_TREINO_MIN * dias_semana

    # Streak of days on goal ending yesterday (+ today, if already met)
    historico = df_ast[df_ast["dia_missao"] < dia].sort_values("dia_missao")["treino_resistido_min"].tolist()
    streak = 0
    for v in reversed(historico):
        if v >= META_TREINO_MIN:
            streak += 1
        else:
            break
    if concluido >= META_TREINO_MIN:
        streak += 1

    inicio_sono = int(telemetria["inicio_sono"])
    proximas = [p for p in pontos[hora + 1:] if p["perfil"] in ("resistido", "aerobico") or "(not done)" in p["atividade"] or "(partial)" in p["atividade"]]
    proximas = [p for p in proximas if p["hora"] < inicio_sono]
    atividade_atual = pontos[hora]["atividade"]

    if deficit == 0:
        status = "meta_cumprida"
        recomendacao = f"{META_TREINO_MIN}-min goal met. Focus on hydration and stretching before sleep."
    # Early-morning sleep (before noon) is the start of the day, not the end
    elif hora >= inicio_sono or (pontos[hora]["perfil"] == "sono" and hora >= 12):
        status = "critico"
        recomendacao = f"Day closed {deficit} min short. Plan to make up for it with {min(deficit, 30)} extra min tomorrow."
    elif proximas:
        p = proximas[0]
        status = "no_caminho" if deficit <= 30 else "atencao"
        recomendacao = f"{deficit} min to go. Next workout window at {p['rotulo']} ({p['atividade'].split(' (')[0]})."
    elif inicio_sono - hora <= 3:
        status = "critico"
        recomendacao = (
            f"{deficit} min to go and the sleep window starts at {inicio_sono:02d}:00. "
            f"Do {min(deficit, 30)} min of light resistance training now, at least 1 h before bed."
        )
    else:
        status = "atencao"
        recomendacao = f"{deficit} min to go and there is no other workout window in the routine. Fit the workout in before {inicio_sono - 2:02d}:00."

    return {
        "meta_diaria_min": META_TREINO_MIN,
        "concluido_min": concluido,
        "deficit_min": deficit,
        "progresso_dia_pct": pct_dia,
        "semana_min": semana_min,
        "meta_semana_min": meta_semana,
        "progresso_semana_pct": min(100, round(semana_min / meta_semana * 100)) if meta_semana else 0,
        "streak_dias": streak,
        "hora": hora,
        "atividade_atual": atividade_atual,
        "status": status,
        "recomendacao": recomendacao,
    }


# ---------------------------------------------------------------------------
# 4. Operational assessment: status, 0–100 score, action tags and technical summary
# ---------------------------------------------------------------------------

STATUS_POR_CODIGO = {1: "NORMAL", 2: "ATENCAO", 3: "CRITICO"}
FAIXA_SCORE = {1: (0, 30), 2: (31, 69), 3: (70, 100)}


def avaliacao_operacional(
    codigo: int,
    categorias: str,
    indicadores: Dict[str, Any],
    atual: pd.Series,
    media_7d: Dict[str, float],
    telemetria: Dict[str, Any],
    predicao: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Deterministic summary for the crew and for the AI. Same inputs -> same output.
    The score respects the status band (NORMAL 0–30, ATENCAO 31–69, CRITICO 70–100).
    """
    ambiente = str(atual["ambiente"])
    cats = set(c for c in str(categorias).split(";") if c and c != "Nominal")
    # The old dataset tags fever/glucose as "Cardiovascular": completed from the indicator keys
    if "temperatura_c" in indicadores:
        cats.add("Imunológico")
    if "glicemia_mg_dl" in indicadores:
        cats.add("Metabólico")
    if "radiacao_acumulada_msv" in indicadores:
        cats.add("Radiação")
    if "sintoma_neuro_ocular" in indicadores:
        cats.add("Neuro-ocular")
    if "treino_resistido_min" in indicadores:
        cats.add("Musculoesquelético")

    # Wearable summary (waking hours, ignoring signal gaps)
    acordado = [p for p in telemetria["pontos"] if p["perfil"] != "sono" and not p["sem_sinal"]]
    spo2_min = min((p["spo2_pct"] for p in acordado), default=None)
    hrv_media = round(sum(p["hrv_ms"] for p in acordado) / len(acordado)) if acordado else None
    hrv_esperada = round(sum(p["esperado"]["hrv_ms"] for p in acordado) / len(acordado)) if acordado else None
    horas_alerta = sum(1 for p in telemetria["pontos"] if p["semaforo_hora"] > 1)
    estresse_medio = round(sum(p["estresse_wearable"] for p in acordado) / len(acordado)) if acordado else None

    # ---------------- Score ----------------
    # level base + indicators in alert + trend + wearable (each part capped, so the score varies)
    pontos = {1: 5, 2: 40, 3: 72}[codigo]
    if codigo > 1:
        pontos += min(14, 4 * len(indicadores))
    riscos = predicao.get("riscos", [])
    pontos += min(8, sum(2 if r["severidade"] == "provavel" else 1 for r in riscos))
    if spo2_min is not None and spo2_min < 94:
        pontos += 3
    pontos += min(3, horas_alerta)
    lo, hi = FAIXA_SCORE[codigo]
    score = int(max(lo, min(hi, round(pontos))))

    # ---------------- Action tags (up to 3, by priority) ----------------
    base_sono = float(atual["base_sono"])
    sono = float(atual["sono_horas"])
    deficit_sono = sono <= base_sono - 1.0 or "sono_horas" in indicadores
    fadiga = (hrv_media is not None and hrv_esperada and hrv_media < hrv_esperada * 0.8) or (estresse_medio or 0) >= 65

    tags: List[str] = []
    if codigo >= 3:
        tags.append("Suspend EVA" if ambiente == "Base Marciana" else "Restrict Exertion")
    elif codigo == 2 and cats & {"Cardiovascular", "Imunológico", "Metabólico"}:
        tags.append("Restrict Exertion")
    if "Radiação" in cats:
        tags.append("Move to Shielded Shelter")
    if "Neuro-ocular" in cats:
        tags.append("Eye Exam")
    if "Imunológico" in cats:
        tags.append("Monitor Fever")
    if deficit_sono:
        tags.append("Sol Desync (24h39m)" if ambiente == "Base Marciana" else "Adjust Sleep Cycle")
    if fadiga:
        tags.append("Autonomic Fatigue")
    if "Musculoesquelético" in cats:
        tags.append("Resume Resistance Training")
    if not tags:
        tags = ["Fit for EVA" if ambiente == "Base Marciana" else "Stable Cycle"]
        if codigo == 1 and ambiente != "Base Marciana":
            tags.append("Keep Routine")
    tags = list(dict.fromkeys(tags))[:3]

    # ---------------- Technical summary with real values ----------------
    partes = [
        f"PA {int(atual['pa_sistolica'])}/{int(atual['pa_diastolica'])} mmHg (baseline {int(atual['base_pa_sistolica'])}/{int(atual['base_pa_diastolica'])})",
        f"HR {int(atual['fc_repouso'])} bpm (baseline {int(atual['base_fc_repouso'])})",
        f"sleep {sono:.1f} h (baseline {base_sono:.1f}; 7-day avg {media_7d['sono_horas']})",
        f"temperature {float(atual['temperatura_c']):.1f} °C",
        f"blood glucose {int(atual['glicemia_mg_dl'])} mg/dL",
    ]
    if spo2_min is not None:
        partes.append(f"lowest SpO₂ {spo2_min}% and average HRV {hrv_media} ms on the wearable")
    rad = float(atual["radiacao_acumulada_msv"])
    inc = indicadores.get("radiacao_acumulada_msv", {}).get("incremento_7_dias_msv") if isinstance(indicadores.get("radiacao_acumulada_msv"), dict) else None
    partes.append(f"accumulated radiation {rad:.1f} mSv" + (f" (+{inc} mSv in 7 days)" if inc is not None else ""))
    if ambiente == "Base Marciana":
        partes.append("24h39m Martian sol cycle")
    causa = f" Alerts: {categoria_en(sorted(cats))}." if cats else " No relevant deviations from baseline."
    resumo = (
        f"{STATUS_EN[STATUS_POR_CODIGO[codigo]]} (score {score}/100) on day {int(atual['dia_missao'])}, {ambiente_en(ambiente)}: "
        + "; ".join(partes) + "." + causa
    )

    return {
        "status": STATUS_POR_CODIGO[codigo],
        "score_risco": score,
        "tags_acao": tags,
        "resumo_tecnico": resumo,
    }
