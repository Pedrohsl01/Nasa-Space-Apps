"""
Continuous wearable telemetry (24 points, 00:00–23:00) generated on demand.

Nothing here is written to the .xlsx: the points are derived from the daily record (anchor) and from the
mission environment routine. The variation is stochastic but deterministic: the seed comes from
(astronaut, day, hour), so the same day always generates the same curve.

Hourly thresholds and activity profiles are DESIGN CHOICES for the demo (to be confirmed with a
health professional), not official clinical criteria.
"""
import math
import random
import zlib
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Activity profiles: expected offset from the day's resting values
# fc/pa in absolute units, temp in °C, hrv as a factor, stress 0–100
# ---------------------------------------------------------------------------
PERFIS: Dict[str, Dict[str, float]] = {
    "sono":        {"fc": -8, "pas": -8, "pad": -6, "temp": -0.3, "spo2": 97.0, "hrv": 1.25, "estresse": 12},
    "repouso":     {"fc": 4,  "pas": 2,  "pad": 1,  "temp": 0.0,  "spo2": 98.0, "hrv": 1.0,  "estresse": 28},
    "trabalho":    {"fc": 12, "pas": 6,  "pad": 3,  "temp": 0.1,  "spo2": 98.0, "hrv": 0.9,  "estresse": 45},
    "resistido":   {"fc": 50, "pas": 24, "pad": 8,  "temp": 0.6,  "spo2": 97.0, "hrv": 0.55, "estresse": 52},
    "aerobico":    {"fc": 58, "pas": 20, "pad": 4,  "temp": 0.7,  "spo2": 96.5, "hrv": 0.5,  "estresse": 48},
    "eva":         {"fc": 40, "pas": 15, "pad": 6,  "temp": 0.4,  "spo2": 95.5, "hrv": 0.65, "estresse": 62},
    "pre_resp":    {"fc": 8,  "pas": 4,  "pad": 2,  "temp": 0.0,  "spo2": 99.0, "hrv": 0.95, "estresse": 40},
    "comunicacao": {"fc": 8,  "pas": 4,  "pad": 2,  "temp": 0.0,  "spo2": 98.0, "hrv": 0.9,  "estresse": 40},
    "lazer":       {"fc": 3,  "pas": 0,  "pad": 0,  "temp": 0.0,  "spo2": 98.0, "hrv": 1.1,  "estresse": 20},
}

# ---------------------------------------------------------------------------
# Routines per environment: hour -> (profile, activity name, short description)
# Sleep hours are adjusted by the sleep hours recorded for the day.
# ---------------------------------------------------------------------------
def _rotina(itens: Dict[range, tuple]) -> Dict[int, tuple]:
    mapa: Dict[int, tuple] = {}
    for horas, atividade in itens.items():
        for h in horas:
            mapa[h] = atividade
    return mapa


