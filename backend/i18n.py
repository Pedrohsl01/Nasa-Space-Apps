"""
Display translation (pt-BR -> en-US) for DATA VALUES stored in the dataset.

The dataset keeps its original values (categoria_risco, ambiente, sintoma_neuro_ocular, nome): they are
keys used by the rules engine and by the frontend. Only the text shown to people is translated here.
"""
from typing import Iterable, Union

CATEGORIA_EN = {
    "Nominal": "Nominal",
    "Cardiovascular": "Cardiovascular",
    "Imunológico": "Immune",
    "Metabólico": "Metabolic",
    "Radiação": "Radiation",
    "Neuro-ocular": "Neuro-ocular",
    "Comportamental": "Behavioral",
    "Musculoesquelético": "Musculoskeletal",
}

AMBIENTE_EN = {
    "Estacao Orbital": "Orbital Station",
    "Transito para Marte": "Transit to Mars",
    "Base Marciana": "Mars Base",
}

SINTOMA_EN = {
    "Nenhum": "None",
    "Leve pressao ocular": "Mild eye pressure",
    "Visao turva": "Blurred vision",
}

STATUS_EN = {"NORMAL": "NORMAL", "ATENCAO": "WARNING", "CRITICO": "CRITICAL"}


def categoria_en(categorias: Union[str, Iterable[str]], sep: str = ", ") -> str:
    """'Imunológico;Radiação' or a list -> 'Immune, Radiation' (Nominal/empty values are dropped)."""
    itens = categorias.split(";") if isinstance(categorias, str) else list(categorias)
    limpos = [c.strip() for c in itens if c and c.strip() and c.strip() not in ("Nominal", "nan")]
    return sep.join(CATEGORIA_EN.get(c, c) for c in limpos)


def ambiente_en(ambiente: str) -> str:
    return AMBIENTE_EN.get(str(ambiente), str(ambiente))


def sintoma_en(sintoma: str) -> str:
    return SINTOMA_EN.get(str(sintoma).strip(), str(sintoma))


def nome_en(nome: str) -> str:
    """Crew titles: 'Cmdt.' -> 'Cmdr.', 'Dra.'/'Dr.' -> 'Dr.'"""
    return str(nome).replace("Cmdt.", "Cmdr.").replace("Dra.", "Dr.")


# ---------------------------------------------------------------------------
# Legacy readings: hourly points saved in data/telemetria_ao_vivo.json before the app was translated
# keep their original Portuguese text. They are translated when the file is loaded (idempotent).
# ---------------------------------------------------------------------------
LEGADO_EXATO = {'Almoço': 'Lunch',
 'Análise de amostras coletadas': 'Analysis of collected samples',
 'Atividade extraveicular com traje pressurizado': 'Extravehicular activity in a pressurized suit',
 'Atraso de sinal de até ~20 min por trecho': 'Signal delay of up to ~20 min each way',
 'Autoavaliação de humor, sono e carga de trabalho': 'Self-assessment of mood, sleep and workload',
 'Avaliação ARCHeR de sono e estresse': 'ARCHeR sleep and stress assessment',
 'Avaliação de fadiga física': 'Physical fatigue assessment',
 'Briefing com o controle de missão': 'Briefing with mission control',
 'Briefing da tripulação': 'Crew briefing',
 'Carga complementar à gravidade parcial': 'Extra load to complement partial gravity',
 'Checagem de pressão e sintomas oculares (desvio de fluidos)': 'Blood pressure and eye symptom check (fluid shift)',
 'Ciclo circadiano artificial: luz azul-enriquecida acende às 06h': 'Artificial circadian cycle: blue-enriched light turns on at 06:00',
 'Cicloergômetro para condicionamento cardiovascular': 'Cycle ergometer for cardiovascular conditioning',
 'Comunicação com a Terra': 'Communication with Earth',
 'Comunicação com atraso de vários minutos': 'Communication with a delay of several minutes',
 'Comunicação pessoal com a Terra': 'Personal communication with Earth',
 'Confinamento prolongado: rotina rígida ajuda o relógio biológico': 'Prolonged confinement: a strict routine helps the body clock',
 'Contato com família': 'Family contact',
 'Despertar': 'Wake-up',
 'Despertar e higiene': 'Wake-up and hygiene',
 'Dosimetria de radiação cósmica': 'Cosmic radiation dosimetry',
 'EVA em superfície': 'Surface EVA',
 'Elevação aguda de temperatura': 'Acute temperature rise',
 'Escala de fadiga e recuperação muscular': 'Fatigue scale and muscle recovery',
 'Estresse agudo (HRV muito baixa)': 'Acute stress (very low HRV)',
 'Exercício resistido e aeróbico contra perda óssea e muscular': 'Resistance and aerobic exercise against bone and muscle loss',
 'Experimentos científicos': 'Science experiments',
 'Experimentos e manutenção a bordo': 'Onboard experiments and maintenance',
 'Gravidade parcial (0,38 g)': 'Partial gravity (0.38 g)',
 'Hidratação e alongamento': 'Hydration and stretching',
 'Janela de sono': 'Sleep window',
 'Janela de trabalho técnico em microgravidade': 'Technical work window in microgravity',
 'Jantar': 'Dinner',
 'Laboratório e geologia': 'Lab and geology',
 'Lazer': 'Leisure',
 'Leitura dos dosímetros: maior exposição fora da magnetosfera': 'Dosimeter readout: higher exposure outside the magnetosphere',
 'Manutenção e experimentos': 'Maintenance and experiments',
 'Mensagens com a Terra': 'Messages with Earth',
 'Monitoramento de SpO₂/CO₂ e fadiga física': 'SpO₂/CO₂ and physical fatigue monitoring',
 'Monitoramento de fluidos cefálicos': 'Cephalad fluid monitoring',
 'O dia já tem a leitura das 23:00; vire para o próximo dia.': 'The day already has the 23:00 reading; roll over to the next day.',
 'Operações e navegação': 'Operations and navigation',
 'Oxigênio puro antes da EVA para evitar doença descompressiva': 'Pure oxygen before the EVA to prevent decompression sickness',
 'Pausa': 'Break',
 'Pico hipertensivo': 'Hypertensive spike',
 'Planejamento do dia com a Terra (quase tempo real)': 'Day planning with Earth (near real time)',
 'Planejamento local (Terra responde com atraso)': 'Local planning (Earth replies with a delay)',
 'Protocolo intensivo anti-atrofia': 'Intensive anti-atrophy protocol',
 'Pré-respiração e preparo do traje': 'Pre-breathe and suit prep',
 'Pós-EVA: checagem respiratória': 'Post-EVA: respiratory check',
 'Queda de saturação (SpO₂)': 'Oxygen desaturation (SpO₂)',
 'Recuperação pós-treino': 'Post-workout recovery',
 'Refeição e pausa': 'Meal and break',
 'Refeição em grupo': 'Group meal',
 'Sistemas da nave e navegação': 'Spacecraft systems and navigation',
 'Sono': 'Sleep',
 'Taquicardia aguda': 'Acute tachycardia',
 'Telemetria horária SIMULADA a partir do registro diário; limiares de demonstração (a confirmar).': 'SIMULATED hourly telemetry derived from the daily '
                                                                                                     'record; demo thresholds (to be confirmed).',
 'Tempo livre': 'Free time',
 'Tempo livre em grupo': 'Group free time',
 'Tempo livre na base': 'Free time at the base',
 'Tempo livre, luz âmbar para preparar o sono': 'Free time, amber light to prepare for sleep',
 'Trabalho em ambiente confinado': 'Work in a confined environment',
 'Trabalho técnico em microgravidade': 'Technical work in microgravity',
 'Treino ARED + esteira': 'ARED + treadmill workout',
 'Treino aeróbico': 'Aerobic workout',
 'Treino complementar (esteira/cicloergômetro)': 'Supplementary workout (treadmill/cycle ergometer)',
 'Treino resistido em 0,38 g': 'Resistance training at 0.38 g',
 'Treino resistido pesado contra perda óssea e muscular': 'Heavy resistance training against bone and muscle loss',
 'Usado quando a meta diária ainda não foi cumprida': 'Used when the daily goal has not been met yet'}

