import json
import os
import random
import threading
import time
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from i18n import categoria_en, nome_en, ponto_en, sintoma_en
from analise_longitudinal import avaliacao_operacional, coach_exercicio, exames_sugeridos, predicao_tendencia
from telemetria_horaria import (
    PERFIS,
    gerar_dia,
    gerar_proxima_leitura_horaria,
    iniciar_leitura,
    linha_do_tempo,
    planejar_dia,
)

# Official project dataset: data/astronaut_health_data_ok.xlsx (in the project root).
# Path computed from this file, so it works when uvicorn runs from any folder.
# DATASET_PATH in .env lets you point to another dataset (e.g. a copy for tests).
RAIZ_PROJETO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_PADRAO = os.getenv(
    "DATASET_PATH",
    os.path.join(RAIZ_PROJETO, "data", "astronaut_health_data_ok.xlsx"),
)

AMBIENTES = ["Estacao Orbital", "Transito para Marte", "Base Marciana"]

# Indicators with an individual baseline (measured column -> base_* column)
PARES_BASE = {
    "pa_sistolica": "base_pa_sistolica",
    "pa_diastolica": "base_pa_diastolica",
    "fc_repouso": "base_fc_repouso",
    "glicemia_mg_dl": "base_glicemia",
    "temperatura_c": "base_temperatura",
    "sono_horas": "base_sono",
}


def _ler_base(caminho: str) -> pd.DataFrame:
    """Reads .xlsx or .csv depending on the extension."""
    if caminho.lower().endswith((".xlsx", ".xls")):
        return pd.read_excel(caminho)
    return pd.read_csv(caminho)


def _gravar_base(df: pd.DataFrame, caminho: str) -> None:
    """Writes the dataset in the same format. Fails with a clear message if the file is open in Excel."""
    try:
        if caminho.lower().endswith((".xlsx", ".xls")):
            df.to_excel(caminho, index=False)
        else:
            df.to_csv(caminho, index=False)
    except PermissionError as e:
        raise RuntimeError(
            f"Could not save to {os.path.basename(caminho)}. "
            "Close the file in Excel and try again."
        ) from e


def _microvariacao(ponto: Dict[str, Any]) -> Dict[str, Any]:
    """
    "Live" mode: small real-time physiological fluctuations on top of the hour's reading
    (HR ±2 bpm, HRV ±3 ms, SpO₂ ±0.3%). Response only; the dataset file is not changed.
    The hour's status stays as computed for the base reading (the fluctuation is too small to change it).
    """
    novo = dict(ponto)
    if novo.get("sem_sinal"):
        return novo
    rng = random.Random(time.time_ns())
    novo["fc_bpm"] = int(round(novo["fc_bpm"] + rng.uniform(-2, 2)))
    novo["hrv_ms"] = max(5, int(round(novo["hrv_ms"] + rng.uniform(-3, 3))))
    novo["spo2_pct"] = round(min(100.0, novo["spo2_pct"] + rng.uniform(-0.3, 0.3)), 1)
    novo["ao_vivo"] = True
    novo["lido_em"] = time.strftime("%H:%M:%S")
    return novo


def _vazio(valor: Any) -> bool:
    return valor is None or (isinstance(valor, float) and np.isnan(valor)) or pd.isna(valor)


# ===========================================================================
# Cumulative intraday readiness (Readiness & EVA Fitness)
#
#   D(t) = D(t-Δt) · e^(-λ_rec(t)·Δt) + ΔD(t)          (Δt = 1 h)
#   R(t) = clamp(R_base − D(t) − P_agudo(t), 0, 100)
#
# Two wear compartments, with different recovery:
#   - "esforco": acute exertion fatigue (workout, EVA, HR/HRV off expected), half-life ~3.5 h
#   - "carga":   wear from alerts, pain and physiological stress (allostatic load), half-life ~10 h
# λ_rec depends on the state of the hour: ≈0 under stress/alert/exertion, higher during sleep and right after
# countermeasures. Constants are DESIGN CHOICES for the demo (to be confirmed with the medical team).
# ===========================================================================
LN2 = float(np.log(2))
MEIA_VIDA_H = {
    # state -> (exertion half-life, load half-life), in hours; None = no recovery
    "sono": (2.5, 7.0),
    "repouso": (3.5, 10.0),
    "contramedida": (2.0, 5.5),
    "estresse": (None, None),
}
LAMBDA_RESIDUAL_ESTRESSE = 0.01  # λ ≈ 0 under stress (half-life ~70 h)
PERFIS_ESFORCO = {"resistido": 4.0, "aerobico": 4.0, "eva": 5.0, "trabalho": 0.4}
JANELA_CONTRAMEDIDA_H = 2  # hours during which a countermeasure speeds up recovery
BONUS_CONTRAMEDIDA_FRAC = 0.15  # fraction of the load wear removed at the hour it is applied
BONUS_CONTRAMEDIDA_MAX = 4.0  # points per countermeasure
CONTRAMEDIDAS_COM_BONUS_DIA = 3  # limited immediate bonus (the rest only speeds up λ)
# Cap on accumulated wear (same 0–100 scale as readiness): a whole day in critical alert
# saturates here instead of growing without limit (it used to reach ~260 points, unreadable in the HUD).
# 100 = wear can consume at most all of the readiness, never "more than everything".
DESGASTE_MAX = 100.0
LIMIAR_SPO2_EVA = 90.0
LIMIAR_SPO2_RESTRICAO = 94.0


def _lambda(meia_vida: Optional[float]) -> float:
    return LAMBDA_RESIDUAL_ESTRESSE if meia_vida is None else LN2 / meia_vida


def _prontidao_base(atual: pd.Series, residual: float) -> Dict[str, Any]:
    """R_base: macro state of the day (sleep, deviations from the base_* baselines, mood, residual fatigue)."""
    fatores: List[Dict[str, Any]] = []

    def tira(rotulo: str, pontos: float):
        pontos = round(float(pontos), 1)
        if pontos > 0:
            fatores.append({"rotulo": rotulo, "pontos": -pontos})

    sono, base_sono = float(atual["sono_horas"]), float(atual["base_sono"])
    tira(f"Sleep {sono} h (baseline {base_sono} h)", min(18.0, max(0.0, base_sono - sono) * 6))
    fc, base_fc = float(atual["fc_repouso"]), float(atual["base_fc_repouso"])
    var_fc = (fc - base_fc) / base_fc * 100 if base_fc else 0
    tira(f"Resting HR +{var_fc:.0f}% vs. baseline", min(8.0, max(0.0, var_fc - 10) * 0.5))
    d_pas = float(atual["pa_sistolica"]) - float(atual["base_pa_sistolica"])
    tira(f"Systolic BP +{d_pas:.0f} mmHg vs. baseline", min(6.0, max(0.0, d_pas - 10) * 0.4))
    d_temp = float(atual["temperatura_c"]) - float(atual["base_temperatura"])
    tira(f"Temperature +{d_temp:.1f} °C vs. baseline", min(6.0, max(0.0, d_temp - 0.4) * 6))
    base_glic = float(atual["base_glicemia"])
    var_glic = abs(float(atual["glicemia_mg_dl"]) - base_glic) / base_glic * 100 if base_glic else 0
    tira(f"Blood glucose {var_glic:.0f}% off baseline", min(4.0, max(0.0, var_glic - 15) * 0.3))
    humor = int(atual["humor"])
    tira(f"Mood {humor}/5", 8 if humor <= 1 else 5 if humor == 2 else 0)
    ocular = str(atual["sintoma_neuro_ocular"]).strip()
    tira(f"Neuro-ocular: {sintoma_en(ocular)}", 8 if ocular == "Visao turva" else 4 if ocular == "Leve pressao ocular" else 0)
    tira("Residual fatigue from the previous day", min(15.0, residual))

    valor = max(0.0, min(100.0, 100 + sum(f["pontos"] for f in fatores)))
    return {"valor": round(valor, 1), "fatores": sorted(fatores, key=lambda f: f["pontos"])}


