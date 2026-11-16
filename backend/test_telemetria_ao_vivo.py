"""
Fluxo do wearable ao vivo: dias anteriores completos, último dia coletado hora a hora, virada de dia
registrando a tripulação toda e continuidade após reiniciar o servidor.

Roda com:  venv\\Scripts\\python.exe test_telemetria_ao_vivo.py   (ou pytest)
Trabalha numa CÓPIA temporária da base: o .xlsx do projeto não é alterado.
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
        print(f"[planilha] dia {dia}: {r['horas_coletadas']} leituras, coleta_ao_vivo={r['coleta_ao_vivo']}")
        assert r["horas_coletadas"] == 24 and r["historico"] == historico and not r["coleta_ao_vivo"]
        assert r["pontos"] == gerar_dia(linha.to_dict())["pontos"], "mesma simulação de antes"
    for f in (lambda: engine.avancar_hora(ID, ULTIMO_PLANILHA - 1), lambda: engine.reiniciar_dia(ID, ULTIMO_PLANILHA)):
        try:
            f()
            raise AssertionError("dia da planilha não pode ser zerado nem coletado")
        except ValueError:
            pass


def test_primeiro_avanco_abre_o_dia_novo_as_00_para_a_tripulacao():
    antes = {a["id_astronauta"]: a["ultimo_dia"] for a in engine.get_astronauts()}
    r = engine.avancar_hora(ID, ULTIMO_PLANILHA)
    depois = {a["id_astronauta"]: a["ultimo_dia"] for a in engine.get_astronauts()}
    print(f"[dia novo] {antes} -> {depois}: dia {r['dia_missao']} {r['ultima_leitura']} ({r['horas_coletadas']} leitura)")
    assert r["virada"]["registrado"] and r["coleta_ao_vivo"] and r["horas_coletadas"] == 1 and r["hora"] == 0
    assert all(depois[k] == v + 1 for k, v in antes.items())
    # O último dia da planilha continua com a simulação original
    assert engine.estado_ao_vivo(ID, ULTIMO_PLANILHA)["horas_coletadas"] == 24


def test_avancar_gera_uma_hora_por_vez_e_continua():
    engine.reiniciar_dia(ID)
    r = _avancar(7)
    assert r["hora"] == 7 and [p["hora"] for p in r["pontos"]] == list(range(8))
    # Continuidade: entre duas horas seguidas de sono (mesma atividade) a FC não dá salto irreal
    pares = [(a, b) for a, b in zip(r["pontos"], r["pontos"][1:])
             if a["perfil"] == b["perfil"] == "sono" and a["fc_bpm"] is not None and b["fc_bpm"] is not None]
    saltos = [abs(a["fc_bpm"] - b["fc_bpm"]) for a, b in pares]
    print(f"[avançar] sono: FC {[p['fc_bpm'] for p in r['pontos'] if p['perfil'] == 'sono']}  maior salto {max(saltos, default=0)} bpm")
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
    print(f"[dor 5/5 às 09h] leitura 10h: FC {p0['fc_bpm']}→{p1['fc_bpm']}  estresse {p0['estresse_wearable']}→{p1['estresse_wearable']}")
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
    outro = _engine()  # simula reiniciar o uvicorn
    retomado = outro.estado_ao_vivo(ID, _ultimo(outro))
    print(f"[reinício do servidor] antes {r['ultima_leitura']} → depois {retomado['ultima_leitura']}")
    assert retomado["hora"] == 5 and retomado["pontos"] == r["pontos"]


def test_virada_registra_o_dia_seguinte_para_a_tripulacao():
    ultimos = {a["id_astronauta"]: a["ultimo_dia"] for a in engine.get_astronauts()}
    engine.reiniciar_dia(ID)
    fim = _avancar(23)
    assert fim["hora"] == 23
    r = engine.avancar_hora(ID, ultimos[ID])
    depois = {a["id_astronauta"]: a["ultimo_dia"] for a in engine.get_astronauts()}
    print(f"[virada] {ultimos} → {depois}; tripulação: {r['virada']['tripulacao']}")
    assert r["virada"]["registrado"] and r["dia_missao"] == ultimos[ID] + 1 and r["hora"] == 0
    assert all(depois[k] == v + 1 for k, v in ultimos.items()), "todos ganham o dia seguinte"
    # O dia que acabou de fechar fica completo, com as leituras que foram vividas
    fechado = engine.estado_ao_vivo(ID, ultimos[ID])
    assert fechado["historico"] and fechado["pontos"] == fim["pontos"]


def test_dia_simulado_pelo_botao_aparece_completo():
    r = engine.registrar_tripulacao(ID, simular_anomalia=True)
    dia = r["dia_registrado"]
    estado = engine.estado_ao_vivo(ID, dia)
    print(f"[simular alerta] dia {dia} ({r['cenario_simulado']}): {estado['horas_coletadas']} leituras, "
          f"ao vivo={estado['coleta_ao_vivo']}; tripulação: {[t.get('dia_registrado') for t in r['tripulacao']]}")
    assert estado["horas_coletadas"] == 24 and not estado["coleta_ao_vivo"], "dia simulado mostra a simulação completa"
    # A partir dele, o próximo avanço abre um dia novo ao vivo às 00:00
    novo = engine.avancar_hora(ID, dia)
    assert novo["dia_missao"] == dia + 1 and novo["coleta_ao_vivo"] and novo["horas_coletadas"] == 1


if __name__ == "__main__":
    try:
        for nome, f in list(globals().items()):
            if nome.startswith("test_"):
                f()
        print("\nOK: fluxo ao vivo validado.")
    finally:
        shutil.rmtree(PASTA, ignore_errors=True)
