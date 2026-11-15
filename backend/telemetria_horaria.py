"""
Telemetria contínua de wearable (24 pontos, 00:00–23:00) gerada sob demanda.

Nada aqui é gravado no .xlsx: os pontos são derivados do registro diário (âncora) e da rotina
do ambiente de missão. A variação é estocástica, mas determinística: a semente vem de
(astronauta, dia, hora), então o mesmo dia sempre gera a mesma curva.

Limiares horários e perfis de atividade são ESCOLHAS DE PROJETO para a demo (a confirmar com
profissional de saúde), não critérios clínicos oficiais.
"""
import random
import zlib
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Perfis de atividade: deslocamento esperado em relação ao repouso do dia
# fc/pa em unidades absolutas, temp em °C, hrv como fator, estresse 0–100
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
# Rotinas por ambiente: hora -> (perfil, nome da atividade, descrição curta)
# As horas de sono são ajustadas pelas horas de sono registradas no dia.
# ---------------------------------------------------------------------------
def _rotina(itens: Dict[range, tuple]) -> Dict[int, tuple]:
    mapa: Dict[int, tuple] = {}
    for horas, atividade in itens.items():
        for h in horas:
            mapa[h] = atividade
    return mapa


ROTINAS: Dict[str, Dict[int, tuple]] = {
    "Estacao Orbital": _rotina({
        range(6, 7): ("repouso", "Despertar e higiene", "Ciclo circadiano artificial: luz azul-enriquecida acende às 06h"),
        range(7, 8): ("comunicacao", "Briefing com o controle de missão", "Planejamento do dia com a Terra (quase tempo real)"),
        range(8, 10): ("trabalho", "Trabalho técnico em microgravidade", "Experimentos e manutenção a bordo"),
        range(10, 11): ("resistido", "Treino ARED + esteira", "Exercício resistido e aeróbico contra perda óssea e muscular"),
        range(11, 12): ("repouso", "Recuperação pós-treino", "Hidratação e alongamento"),
        range(12, 13): ("repouso", "Almoço", "Refeição e pausa"),
        range(13, 17): ("trabalho", "Experimentos científicos", "Janela de trabalho técnico em microgravidade"),
        range(17, 18): ("aerobico", "Treino complementar (esteira/cicloergômetro)", "Usado quando a meta diária ainda não foi cumprida"),
        range(18, 19): ("repouso", "Jantar", "Refeição em grupo"),
        range(19, 20): ("comunicacao", "Contato com família", "Comunicação pessoal com a Terra"),
        range(20, 21): ("repouso", "Monitoramento de fluidos cefálicos", "Checagem de pressão e sintomas oculares (desvio de fluidos)"),
        range(21, 22): ("lazer", "Lazer", "Tempo livre, luz âmbar para preparar o sono"),
    }),
    "Transito para Marte": _rotina({
        range(6, 7): ("repouso", "Despertar", "Confinamento prolongado: rotina rígida ajuda o relógio biológico"),
        range(7, 8): ("comunicacao", "Briefing da tripulação", "Planejamento local (Terra responde com atraso)"),
        range(8, 10): ("resistido", "Protocolo intensivo anti-atrofia", "Treino resistido pesado contra perda óssea e muscular"),
        range(10, 13): ("trabalho", "Operações e navegação", "Sistemas da nave e navegação"),
        range(13, 14): ("repouso", "Almoço", "Refeição e pausa"),
        range(14, 15): ("trabalho", "Dosimetria de radiação cósmica", "Leitura dos dosímetros: maior exposição fora da magnetosfera"),
        range(15, 16): ("aerobico", "Treino aeróbico", "Cicloergômetro para condicionamento cardiovascular"),
        range(16, 19): ("trabalho", "Manutenção e experimentos", "Trabalho em ambiente confinado"),
        range(19, 20): ("repouso", "Avaliação ARCHeR de sono e estresse", "Autoavaliação de humor, sono e carga de trabalho"),
        range(20, 21): ("comunicacao", "Mensagens com a Terra", "Comunicação com atraso de vários minutos"),
        range(21, 22): ("lazer", "Lazer", "Tempo livre em grupo"),
    }),
    "Base Marciana": _rotina({
        range(6, 7): ("repouso", "Despertar", "Gravidade parcial (0,38 g)"),
        range(7, 8): ("pre_resp", "Pré-respiração e preparo do traje", "Oxigênio puro antes da EVA para evitar doença descompressiva"),
        range(8, 12): ("eva", "EVA em superfície", "Atividade extraveicular com traje pressurizado"),
        range(12, 13): ("repouso", "Pós-EVA: checagem respiratória", "Monitoramento de SpO₂/CO₂ e fadiga física"),
        range(13, 14): ("repouso", "Almoço", "Refeição e pausa"),
        range(14, 17): ("trabalho", "Laboratório e geologia", "Análise de amostras coletadas"),
        range(17, 18): ("resistido", "Treino resistido em 0,38 g", "Carga complementar à gravidade parcial"),
        range(18, 19): ("repouso", "Jantar", "Refeição em grupo"),
        range(19, 20): ("comunicacao", "Comunicação com a Terra", "Atraso de sinal de até ~20 min por trecho"),
        range(20, 21): ("repouso", "Avaliação de fadiga física", "Escala de fadiga e recuperação muscular"),
        range(21, 22): ("lazer", "Lazer", "Tempo livre na base"),
    }),
}