def _bloqueios_do_dia(atual: pd.Series, delta_rad_7d: float) -> List[Dict[str, Any]]:
    """Conditions in the daily record that, on their own, limit EVA for the whole day."""
    b: List[Dict[str, Any]] = []
    if float(atual["temperatura_c"]) >= 38.1:
        b.append({"nivel": "INAPTO", "motivo": f"Fever in the daily record ({float(atual['temperatura_c'])} °C)"})
    if str(atual["sintoma_neuro_ocular"]).strip() == "Visao turva":
        b.append({"nivel": "RESTRICAO", "motivo": "Blurred vision (neuro-ocular/SANS risk)"})
    if int(atual["pa_sistolica"]) >= 140 or int(atual["pa_sistolica"]) - int(atual["base_pa_sistolica"]) >= 22:
        b.append({"nivel": "RESTRICAO", "motivo": f"Daily BP {int(atual['pa_sistolica'])}/{int(atual['pa_diastolica'])} mmHg"})
    if delta_rad_7d >= 25.0:
        b.append({"nivel": "RESTRICAO", "motivo": f"High radiation dose this week (+{delta_rad_7d} mSv)"})

    # Same rule as the protocol (avaliacao_operacional): the day's triage rules EVA, so the top
    # never says "fit" while the protocol says to suspend or seek shelter.
    codigo = atual.get("codigo_semaforo")
    categorias = [c for c in str(atual.get("categoria_risco") or "").split(";") if c and c != "Nominal" and c != "nan"]
    if not _vazio(codigo):
        if int(codigo) >= 3:
            b.append({"nivel": "INAPTO", "motivo": f"Critical alert today ({categoria_en(categorias) or 'triage'}): suspend EVA"})
        elif int(codigo) == 2 and set(categorias) & {"Cardiovascular", "Imunológico", "Metabólico"}:
            b.append({"nivel": "RESTRICAO", "motivo": f"Alert today ({categoria_en(categorias)}): restrict exertion"})
    if "Radiação" in categorias and not any("radiation" in x["motivo"].lower() for x in b):
        b.append({"nivel": "RESTRICAO", "motivo": "Radiation alert: move to the shielded shelter"})
    return b


def _desgaste_vitais(p: Dict[str, Any]) -> Dict[str, float]:
    """ΔD of the hour's vital signs against what is expected for the activity (which already starts from the baseline)."""
    esp = p["esperado"]
    esforco = carga = 0.0
    if p["fc_bpm"] is not None and esp.get("fc_bpm"):
        excesso = max(0.0, (p["fc_bpm"] - esp["fc_bpm"]) / esp["fc_bpm"] - 0.08)
        esforco += min(6.0, excesso * 25)
    if p["hrv_ms"] is not None and esp.get("hrv_ms"):
        queda = max(0.0, (esp["hrv_ms"] - p["hrv_ms"]) / esp["hrv_ms"] - 0.15)
        esforco += min(5.0, queda * 12)
    if p["spo2_pct"] is not None:
        carga += min(10.0, max(0.0, 95.0 - p["spo2_pct"]) * 1.5)
    if p["temperatura_c"] is not None:
        corrigida = p["temperatura_c"] - PERFIS.get(p["perfil"], PERFIS["repouso"])["temp"]
        carga += min(6.0, max(0.0, corrigida - 37.3) * 4)
    if p["pa_sistolica"] is not None and esp.get("pa_sistolica"):
        carga += min(4.0, max(0.0, p["pa_sistolica"] - esp["pa_sistolica"] - 10) / 5)
    if p["estresse_wearable"] is not None:
        carga += min(4.0, max(0.0, p["estresse_wearable"] - 60) / 10)
    return {"esforco": esforco, "carga": carga}


