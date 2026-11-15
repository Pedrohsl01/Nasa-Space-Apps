"""
Validação do modelo cumulativo de prontidão (risk_engine.integrar_prontidao).

Roda com:  venv\\Scripts\\python.exe test_prontidao.py   (ou pytest test_prontidao.py)
Usa uma linha de dia "descansado" sintética e 24 pontos horários controlados, para isolar o modelo.
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
    """24 h: sono 00–05, repouso no resto; `eventos` = {hora: dict de sobrescritas}."""
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
    print(f"\n[1] 07h={s[7]}  09h={s[9]}  10h={s[10]}  12h={s[12]}  | desgaste 12h={r['desgaste_acumulado']}")
    assert s[7] >= 95, "dia descansado começa alto"
    assert s[9] < s[7] - 20, "o pico derruba a prontidão às 09h"
    assert s[9] < s[10] < s[12], "volta subindo hora a hora"
    assert s[12] < 95, "não volta direto a ~100% às 12h"
    assert s[10] - s[9] < (s[7] - s[9]) * 0.8, "10h não recupera quase tudo de uma vez"


def test_cenario_2_contramedida_acelera_mas_proporcional():
    pontos = _dia({8: PICO_09, 9: PICO_09})
    _, sem = _serie(pontos, 14)
    r, com = _serie(pontos, 14, contramedidas=[{"hora": 10, "texto": "Hidratação e repouso supervisionado"}])
    print(f"[2] 14h sem contramedida={sem[14]}  com contramedida={com[14]}  | recuperação={r['recuperacao_acumulada']}")
    assert com[14] > sem[14], "contramedida acelera a recuperação"
    assert com[14] - sem[14] < 15, "bônus limitado, não apaga o desgaste"
    assert com[14] < 99, "ainda sobra desgaste do dia"
    # Muitas contramedidas na mesma hora não zeram uma exaustão severa
    exausto = _dia({h: PICO_09 for h in range(7, 12)})
    r_base, base = _serie(exausto, 12)
    r_var, varias = _serie(exausto, 12, contramedidas=[{"hora": 12, "texto": f"p{i}"} for i in range(10)])
    alivio = r_base["desgaste_acumulado"] - r_var["desgaste_acumulado"]
    print(f"    exaustão 07–11h: 12h sem={base[12]}  com 10 contramedidas={varias[12]}  (desgaste −{alivio:.1f})")
    assert alivio < r_base["desgaste_acumulado"] * 0.35, "10 contramedidas não apagam a exaustão"
    assert r_var["status_eva"] == "INAPTO"


def test_cenario_3_alerta_critico_08_bloqueia_eva():
    critico = {"spo2_pct": 87.5, "fc_bpm": 82, "semaforo_hora": 3,
               "alertas": [{"sinal": "spo2_pct", "nivel": 3, "texto": "SpO₂ 87.5% (abaixo de 90%)"}]}
    r, s = _serie(_dia({8: critico}), 8)
    print(f"[3] 08h prontidão={r['prontidao_atual']}  aptidão EVA={r['aptidao_eva']}  status={r['status_eva']}  "
          f"desgaste={r['desgaste_acumulado']}  agudo={r['penalidade_aguda']}")
    assert r["desgaste_acumulado"] < 25, "fadiga acumulada ainda baixa"
    assert r["status_eva"] == "INAPTO" and r["aptidao_eva"] <= 40, "bloqueio imediato de EVA"


def test_dor_relatada_pesa_ao_longo_das_horas():
    pontos = _dia()
    dor = [{"hora": 9, "intensidade": 3, "nome": "Lombar", "tipo": "Dor"}]
    _, s = _serie(pontos, 15, desconfortos=dor)
    print(f"[+] dor 3/5 desde 09h: 09h={s[9]}  12h={s[12]}  15h={s[15]}")
    assert s[8] > s[9] > s[12] > s[15], "dor não mitigada acumula desgaste"


if __name__ == "__main__":
    for nome, f in list(globals().items()):
        if nome.startswith("test_"):
            f()
    print("\nOK: todos os cenários passaram.")
