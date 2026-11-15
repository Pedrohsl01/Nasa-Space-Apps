"""
Análises que olham além da foto do dia:
  - predicao_tendencia: riscos emergentes na janela móvel de 5 a 7 dias (antes de virarem alerta vermelho)
  - exames_sugeridos: déficit de informação (dado ausente, inconsistente ou inconclusivo)
  - coach_exercicio: progresso diário/semanal da meta de 60 min de treino

Regras fixas e legíveis. Limiares e contramedidas são escolhas de projeto para a demo
(a confirmar com cirurgião de voo), não protocolos clínicos oficiais.
"""
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

META_TREINO_MIN = 60
META_SEMANAL_MIN = META_TREINO_MIN * 7

COLUNAS_VITAIS = [
    "pa_sistolica", "pa_diastolica", "fc_repouso", "glicemia_mg_dl",
    "temperatura_c", "sono_horas", "humor", "treino_resistido_min", "sintoma_neuro_ocular",
]

# Faixas de plausibilidade só para detectar erro de registro (não são faixas clínicas)
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
    """Inclinação (unidades por dia) da reta de tendência. None se houver menos de 3 pontos válidos."""
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
# 1. Predição de risco longitudinal
# ---------------------------------------------------------------------------

def predicao_tendencia(df_ast: pd.DataFrame, dia: int) -> Dict[str, Any]:
    jan = _janela(df_ast, dia, 7)
    if len(jan) < 5:
        return {
            "janela_dias": len(jan),
            "riscos": [],
            "nivel": "dados_insuficientes",
            "resumo": "São necessários pelo menos 5 dias de registro para analisar tendência.",
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

    # Sono em queda gradual
    base_sono = float(atual["base_sono"])
    incl_sono = _inclinacao(jan["sono_horas"])
    media3_sono = float(jan["sono_horas"].tail(3).mean())
    ev = []
    if incl_sono is not None and incl_sono <= -0.15:
        ev.append(f"sono caindo {abs(incl_sono):.2f} h/dia nos últimos {len(jan)} dias")
    if media3_sono <= base_sono - 0.8:
        ev.append(f"média de 3 dias {media3_sono:.1f} h vs. base {base_sono:.1f} h")
    if ev:
        risco("sono_progressivo", "Débito de sono progressivo", "Comportamental", "Isolamento e confinamento", ev, [
            "Ajustar o ciclo de luz: luz azul-enriquecida ao acordar e âmbar 2 h antes de dormir",
            "Fixar horário de sono e reduzir tarefas noturnas por 3 dias",
            "Check-in de sono e estresse (ARCHeR) com a tripulação",
        ], len(ev) > 1)

    # FC de repouso subindo
    base_fc = float(atual["base_fc_repouso"])
    incl_fc = _inclinacao(jan["fc_repouso"])
    ev = []
    if incl_fc is not None and incl_fc >= 0.8:
        ev.append(f"FC de repouso subindo {incl_fc:.1f} bpm/dia")
    if float(jan["fc_repouso"].tail(3).mean()) >= base_fc + 6:
        ev.append(f"média de 3 dias {jan['fc_repouso'].tail(3).mean():.0f} bpm vs. base {base_fc:.0f} bpm")
    if ev:
        risco("fc_subindo", "FC de repouso em subida", "Cardiovascular", "Ambiente fechado e hostil", ev, [
            "Hidratação eletrolítica (reposição de sódio e potássio conforme protocolo de bordo)",
            "Reduzir intensidade do treino por 24–48 h e repetir aferição em repouso",
            "Acompanhar temperatura 2x/dia para descartar infecção",
        ], len(ev) > 1)

    # Pressão subindo: possível desvio de fluidos para a cabeça
    base_pas = float(atual["base_pa_sistolica"])
    incl_pas = _inclinacao(jan["pa_sistolica"])
    ev = []
    if incl_pas is not None and incl_pas >= 1.0:
        ev.append(f"PA sistólica subindo {incl_pas:.1f} mmHg/dia")
    if float(jan["pa_sistolica"].tail(3).mean()) >= base_pas + 8:
        ev.append(f"média de 3 dias {jan['pa_sistolica'].tail(3).mean():.0f} mmHg vs. base {base_pas:.0f}")
    if ev:
        risco("fluidos_cefalicos", "Pressão em subida — possível desvio de fluidos para a cabeça", "Neuro-ocular",
              "Gravidade alterada", ev, [
                  "Protocolo Thigh Cuff (manguitos de coxa) para reter líquido nas pernas",
                  "Avaliação ocular preventiva antes de surgirem sintomas",
                  "Hidratação e redução de sal na dieta por alguns dias",
              ], len(ev) > 1)

    # Radiação acumulando mais rápido que o habitual (taxa, não o total)
    delta_rad = float(jan["radiacao_acumulada_msv"].iloc[-1] - jan["radiacao_acumulada_msv"].iloc[0])
    taxa_rad = delta_rad / max(1, len(jan) - 1)
    ev = []
    if 10 <= delta_rad < 25:
        ev.append(f"+{delta_rad:.1f} mSv em {len(jan)} dias (ritmo de {taxa_rad:.2f} mSv/dia)")
    if ev:
        risco("radiacao_ritmo", "Acúmulo de radiação acima do ritmo habitual", "Radiação", "Radiação espacial", ev, [
            "Planejar abrigo no módulo mais blindado em caso de alerta de tempestade solar",
            "Adiar EVAs e tempo em áreas menos blindadas",
            "Conferir o dosímetro pessoal e registrar a dose do dia",
        ], False)

    # Treino: dias abaixo da meta
    treinos = [float(v) for v in jan["treino_resistido_min"]]
    abaixo = sum(1 for v in treinos if v < META_TREINO_MIN)
    seguidos = _dias_seguidos_abaixo(treinos, META_TREINO_MIN)
    ev = []
    if abaixo >= 3:
        ev.append(f"{abaixo} de {len(treinos)} dias abaixo de {META_TREINO_MIN} min")
    if seguidos >= 2:
        ev.append(f"{seguidos} dias seguidos abaixo da meta")
    if ev:
        risco("treino_adesao", "Adesão ao treino em queda — risco de perda óssea e muscular", "Musculoesquelético",
              "Gravidade alterada", ev, [
                  "Retomar 60 min/dia de treino resistido + aeróbico",
                  "Priorizar exercícios com carga na coluna e nas pernas",
                  "Dividir a meta em 2 blocos de 30 min se a agenda estiver cheia",
              ], len(ev) > 1)

    # Humor em queda
    incl_humor = _inclinacao(jan["humor"])
    ev = []
    if incl_humor is not None and incl_humor <= -0.15:
        ev.append(f"humor caindo {abs(incl_humor):.2f} ponto/dia")
    if float(jan["humor"].tail(3).mean()) <= 3.0:
        ev.append(f"média de humor {jan['humor'].tail(3).mean():.1f}/5 nos últimos 3 dias")
    if ev:
        risco("humor_queda", "Humor em queda", "Comportamental", "Isolamento e confinamento", ev, [
            "Agendar conversa com família ou apoio psicológico da Terra",
            "Atividade de lazer em grupo e pausa na rotina",
        ], len(ev) > 1)

    # Temperatura subindo devagar
    incl_temp = _inclinacao(jan["temperatura_c"])
    if incl_temp is not None and incl_temp >= 0.08 and float(atual["temperatura_c"]) < 38.1:
        risco("temperatura_subindo", "Temperatura em subida gradual", "Cardiovascular", "Ambiente fechado e hostil",
              [f"temperatura subindo {incl_temp:.2f} °C/dia"], [
                  "Aferir temperatura 2x/dia",
                  "Reforçar higiene e considerar isolamento preventivo se surgir febre",
              ], False)

    # Glicemia com deriva
    incl_glic = _inclinacao(jan["glicemia_mg_dl"])
    if incl_glic is not None and abs(incl_glic) >= 1.5:
        direcao = "subindo" if incl_glic > 0 else "caindo"
        risco("glicemia_deriva", f"Glicemia {direcao} de forma gradual", "Cardiovascular", "Ambiente fechado e hostil",
              [f"glicemia {direcao} {abs(incl_glic):.1f} mg/dL/dia"], [
                  "Revisar horários das refeições e o plano alimentar",
                  "Medir glicemia capilar em jejum por 3 dias",
              ], False)

    nivel = "atencao" if any(r["severidade"] == "provavel" for r in riscos) else ("observacao" if riscos else "estavel")
    return {
        "janela_dias": len(jan),
        "inicio": int(jan["dia_missao"].iloc[0]),
        "fim": int(jan["dia_missao"].iloc[-1]),
        "riscos": riscos,
        "nivel": nivel,
        "resumo": (
            f"{len(riscos)} risco(s) emergente(s) na janela de {len(jan)} dias."
            if riscos else f"Nenhuma tendência de risco nos últimos {len(jan)} dias."
        ),
    }


# ---------------------------------------------------------------------------
# 2. Déficit de informação e exames sugeridos
# ---------------------------------------------------------------------------

EXAME_POR_COLUNA = {
    "glicemia_mg_dl": ("Glicemia capilar / painel metabólico", "Glicemia não aferida"),
    "pa_sistolica": ("Aferição manual de pressão arterial", "Pressão arterial não registrada"),
    "pa_diastolica": ("Aferição manual de pressão arterial", "Pressão diastólica não registrada"),
    "fc_repouso": ("ECG de 12 derivações", "Frequência cardíaca não registrada"),
    "temperatura_c": ("Termometria oral ou timpânica", "Temperatura não registrada"),
    "sono_horas": ("Actigrafia do sono (wearable)", "Horas de sono não registradas"),
    "humor": ("Questionário de humor e estresse (ARCHeR)", "Humor não registrado"),
    "treino_resistido_min": ("Conferir log do equipamento de treino", "Minutos de treino não registrados"),
    "sintoma_neuro_ocular": ("Questionário de sintomas visuais", "Sintoma neuro-ocular não registrado"),
}


def exames_sugeridos(df_ast: pd.DataFrame, dia: int, telemetria: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    jan = _janela(df_ast, dia, 7)
    atual = jan.iloc[-1]
    exames: Dict[str, Dict[str, Any]] = {}

    def sugerir(exame: str, motivo: str, procedimento: str, prioridade: str, tipo: str):
        if exame in exames:
            # Mantém o motivo mais grave e acumula os demais
            if motivo not in exames[exame]["motivo"]:
                exames[exame]["motivo"] += f"; {motivo}"
            ordem = {"alta": 0, "media": 1, "baixa": 2}
            if ordem[prioridade] < ordem[exames[exame]["prioridade"]]:
                exames[exame]["prioridade"] = prioridade
            return
        exames[exame] = {"exame": exame, "motivo": motivo, "procedimento": procedimento, "prioridade": prioridade, "tipo": tipo}

    # (a) Dados ausentes nos últimos 7 dias
    for col in COLUNAS_VITAIS:
        faltando = jan[jan[col].isna() | (jan[col].astype(str).str.strip() == "")]["dia_missao"].tolist()
        if faltando:
            exame, motivo = EXAME_POR_COLUNA[col]
            dias = ", ".join(str(int(d)) for d in faltando)
            sugerir(exame, f"{motivo} (dia {dias})", "Aferir hoje e registrar no check-in", "media", "ausente")

    # (b) Valores inconsistentes (fora do plausível ou PA diastólica >= sistólica)
    for col, (lo, hi) in PLAUSIVEL.items():
        v = pd.to_numeric(jan[col], errors="coerce")
        ruins = jan[(v < lo) | (v > hi)]["dia_missao"].tolist()
        if ruins:
            sugerir(f"Repetir aferição de {col}", f"Valor fora da faixa plausível no dia {', '.join(map(str, ruins))}",
                    "Repetir a medida com outro equipamento e corrigir o registro", "media", "inconsistente")
    pa_inv = jan[pd.to_numeric(jan["pa_diastolica"], errors="coerce") >= pd.to_numeric(jan["pa_sistolica"], errors="coerce")]
    if not pa_inv.empty:
        sugerir("Aferição manual de pressão arterial", "Diastólica maior ou igual à sistólica (registro inconsistente)",
                "Repetir com esfigmomanômetro manual", "media", "inconsistente")

    # (c) Inconclusivo: sono caindo ou pressão subindo sem avaliação ocular registrada
    sono_queda = float(jan["sono_horas"].tail(3).mean()) <= float(atual["base_sono"]) - 1.0
    pa_alta = float(atual["pa_sistolica"]) >= float(atual["base_pa_sistolica"]) + 10
    sem_sintoma = (jan["sintoma_neuro_ocular"].astype(str) == "Nenhum").all()
    if (sono_queda or pa_alta) and sem_sintoma:
        gatilho = "queda de sono" if sono_queda else "pressão acima da base"
        sugerir("Tonometria e OCT ocular", f"Investigar SANS: {gatilho} sem avaliação neuro-ocular objetiva recente",
                "Medir pressão intraocular e fazer OCT/fundoscopia a bordo", "media", "inconclusivo")
    if str(atual["sintoma_neuro_ocular"]) != "Nenhum":
        sugerir("Tonometria e OCT ocular", f"Sintoma relatado hoje: {atual['sintoma_neuro_ocular']}",
                "Medir pressão intraocular e fazer OCT/fundoscopia a bordo", "alta", "inconclusivo")

    # FC oscilando
    var_fc = (float(atual["fc_repouso"]) - float(atual["base_fc_repouso"])) / float(atual["base_fc_repouso"]) * 100
    horas_fc = []
    if telemetria:
        horas_fc = [p["rotulo"] for p in telemetria["pontos"] if any(a["sinal"] == "fc_bpm" for a in p.get("alertas", []))]
    if abs(var_fc) >= 15 or len(horas_fc) >= 1:
        motivo = f"FC de repouso {var_fc:+.0f}% vs. base" if abs(var_fc) >= 15 else f"Oscilação de FC no wearable às {', '.join(horas_fc)}"
        sugerir("ECG de 12 derivações", f"Confirmar oscilação de FC: {motivo}", "ECG em repouso e repetir após 1 h",
                "alta" if abs(var_fc) >= 28 or len(horas_fc) >= 2 else "media", "inconclusivo")

    # Glicemia fora da base
    var_glic = (float(atual["glicemia_mg_dl"]) - float(atual["base_glicemia"])) / float(atual["base_glicemia"]) * 100
    if abs(var_glic) >= 15:
        sugerir("Glicemia capilar / painel metabólico", f"Glicemia {var_glic:+.0f}% vs. base",
                "Glicemia capilar em jejum e 2 h após refeição", "media", "inconclusivo")

    # Temperatura elevada: procurar foco
    if float(atual["temperatura_c"]) >= 37.5:
        sugerir("Avaliação de foco infeccioso", f"Temperatura {atual['temperatura_c']} °C",
                "Exame físico guiado e aferição a cada 4 h", "alta" if float(atual["temperatura_c"]) >= 38.1 else "media", "inconclusivo")

    # Telemetria horária: SpO₂ baixa (especialmente pós-EVA) e lacunas de sinal
    if telemetria:
        pontos = telemetria["pontos"]
        baixas = [p for p in pontos if p.get("spo2_pct") is not None and p["spo2_pct"] < 94]
        if baixas:
            pos_eva = any(p["perfil"] == "eva" for p in baixas) or telemetria["ambiente"] == "Base Marciana"
            exame = "Oximetria e capnografia pós-EVA" if pos_eva else "Oximetria de pulso contínua"
            sugerir(exame, f"SpO₂ mínima {min(p['spo2_pct'] for p in baixas)}% às {', '.join(p['rotulo'] for p in baixas)}",
                    "Oxímetro de dedo em repouso + checar CO₂ do traje/habitat", "alta", "inconclusivo")
        lacunas = [p["rotulo"] for p in pontos if p.get("sem_sinal")]
        if lacunas:
            sugerir("Verificar wearable e aferição manual", f"Lacuna de telemetria às {', '.join(lacunas)}",
                    "Checar bateria e contato do sensor; aferir FC e SpO₂ manualmente", "baixa", "ausente")

    ordem = {"alta": 0, "media": 1, "baixa": 2}
    return sorted(exames.values(), key=lambda e: ordem[e["prioridade"]])


# ---------------------------------------------------------------------------
# 3. Coach de exercício
# ---------------------------------------------------------------------------

def coach_exercicio(df_ast: pd.DataFrame, dia: int, hora: int, telemetria: Dict[str, Any]) -> Dict[str, Any]:
    pontos = telemetria["pontos"]
    hora = max(0, min(23, hora))
    concluido = int(pontos[hora]["treino_min_acumulado"])
    deficit = max(0, META_TREINO_MIN - concluido)
    pct_dia = min(100, round(concluido / META_TREINO_MIN * 100))

    # Semana: 6 dias anteriores (registro completo) + hoje até a hora atual
    anteriores = _janela(df_ast, dia - 1, 6)
    semana_min = int(anteriores["treino_resistido_min"].sum()) + concluido
    dias_semana = len(anteriores) + 1
    meta_semana = META_TREINO_MIN * dias_semana

    # Sequência de dias na meta terminando ontem (+ hoje, se já bateu)
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
    proximas = [p for p in pontos[hora + 1:] if p["perfil"] in ("resistido", "aerobico") or "(não realizado)" in p["atividade"] or "(parcial)" in p["atividade"]]
    proximas = [p for p in proximas if p["hora"] < inicio_sono]
    atividade_atual = pontos[hora]["atividade"]

    if deficit == 0:
        status = "meta_cumprida"
        recomendacao = f"Meta de {META_TREINO_MIN} min cumprida. Foque em hidratação e alongamento antes do sono."
    # Sono da madrugada (antes do meio-dia) é o começo do dia, não o fim
    elif hora >= inicio_sono or (pontos[hora]["perfil"] == "sono" and hora >= 12):
        status = "critico"
        recomendacao = f"Dia encerrado com {deficit} min de déficit. Planeje compensar com {min(deficit, 30)} min extras amanhã."
    elif proximas:
        p = proximas[0]
        status = "no_caminho" if deficit <= 30 else "atencao"
        recomendacao = f"Faltam {deficit} min. Próxima janela de treino às {p['rotulo']} ({p['atividade'].split(' (')[0]})."
    elif inicio_sono - hora <= 3:
        status = "critico"
        recomendacao = (
            f"Faltam {deficit} min e a janela de sono começa às {inicio_sono:02d}:00. "
            f"Faça {min(deficit, 30)} min de treino resistido leve agora, pelo menos 1 h antes de deitar."
        )
    else:
        status = "atencao"
        recomendacao = f"Faltam {deficit} min e não há outra janela de treino na rotina. Encaixe o treino antes das {inicio_sono - 2:02d}:00."

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