# Horas de treino por ambiente e fração da meta prevista em cada uma (distribui os minutos do dia)
JANELAS_TREINO: Dict[str, List[tuple]] = {
    "Estacao Orbital": [(10, 1.0), (17, 0.0)],     # 17h só recebe o que passar de 60 min
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
    "taquicardia": "Taquicardia aguda",
    "dessaturacao": "Queda de saturação (SpO₂)",
    "hipertensao": "Pico hipertensivo",
    "febre": "Elevação aguda de temperatura",
    "estresse_agudo": "Estresse agudo (HRV muito baixa)",
}


def _semente(*partes: Any) -> int:
    return zlib.crc32("|".join(str(p) for p in partes).encode("utf-8"))


def _distribuir_treino(ambiente: str, minutos: int) -> Dict[int, int]:
    """Distribui os minutos de treino do dia nas janelas de treino do ambiente."""
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
    """Janela de sono começa às 22h e dura as horas de sono registradas no dia."""
    n = max(0, min(14, int(round(sono_horas))))
    return {(INICIO_SONO + i) % 24 for i in range(n)}


def gerar_dia(registro: Dict[str, Any], picos: Optional[List[int]] = None) -> Dict[str, Any]:
    """
    Gera os 24 pontos horários a partir do registro diário (uma linha da base, como dict).
    picos: horas em que um pico agudo de wearable deve ser injetado (botão "Simular Pico Wearable").
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

    # HRV individual simulada: quem tem FC de base mais baixa tende a ter HRV maior
    hrv_base = 55 + (70 - base_fc) * 1.2
    # Sono curto e humor baixo elevam o estresse e reduzem a HRV ao longo do dia
    deficit_sono = max(0.0, base_sono - sono)
    ajuste_estresse = deficit_sono * 6 + (4 - humor) * 7 + (6 if ambiente == "Transito para Marte" else 0)
    fator_hrv_dia = max(0.5, 1 - deficit_sono * 0.07 - max(0, 4 - humor) * 0.05)

    horas_sono = _horas_de_sono(sono)
    treino_por_hora = _distribuir_treino(ambiente, int(registro["treino_resistido_min"]))

    # Lacuna de telemetria simulada: ~1 a cada 7 dias o wearable fica 2 h sem sinal
    rng_dia = random.Random(_semente(id_ast, dia, "lacuna"))
    horas_sem_sinal: set = set()
    if rng_dia.random() < 1 / 7:
        inicio = rng_dia.choice([2, 3, 13, 14, 15])
        horas_sem_sinal = {inicio, inicio + 1}

    pontos: List[Dict[str, Any]] = []
    acumulado = 0
    for h in range(24):
        if h in horas_sono:
            perfil_id, atividade, descricao = "sono", "Sono", "Janela de sono"
        else:
            perfil_id, atividade, descricao = rotina.get(h, ("repouso", "Pausa", "Tempo livre"))

        minutos_treino = treino_por_hora.get(h, 0) if h not in horas_sono else 0
        if perfil_id in ("resistido", "aerobico"):
            if minutos_treino < 20:
                perfil_id = "repouso"
                atividade = f"{atividade} (não realizado)" if minutos_treino == 0 else f"{atividade} (parcial)"
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
        # Oscilação espontânea rara (~3% das horas fora do sono), para a curva não ser "perfeita"
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
        "nota": "Telemetria horária SIMULADA a partir do registro diário; limiares de demonstração (a confirmar).",
    }


def _injetar_pico(valor: Dict[str, float], ambiente: str, perfil_id: str, semente: int) -> str:
    """Anomalia aguda na hora: escolhe o tipo de forma determinística (EVA favorece dessaturação)."""
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
    Limiares horários (de demonstração). Compara com o ESPERADO para a atividade daquela hora,
    para que FC alta durante o treino não vire alerta, mas FC alta em repouso sim.
    """
    alertas: List[Dict[str, Any]] = []

    def alerta(sinal: str, nivel: int, texto: str):
        alertas.append({"sinal": sinal, "nivel": nivel, "texto": texto})

    fc, fc_esp = ponto["fc_bpm"], esperado["fc_bpm"]
    if fc - fc_esp >= 35 or fc >= 175:
        alerta("fc_bpm", 3, f"FC {fc} bpm, {int(fc - fc_esp)} acima do esperado para a atividade")
    elif fc - fc_esp >= 20:
        alerta("fc_bpm", 2, f"FC {fc} bpm, {int(fc - fc_esp)} acima do esperado para a atividade")

    pas, pas_esp = ponto["pa_sistolica"], esperado["pa_sistolica"]
    if pas - pas_esp >= 28 or pas >= 180:
        alerta("pa_sistolica", 3, f"PA sistólica {pas} mmHg muito acima do esperado")
    elif pas - pas_esp >= 18 or (perfil_id in ("sono", "repouso", "lazer") and pas >= 140):
        alerta("pa_sistolica", 2, f"PA sistólica {pas} mmHg acima do esperado")

    spo2 = ponto["spo2_pct"]
    if spo2 < 90:
        alerta("spo2_pct", 3, f"SpO₂ {spo2}% (abaixo de 90%)")
    elif spo2 < 94:
        alerta("spo2_pct", 2, f"SpO₂ {spo2}% (abaixo de 94%)")

    # Temperatura corrigida pelo efeito esperado da atividade
    temp_corrigida = ponto["temperatura_c"] - PERFIS[perfil_id]["temp"]
    if temp_corrigida >= 38.1:
        alerta("temperatura_c", 3, f"Temperatura {ponto['temperatura_c']} °C (febre)")
    elif temp_corrigida >= 37.5:
        alerta("temperatura_c", 2, f"Temperatura {ponto['temperatura_c']} °C (subfebril)")

    hrv, hrv_esp = ponto["hrv_ms"], esperado["hrv_ms"]
    if hrv < hrv_esp * 0.35:
        alerta("hrv_ms", 3, f"HRV {hrv} ms, muito abaixo do esperado ({int(hrv_esp)} ms)")
    elif hrv < hrv_esp * 0.5:
        alerta("hrv_ms", 2, f"HRV {hrv} ms, abaixo do esperado ({int(hrv_esp)} ms)")

    est = ponto["estresse_wearable"]
    if est >= 90:
        alerta("estresse_wearable", 3, f"Estresse {est}/100")
    elif est >= 75:
        alerta("estresse_wearable", 2, f"Estresse {est}/100")

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