ROTINAS: Dict[str, Dict[int, tuple]] = {
    "Estacao Orbital": _rotina({
        range(6, 7): ("repouso", "Wake-up and hygiene", "Artificial circadian cycle: blue-enriched light turns on at 06:00"),
        range(7, 8): ("comunicacao", "Briefing with mission control", "Day planning with Earth (near real time)"),
        range(8, 10): ("trabalho", "Technical work in microgravity", "Onboard experiments and maintenance"),
        range(10, 11): ("resistido", "ARED + treadmill workout", "Resistance and aerobic exercise against bone and muscle loss"),
        range(11, 12): ("repouso", "Post-workout recovery", "Hydration and stretching"),
        range(12, 13): ("repouso", "Lunch", "Meal and break"),
        range(13, 17): ("trabalho", "Science experiments", "Technical work window in microgravity"),
        range(17, 18): ("aerobico", "Supplementary workout (treadmill/cycle ergometer)", "Used when the daily goal has not been met yet"),
        range(18, 19): ("repouso", "Dinner", "Group meal"),
        range(19, 20): ("comunicacao", "Family contact", "Personal communication with Earth"),
        range(20, 21): ("repouso", "Cephalad fluid monitoring", "Blood pressure and eye symptom check (fluid shift)"),
        range(21, 22): ("lazer", "Leisure", "Free time, amber light to prepare for sleep"),
    }),
    "Transito para Marte": _rotina({
        range(6, 7): ("repouso", "Wake-up", "Prolonged confinement: a strict routine helps the body clock"),
        range(7, 8): ("comunicacao", "Crew briefing", "Local planning (Earth replies with a delay)"),
        range(8, 10): ("resistido", "Intensive anti-atrophy protocol", "Heavy resistance training against bone and muscle loss"),
        range(10, 13): ("trabalho", "Operations and navigation", "Spacecraft systems and navigation"),
        range(13, 14): ("repouso", "Lunch", "Meal and break"),
        range(14, 15): ("trabalho", "Cosmic radiation dosimetry", "Dosimeter readout: higher exposure outside the magnetosphere"),
        range(15, 16): ("aerobico", "Aerobic workout", "Cycle ergometer for cardiovascular conditioning"),
        range(16, 19): ("trabalho", "Maintenance and experiments", "Work in a confined environment"),
        range(19, 20): ("repouso", "ARCHeR sleep and stress assessment", "Self-assessment of mood, sleep and workload"),
        range(20, 21): ("comunicacao", "Messages with Earth", "Communication with a delay of several minutes"),
        range(21, 22): ("lazer", "Leisure", "Group free time"),
    }),
    "Base Marciana": _rotina({
        range(6, 7): ("repouso", "Wake-up", "Partial gravity (0.38 g)"),
        range(7, 8): ("pre_resp", "Pre-breathe and suit prep", "Pure oxygen before the EVA to prevent decompression sickness"),
        range(8, 12): ("eva", "Surface EVA", "Extravehicular activity in a pressurized suit"),
        range(12, 13): ("repouso", "Post-EVA: respiratory check", "SpO₂/CO₂ and physical fatigue monitoring"),
        range(13, 14): ("repouso", "Lunch", "Meal and break"),
        range(14, 17): ("trabalho", "Lab and geology", "Analysis of collected samples"),
        range(17, 18): ("resistido", "Resistance training at 0.38 g", "Extra load to complement partial gravity"),
        range(18, 19): ("repouso", "Dinner", "Group meal"),
        range(19, 20): ("comunicacao", "Communication with Earth", "Signal delay of up to ~20 min each way"),
        range(20, 21): ("repouso", "Physical fatigue assessment", "Fatigue scale and muscle recovery"),
        range(21, 22): ("lazer", "Leisure", "Free time at the base"),
    }),
}

# Workout hours per environment and the share of the goal planned for each (spreads the day's minutes)
JANELAS_TREINO: Dict[str, List[tuple]] = {
    "Estacao Orbital": [(10, 1.0), (17, 0.0)],     # 17:00 only gets whatever exceeds 60 min
    "Transito para Marte": [(8, 0.35), (9, 0.35), (15, 0.30)],
    "Base Marciana": [(17, 1.0)],
}

INICIO_SONO = 22
META_TREINO_MIN = 60

PARTES_POR_SINAL = {
    "fc_bpm": ["peito"],
    "pa_sistolica": ["peito"],
    "temperatura_c": ["pele"],
    "spo2_pct": ["pulmao"],
    "hrv_ms": ["peito"],
    "estresse_wearable": ["cabeca"],
}

TIPOS_PICO = {
    "taquicardia": "Acute tachycardia",
    "dessaturacao": "Oxygen desaturation (SpO₂)",
    "hipertensao": "Hypertensive spike",
    "febre": "Acute temperature rise",
    "estresse_agudo": "Acute stress (very low HRV)",
}


def _semente(*partes: Any) -> int:
    return zlib.crc32("|".join(str(p) for p in partes).encode("utf-8"))


def _distribuir_treino(ambiente: str, minutos: int) -> Dict[int, int]:
    """Spreads the day's workout minutes across the environment's workout windows."""
    janelas = JANELAS_TREINO.get(ambiente, [(10, 1.0)])
    resultado = {h: 0 for h, _ in janelas}
    if ambiente == "Estacao Orbital":
        resultado[10] = min(minutos, META_TREINO_MIN)
        resultado[17] = max(0, minutos - META_TREINO_MIN)
        return resultado
    restante = minutos
    for i, (h, frac) in enumerate(janelas):
        parte = restante if i == len(janelas) - 1 else int(round(minutos * frac))
        parte = min(parte, restante)
        resultado[h] = parte
        restante -= parte
    return resultado