# Ordered fragments (most specific first) for alert and effect sentences that carry numbers
LEGADO_TRECHOS = [
    ("acima do esperado para a atividade", "above expected for the activity"),
    ("muito acima do esperado", "far above expected"),
    ("acima do esperado", "above expected"),
    ("muito abaixo do esperado", "far below expected"),
    ("abaixo do esperado", "below expected"),
    ("(abaixo de ", "(below "),
    ("PA sistólica", "Systolic BP"),
    ("Temperatura", "Temperature"),
    ("(febre)", "(fever)"),
    ("(subfebril)", "(low-grade fever)"),
    ("Estresse ", "Stress "),
    ("Dor relatada (carga ", "Reported pain (load "),
    ("FC e estresse sobem, HRV cai", "HR and stress go up, HRV drops"),
    ("contramedida(s) recente(s)", "recent countermeasure(s)"),
    ("FC e estresse descem, HRV sobe", "HR and stress go down, HRV rises"),
    ("Fadiga acumulada (", "Accumulated fatigue ("),
    ("FC de repouso mais alta", "higher resting HR"),
    ("FC ", "HR "),
]


def _texto_legado(texto: str) -> str:
    for pt, en in LEGADO_TRECHOS:
        texto = texto.replace(pt, en)
    return texto


def _atividade_legada(texto: str) -> str:
    sufixo = ""
    for pt, en in ((" (não realizado)", " (not done)"), (" (parcial)", " (partial)")):
        if texto.endswith(pt):
            texto, sufixo = texto[: -len(pt)], en
    return LEGADO_EXATO.get(texto, texto) + sufixo


def ponto_en(ponto: dict) -> dict:
    """Translates the display text of a saved hourly reading (activity, description, effects, alerts)."""
    if not isinstance(ponto, dict):
        return ponto
    if isinstance(ponto.get("atividade"), str):
        ponto["atividade"] = _atividade_legada(ponto["atividade"])
    if isinstance(ponto.get("descricao"), str):
        ponto["descricao"] = LEGADO_EXATO.get(ponto["descricao"], ponto["descricao"])
    if isinstance(ponto.get("efeitos"), list):
        ponto["efeitos"] = [_texto_legado(str(t)) for t in ponto["efeitos"]]
    for a in ponto.get("alertas") or []:
        if isinstance(a, dict) and isinstance(a.get("texto"), str):
            a["texto"] = _texto_legado(a["texto"])
    return ponto
