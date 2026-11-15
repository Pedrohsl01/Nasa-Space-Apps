"""
Fluxo incremental do wearable (reiniciar -> avançar hora -> virada de dia).

Roda com:  venv\\Scripts\\python.exe test_telemetria_ao_vivo.py   (ou pytest)
Usa a base real em memória e nunca vira o ÚLTIMO dia (isso gravaria um dia novo no .xlsx).
"""
from risk_engine import SpaceHealthRiskEngine

engine = SpaceHealthRiskEngine()
AST = engine.get_astronauts()[0]
ID = AST["id_astronauta"]
DIA = AST["ultimo_dia"] - 1  # existe o dia seguinte: a virada não grava nada


def _avancar(n, **kw):
    r = None
    for _ in range(n):
        r = engine.avancar_hora(ID, DIA if r is None or r["dia_missao"] == DIA else r["dia_missao"], **kw)
    return r


def test_reiniciar_tem_so_a_leitura_das_00():
    r = engine.reiniciar_dia(ID, DIA)
    print(f"\n[reiniciar] dia {r['dia_missao']}: {r['horas_coletadas']} leitura(s), última {r['ultima_leitura']}, "
          f"base {r['prontidao']['base']['valor']} (residual {r['prontidao']['fadiga_residual']})")
    assert r["horas_coletadas"] == 1 and r["hora"] == 0 and r["pontos"][0]["hora"] == 0
    assert len(r["prontidao"]["historico_prontidao"]) == 1


def test_avancar_gera_uma_hora_por_vez_e_continua():
    engine.reiniciar_dia(ID, DIA)
    r = _avancar(7)
    assert r["hora"] == 7 and r["horas_coletadas"] == 8
    assert [p["hora"] for p in r["pontos"]] == list(range(8))
    assert len(r["prontidao"]["historico_prontidao"]) == 8
    # Continuidade: no sono (00–05) a FC não salta mais que ~12 bpm entre horas
    fcs = [p["fc_bpm"] for p in r["pontos"][:6] if p["fc_bpm"] is not None]
    saltos = [abs(a - b) for a, b in zip(fcs, fcs[1:])]
    print(f"[avançar] 00–05 FC {fcs}  maior salto {max(saltos)} bpm")
    assert max(saltos) <= 12


def test_dor_relatada_muda_as_proximas_leituras():
    engine.reiniciar_dia(ID, DIA)
    _avancar(9)
    base = engine.avancar_hora(ID, DIA)  # leitura 10 sem eventos
    engine.reiniciar_dia(ID, DIA)
    _avancar(9)
    dor = [{"hora": 9, "intensidade": 5, "nome": "Lombar", "tipo": "Dor", "regiao": "lombar"}]
    com = engine.avancar_hora(ID, DIA, desconfortos=dor)
    p0, p1 = base["ponto_atual"], com["ponto_atual"]
    print(f"[dor 5/5 às 09h] leitura 10h: FC {p0['fc_bpm']}→{p1['fc_bpm']}  estresse {p0['estresse_wearable']}→{p1['estresse_wearable']}  "
          f"aptidão {base['prontidao']['aptidao_eva']}→{com['prontidao']['aptidao_eva']} ({com['prontidao']['status_eva']})")
    assert p1["fc_bpm"] > p0["fc_bpm"] and p1["estresse_wearable"] > p0["estresse_wearable"]
    assert com["prontidao"]["status_eva"] == "INAPTO"
    assert p1["efeitos"], "a leitura explica o efeito aplicado"


def test_evento_sem_tick_so_recalcula_prontidao():
    engine.reiniciar_dia(ID, DIA)
    antes = _avancar(10)
    depois = engine.estado_ao_vivo(ID, DIA, contramedidas=[{"hora": 10, "texto": "Repouso supervisionado"}])
    assert depois["horas_coletadas"] == antes["horas_coletadas"], "não gera leitura nova"
    assert depois["pontos"] == antes["pontos"], "leituras já coletadas não mudam"
    assert depois["prontidao"]["contramedidas_consideradas"] == 1


def test_virada_apos_23h_abre_proximo_dia_as_00():
    engine.reiniciar_dia(ID, DIA)
    fim = _avancar(23)
    assert fim["hora"] == 23 and fim["dia_completo"]
    r = engine.avancar_hora(ID, DIA)
    print(f"[virada] {r['virada']}  -> dia {r['dia_missao']} {r['ultima_leitura']} ({r['horas_coletadas']} leitura), "
          f"residual {r['prontidao']['fadiga_residual']} (desgaste ao fechar {fim['prontidao']['desgaste_acumulado']})")
    assert r["virada"] == {"de": DIA, "para": DIA + 1, "registrado": False}
    assert r["dia_missao"] == DIA + 1 and r["horas_coletadas"] == 1 and r["hora"] == 0


if __name__ == "__main__":
    for nome, f in list(globals().items()):
        if nome.startswith("test_"):
            f()
    print("\nOK: fluxo incremental validado.")