def _horas_de_sono(sono_horas: float) -> set:
    """The sleep window starts at 22:00 and lasts the sleep hours recorded for the day."""
    n = max(0, min(14, int(round(sono_horas))))
    return {(INICIO_SONO + i) % 24 for i in range(n)}


# ---------------------------------------------------------------------------
# INCREMENTAL reading generator (smartwatch): one hour at a time
#
#   value(h+1) = expected(h+1) + residual(h+1) + effect(h+1)
#   residual(h+1) = ρ·residual(h) + √(1−ρ²)·σ·N(0,1)        (autoregressive continuity)
#   effect(h+1)  = 0.4·effect(h) + 0.6·target(events at h)  (pain, countermeasure and fatigue come in with a lag)
#   expected(h)  = day's resting value + activity profile + circadian rhythm of the hour
# ---------------------------------------------------------------------------
SINAIS = ["fc_bpm", "pa_sistolica", "pa_diastolica", "temperatura_c", "spo2_pct", "hrv_ms", "estresse_wearable"]
# Standard deviation of the stationary noise per signal (hrv_ms is a fraction of the expected value)
SIGMA = {"fc_bpm": 3.0, "pa_sistolica": 4.0, "pa_diastolica": 3.0, "temperatura_c": 0.08, "spo2_pct": 0.6, "hrv_ms": 0.08, "estresse_wearable": 6.0}
RHO_AR = 0.6  # 1 h autocorrelation
LAG_EFEITO = 0.4  # fraction of the previous hour's effect that remains (gradual physiological response)


def planejar_dia(registro: Dict[str, Any]) -> Dict[str, Any]:
    """
    Day plan from the daily record: activity schedule (environment routine, sleep window,
    workout minutes per hour), reference resting values and signal gap hours.
    Generates no reading: readings come one by one from iniciar_leitura / gerar_proxima_leitura_horaria.
    """
    id_ast = str(registro["id_astronauta"])
    dia = int(registro["dia_missao"])
    ambiente = str(registro["ambiente"])
    rotina = ROTINAS.get(ambiente, ROTINAS["Estacao Orbital"])

    base_fc = float(registro["base_fc_repouso"])
    sono = float(registro["sono_horas"])
    humor = int(registro["humor"])
    deficit_sono = max(0.0, float(registro["base_sono"]) - sono)

    horas_sono = _horas_de_sono(sono)
    treino_por_hora = _distribuir_treino(ambiente, int(registro["treino_resistido_min"]))

    # Simulated telemetry gap: ~1 in every 7 days the wearable goes 2 h without signal
    rng_dia = random.Random(_semente(id_ast, dia, "lacuna"))
    horas_sem_sinal: set = set()
    if rng_dia.random() < 1 / 7:
        inicio = rng_dia.choice([2, 3, 13, 14, 15])
        horas_sem_sinal = {inicio, inicio + 1}

    agenda: List[Dict[str, Any]] = []
    acumulado = 0
    for h in range(24):
        if h in horas_sono:
            perfil_id, atividade, descricao = "sono", "Sleep", "Sleep window"
        else:
            perfil_id, atividade, descricao = rotina.get(h, ("repouso", "Break", "Free time"))
        minutos = treino_por_hora.get(h, 0) if h not in horas_sono else 0
        if perfil_id in ("resistido", "aerobico") and minutos < 20:
            perfil_id = "repouso"
            atividade = f"{atividade} (not done)" if minutos == 0 else f"{atividade} (partial)"
        acumulado += minutos
        agenda.append({
            "hora": h, "rotulo": f"{h:02d}:00", "perfil": perfil_id, "atividade": atividade,
            "descricao": descricao, "treino_min": minutos, "treino_min_acumulado": acumulado,
        })

    return {
        "id_astronauta": id_ast,
        "dia_missao": dia,
        "ambiente": ambiente,
        "inicio_sono": INICIO_SONO,
        "horas_sem_sinal": sorted(horas_sem_sinal),
        "agenda": agenda,
        "fc_rep": float(registro["fc_repouso"]),
        "pas": float(registro["pa_sistolica"]),
        "pad": float(registro["pa_diastolica"]),
        "temp": float(registro["temperatura_c"]),
        # Simulated individual HRV: a lower baseline HR tends to mean a higher HRV
        "hrv_base": 55 + (70 - base_fc) * 1.2,
        # Short sleep and low mood raise stress and lower HRV throughout the day
        "fator_hrv_dia": max(0.5, 1 - deficit_sono * 0.07 - max(0, 4 - humor) * 0.05),
        "ajuste_estresse": deficit_sono * 6 + (4 - humor) * 7 + (6 if ambiente == "Transito para Marte" else 0),
    }


