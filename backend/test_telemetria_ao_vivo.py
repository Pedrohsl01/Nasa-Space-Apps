"""
Live wearable flow: earlier days complete, last day collected hour by hour, day rollover
recording the whole crew and continuity after restarting the server.

Run with:  venv\\Scripts\\python.exe test_telemetria_ao_vivo.py   (or pytest)
Works on a temporary COPY of the dataset: the project's .xlsx is not changed.
"""
import os
import shutil
import tempfile

from risk_engine import BASE_PADRAO, SpaceHealthRiskEngine

PASTA = tempfile.mkdtemp(prefix="astrohealth_teste_")
BASE = os.path.join(PASTA, os.path.basename(BASE_PADRAO))
shutil.copy(BASE_PADRAO, BASE)
ARQ = os.path.join(PASTA, "telemetria_ao_vivo.json")


def _engine():
    return SpaceHealthRiskEngine(BASE, arquivo_ao_vivo=ARQ)


engine = _engine()
EQUIPE = engine.get_astronauts()
ID = EQUIPE[0]["id_astronauta"]


def _ultimo(e=None, id_ast=ID):
    return (e or engine)._ultimo_dia(id_ast)


def _avancar(n, **kw):
    r = None
    for _ in range(n):
        r = engine.avancar_hora(ID, _ultimo(), **kw)
    return r


ULTIMO_PLANILHA = _ultimo()


def test_dias_da_planilha_vem_completos_com_a_simulacao_original():
    from telemetria_horaria import gerar_dia
    for dia, historico in ((ULTIMO_PLANILHA - 1, True), (ULTIMO_PLANILHA, False)):
        r = engine.estado_ao_vivo(ID, dia)
        _, linha = engine._linha_dia(ID, dia)
        print(f"[dataset] day {dia}: {r['horas_coletadas']} readings, coleta_ao_vivo={r['coleta_ao_vivo']}")
        assert r["horas_coletadas"] == 24 and r["historico"] == historico and not r["coleta_ao_vivo"]
        assert r["pontos"] == gerar_dia(linha.to_dict())["pontos"], "same simulation as before"
    for f in (lambda: engine.avancar_hora(ID, ULTIMO_PLANILHA - 1), lambda: engine.reiniciar_dia(ID, ULTIMO_PLANILHA)):
        try:
            f()
            raise AssertionError("a dataset day cannot be reset or collected")
        except ValueError:
            pass


def test_primeiro_avanco_abre_o_dia_novo_as_00_para_a_tripulacao():
    antes = {a["id_astronauta"]: a["ultimo_dia"] for a in engine.get_astronauts()}
    r = engine.avancar_hora(ID, ULTIMO_PLANILHA)
    depois = {a["id_astronauta"]: a["ultimo_dia"] for a in engine.get_astronauts()}
    print(f"[new day] {antes} -> {depois}: day {r['dia_missao']} {r['ultima_leitura']} ({r['horas_coletadas']} reading)")
    assert r["virada"]["registrado"] and r["coleta_ao_vivo"] and r["horas_coletadas"] == 1 and r["hora"] == 0
    assert all(depois[k] == v + 1 for k, v in antes.items())
    # The last dataset day keeps the original simulation
    assert engine.estado_ao_vivo(ID, ULTIMO_PLANILHA)["horas_coletadas"] == 24


def test_avancar_gera_uma_hora_por_vez_e_continua():
    engine.reiniciar_dia(ID)
    r = _avancar(7)
    assert r["hora"] == 7 and [p["hora"] for p in r["pontos"]] == list(range(8))
    # Continuity: between two consecutive sleep hours (same activity) HR makes no unrealistic jump
    pares = [(a, b) for a, b in zip(r["pontos"], r["pontos"][1:])
             if a["perfil"] == b["perfil"] == "sono" and a["fc_bpm"] is not None and b["fc_bpm"] is not None]
    saltos = [abs(a["fc_bpm"] - b["fc_bpm"]) for a, b in pares]
    print(f"[advance] sleep: HR {[p['fc_bpm'] for p in r['pontos'] if p['perfil'] == 'sono']}  largest jump {max(saltos, default=0)} bpm")
    assert max(saltos, default=0) <= 12


