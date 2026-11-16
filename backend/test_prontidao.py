"""
Validation of the cumulative readiness model (risk_engine.integrar_prontidao).

Run with:  venv\\Scripts\\python.exe test_prontidao.py   (or pytest test_prontidao.py)
Uses a synthetic "rested" day row and 24 controlled hourly points, to isolate the model.
"""
import pandas as pd

from risk_engine import integrar_prontidao

DIA_DESCANSADO = pd.Series({
    "sono_horas": 8.0, "base_sono": 8.0,
    "fc_repouso": 60, "base_fc_repouso": 60,
    "pa_sistolica": 115, "base_pa_sistolica": 115, "pa_diastolica": 75,
    "temperatura_c": 36.6, "base_temperatura": 36.6,
    "glicemia_mg_dl": 90, "base_glicemia": 90,
    "humor": 5, "sintoma_neuro_ocular": "Nenhum",
})


def _ponto(h: int, perfil: str = "repouso", **sinais) -> dict:
    esperado = {"fc_bpm": 64, "pa_sistolica": 117, "temperatura_c": 36.6, "spo2_pct": 98.0, "hrv_ms": 60, "estresse_wearable": 28}
    p = {
        "hora": h, "rotulo": f"{h:02d}:00", "atividade": perfil, "perfil": perfil, "treino_min": 0,
        "sem_sinal": False, "esperado": esperado, "semaforo_hora": 1, "alertas": [],
        "fc_bpm": 64, "pa_sistolica": 117, "pa_diastolica": 76, "temperatura_c": 36.6,
        "spo2_pct": 98.0, "hrv_ms": 60, "estresse_wearable": 28,
    }
    p.update(sinais)
    return p


def _dia(eventos=None) -> list:
    """24 h: sleep 00–05, rest for the remainder; `eventos` = {hour: dict of overrides}."""
    pontos = []
    for h in range(24):
        base = _ponto(h, "sono" if h < 6 else "repouso")
        base.update((eventos or {}).get(h, {}))
        pontos.append(base)
    return pontos


PICO_09 = {"perfil": "eva", "fc_bpm": 120, "hrv_ms": 20, "spo2_pct": 92.5, "estresse_wearable": 85, "semaforo_hora": 2,
           "alertas": [{"sinal": "spo2_pct", "nivel": 2, "texto": "SpO₂ 92.5%"}]}


def _serie(pontos, hora, **kw):
    r = integrar_prontidao(DIA_DESCANSADO, pontos, hora, **kw)
    return r, {h["hora"]: h["prontidao"] for h in r["historico_prontidao"]}


def test_cenario_1_pico_09_recupera_gradualmente():
    pontos = _dia({8: PICO_09, 9: PICO_09})
    r, s = _serie(pontos, 12)
    print(f"\n[1] 07h={s[7]}  09h={s[9]}  10h={s[10]}  12h={s[12]}  | wear 12h={r['desgaste_acumulado']}")
    assert s[7] >= 95, "a rested day starts high"
    assert s[9] < s[7] - 20, "the spike knocks readiness down at 09h"
    assert s[9] < s[10] < s[12], "climbs back hour by hour"
    assert s[12] < 95, "does not jump straight back to ~100% at 12h"
    assert s[10] - s[9] < (s[7] - s[9]) * 0.8, "10h does not recover almost everything at once"


def test_cenario_2_contramedida_acelera_mas_proporcional():
    pontos = _dia({8: PICO_09, 9: PICO_09})
    _, sem = _serie(pontos, 14)
    r, com = _serie(pontos, 14, contramedidas=[{"hora": 10, "texto": "Hydration and supervised rest"}])
    print(f"[2] 14h without countermeasure={sem[14]}  with countermeasure={com[14]}  | recovery={r['recuperacao_acumulada']}")
    assert com[14] > sem[14], "a countermeasure speeds up recovery"
    assert com[14] - sem[14] < 15, "limited bonus, does not erase the wear"
    assert com[14] < 99, "some of the day's wear still remains"
    # Many countermeasures in the same hour do not zero out severe exhaustion
    exausto = _dia({h: PICO_09 for h in range(7, 12)})
    r_base, base = _serie(exausto, 12)
    r_var, varias = _serie(exausto, 12, contramedidas=[{"hora": 12, "texto": f"p{i}"} for i in range(10)])
    alivio = r_base["desgaste_acumulado"] - r_var["desgaste_acumulado"]
    print(f"    exhaustion 07–11h: 12h without={base[12]}  with 10 countermeasures={varias[12]}  (wear −{alivio:.1f})")
    assert alivio < r_base["desgaste_acumulado"] * 0.35, "10 countermeasures do not erase exhaustion"
    assert r_var["status_eva"] == "INAPTO"


def test_cenario_3_alerta_critico_08_bloqueia_eva():
    critico = {"spo2_pct": 87.5, "fc_bpm": 82, "semaforo_hora": 3,
               "alertas": [{"sinal": "spo2_pct", "nivel": 3, "texto": "SpO₂ 87.5% (abaixo de 90%)"}]}
    r, s = _serie(_dia({8: critico}), 8)
    print(f"[3] 08h readiness={r['prontidao_atual']}  EVA fitness={r['aptidao_eva']}  status={r['status_eva']}  "
          f"wear={r['desgaste_acumulado']}  acute={r['penalidade_aguda']}")
    assert r["desgaste_acumulado"] < 25, "accumulated fatigue still low"
    assert r["status_eva"] == "INAPTO" and r["aptidao_eva"] <= 40, "immediate EVA block"


def test_dor_relatada_pesa_ao_longo_das_horas():
    pontos = _dia()
    dor = [{"hora": 9, "intensidade": 3, "nome": "Lombar", "tipo": "Dor"}]
    _, s = _serie(pontos, 15, desconfortos=dor)
    print(f"[+] pain 3/5 since 09h: 09h={s[9]}  12h={s[12]}  15h={s[15]}")
    assert s[8] > s[9] > s[12] > s[15], "unmitigated pain accumulates wear"


if __name__ == "__main__":
    for nome, f in list(globals().items()):
        if nome.startswith("test_"):
            f()
    print("\nOK: all scenarios passed.")