def _circadiano(h: int) -> Dict[str, float]:
    """Circadian rhythm: temperature peaks ~17:00 and dips ~05:00; HR follows; HRV is higher at night."""
    c17 = math.cos(2 * math.pi * (h - 17) / 24)
    c16 = math.cos(2 * math.pi * (h - 16) / 24)
    c13 = math.cos(2 * math.pi * (h - 13) / 24)
    return {"temp": 0.2 * c17, "fc": 2.5 * c16, "hrv": 1 - 0.06 * c16, "estresse": 4 * c13}


def esperado_hora(plano: Dict[str, Any], h: int) -> Dict[str, float]:
    """Expected value of each signal at hour h (no noise and no events)."""
    p = PERFIS[plano["agenda"][h]["perfil"]]
    c = _circadiano(h)
    return {
        "fc_bpm": plano["fc_rep"] + p["fc"] + c["fc"],
        "pa_sistolica": plano["pas"] + p["pas"],
        "pa_diastolica": plano["pad"] + p["pad"],
        "temperatura_c": plano["temp"] + p["temp"] + c["temp"],
        "spo2_pct": p["spo2"],
        "hrv_ms": plano["hrv_base"] * plano["fator_hrv_dia"] * p["hrv"] * c["hrv"],
        "estresse_wearable": min(100.0, p["estresse"] + plano["ajuste_estresse"] + c["estresse"]),
    }


def _alvo_eventos(
    h: int,
    desconfortos: List[Dict[str, Any]],
    contramedidas: List[Dict[str, Any]],
    desgaste: float,
) -> tuple:
    """
    Target physiological effect of the events active at hour h on the reading of h+1.
    Discomfort (pain) activates the sympathetic system; a recent countermeasure calms it; accumulated fatigue raises resting HR.
    """
    alvo = {k: 0.0 for k in SINAIS}
    textos: List[str] = []

    carga_dor = 0.0
    for d in desconfortos:
        hd = int(d.get("hora", 0))
        if hd > h:
            continue
        mitigado = any(hd <= int(c.get("hora", 0)) <= h for c in contramedidas)
        carga_dor += int(d["intensidade"]) * (0.5 if mitigado else 1.0)
    if carga_dor:
        alvo["fc_bpm"] += min(12.0, 1.5 * carga_dor)
        alvo["pa_sistolica"] += min(10.0, 1.2 * carga_dor)
        alvo["pa_diastolica"] += min(5.0, 0.6 * carga_dor)
        alvo["estresse_wearable"] += min(25.0, 4 * carga_dor)
        alvo["hrv_ms"] -= min(0.4, 0.035 * carga_dor)
        textos.append(f"Reported pain (load {carga_dor:g}): HR and stress go up, HRV drops")

    recentes = [c for c in contramedidas if 0 <= h - int(c.get("hora", 0)) <= 1]
    if recentes:
        n = min(2, len(recentes))
        alvo["fc_bpm"] -= 3 * n
        alvo["pa_sistolica"] -= 3 * n
        alvo["estresse_wearable"] -= 10 * n
        alvo["hrv_ms"] += 0.08 * n
        textos.append(f"{len(recentes)} recent countermeasure(s): HR and stress go down, HRV rises")

    if desgaste > 5:
        alvo["fc_bpm"] += min(6.0, desgaste * 0.08)
        alvo["hrv_ms"] -= min(0.2, desgaste * 0.004)
        alvo["estresse_wearable"] += min(8.0, desgaste * 0.1)
        textos.append(f"Accumulated fatigue ({desgaste:.0f}): higher resting HR")
    return alvo, textos