def test_dor_relatada_muda_as_proximas_leituras():
    engine.reiniciar_dia(ID)
    _avancar(9)
    base = engine.avancar_hora(ID, _ultimo())
    engine.reiniciar_dia(ID)
    _avancar(9)
    dor = [{"hora": 9, "intensidade": 5, "nome": "Lombar", "tipo": "Dor", "regiao": "lombar"}]
    com = engine.avancar_hora(ID, _ultimo(), desconfortos=dor)
    p0, p1 = base["ponto_atual"], com["ponto_atual"]
    print(f"[pain 5/5 at 09h] 10h reading: HR {p0['fc_bpm']}→{p1['fc_bpm']}  stress {p0['estresse_wearable']}→{p1['estresse_wearable']}")
    assert p1["fc_bpm"] > p0["fc_bpm"] and p1["estresse_wearable"] > p0["estresse_wearable"]
    assert com["prontidao"]["status_eva"] == "INAPTO" and p1["efeitos"]


def test_evento_sem_tick_so_recalcula_prontidao():
    engine.reiniciar_dia(ID)
    antes = _avancar(10)
    depois = engine.estado_ao_vivo(ID, _ultimo(), contramedidas=[{"hora": 10, "texto": "Repouso supervisionado"}])
    assert depois["pontos"] == antes["pontos"] and depois["prontidao"]["contramedidas_consideradas"] == 1


def test_servidor_reiniciado_continua_de_onde_parou():
    engine.reiniciar_dia(ID)
    r = _avancar(5)
    outro = _engine()  # simulates restarting uvicorn
    retomado = outro.estado_ao_vivo(ID, _ultimo(outro))
    print(f"[server restart] before {r['ultima_leitura']} → after {retomado['ultima_leitura']}")
    assert retomado["hora"] == 5 and retomado["pontos"] == r["pontos"]


def test_virada_registra_o_dia_seguinte_para_a_tripulacao():
    ultimos = {a["id_astronauta"]: a["ultimo_dia"] for a in engine.get_astronauts()}
    engine.reiniciar_dia(ID)
    fim = _avancar(23)
    assert fim["hora"] == 23
    r = engine.avancar_hora(ID, ultimos[ID])
    depois = {a["id_astronauta"]: a["ultimo_dia"] for a in engine.get_astronauts()}
    print(f"[rollover] {ultimos} → {depois}; crew: {r['virada']['tripulacao']}")
    assert r["virada"]["registrado"] and r["dia_missao"] == ultimos[ID] + 1 and r["hora"] == 0
    assert all(depois[k] == v + 1 for k, v in ultimos.items()), "everyone gets the next day"
    # The day that just closed stays complete, with the readings that were lived
    fechado = engine.estado_ao_vivo(ID, ultimos[ID])
    assert fechado["historico"] and fechado["pontos"] == fim["pontos"]


def test_dia_simulado_pelo_botao_aparece_completo():
    r = engine.registrar_tripulacao(ID, simular_anomalia=True)
    dia = r["dia_registrado"]
    estado = engine.estado_ao_vivo(ID, dia)
    print(f"[simulate alert] day {dia} ({r['cenario_simulado']}): {estado['horas_coletadas']} readings, "
          f"live={estado['coleta_ao_vivo']}; crew: {[t.get('dia_registrado') for t in r['tripulacao']]}")
    assert estado["horas_coletadas"] == 24 and not estado["coleta_ao_vivo"], "a simulated day shows the complete simulation"
    # From it, the next advance opens a new live day at 00:00
    novo = engine.avancar_hora(ID, dia)
    assert novo["dia_missao"] == dia + 1 and novo["coleta_ao_vivo"] and novo["horas_coletadas"] == 1


if __name__ == "__main__":
    try:
        for nome, f in list(globals().items()):
            if nome.startswith("test_"):
                f()
        print("\nOK: live flow validated.")
    finally:
        shutil.rmtree(PASTA, ignore_errors=True)