class IntegradorProntidao:
    """
    Readiness integrator in hourly steps. Each call to passo() applies ONE hour:
    decay of the existing wear (λ_rec for the hour's state) + new wear ΔD + acute penalty.
    The live flow calls passo() on every new wearable reading; integrar_prontidao() loops over a whole day.
    """

    def __init__(self, atual: pd.Series, residual: float = 0.0, delta_rad_7d: float = 0.0):
        self.atual = atual
        self.residual = float(residual)
        self.delta_rad_7d = float(delta_rad_7d)
        self.base = _prontidao_base(atual, residual)
        self.d_esf = 0.0
        self.d_carga = 0.0
        self.recuperado = 0.0
        self.bonus_usados = 0
        self.historico: List[Dict[str, Any]] = []
        self._ultimo: Optional[tuple] = None  # (point, acute factors, active reports) of the last integrated hour

    @property
    def desgaste(self) -> float:
        return self.d_esf + self.d_carga

    def passo(self, p: Dict[str, Any], desconfortos: Optional[List[Dict[str, Any]]] = None,
              contramedidas: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        h = int(p["hora"])
        desconfortos = [d for d in (desconfortos or []) if int(d.get("hora", 0)) <= h]
        contramedidas = sorted((c for c in (contramedidas or []) if int(c.get("hora", 0)) <= h), key=lambda c: int(c["hora"]))
        aplicadas_agora = [c for c in contramedidas if int(c["hora"]) == h]
        # A report stops weighing in full after the first countermeasure applied after it
        ativos = [(d, any(int(d.get("hora", 0)) <= int(c["hora"]) <= h for c in contramedidas)) for d in desconfortos]

        # ---------- ΔD(t): what the hour adds ----------
        delta = {"esforco": 0.0, "carga": 0.0}
        if not p.get("sem_sinal"):
            v = _desgaste_vitais(p)
            delta["esforco"] += v["esforco"]
            delta["carga"] += v["carga"]
        perfil = p.get("perfil", "repouso")
        if perfil in PERFIS_ESFORCO:
            fator = 1.0 if perfil in ("eva", "trabalho") else max(0.5, min(1.0, p.get("treino_min", 0) / 60))
            delta["esforco"] += PERFIS_ESFORCO[perfil] * fator
        semaforo = int(p.get("semaforo_hora", 1))
        delta["carga"] += {2: 3.0, 3: 7.0}.get(semaforo, 0.0)
        dor = sum(int(d["intensidade"]) * (0.4 if mit else 0.8) for d, mit in ativos)
        delta["carga"] += min(8.0, dor)

        # ---------- λ_rec(t): state of the hour ----------
        dor_forte = any(int(d["intensidade"]) >= 4 and not mit for d, mit in ativos)
        sob_estresse = semaforo >= 2 or perfil in ("resistido", "aerobico", "eva") or dor_forte
        em_contramedida = any(0 <= h - int(c["hora"]) < JANELA_CONTRAMEDIDA_H for c in contramedidas)
        if em_contramedida:
            estado = "contramedida"
        elif sob_estresse:
            estado = "estresse"
        elif perfil == "sono":
            estado = "sono"
        else:
            estado = "repouso"
        mv_esf, mv_carga = MEIA_VIDA_H[estado]
        if estado == "contramedida" and sob_estresse:
            # Countermeasure under active stress: recovers, but at half the pace
            mv_esf, mv_carga = mv_esf * 2, mv_carga * 2
        lam_esf, lam_carga = _lambda(mv_esf), _lambda(mv_carga)

        # ---------- Balance: decay of what was already there + new wear ----------
        antes = self.desgaste
        self.d_esf *= float(np.exp(-lam_esf))
        self.d_carga *= float(np.exp(-lam_carga))
        rec_hora = antes - self.desgaste

        # Limited immediate bonus from countermeasures applied this hour (does not erase severe exhaustion)
        bonus = 0.0
        for _ in aplicadas_agora:
            if self.bonus_usados >= CONTRAMEDIDAS_COM_BONUS_DIA:
                break
            b = min(BONUS_CONTRAMEDIDA_MAX, self.d_carga * BONUS_CONTRAMEDIDA_FRAC + self.d_esf * 0.05)
            self.d_carga = max(0.0, self.d_carga - b * 0.8)
            self.d_esf = max(0.0, self.d_esf - b * 0.2)
            bonus += b
            self.bonus_usados += 1
        rec_hora += bonus
        self.recuperado += rec_hora

        self.d_esf += delta["esforco"]
        self.d_carga += delta["carga"]
        if self.desgaste > DESGASTE_MAX:
            # Saturates at the cap while keeping the exertion/load ratio
            fator = DESGASTE_MAX / self.desgaste
            self.d_esf *= fator
            self.d_carga *= fator

        # ---------- P_agudo(t): only what is happening right now ----------
        agudos: List[Dict[str, Any]] = []
        if semaforo >= 3:
            agudos.append({"rotulo": "Critical wearable alert", "pontos": -15.0})
        elif semaforo == 2:
            agudos.append({"rotulo": "Wearable alert", "pontos": -5.0})
        if p.get("spo2_pct") is not None and p["spo2_pct"] < LIMIAR_SPO2_EVA:
            agudos.append({"rotulo": f"Hypoxia (SpO₂ {p['spo2_pct']}%)", "pontos": -10.0})
        dor_aguda = sum(6.0 if int(d["intensidade"]) >= 4 and not mit else 2.0 if int(d["intensidade"]) >= 4 else 0.0 for d, mit in ativos)
        if dor_aguda:
            agudos.append({"rotulo": "Acute pain reported", "pontos": -min(15.0, dor_aguda)})
        p_agudo = -sum(a["pontos"] for a in agudos)

        r = max(0.0, min(100.0, self.base["valor"] - self.desgaste - p_agudo))
        item = {
            "hora": h,
            "rotulo": p["rotulo"],
            "atividade": p.get("atividade"),
            "estado": estado,
            "prontidao": round(r, 1),
            "desgaste": round(self.desgaste, 2),
            "desgaste_esforco": round(self.d_esf, 2),
            "desgaste_carga": round(self.d_carga, 2),
            "delta_desgaste": round(delta["esforco"] + delta["carga"], 2),
            "recuperacao_hora": round(rec_hora, 2),
            "penalidade_aguda": round(p_agudo, 1),
            "lambda_esforco": round(lam_esf, 3),
            "lambda_carga": round(lam_carga, 3),
            "semaforo_hora": semaforo,
        }
        self.historico.append(item)
        self._ultimo = (p, agudos, ativos, len(contramedidas), len(desconfortos))
        return item

    def resultado(self) -> Dict[str, Any]:
        """Readiness and EVA Fitness at the last integrated hour (with that hour's safety blocks)."""
        if not self.historico or self._ultimo is None:
            raise ValueError("Nenhuma hora integrada ainda.")
        ultimo = self.historico[-1]
        p_t, agudos, ativos, n_contra, n_desc = self._ultimo

        # ---------- EVA fitness: safety cap/block independent of wear ----------
        bloqueios = _bloqueios_do_dia(self.atual, self.delta_rad_7d)
        if p_t.get("sem_sinal"):
            bloqueios.append({"nivel": "RESTRICAO", "motivo": "Wearable offline: no clearance without telemetry"})
        else:
            if int(p_t.get("semaforo_hora", 1)) >= 3:
                textos = "; ".join(a["texto"] for a in p_t.get("alertas", []) if a["nivel"] >= 3)
                bloqueios.append({"nivel": "INAPTO", "motivo": f"Critical alert active at {p_t['rotulo']}: {textos}"})
            elif int(p_t.get("semaforo_hora", 1)) == 2:
                bloqueios.append({"nivel": "RESTRICAO", "motivo": f"Alert active at {p_t['rotulo']}"})
            spo2 = p_t.get("spo2_pct")
            if spo2 is not None and spo2 < LIMIAR_SPO2_EVA:
                bloqueios.append({"nivel": "INAPTO", "motivo": f"Hypoxia: SpO₂ {spo2}% < {LIMIAR_SPO2_EVA:.0f}%"})
            elif spo2 is not None and spo2 < LIMIAR_SPO2_RESTRICAO:
                bloqueios.append({"nivel": "RESTRICAO", "motivo": f"SpO₂ {spo2}% < {LIMIAR_SPO2_RESTRICAO:.0f}%"})
        for d, mit in ativos:
            i = int(d["intensidade"])
            if i >= 5 or (i >= 4 and not mit):
                bloqueios.append({"nivel": "INAPTO", "motivo": f"Severe pain: {d.get('tipo', 'discomfort')} {d.get('nome', '')} {i}/5".strip()})
            elif i >= 4:
                bloqueios.append({"nivel": "RESTRICAO", "motivo": f"Pain {d.get('nome', '')} {i}/5 (mitigated)".strip()})

        prontidao = ultimo["prontidao"]
        aptidao = prontidao
        inapto = any(b["nivel"] == "INAPTO" for b in bloqueios)
        if inapto:
            aptidao = min(aptidao, 40.0)
        elif bloqueios:
            aptidao = min(aptidao, 70.0)
        aptidao = round(aptidao)
        status = "APTO" if aptidao >= 75 else "RESTRICAO" if aptidao >= 45 else "INAPTO"
        # The block rules the status even if the number falls in a better range
        if inapto:
            status = "INAPTO"
        elif bloqueios and status == "APTO":
            status = "RESTRICAO"
        rotulos = {"APTO": "FIT FOR EVA", "RESTRICAO": "PARTIAL RESTRICTION", "INAPTO": "EVA SUSPENDED"}

        return {
            "hora": ultimo["hora"],
            "prontidao_atual": round(prontidao),
            "aptidao_eva": aptidao,
            "status_eva": status,
            "rotulo_eva": rotulos[status],
            "faixa": {"APTO": "apto", "RESTRICAO": "atencao", "INAPTO": "critico"}[status],
            "base": self.base,
            "desgaste_acumulado": round(ultimo["desgaste"], 1),
            "desgaste_esforco": round(ultimo["desgaste_esforco"], 1),
            "desgaste_carga": round(ultimo["desgaste_carga"], 1),
            "recuperacao_acumulada": round(self.recuperado, 1),
            "penalidade_aguda": round(ultimo["penalidade_aguda"], 1),
            "fatores_agudos": agudos,
            "bloqueios": bloqueios,
            "estado_atual": ultimo["estado"],
            "contramedidas_consideradas": n_contra,
            "desconfortos_considerados": n_desc,
            "fadiga_residual": round(self.residual, 1),
            "historico_prontidao": list(self.historico),
            "modelo": {
                "equacao": "D(t) = D(t-1)·e^(-λ(t)) + ΔD(t);  R(t) = clamp(R_base − D(t) − P_agudo(t), 0, 100)",
                "meias_vidas_h": {k: {"esforco": v[0], "carga": v[1]} for k, v in MEIA_VIDA_H.items()},
            },
            "nota": "Cumulative DEMO model (constants to be confirmed with the medical team).",
        }


def integrar_prontidao(
    atual: pd.Series,
    pontos: List[Dict[str, Any]],
    hora: int,
    desconfortos: Optional[List[Dict[str, Any]]] = None,
    contramedidas: Optional[List[Dict[str, Any]]] = None,
    residual: float = 0.0,
    delta_rad_7d: float = 0.0,
) -> Dict[str, Any]:
    """
    Integrates readiness hour by hour from 00:00 to `hora` (loop over IntegradorProntidao.passo).
    desconfortos: [{"hora", "intensidade" 1–5, "nome", "tipo"}], active from the hour of the report.
    contramedidas: [{"hora", "texto"}], speed up recovery from the hour they were applied.
    """
    integrador = IntegradorProntidao(atual, residual, delta_rad_7d)
    for p in linha_do_tempo({"pontos": pontos}, hora):
        integrador.passo(p, desconfortos, contramedidas)
    return integrador.resultado()



class SpaceHealthRiskEngine:
    def __init__(self, csv_path: str = BASE_PADRAO, arquivo_ao_vivo: Optional[str] = None):
        self.csv_path = csv_path
        self.df = _ler_base(self.csv_path)
        self._lock = threading.Lock()
        # Live wearable: the day's session per crew member and the wear at the close of the last lived day
        self._lock_sessoes = threading.RLock()
        self._sessoes: Dict[str, Dict[str, Any]] = {}
        self._fechamentos: Dict[str, Dict[str, Any]] = {}
        # Live day saved to disk (default: data/telemetria_ao_vivo.json next to the dataset; "" turns it off)
        self._arquivo_ao_vivo = (
            os.path.join(os.path.dirname(os.path.abspath(csv_path)), "telemetria_ao_vivo.json")
            if arquivo_ao_vivo is None else arquivo_ao_vivo
        )
        self._carregar_ao_vivo()

    def reload_csv(self):
        self.df = _ler_base(self.csv_path)

    def get_astronauts(self):
        resultado = []
        for (id_ast, nome, sexo), grupo in self.df.groupby(["id_astronauta", "nome", "sexo"], sort=True):
            ultimo = grupo.sort_values("dia_missao").iloc[-1]
            resultado.append({
                "id_astronauta": str(id_ast),
                "nome": nome_en(nome),
                "sexo": str(sexo),
                "primeiro_dia": int(grupo["dia_missao"].min()),
                "ultimo_dia": int(ultimo["dia_missao"]),
                "ambiente_atual": str(ultimo["ambiente"]),
            })
        return resultado

    @staticmethod
    def desvios_base(linha: pd.Series) -> Dict[str, Any]:
        """Daily value, individual baseline (base_*) and absolute/percent deviation."""
        saida: Dict[str, Any] = {}
        for medida, base in PARES_BASE.items():
            valor = float(linha[medida])
            ref = float(linha[base])
            saida[medida] = {
                "valor": round(valor, 2),
                "base": round(ref, 2),
                "desvio": round(valor - ref, 2),
                "desvio_pct": round(((valor - ref) / ref) * 100, 1) if ref else None,
            }
        # No base_* column: fixed project reference (workout goal) or just the value
        saida["treino_resistido_min"] = {
            "valor": int(linha["treino_resistido_min"]),
            "base": 60,
            "desvio": int(linha["treino_resistido_min"]) - 60,
            "desvio_pct": round(((int(linha["treino_resistido_min"]) - 60) / 60) * 100, 1),
        }
        saida["humor"] = {"valor": int(linha["humor"]), "base": None, "desvio": None, "desvio_pct": None}
        saida["radiacao_acumulada_msv"] = {
            "valor": round(float(linha["radiacao_acumulada_msv"]), 2),
            "base": None, "desvio": None, "desvio_pct": None,
        }
        saida["sintoma_neuro_ocular"] = str(linha["sintoma_neuro_ocular"])
        return saida

    def analyze_day(self, id_astronauta: str, dia_missao: int) -> Dict[str, Any]:
        df_ast = self.df[self.df["id_astronauta"] == id_astronauta].sort_values("dia_missao")
        if df_ast.empty:
            raise ValueError(f"Astronaut {id_astronauta} not found in the dataset.")

        # Rolling window of the last 7 days (dia_missao - 6 to dia_missao)
        inicio_janela = max(1, dia_missao - 6)
        janela_7d = df_ast[
            (df_ast["dia_missao"] >= inicio_janela) & (df_ast["dia_missao"] <= dia_missao)
        ].copy()

        if janela_7d.empty or dia_missao not in janela_7d["dia_missao"].values:
            raise ValueError(f"Mission day {dia_missao} not found for {id_astronauta}.")

        atual = janela_7d[janela_7d["dia_missao"] == dia_missao].iloc[0]

        # 7-day rolling averages
        media_7d = {
            "pa_sistolica": round(float(janela_7d["pa_sistolica"].mean()), 1),
            "pa_diastolica": round(float(janela_7d["pa_diastolica"].mean()), 1),
            "fc_repouso": round(float(janela_7d["fc_repouso"].mean()), 1),
            "glicemia_mg_dl": round(float(janela_7d["glicemia_mg_dl"].mean()), 1),
            "temperatura_c": round(float(janela_7d["temperatura_c"].mean()), 2),
            "sono_horas": round(float(janela_7d["sono_horas"].mean()), 1),
            "humor": round(float(janela_7d["humor"].mean()), 1),
            "treino_resistido_min": round(float(janela_7d["treino_resistido_min"].mean()), 1),
        }

        # Radiation change over the last 7 days
        rad_inicio = float(janela_7d["radiacao_acumulada_msv"].iloc[0])
        rad_atual = float(atual["radiacao_acumulada_msv"])
        delta_rad_7d = round(rad_atual - rad_inicio, 2)

        # Deterministic assessment by clinical domain
        severidades = [1]
        categorias = []
        partes = []
        indicadores_alerta: Dict[str, Any] = {}

        def registrar_alerta(sev: int, cat: str, zonas: list):
            severidades.append(sev)
            if cat not in categorias:
                categorias.append(cat)
            for z in zonas:
                if z not in partes:
                    partes.append(z)

        # 1. Neuro-ocular risk (SANS - Altered Gravity)
        sintoma_ocular = str(atual["sintoma_neuro_ocular"]).strip()
        if sintoma_ocular == "Visao turva":
            registrar_alerta(3, "Neuro-ocular", ["cabeca"])
            indicadores_alerta["sintoma_neuro_ocular"] = sintoma_ocular
        elif sintoma_ocular == "Leve pressao ocular":
            registrar_alerta(2, "Neuro-ocular", ["cabeca"])
            indicadores_alerta["sintoma_neuro_ocular"] = sintoma_ocular

        # 2. Cardiovascular risk (Blood pressure and HR)
        desvio_pas_dia = int(atual["pa_sistolica"]) - int(atual["base_pa_sistolica"])
        desvio_pas_7d = media_7d["pa_sistolica"] - float(atual["base_pa_sistolica"])
        if desvio_pas_dia >= 22 or int(atual["pa_sistolica"]) >= 140:
            registrar_alerta(3, "Cardiovascular", ["peito", "cabeca"])
            indicadores_alerta["pressao_arterial"] = {
                "valor_dia": f"{int(atual['pa_sistolica'])}/{int(atual['pa_diastolica'])} mmHg",
                "linha_base": f"{int(atual['base_pa_sistolica'])}/{int(atual['base_pa_diastolica'])} mmHg",
                "media_sistolica_7_dias": media_7d["pa_sistolica"],
            }
        elif desvio_pas_dia >= 12 or desvio_pas_7d >= 10:
            registrar_alerta(2, "Cardiovascular", ["peito"])
            indicadores_alerta["pressao_arterial"] = {
                "valor_dia": f"{int(atual['pa_sistolica'])}/{int(atual['pa_diastolica'])} mmHg",
                "linha_base": f"{int(atual['base_pa_sistolica'])}/{int(atual['base_pa_diastolica'])} mmHg",
                "media_sistolica_7_dias": media_7d["pa_sistolica"],
            }

        var_fc_pct = ((float(atual["fc_repouso"]) - float(atual["base_fc_repouso"])) / float(atual["base_fc_repouso"])) * 100
        if var_fc_pct >= 28:
            registrar_alerta(3, "Cardiovascular", ["peito", "pulmao"])
            indicadores_alerta["fc_repouso"] = {
                "valor_dia": int(atual["fc_repouso"]),
                "linha_base": int(atual["base_fc_repouso"]),
                "media_ultimos_7_dias": media_7d["fc_repouso"],
                "variacao_dia": f"+{round(var_fc_pct, 1)}%",
            }
        elif var_fc_pct >= 15:
            registrar_alerta(2, "Cardiovascular", ["peito"])
            indicadores_alerta["fc_repouso"] = {
                "valor_dia": int(atual["fc_repouso"]),
                "linha_base": int(atual["base_fc_repouso"]),
                "media_ultimos_7_dias": media_7d["fc_repouso"],
                "variacao_dia": f"+{round(var_fc_pct, 1)}%",
            }

        # Temperature -> "Imunológico" and Glucose -> "Metabólico" (hazard: hostile closed environment)
        temp_atual = float(atual["temperatura_c"])
        if temp_atual >= 38.1:
            registrar_alerta(3, "Imunológico", ["peito", "pele"])
            indicadores_alerta["temperatura_c"] = {
                "valor_dia": temp_atual,
                "linha_base": float(atual["base_temperatura"]),
                "media_ultimos_7_dias": media_7d["temperatura_c"],
            }
        elif temp_atual >= 37.5:
            registrar_alerta(2, "Imunológico", ["pele"])
            indicadores_alerta["temperatura_c"] = {
                "valor_dia": temp_atual,
                "linha_base": float(atual["base_temperatura"]),
                "media_ultimos_7_dias": media_7d["temperatura_c"],
            }

        var_glic_pct = ((float(atual["glicemia_mg_dl"]) - float(atual["base_glicemia"])) / float(atual["base_glicemia"])) * 100
        if abs(var_glic_pct) >= 22:
            registrar_alerta(2 if abs(var_glic_pct) < 32 else 3, "Metabólico", ["peito"])
            indicadores_alerta["glicemia_mg_dl"] = {
                "valor_dia": int(atual["glicemia_mg_dl"]),
                "linha_base": int(atual["base_glicemia"]),
                "media_ultimos_7_dias": media_7d["glicemia_mg_dl"],
                "variacao_dia": f"{round(var_glic_pct, 1)}%",
            }

        # 3. Musculoskeletal risk (NASA goal: ~60 min/day of resistance training)
        meta_treino = 60
        treino_dia = int(atual["treino_resistido_min"])
        if media_7d["treino_resistido_min"] < 30 or (treino_dia < 20 and media_7d["treino_resistido_min"] < 40):
            registrar_alerta(3, "Musculoesquelético", ["coluna", "pernas"])
            indicadores_alerta["treino_resistido_min"] = {
                "valor_dia": treino_dia,
                "linha_base_esperada": meta_treino,
                "media_ultimos_7_dias": media_7d["treino_resistido_min"],
            }
        elif media_7d["treino_resistido_min"] < 45 or treino_dia < 35:
            registrar_alerta(2, "Musculoesquelético", ["pernas"])
            indicadores_alerta["treino_resistido_min"] = {
                "valor_dia": treino_dia,
                "linha_base_esperada": meta_treino,
                "media_ultimos_7_dias": media_7d["treino_resistido_min"],
            }

        # 4. Behavioral risk (Sleep and Mood - Isolation and Confinement)
        base_sono = float(atual["base_sono"])
        var_sono_7d_pct = ((media_7d["sono_horas"] - base_sono) / base_sono) * 100
        humor_dia = int(atual["humor"])

        if var_sono_7d_pct <= -25 or float(atual["sono_horas"]) <= base_sono - 2.2 or humor_dia == 1:
            registrar_alerta(3, "Comportamental", ["cabeca"])
            indicadores_alerta["sono_horas"] = {
                "valor_dia": float(atual["sono_horas"]),
                "linha_base": base_sono,
                "media_ultimos_7_dias": media_7d["sono_horas"],
                "variacao_7_dias": f"{round(var_sono_7d_pct, 1)}%",
            }
            indicadores_alerta["humor"] = {"valor_dia": humor_dia, "media_ultimos_7_dias": media_7d["humor"]}
        elif var_sono_7d_pct <= -14 or float(atual["sono_horas"]) <= base_sono - 1.3 or humor_dia == 2:
            registrar_alerta(2, "Comportamental", ["cabeca"])
            indicadores_alerta["sono_horas"] = {
                "valor_dia": float(atual["sono_horas"]),
                "linha_base": base_sono,
                "media_ultimos_7_dias": media_7d["sono_horas"],
                "variacao_7_dias": f"{round(var_sono_7d_pct, 1)}%",
            }
            indicadores_alerta["humor"] = {"valor_dia": humor_dia, "media_ultimos_7_dias": media_7d["humor"]}

        # 5. Radiation risk (Accumulated dose and solar storm spikes)
        if rad_atual >= 650.0 or delta_rad_7d >= 25.0:
            registrar_alerta(3, "Radiação", ["pele", "peito"])
            indicadores_alerta["radiacao_acumulada_msv"] = {
                "valor_dia": round(rad_atual, 2),
                "incremento_7_dias_msv": delta_rad_7d,
            }
        elif rad_atual >= 450.0 or delta_rad_7d >= 15.0:
            registrar_alerta(2, "Radiação", ["pele"])
            indicadores_alerta["radiacao_acumulada_msv"] = {
                "valor_dia": round(rad_atual, 2),
                "incremento_7_dias_msv": delta_rad_7d,
            }

        triagem_motor = {
            "codigo_semaforo": int(np.max(severidades)),
            "categoria_risco": ";".join(categorias) if categorias else "Nominal",
            "partes_afetadas": ";".join(partes) if partes else "nenhuma",
        }

        # Source of truth: the dataset columns. If the day has no triage yet (new record), use the engine's.
        if all(not _vazio(atual.get(c)) for c in ("codigo_semaforo", "categoria_risco", "partes_afetadas")):
            codigo_semaforo = int(atual["codigo_semaforo"])
            categoria_risco = str(atual["categoria_risco"])
            partes_afetadas = str(atual["partes_afetadas"])
        else:
            codigo_semaforo = triagem_motor["codigo_semaforo"]
            categoria_risco = triagem_motor["categoria_risco"]
            partes_afetadas = triagem_motor["partes_afetadas"]

        # Exact compact payload for the AI
        payload_compacto = {
            "contexto_missao": {
                "id_astronauta": str(atual["id_astronauta"]),
                "nome": nome_en(atual["nome"]),
                "sexo": str(atual["sexo"]),
                "dia_missao": int(atual["dia_missao"]),
                "ambiente": str(atual["ambiente"]),
            },
            "triagem_python": {
                "codigo_semaforo": codigo_semaforo,
                "categoria_risco": categoria_risco,
                "partes_afetadas": partes_afetadas,
            },
            "indicadores_em_alerta": indicadores_alerta,
            "telemetria_nominal_resumida": {
                "pa_atual": f"{int(atual['pa_sistolica'])}/{int(atual['pa_diastolica'])} mmHg (Baseline: {int(atual['base_pa_sistolica'])}/{int(atual['base_pa_diastolica'])})",
                "fc_repouso": f"{int(atual['fc_repouso'])} bpm (Baseline: {int(atual['base_fc_repouso'])})",
                "glicemia_mg_dl": int(atual["glicemia_mg_dl"]),
                "temperatura_c": float(atual["temperatura_c"]),
                "humor": int(atual["humor"]),
                "radiacao_acumulada_msv": round(rad_atual, 2),
            },
        }

        # Series of the last 14 days for dynamic charts in React
        inicio_grafico = max(1, dia_missao - 13)
        serie_14d = df_ast[
            (df_ast["dia_missao"] >= inicio_grafico) & (df_ast["dia_missao"] <= dia_missao)
        ][
            [
                "dia_missao",
                "pa_sistolica",
                "base_pa_sistolica",
                "fc_repouso",
                "base_fc_repouso",
                "sono_horas",
                "base_sono",
                "treino_resistido_min",
                "temperatura_c",
                "radiacao_acumulada_msv",
                "humor",
            ]
        ].to_dict(orient="records")

        # Series of the last 7 days with all indicators and their baselines (trend chart)
        colunas_7d = ["dia_missao", "humor", "treino_resistido_min", "radiacao_acumulada_msv"] + [
            c for par in PARES_BASE.items() for c in par
        ]
        serie_7d = janela_7d[colunas_7d].to_dict(orient="records")

        # Longitudinal view (5–7 days) and information gaps
        predicao = predicao_tendencia(df_ast, dia_missao)
        telemetria = gerar_dia(atual.to_dict())
        exames = exames_sugeridos(df_ast, dia_missao, telemetria)
        # For the AI, titles only (keeps the payload small for Groq's token limit)
        payload_compacto["tendencia_7_dias"] = [r["titulo"] for r in predicao["riscos"]]

        # Status, 0–100 score, action tags and technical summary (deterministic)
        avaliacao = avaliacao_operacional(
            codigo_semaforo, categoria_risco, indicadores_alerta if codigo_semaforo > 1 else {},
            atual, media_7d, telemetria, predicao,
        )
        payload_compacto["avaliacao"] = avaliacao

        return {
            "payload_compacto": payload_compacto,
            "serie_14_dias": serie_14d,
            "serie_7_dias": serie_7d,
            "medias_7_dias": media_7d,
            "telemetria_dia": self.desvios_base(atual),
            "triagem_motor": triagem_motor,
            "predicao_tendencia": predicao,
            **avaliacao,
            "exames_sugeridos": exames,
        }

    def telemetria_horaria(self, id_astronauta: str, dia_missao: int, hora: int = 23, picos: Optional[list] = None, ao_vivo: bool = False) -> Dict[str, Any]:
        """The day's 24 wearable points (generated, not saved), coach at the requested hour and updated exams."""
        df_ast = self.df[self.df["id_astronauta"] == id_astronauta].sort_values("dia_missao")
        if df_ast.empty:
            raise ValueError(f"Astronaut {id_astronauta} not found in the dataset.")
        linha = df_ast[df_ast["dia_missao"] == dia_missao]
        if linha.empty:
            raise ValueError(f"Mission day {dia_missao} not found for {id_astronauta}.")
        if not 0 <= hora <= 23:
            raise ValueError("The hour must be between 0 and 23.")

        telemetria = gerar_dia(linha.iloc[0].to_dict(), picos)
        if ao_vivo:
            telemetria["pontos"][hora] = _microvariacao(telemetria["pontos"][hora])
        return {
            **telemetria,
            "hora": hora,
            "ponto_atual": telemetria["pontos"][hora],
            "coach_exercicio": coach_exercicio(df_ast, dia_missao, hora, telemetria),
            "exames_sugeridos": exames_sugeridos(df_ast, dia_missao, telemetria),
            # Cumulative readiness without body map/chat events (POST /api/prontidao includes those events)
            "prontidao": self.prontidao_dia(id_astronauta, dia_missao, hora, picos, telemetria=telemetria),
        }

    def prontidao_dia(
        self,
        id_astronauta: str,
        dia_missao: int,
        hora: int,
        picos: Optional[list] = None,
        desconfortos: Optional[List[Dict[str, Any]]] = None,
        contramedidas: Optional[List[Dict[str, Any]]] = None,
        telemetria: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Cumulative Readiness/EVA Fitness from 00:00 to `hora` (see integrar_prontidao)."""
        df_ast = self.df[self.df["id_astronauta"] == id_astronauta].sort_values("dia_missao")
        if df_ast.empty:
            raise ValueError(f"Astronaut {id_astronauta} not found in the dataset.")
        linha = df_ast[df_ast["dia_missao"] == dia_missao]
        if linha.empty:
            raise ValueError(f"Mission day {dia_missao} not found for {id_astronauta}.")
        if not 0 <= hora <= 23:
            raise ValueError("The hour must be between 0 and 23.")
        atual = linha.iloc[0]
        if telemetria is None:
            telemetria = gerar_dia(atual.to_dict(), picos)
        return integrar_prontidao(
            atual, telemetria["pontos"], hora, desconfortos, contramedidas,
            self._fadiga_residual(id_astronauta, df_ast, atual), self._delta_rad_7d(df_ast, atual),
        )

    @staticmethod
    def _delta_rad_7d(df_ast: pd.DataFrame, atual: pd.Series) -> float:
        dia = int(atual["dia_missao"])
        janela = df_ast[(df_ast["dia_missao"] >= max(1, dia - 6)) & (df_ast["dia_missao"] <= dia)]
        return round(float(atual["radiacao_acumulada_msv"]) - float(janela["radiacao_acumulada_msv"].iloc[0]), 2)

    def _fadiga_residual(self, id_astronauta: str, df_ast: pd.DataFrame, atual: pd.Series) -> float:
        """
        Wear left over from the close of the previous day, reduced by this night's sleep (6 h sleep half-life).
        If the previous day was lived in the live flow, uses the real closing wear (with pain/countermeasures);
        otherwise, projects the previous day from telemetry alone.
        """
        dia = int(atual["dia_missao"])
        fechamento = self._fechamentos.get(id_astronauta)
        if fechamento and fechamento["dia"] == dia - 1:
            desgaste = fechamento["desgaste"]
        else:
            anterior = df_ast[df_ast["dia_missao"] == dia - 1]
            if anterior.empty:
                return 0.0
            ant = anterior.iloc[0]
            desgaste = integrar_prontidao(ant, gerar_dia(ant.to_dict())["pontos"], 23)["desgaste_acumulado"]
        return desgaste * 0.5 ** (float(atual["sono_horas"]) / 6.0)

    # ------------------------------------------------------------------
    # LIVE wearable
    #   - DATASET days: show the complete original simulation (24 readings from gerar_dia), as always.
    #   - Days simulated by the buttons (Simulate alert day etc.): complete, like the dataset ones.
    #   - NEW days (opened by the clock rollover after 23:00): start at 00:00 with one
    #     reading and each tick generates only the next hour. Only the most recent new day gets readings.
    #   - On the last day, advancing after 23:00 records the next day for the WHOLE crew
    #     and opens the new day at 00:00 (if the last day is from the dataset, the first advance already does that).
    # New days and readings live in data/telemetria_ao_vivo.json: restarting the server resumes where it stopped.
    # ------------------------------------------------------------------

    def _df_ast(self, id_astronauta: str) -> pd.DataFrame:
        df_ast = self.df[self.df["id_astronauta"] == id_astronauta].sort_values("dia_missao")
        if df_ast.empty:
            raise ValueError(f"Astronaut {id_astronauta} not found in the dataset.")
        return df_ast

    def _ultimo_dia(self, id_astronauta: str) -> int:
        return int(self._df_ast(id_astronauta)["dia_missao"].max())

    def _linha_dia(self, id_astronauta: str, dia_missao: int) -> tuple:
        df_ast = self._df_ast(id_astronauta)
        linha = df_ast[df_ast["dia_missao"] == dia_missao]
        if linha.empty:
            raise ValueError(f"Mission day {dia_missao} not found for {id_astronauta}.")
        return df_ast, linha.iloc[0]

    # ---------- Live day persistence ----------
    def _carregar_ao_vivo(self) -> None:
        self._persistido: Dict[str, Any] = {"sessoes": {}, "dias_vividos": {}, "dias_novos": {}}
        if not self._arquivo_ao_vivo or not os.path.exists(self._arquivo_ao_vivo):
            return
        try:
            with open(self._arquivo_ao_vivo, encoding="utf-8") as f:
                dados = json.load(f)
            self._persistido["sessoes"] = dados.get("sessoes", {})
            self._persistido["dias_vividos"] = dados.get("dias_vividos", {})
            # Readings saved before the translation keep Portuguese text: translate on load
            for salvo in self._persistido["sessoes"].values():
                salvo["pontos"] = [ponto_en(p) for p in salvo.get("pontos", [])]
            for dias in self._persistido["dias_vividos"].values():
                for d in dias:
                    dias[d] = [ponto_en(p) for p in dias[d]]
            self._persistido["dias_novos"] = {k: [int(d) for d in v] for k, v in dados.get("dias_novos", {}).items()}
            self._fechamentos = {k: {"dia": int(v["dia"]), "desgaste": float(v["desgaste"])} for k, v in dados.get("fechamentos", {}).items()}
        except (OSError, ValueError, KeyError, TypeError):
            pass  # corrupted file: start from scratch without taking the API down

    def _salvar_ao_vivo(self) -> None:
        if not self._arquivo_ao_vivo:
            return
        for id_ast, s in list(self._sessoes.items()):
            self._persistido["sessoes"][id_ast] = {
                "dia": s["dia"], "pontos": s["pontos"], "desconfortos": s["desconfortos"], "contramedidas": s["contramedidas"],
            }
        dados = {**self._persistido, "fechamentos": self._fechamentos}
        tmp = self._arquivo_ao_vivo + ".tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(dados, f, ensure_ascii=False)
            os.replace(tmp, self._arquivo_ao_vivo)
        except OSError:
            pass  # no disk: the live day still holds in memory

    def _eh_dia_novo(self, id_astronauta: str, dia: int) -> bool:
        """Day recorded by the app after the last dataset day (hour-by-hour collection)."""
        return int(dia) in self._persistido["dias_novos"].get(id_astronauta, [])

    def _marcar_dia_novo(self, id_astronauta: str, dia: int) -> None:
        dias = self._persistido["dias_novos"].setdefault(id_astronauta, [])
        if int(dia) not in dias:
            dias.append(int(dia))
        self._salvar_ao_vivo()

    def _ao_vivo_agora(self, id_astronauta: str) -> bool:
        """Is the crew member's last day a new day (being collected)?"""
        return self._eh_dia_novo(id_astronauta, self._ultimo_dia(id_astronauta))

    # ---------- Live day session ----------
    def _nova_sessao(self, id_astronauta: str, dia: int, pontos: Optional[List[Dict[str, Any]]] = None,
                     desconfortos=None, contramedidas=None) -> Dict[str, Any]:
        df_ast, atual = self._linha_dia(id_astronauta, dia)
        residual = self._fadiga_residual(id_astronauta, df_ast, atual)
        plano = planejar_dia(atual.to_dict())
        sessao = {
            "id_astronauta": id_astronauta,
            "dia": int(dia),
            "plano": plano,
            "pontos": pontos or [iniciar_leitura(plano, desgaste=residual)],
            "integrador": IntegradorProntidao(atual, residual, self._delta_rad_7d(df_ast, atual)),
            "desconfortos": [],
            "contramedidas": [],
        }
        sessao["desconfortos"], sessao["contramedidas"] = self._normalizar_eventos(desconfortos, contramedidas)
        for p in sessao["pontos"]:
            sessao["integrador"].passo(p, sessao["desconfortos"], sessao["contramedidas"])
        return sessao

    def _sessao_ao_vivo(self, id_astronauta: str) -> Dict[str, Any]:
        """Session of the last recorded day: in memory, saved in the file, or a new one at 00:00."""
        ultimo = self._ultimo_dia(id_astronauta)
        sessao = self._sessoes.get(id_astronauta)
        if sessao and sessao["dia"] == ultimo:
            return sessao
        salvo = self._persistido["sessoes"].get(id_astronauta)
        if salvo and int(salvo["dia"]) == ultimo and salvo.get("pontos"):
            sessao = self._nova_sessao(id_astronauta, ultimo, salvo["pontos"], salvo.get("desconfortos"), salvo.get("contramedidas"))
        else:
            sessao = self._nova_sessao(id_astronauta, ultimo)
        self._sessoes[id_astronauta] = sessao
        self._salvar_ao_vivo()
        return sessao

    @staticmethod
    def _normalizar_eventos(desconfortos, contramedidas) -> tuple:
        des = sorted(
            ({"hora": int(d["hora"]), "intensidade": int(d["intensidade"]), "nome": str(d.get("nome", "")),
              "tipo": str(d.get("tipo", "")), "regiao": str(d.get("regiao", ""))} for d in (desconfortos or [])),
            key=lambda d: (d["hora"], d["regiao"], d["nome"]),
        )
        con = sorted(({"hora": int(c["hora"]), "texto": str(c.get("texto", ""))} for c in (contramedidas or [])),
                     key=lambda c: (c["hora"], c["texto"]))
        return des, con

    def _sincronizar_eventos(self, sessao: Dict[str, Any], desconfortos, contramedidas) -> bool:
        """New/changed events: re-integrates the readings ALREADY collected (they do not change; only readiness does)."""
        des, con = self._normalizar_eventos(desconfortos, contramedidas)
        if des == sessao["desconfortos"] and con == sessao["contramedidas"]:
            return False
        sessao["desconfortos"], sessao["contramedidas"] = des, con
        antigo = sessao["integrador"]
        novo = IntegradorProntidao(antigo.atual, antigo.residual, antigo.delta_rad_7d)
        for p in sessao["pontos"]:
            novo.passo(p, des, con)
        sessao["integrador"] = novo
        return True

    def _dia_registrado(self, id_astronauta: str, dia: int, desconfortos=None, contramedidas=None) -> Dict[str, Any]:
        """Complete day (24 readings): the ones lived live, if the day was new; otherwise, the original dataset simulation."""
        _, atual = self._linha_dia(id_astronauta, dia)
        vividos = self._persistido["dias_vividos"].get(id_astronauta, {}).get(str(dia))
        pontos = vividos if vividos and len(vividos) == 24 else gerar_dia(atual.to_dict())["pontos"]
        return self._nova_sessao(id_astronauta, dia, pontos, desconfortos, contramedidas)

    def registrar_tripulacao(
        self,
        id_principal: str,
        medicoes: Optional[Dict[str, Any]] = None,
        simular_anomalia: bool = False,
        ambiente: Optional[str] = None,
        ao_vivo: bool = False,
    ) -> Dict[str, Any]:
        """
        ao_vivo=True (wearable clock rollover): the created days are collected hour by hour from 00:00.
        ao_vivo=False (simulate/record buttons): the created days show up complete, with the day's simulation.
        Records the next day for the main crew member (manual or simulated) and SIMULATES the next day for the others
        (same kind of simulation: normal or with anomaly; manual record -> the others get a normal day).
        """
        resultado = self.registrar_dia(id_principal, medicoes, simular_anomalia, ambiente, ao_vivo=ao_vivo)
        outros: List[Dict[str, Any]] = []
        for a in self.get_astronauts():
            if a["id_astronauta"] == id_principal:
                continue
            try:
                r = self.registrar_dia(a["id_astronauta"], None, simular_anomalia if medicoes is None else False, ambiente, ao_vivo=ao_vivo)
                triagem = r["analise"]["payload_compacto"]["triagem_python"]
                outros.append({
                    "id_astronauta": a["id_astronauta"], "nome": a["nome"], "dia_registrado": r["dia_registrado"],
                    "cenario_simulado": r["cenario_simulado"], "codigo_semaforo": triagem["codigo_semaforo"],
                })
            except (ValueError, RuntimeError) as e:
                outros.append({"id_astronauta": a["id_astronauta"], "nome": a["nome"], "erro": str(e)})
        resultado["tripulacao"] = outros
        return resultado

    def _virar_dia(self, sessao: Dict[str, Any], vivido: bool = True) -> tuple:
        """Closes the last day (final wear and, if lived live, the 24 readings) and opens the next one at 00:00."""
        id_ast = sessao["id_astronauta"]
        self._fechamentos[id_ast] = {"dia": sessao["dia"], "desgaste": sessao["integrador"].desgaste}
        if vivido:
            self._persistido["dias_vividos"].setdefault(id_ast, {})[str(sessao["dia"])] = sessao["pontos"]
        proximo = sessao["dia"] + 1
        tripulacao: List[Dict[str, Any]] = []
        registrado = False
        if proximo > self._ultimo_dia(id_ast):
            tripulacao = self.registrar_tripulacao(id_ast, None, False, ao_vivo=True)["tripulacao"]
            registrado = True
        self._sessoes.pop(id_ast, None)
        nova = self._sessao_ao_vivo(id_ast)
        return nova, {"de": sessao["dia"], "para": nova["dia"], "registrado": registrado, "tripulacao": tripulacao}

    def _estado(self, sessao: Dict[str, Any], virada: Optional[Dict[str, Any]] = None, historico: bool = False) -> Dict[str, Any]:
        df_ast = self._df_ast(sessao["id_astronauta"])
        plano = sessao["plano"]
        pontos = sessao["pontos"]
        atual = pontos[-1]
        hora = int(atual["hora"])
        # The coach looks at the planned schedule for the coming hours (routine), not at future readings
        tel_coach = {"pontos": pontos + plano["agenda"][hora + 1:], "inicio_sono": plano["inicio_sono"]}
        tel_coletada = {"pontos": pontos, "ambiente": plano["ambiente"]}
        return {
            "id_astronauta": sessao["id_astronauta"],
            "dia_missao": sessao["dia"],
            "ambiente": plano["ambiente"],
            "inicio_sono": plano["inicio_sono"],
            "horas_sem_sinal": [p["hora"] for p in pontos if p["sem_sinal"]],
            "picos": [p["hora"] for p in pontos if p["pico_simulado"]],
            "pontos": pontos,
            "hora": hora,
            "ponto_atual": atual,
            "ultima_leitura": atual["rotulo"],
            "horas_coletadas": len(pontos),
            "dia_completo": hora >= 23,
            "historico": historico,
            # true: new day in hour-by-hour collection; false: complete day (from the dataset or before the last one)
            "coleta_ao_vivo": not historico and self._eh_dia_novo(sessao["id_astronauta"], sessao["dia"]),
            "coach_exercicio": coach_exercicio(df_ast, sessao["dia"], hora, tel_coach),
            "exames_sugeridos": exames_sugeridos(df_ast, sessao["dia"], tel_coletada),
            "prontidao": sessao["integrador"].resultado(),
            "virada": virada,
            "nota": "SIMULATED readings generated hour by hour (smartwatch); demo thresholds (to be confirmed).",
        }

    def estado_ao_vivo(
        self,
        id_astronauta: str,
        dia_missao: int,
        desconfortos: Optional[List[Dict[str, Any]]] = None,
        contramedidas: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Dataset day or one before the last: complete. Last NEW day: resumes collection and applies the body map/chat events."""
        with self._lock_sessoes:
            ultimo = self._ultimo_dia(id_astronauta)
            if int(dia_missao) < ultimo or not self._ao_vivo_agora(id_astronauta):
                dia = self._dia_registrado(id_astronauta, int(dia_missao), desconfortos, contramedidas)
                return self._estado(dia, historico=int(dia_missao) < ultimo)
            sessao = self._sessao_ao_vivo(id_astronauta)
            if self._sincronizar_eventos(sessao, desconfortos, contramedidas):
                self._salvar_ao_vivo()
            return self._estado(sessao)

    def reiniciar_dia(
        self,
        id_astronauta: str,
        dia_missao: Optional[int] = None,
        proximo: bool = False,
        desconfortos: Optional[List[Dict[str, Any]]] = None,
        contramedidas: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Restarts the LIVE day (last recorded) at 00:00; earlier days are not reset.
        proximo=True closes the live day and opens the next one (recording it for the crew, if needed).
        """
        with self._lock_sessoes:
            ultimo = self._ultimo_dia(id_astronauta)
            if dia_missao is not None and int(dia_missao) != ultimo:
                raise ValueError(f"Only the live day ({ultimo}) can be restarted; earlier days stay as recorded.")
            if proximo:
                if self._ao_vivo_agora(id_astronauta):
                    sessao, virada = self._virar_dia(self._sessao_ao_vivo(id_astronauta))
                else:
                    sessao, virada = self._virar_dia(self._dia_registrado(id_astronauta, ultimo), vivido=False)
            elif not self._ao_vivo_agora(id_astronauta):
                raise ValueError(f"Day {ultimo} comes from the dataset: it keeps its original simulation and is not restarted.")
            else:
                sessao, virada = self._nova_sessao(id_astronauta, ultimo, None, desconfortos, contramedidas), None
                self._sessoes[id_astronauta] = sessao
            self._salvar_ao_vivo()
            return self._estado(sessao, virada)

    def avancar_hora(
        self,
        id_astronauta: str,
        dia_missao: Optional[int] = None,
        desconfortos: Optional[List[Dict[str, Any]]] = None,
        contramedidas: Optional[List[Dict[str, Any]]] = None,
        pico: bool = False,
    ) -> Dict[str, Any]:
        """
        Smartwatch tick on the live day: generates only reading h+1 (continuous with h and reacting to active events),
        runs one step of the readiness integrator and returns the state. After 23:00, rolls the day over.
        """
        with self._lock_sessoes:
            ultimo = self._ultimo_dia(id_astronauta)
            if dia_missao is not None and int(dia_missao) < ultimo:
                raise ValueError(f"Day {dia_missao} is already recorded (complete); live collection happens on day {ultimo}.")
            if not self._ao_vivo_agora(id_astronauta):
                # Last day is from the dataset (complete): advancing starts the first new day at 00:00
                sessao, virada = self._virar_dia(self._dia_registrado(id_astronauta, ultimo), vivido=False)
                self._salvar_ao_vivo()
                return self._estado(sessao, virada)
            sessao = self._sessao_ao_vivo(id_astronauta)
            self._sincronizar_eventos(sessao, desconfortos, contramedidas)
            if sessao["pontos"][-1]["hora"] >= 23:
                sessao, virada = self._virar_dia(sessao)
                self._salvar_ao_vivo()
                return self._estado(sessao, virada)
            integrador = sessao["integrador"]
            leitura = gerar_proxima_leitura_horaria({
                "plano": sessao["plano"],
                "anterior": sessao["pontos"][-1],
                "desconfortos": sessao["desconfortos"],
                "contramedidas": sessao["contramedidas"],
                "desgaste_acumulado": integrador.desgaste,
                "pico": pico,
            })
            sessao["pontos"].append(leitura)
            integrador.passo(leitura, sessao["desconfortos"], sessao["contramedidas"])
            self._salvar_ao_vivo()
            return self._estado(sessao)


    # ------------------------------------------------------------------
    # Recording a new day (manual or simulated) and persisting it to the dataset
    # ------------------------------------------------------------------

    CENARIOS_ANOMALIA = [
        "sono_isolamento",
        "sans_neuro_ocular",
        "febre_infeccao",
        "hipertensao",
        "sedentarismo",
        "tempestade_solar",
    ]

    def _simular_medicoes(self, ultimo: pd.Series, dose_diaria: float, anomalia: bool) -> tuple:
        """Generates plausible measurements around the baseline. With anomaly, applies an alert scenario."""
        r = random.Random()
        m = {
            "pa_sistolica": int(round(float(ultimo["base_pa_sistolica"]) + r.uniform(-5, 5))),
            "pa_diastolica": int(round(float(ultimo["base_pa_diastolica"]) + r.uniform(-4, 4))),
            "fc_repouso": int(round(float(ultimo["base_fc_repouso"]) + r.uniform(-4, 4))),
            "glicemia_mg_dl": int(round(float(ultimo["base_glicemia"]) * r.uniform(0.95, 1.05))),
            "temperatura_c": round(float(ultimo["base_temperatura"]) + r.uniform(-0.2, 0.2), 1),
            "sono_horas": round(float(ultimo["base_sono"]) + r.uniform(-0.4, 0.4), 1),
            "humor": r.choice([4, 4, 5]),
            "treino_resistido_min": r.randint(60, 85),
            "sintoma_neuro_ocular": "Nenhum",
            "radiacao_dia_msv": round(dose_diaria * r.uniform(0.9, 1.1), 2),
        }
        cenario = None
        if anomalia:
            cenario = r.choice(self.CENARIOS_ANOMALIA)
            if cenario == "sono_isolamento":
                m["sono_horas"] = round(float(ultimo["base_sono"]) - r.uniform(2.3, 3.0), 1)
                m["humor"] = 2
            elif cenario == "sans_neuro_ocular":
                m["sintoma_neuro_ocular"] = r.choice(["Leve pressao ocular", "Visao turva"])
                m["pa_sistolica"] = int(float(ultimo["base_pa_sistolica"]) + r.randint(12, 18))
            elif cenario == "febre_infeccao":
                m["temperatura_c"] = round(r.uniform(38.2, 38.8), 1)
                m["fc_repouso"] = int(round(float(ultimo["base_fc_repouso"]) * r.uniform(1.28, 1.35)))
            elif cenario == "hipertensao":
                m["pa_sistolica"] = int(float(ultimo["base_pa_sistolica"]) + r.randint(22, 30))
                m["pa_diastolica"] = int(float(ultimo["base_pa_diastolica"]) + r.randint(10, 16))
            elif cenario == "sedentarismo":
                m["treino_resistido_min"] = r.randint(5, 15)
            elif cenario == "tempestade_solar":
                m["radiacao_dia_msv"] = round(r.uniform(26, 35), 2)
        return m, cenario

    def registrar_dia(
        self,
        id_astronauta: str,
        medicoes: Optional[Dict[str, Any]] = None,
        simular_anomalia: bool = False,
        ambiente: Optional[str] = None,
        ao_vivo: bool = False,
    ) -> Dict[str, Any]:
        """
        Creates the record for (last day + 1) for the astronaut.
        ao_vivo=True: the day is flagged as NEW (hour-by-hour collection); otherwise it shows up complete, like the dataset ones.
        - medicoes given: manual record.
        - medicoes = None: automatic simulation (normal or with anomaly).
        Copies the base_* fields from the last day, computes the triage with this engine's rules,
        writes codigo_semaforo/categoria_risco/partes_afetadas and persists to the dataset file.
        """
        with self._lock:
            df_ast = self.df[self.df["id_astronauta"] == id_astronauta].sort_values("dia_missao")
            if df_ast.empty:
                raise ValueError(f"Astronaut {id_astronauta} not found in the dataset.")
            if ambiente is not None and ambiente not in AMBIENTES:
                raise ValueError(f"Invalid environment: {ambiente}. Use one of {AMBIENTES}.")

            ultimo = df_ast.iloc[-1]
            novo_dia = int(ultimo["dia_missao"]) + 1

            # Typical daily dose = median of the radiation increment over the last 7 days
            # (median so a solar storm spike does not inflate the following days)
            incrementos = df_ast["radiacao_acumulada_msv"].tail(8).diff().dropna()
            dose_diaria = float(incrementos.median()) if not incrementos.empty else 0.7

            cenario = None
            if medicoes is None:
                medicoes, cenario = self._simular_medicoes(ultimo, dose_diaria, simular_anomalia)
                origem = "simulado_anomalia" if simular_anomalia else "simulado_normal"
            else:
                medicoes = dict(medicoes)
                origem = "manual"

            dose = medicoes.pop("radiacao_dia_msv", None)
            dose = dose_diaria if dose is None else float(dose)

            nova = {c: ultimo[c] for c in ["id_astronauta", "nome", "sexo"] + list(PARES_BASE.values())}
            nova.update({
                "dia_missao": novo_dia,
                "ambiente": ambiente or str(ultimo["ambiente"]),
                "pa_sistolica": int(medicoes["pa_sistolica"]),
                "pa_diastolica": int(medicoes["pa_diastolica"]),
                "fc_repouso": int(medicoes["fc_repouso"]),
                "glicemia_mg_dl": int(medicoes["glicemia_mg_dl"]),
                "temperatura_c": float(medicoes["temperatura_c"]),
                "sono_horas": float(medicoes["sono_horas"]),
                "humor": int(medicoes["humor"]),
                "treino_resistido_min": int(medicoes["treino_resistido_min"]),
                "sintoma_neuro_ocular": str(medicoes.get("sintoma_neuro_ocular") or "Nenhum"),
                "radiacao_acumulada_msv": round(float(ultimo["radiacao_acumulada_msv"]) + dose, 2),
                "codigo_semaforo": np.nan,
                "categoria_risco": np.nan,
                "partes_afetadas": np.nan,
            })

            df_novo = pd.concat([self.df, pd.DataFrame([nova])], ignore_index=True)
            df_anterior = self.df
            self.df = df_novo
            try:
                # Triage by the engine rules (deviations from the base_* fields)
                triagem = self.analyze_day(id_astronauta, novo_dia)["triagem_motor"]
                idx = self.df.index[-1]
                self.df.loc[idx, "codigo_semaforo"] = triagem["codigo_semaforo"]
                self.df.loc[idx, "categoria_risco"] = triagem["categoria_risco"]
                self.df.loc[idx, "partes_afetadas"] = triagem["partes_afetadas"]
                self.df["codigo_semaforo"] = self.df["codigo_semaforo"].astype(int)
                self.df = self.df[df_anterior.columns]
                _gravar_base(self.df, self.csv_path)
                if ao_vivo:
                    self._marcar_dia_novo(id_astronauta, novo_dia)
            except Exception:
                self.df = df_anterior  # do not leave a half-finished record in memory
                raise

            return {
                "dia_registrado": novo_dia,
                "origem": origem,
                "cenario_simulado": cenario,
                "analise": self.analyze_day(id_astronauta, novo_dia),
            }