def _montar_ponto(
    plano: Dict[str, Any],
    h: int,
    residuo: Dict[str, float],
    efeito: Dict[str, float],
    pico: bool,
    textos: List[str],
) -> Dict[str, Any]:
    a = plano["agenda"][h]
    esp = esperado_hora(plano, h)
    valor = {
        k: esp[k] * (1 + residuo[k] + efeito[k]) if k == "hrv_ms" else esp[k] + residuo[k] + efeito[k]
        for k in SINAIS
    }
    # Rare spontaneous swing (~3% of non-sleep hours), so the curve is not "perfect"
    rng = random.Random(_semente(plano["id_astronauta"], plano["dia_missao"], h, "osc"))
    if a["perfil"] != "sono" and rng.random() < 0.03:
        valor["fc_bpm"] += rng.uniform(18, 26)
        valor["hrv_ms"] *= 0.6

    tipo_pico = None
    if pico:
        antes = dict(valor)
        tipo_pico = _injetar_pico(valor, plano["ambiente"], a["perfil"], _semente(plano["id_astronauta"], plano["dia_missao"], h, "pico"))
        # Half of the spike becomes residual: in the next hour the signal comes back gradually, with no unrealistic jump
        for k in SINAIS:
            delta = valor[k] - antes[k]
            residuo[k] += 0.5 * (delta / esp[k] if k == "hrv_ms" and esp[k] else delta)

    sem_sinal = h in plano["horas_sem_sinal"] and tipo_pico is None
    ponto: Dict[str, Any] = {
        "hora": h,
        "rotulo": a["rotulo"],
        "atividade": a["atividade"],
        "descricao": a["descricao"],
        "perfil": a["perfil"],
        "treino_min": a["treino_min"],
        "treino_min_acumulado": a["treino_min_acumulado"],
        "sem_sinal": sem_sinal,
        "pico_simulado": tipo_pico,
        "esperado": {k: _arredondar(k, v) for k, v in esp.items()},
        "efeitos": textos,
        # Internal generator state (continuity of the next reading)
        "estado_ar": {
            "residuo": {k: round(v, 4) for k, v in residuo.items()},
            "efeito": {k: round(v, 4) for k, v in efeito.items()},
        },
    }
    if sem_sinal:
        ponto.update({k: None for k in SINAIS})
        ponto.update({"semaforo_hora": 1, "partes_afetadas": "nenhuma", "alertas": []})
    else:
        valor = _limitar(valor)
        ponto.update({k: _arredondar(k, v) for k, v in valor.items()})
        ponto.update(_avaliar_hora(ponto, esp, a["perfil"]))
    return ponto


def iniciar_leitura(plano: Dict[str, Any], desgaste: float = 0.0, pico: bool = False) -> Dict[str, Any]:
    """First reading of the day (00:00): basal state, with stationary noise and the previous day's residual fatigue."""
    rng = random.Random(_semente(plano["id_astronauta"], plano["dia_missao"], 0, "ar"))
    residuo = {k: SIGMA[k] * rng.gauss(0, 1) for k in SINAIS}
    efeito, textos = _alvo_eventos(0, [], [], desgaste)
    return _montar_ponto(plano, 0, residuo, efeito, pico, textos)


def gerar_proxima_leitura_horaria(estado: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generates ONLY the reading for hour h+1 from reading h (estado["anterior"]).
    estado: plano (planejar_dia), anterior (point h), desconfortos [{hora, intensidade}],
            contramedidas [{hora}], desgaste_acumulado (readiness at h), pico (bool).
    """
    plano = estado["plano"]
    anterior = estado["anterior"]
    h = int(anterior["hora"]) + 1
    if h > 23:
        raise ValueError("The day already has the 23:00 reading; roll over to the next day.")
    rng = random.Random(_semente(plano["id_astronauta"], plano["dia_missao"], h, "ar"))
    ar = anterior.get("estado_ar") or {"residuo": {k: 0.0 for k in SINAIS}, "efeito": {k: 0.0 for k in SINAIS}}
    inovacao = math.sqrt(1 - RHO_AR ** 2)
    residuo = {k: RHO_AR * ar["residuo"].get(k, 0.0) + inovacao * SIGMA[k] * rng.gauss(0, 1) for k in SINAIS}
    alvo, textos = _alvo_eventos(
        h - 1, estado.get("desconfortos") or [], estado.get("contramedidas") or [], float(estado.get("desgaste_acumulado", 0.0))
    )
    efeito = {k: LAG_EFEITO * ar["efeito"].get(k, 0.0) + (1 - LAG_EFEITO) * alvo[k] for k in SINAIS}
    return _montar_ponto(plano, h, residuo, efeito, bool(estado.get("pico")), textos)


def gerar_dia(registro: Dict[str, Any], picos: Optional[List[int]] = None) -> Dict[str, Any]:
    """
    ORIGINAL SIMULATION of the days recorded in the dataset (24 points at once, as it always was).
    NEW days (created after the last dataset day) use the incremental generator
    (iniciar_leitura + gerar_proxima_leitura_horaria), one hour at a time.
    Generates the 24 hourly points from the daily record (one dataset row, as a dict).
    picos: hours at which an acute wearable spike must be injected ("Next reading with spike" button).
    """
    picos = sorted(set(h for h in (picos or []) if 0 <= h <= 23))
    id_ast = str(registro["id_astronauta"])
    dia = int(registro["dia_missao"])
    ambiente = str(registro["ambiente"])
    rotina = ROTINAS.get(ambiente, ROTINAS["Estacao Orbital"])

    fc_rep = float(registro["fc_repouso"])
    pas_dia = float(registro["pa_sistolica"])
    pad_dia = float(registro["pa_diastolica"])
    temp_dia = float(registro["temperatura_c"])
    sono = float(registro["sono_horas"])
    humor = int(registro["humor"])
    base_fc = float(registro["base_fc_repouso"])
    base_sono = float(registro["base_sono"])

    # Simulated individual HRV: a lower baseline HR tends to mean a higher HRV
    hrv_base = 55 + (70 - base_fc) * 1.2
    # Short sleep and low mood raise stress and lower HRV throughout the day
    deficit_sono = max(0.0, base_sono - sono)
    ajuste_estresse = deficit_sono * 6 + (4 - humor) * 7 + (6 if ambiente == "Transito para Marte" else 0)
    fator_hrv_dia = max(0.5, 1 - deficit_sono * 0.07 - max(0, 4 - humor) * 0.05)

    horas_sono = _horas_de_sono(sono)
    treino_por_hora = _distribuir_treino(ambiente, int(registro["treino_resistido_min"]))

    # Simulated telemetry gap: ~1 in every 7 days the wearable goes 2 h without signal
    rng_dia = random.Random(_semente(id_ast, dia, "lacuna"))
    horas_sem_sinal: set = set()
    if rng_dia.random() < 1 / 7:
        inicio = rng_dia.choice([2, 3, 13, 14, 15])
        horas_sem_sinal = {inicio, inicio + 1}

    pontos: List[Dict[str, Any]] = []
    acumulado = 0
    for h in range(24):
        if h in horas_sono:
            perfil_id, atividade, descricao = "sono", "Sleep", "Sleep window"
        else:
            perfil_id, atividade, descricao = rotina.get(h, ("repouso", "Break", "Free time"))

        minutos_treino = treino_por_hora.get(h, 0) if h not in horas_sono else 0
        if perfil_id in ("resistido", "aerobico"):
            if minutos_treino < 20:
                perfil_id = "repouso"
                atividade = f"{atividade} (not done)" if minutos_treino == 0 else f"{atividade} (partial)"
        acumulado += minutos_treino

        p = PERFIS[perfil_id]
        esperado = {
            "fc_bpm": fc_rep + p["fc"],
            "pa_sistolica": pas_dia + p["pas"],
            "pa_diastolica": pad_dia + p["pad"],
            "temperatura_c": temp_dia + p["temp"],
            "spo2_pct": p["spo2"],
            "hrv_ms": hrv_base * fator_hrv_dia * p["hrv"],
            "estresse_wearable": min(100.0, p["estresse"] + ajuste_estresse),
        }

        rng = random.Random(_semente(id_ast, dia, h))
        valor = {
            "fc_bpm": esperado["fc_bpm"] + rng.gauss(0, 3),
            "pa_sistolica": esperado["pa_sistolica"] + rng.gauss(0, 4),
            "pa_diastolica": esperado["pa_diastolica"] + rng.gauss(0, 3),
            "temperatura_c": esperado["temperatura_c"] + rng.gauss(0, 0.08),
            "spo2_pct": esperado["spo2_pct"] + rng.gauss(0, 0.6),
            "hrv_ms": esperado["hrv_ms"] * (1 + rng.gauss(0, 0.08)),
            "estresse_wearable": esperado["estresse_wearable"] + rng.gauss(0, 6),
        }
        # Rare spontaneous swing (~3% of non-sleep hours), so the curve is not "perfect"
        if h not in horas_sono and rng.random() < 0.03:
            valor["fc_bpm"] += rng.uniform(18, 26)
            valor["hrv_ms"] *= 0.6

        pico = None
        if h in picos:
            pico = _injetar_pico(valor, ambiente, perfil_id, _semente(id_ast, dia, h, "pico"))

        sem_sinal = h in horas_sem_sinal and pico is None
        ponto: Dict[str, Any] = {
            "hora": h,
            "rotulo": f"{h:02d}:00",
            "atividade": atividade,
            "descricao": descricao,
            "perfil": perfil_id,
            "treino_min": minutos_treino,
            "treino_min_acumulado": acumulado,
            "sem_sinal": sem_sinal,
            "pico_simulado": pico,
            "esperado": {k: _arredondar(k, v) for k, v in esperado.items()},
        }
        if sem_sinal:
            ponto.update({k: None for k in valor})
            ponto.update({"semaforo_hora": 1, "partes_afetadas": "nenhuma", "alertas": []})
        else:
            valor = _limitar(valor)
            ponto.update({k: _arredondar(k, v) for k, v in valor.items()})
            ponto.update(_avaliar_hora(ponto, esperado, perfil_id))
        pontos.append(ponto)

    return {
        "id_astronauta": id_ast,
        "dia_missao": dia,
        "ambiente": ambiente,
        "inicio_sono": INICIO_SONO,
        "horas_sem_sinal": sorted(horas_sem_sinal - set(picos)),
        "picos": picos,
        "pontos": pontos,
        "nota": "SIMULATED hourly telemetry derived from the daily record; demo thresholds (to be confirmed).",
    }


def linha_do_tempo(telemetria: Dict[str, Any], hora: int) -> List[Dict[str, Any]]:
    """Points from the start of the operational day (00:00) to the requested hour, in chronological order (inclusive)."""
    hora = max(0, min(23, int(hora)))
    return sorted((p for p in telemetria["pontos"] if p["hora"] <= hora), key=lambda p: p["hora"])


def _injetar_pico(valor: Dict[str, float], ambiente: str, perfil_id: str, semente: int) -> str:
    """Acute anomaly at the hour: picks the type deterministically (EVA favors desaturation)."""
    rng = random.Random(semente)
    if perfil_id == "eva" or (ambiente == "Base Marciana" and rng.random() < 0.4):
        tipo = "dessaturacao"
    else:
        tipo = rng.choice(["taquicardia", "hipertensao", "febre", "estresse_agudo", "taquicardia"])
    if tipo == "taquicardia":
        valor["fc_bpm"] += 42
        valor["hrv_ms"] *= 0.35
        valor["estresse_wearable"] += 20
    elif tipo == "dessaturacao":
        valor["spo2_pct"] = 87.5
        valor["fc_bpm"] += 18
    elif tipo == "hipertensao":
        valor["pa_sistolica"] += 34
        valor["pa_diastolica"] += 16
    elif tipo == "febre":
        valor["temperatura_c"] += 1.5
        valor["fc_bpm"] += 15
    elif tipo == "estresse_agudo":
        valor["estresse_wearable"] = 96
        valor["hrv_ms"] *= 0.3
    return tipo


def _limitar(v: Dict[str, float]) -> Dict[str, float]:
    v["spo2_pct"] = min(100.0, max(70.0, v["spo2_pct"]))
    v["estresse_wearable"] = min(100.0, max(0.0, v["estresse_wearable"]))
    v["hrv_ms"] = max(5.0, v["hrv_ms"])
    return v


def _arredondar(chave: str, v: float) -> float:
    if chave in ("temperatura_c",):
        return round(v, 1)
    if chave in ("spo2_pct",):
        return round(v, 1)
    return int(round(v))


def _avaliar_hora(ponto: Dict[str, Any], esperado: Dict[str, float], perfil_id: str) -> Dict[str, Any]:
    """
    Hourly thresholds (demo). Compares with what is EXPECTED for that hour's activity,
    so a high HR during a workout does not become an alert, but a high HR at rest does.
    """
    alertas: List[Dict[str, Any]] = []

    def alerta(sinal: str, nivel: int, texto: str):
        alertas.append({"sinal": sinal, "nivel": nivel, "texto": texto})

    fc, fc_esp = ponto["fc_bpm"], esperado["fc_bpm"]
    if fc - fc_esp >= 35 or fc >= 175:
        alerta("fc_bpm", 3, f"HR {fc} bpm, {int(fc - fc_esp)} above expected for the activity")
    elif fc - fc_esp >= 20:
        alerta("fc_bpm", 2, f"HR {fc} bpm, {int(fc - fc_esp)} above expected for the activity")

    pas, pas_esp = ponto["pa_sistolica"], esperado["pa_sistolica"]
    if pas - pas_esp >= 28 or pas >= 180:
        alerta("pa_sistolica", 3, f"Systolic BP {pas} mmHg far above expected")
    elif pas - pas_esp >= 18 or (perfil_id in ("sono", "repouso", "lazer") and pas >= 140):
        alerta("pa_sistolica", 2, f"Systolic BP {pas} mmHg above expected")

    spo2 = ponto["spo2_pct"]
    if spo2 < 90:
        alerta("spo2_pct", 3, f"SpO₂ {spo2}% (below 90%)")
    elif spo2 < 94:
        alerta("spo2_pct", 2, f"SpO₂ {spo2}% (below 94%)")

    # Temperature corrected for the expected effect of the activity
    temp_corrigida = ponto["temperatura_c"] - PERFIS[perfil_id]["temp"]
    if temp_corrigida >= 38.1:
        alerta("temperatura_c", 3, f"Temperature {ponto['temperatura_c']} °C (fever)")
    elif temp_corrigida >= 37.5:
        alerta("temperatura_c", 2, f"Temperature {ponto['temperatura_c']} °C (low-grade fever)")

    hrv, hrv_esp = ponto["hrv_ms"], esperado["hrv_ms"]
    if hrv < hrv_esp * 0.35:
        alerta("hrv_ms", 3, f"HRV {hrv} ms, far below expected ({int(hrv_esp)} ms)")
    elif hrv < hrv_esp * 0.5:
        alerta("hrv_ms", 2, f"HRV {hrv} ms, below expected ({int(hrv_esp)} ms)")

    est = ponto["estresse_wearable"]
    if est >= 90:
        alerta("estresse_wearable", 3, f"Stress {est}/100")
    elif est >= 75:
        alerta("estresse_wearable", 2, f"Stress {est}/100")

    partes: List[str] = []
    for a in alertas:
        for p in PARTES_POR_SINAL[a["sinal"]] + (["cabeca"] if a["sinal"] == "pa_sistolica" and a["nivel"] == 3 else []):
            if p not in partes:
                partes.append(p)

    return {
        "semaforo_hora": max([1] + [a["nivel"] for a in alertas]),
        "partes_afetadas": ";".join(partes) if partes else "nenhuma",
        "alertas": alertas,
    }
