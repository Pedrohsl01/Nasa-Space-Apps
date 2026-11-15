import hashlib
import json
import os
import threading
from concurrent.futures import ThreadPoolExecutor, TimeoutError as TempoEsgotado
from typing import Any, Dict

from dotenv import load_dotenv
from groq import Groq

# Carrega o .env desta pasta, mesmo rodando o uvicorn de outro lugar
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

# Modelo configurável pelo .env. Padrão: o modelo gratuito usado pela equipe.
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

# Contador de uso da Groq desde que o servidor foi iniciado.
# "limites_restantes" vem dos cabeçalhos x-ratelimit-* que a própria Groq devolve em cada resposta.
USO_GROQ: Dict[str, Any] = {
    "chamadas": 0,
    "sucessos": 0,
    "falhas": 0,
    "tokens_entrada": 0,
    "tokens_saida": 0,
    "tokens_total": 0,
    "ultima_chamada": None,
    "limites_restantes": {},
}


def obter_uso_groq() -> Dict[str, Any]:
    return USO_GROQ


# Respostas da IA já obtidas, indexadas pelo SHA-256 do estado biométrico + triagem enviados à IA.
# Mesmo estado -> mesma chave -> nenhuma requisição nova. "Reanalisar com IA" (forcar_ia=True) ignora o cache.
CACHE_IA: Dict[str, Dict[str, Any]] = {}
_TRAVA_CACHE = threading.Lock()

# Tempo máximo de espera pela Groq antes de responder com a análise local.
# A chamada continua em segundo plano e, quando termina, entra no cache (a próxima consulta já vem da IA).
TIMEOUT_IA_S = 3.5
_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="groq")


def _chave_estado(payload: Dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def _ler_limites(headers) -> Dict[str, Any]:
    """Na Groq: 'requests' = requisições por DIA; 'tokens' = tokens por MINUTO."""
    return {
        "requisicoes_dia_restantes": headers.get("x-ratelimit-remaining-requests"),
        "requisicoes_dia_limite": headers.get("x-ratelimit-limit-requests"),
        "tokens_minuto_restantes": headers.get("x-ratelimit-remaining-tokens"),
        "tokens_minuto_limite": headers.get("x-ratelimit-limit-tokens"),
        "reinicia_requisicoes_em": headers.get("x-ratelimit-reset-requests"),
        "reinicia_tokens_em": headers.get("x-ratelimit-reset-tokens"),
    }

SYSTEM_PROMPT = """
Você é um Copiloto Médico Aeroespacial Autônomo embarcado em missões de longa duração, fundamentado nas diretrizes do NASA Human Research Program (HRP) e da Agência Espacial Canadense (CSA).

Domínio científico obrigatório:
- Os 5 perigos do voo espacial humano: Radiação espacial, Isolamento e confinamento, Distância da Terra (atraso de comunicação de até 20 min em Marte), Campos gravitacionais alterados e Ambientes fechados hostis.
- Síndrome Neuro-ocular Associada ao Voo Espacial (SANS): causada pelo deslocamento cefálico de fluidos na microgravidade; contramedidas incluem uso de manguitos nas coxas (Thigh Cuff) e suplementação diária de complexo B (B-Complex).
- Perda óssea e muscular (~1% ao mês sem gravidade): mitigada por exercícios resistidos diários (protocolos Zero T2 e monitoramento de Spinal Health).
- Saúde comportamental e ciclo circadiano: monitorada via padrões de sono e atividade (estudo ARCHeR), mitigada por higiene do sono com luz circadiana e cultivo de vegetais (Space Gardening).
- Radiação espacial e nêutrons (~30% da dose na ISS, monitorada continuamente pelo espectrômetro autônomo CANS da CSA): exige deslocamento para áreas blindadas da nave em eventos solares.
- Ambiente fechado e imunidade: estresse espacial pode reativar vírus latentes e alterar o microbioma.

Regras de resposta:
1. Não presuma conhecimento médico avançado do astronauta; explique de forma clara, direta e prática.
2. Baseie-se exclusivamente no JSON compacto recebido.
2b. Se houver "relatos_desconforto" (sintomas relatados pelo próprio astronauta por região do corpo e intensidade 1–5),
    cruze-os com os sinais vitais e alertas: diga se o sintoma combina com algum desvio medido e inclua ao menos
    uma ação específica para cada desconforto de intensidade 4 ou 5.
2c. Se houver "pergunta_operador" (pergunta feita no Chat de Contramedidas), responda a ela de forma direta:
    o "resumo_alerta" deve responder à pergunta e as ações devem ser específicas para ela.
3. Responda EXCLUSIVAMENTE em JSON válido, sem markdown ou texto fora das chaves abaixo:
{
  "resumo_alerta": "Frase curta sintetizando o estado atual.",
  "explicacao_fisiologica": "Explicação didática de como o ambiente espacial causa essa alteração.",
  "acao_imediata_astronauta": [
    "Contramedida prática 1",
    "Contramedida prática 2"
  ],
  "nivel_escalonamento": "Indicação clara se o quadro deve ser gerenciado localmente a bordo ou se exige alerta prioritário aos cirurgiões de voo na Terra."
}
"""


def _gerar_fallback_offline(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Garante operação 100% autônoma mesmo sem internet ou em dias nominais (Verde)."""
    triagem = payload["triagem_python"]
    semaforo = triagem["codigo_semaforo"]
    categorias = triagem["categoria_risco"]
    ambiente = payload["contexto_missao"]["ambiente"]

    if semaforo == 1:
        return {
            "resumo_alerta": "Todos os indicadores fisiológicos e ambientais estão dentro da sua linha de base.",
            "explicacao_fisiologica": f"Seu organismo mantém adaptação estável ao ambiente ({ambiente}), sem desvios significativos nos últimos 7 dias.",
            "acao_imediata_astronauta": [
                "Manter a rotina diária de 60 minutos de treino resistido (protocolo Zero T2).",
                "Manter hidratação adequada e suplementação diária de complexo B (B-Complex)."
            ],
            "nivel_escalonamento": "Operação Nominal: Nenhuma ação corretiva ou envio prioritário à Terra necessário."
        }

    acoes = []
    if "Neuro-ocular" in categorias:
        acoes.append("Aplicar manguitos nas coxas (Thigh Cuff) conforme protocolo para reduzir fluidos na cabeça e verificar suplementação B-Complex.")
    if "Musculoesquelético" in categorias:
        acoes.append("Completar sessão de treino resistido (Zero T2) hoje para conter perda de densidade óssea e proteger a coluna (Spinal Health).")
    if "Comportamental" in categorias:
        acoes.append("Iniciar protocolo de regulação circadiana (estudo ARCHeR), reduzir estímulos antes de dormir e realizar check-in com a tripulação.")
    if "Cardiovascular" in categorias:
        acoes.append("Repousar, hidratar 500 ml de água e repetir a aferição de pressão e frequência cardíaca em 2 horas.")
    if "Imunológico" in categorias:
        acoes.append("Repetir a temperatura em 1 hora, hidratar, reforçar higiene e avaliar foco de infecção; isolamento preventivo se a febre persistir.")
    if "Metabólico" in categorias:
        acoes.append("Confirmar com glicemia capilar, revisar o horário da última refeição e seguir o plano alimentar da missão.")
    if "Radiação" in categorias:
        acoes.append("Verificar dosimetria (padrão CANS) e deslocar-se para o módulo com maior blindagem da espaçonave.")

    escalonamento = (
        "ALERTA CRÍTICO (Nível 3): Transmitir imediatamente pacote compactado de telemetria aos médicos de voo na Terra (considerando atraso de sinal) e acionar suporte médico da tripulação."
        if semaforo == 3
        else "ATENÇÃO LOCAL (Nível 2): Gerenciar a bordo com as contramedidas acima, notificar o comandante/tripulação e reavaliar em 24 horas."
    )

    return {
        "resumo_alerta": f"Alerta {'Crítico' if semaforo == 3 else 'de Atenção'} detectado nas categorias: {categorias}.",
        "explicacao_fisiologica": f"A análise determinística de 7 dias identificou desvio sustentado em relação à sua linha de base individual durante a fase '{ambiente}'.",
        "acao_imediata_astronauta": acoes or ["Repetir medições vitais em 1 hora e manter hidratação."],
        "nivel_escalonamento": escalonamento
    }


FONTES = {
    "grok_live": "Copiloto IA (Groq {modelo} + Protocolos NASA HRP/CSA)",
    "grok_cache": "Copiloto IA (Groq {modelo}) — resposta em cache, sem nova requisição",
    "motor_local": "Motor Autônomo Local (Offline-First){motivo}",
}


def _finalizar(resultado: Dict[str, Any], fonte: str, payload: Dict[str, Any], motivo: str = "") -> Dict[str, Any]:
    """Acrescenta os campos padronizados: analise_ia, tags_acao, fonte_analise e fonte_descricao."""
    avaliacao = payload.get("avaliacao", {})
    saida = dict(resultado)
    saida["analise_ia"] = " ".join(
        t for t in (saida.get("resumo_alerta", ""), saida.get("explicacao_fisiologica", "")) if t
    ).strip()
    saida["tags_acao"] = list(avaliacao.get("tags_acao", []))
    saida["status"] = avaliacao.get("status")
    saida["score_risco"] = avaliacao.get("score_risco")
    saida["fonte_analise"] = fonte
    saida["fonte_descricao"] = FONTES[fonte].format(modelo=GROQ_MODEL, motivo=f" — {motivo}" if motivo else "")
    return saida


def _acoes_desconforto(payload: Dict[str, Any]) -> list:
    """Ações locais para os desconfortos relatados (sem IA)."""
    acoes = []
    for d in payload.get("relatos_desconforto", []):
        n = int(str(d.get("intensidade", "1")).split("/")[0])
        base = f"{d['regiao']} ({d['tipo'].lower()}, {d['intensidade']})"
        if n >= 4:
            acoes.append(f"{base}: interromper esforço que envolva a região, avisar a tripulação e reavaliar em 1 hora.")
        else:
            acoes.append(f"{base}: registrar evolução, alongar/repousar a região e reavaliar no próximo check-in.")
    return acoes


def _analise_local(payload: Dict[str, Any], motivo: str = "") -> Dict[str, Any]:
    resultado = _gerar_fallback_offline(payload)
    # Desconfortos relatados entram nas ações da análise local
    resultado["acao_imediata_astronauta"] = list(resultado.get("acao_imediata_astronauta", [])) + _acoes_desconforto(payload)
    resumo = payload.get("avaliacao", {}).get("resumo_tecnico")
    if resumo:
        # A análise local usa o resumo técnico do motor (valores reais do dia)
        resultado["explicacao_fisiologica"] = resumo
    return _finalizar(resultado, "motor_local", payload, motivo)


def _chamar_groq(payload_compacto: Dict[str, Any], api_key: str, numero: int, chave: str) -> Dict[str, Any]:
    """Executa a chamada (em thread). Ao terminar, grava no cache, mesmo que o pedido original já tenha desistido."""
    try:
        client = Groq(api_key=api_key)
        extras: Dict[str, Any] = {}
        if GROQ_MODEL.startswith("openai/gpt-oss"):
            # Modelos gpt-oss "pensam" antes de responder; esforço baixo poupa o limite de 8K tokens/min do plano gratuito
            extras["reasoning_effort"] = "low"
        # with_raw_response dá acesso aos cabeçalhos com os limites restantes
        bruto = client.chat.completions.with_raw_response.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps(payload_compacto, ensure_ascii=False)},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
            max_completion_tokens=1500,
            timeout=30.0,
            **extras,
        )
        chat = bruto.parse()
        USO_GROQ["limites_restantes"] = _ler_limites(bruto.headers)
        if chat.usage:
            USO_GROQ["tokens_entrada"] += chat.usage.prompt_tokens
            USO_GROQ["tokens_saida"] += chat.usage.completion_tokens
            USO_GROQ["tokens_total"] += chat.usage.total_tokens
        resposta_json = json.loads(chat.choices[0].message.content)
        USO_GROQ["sucessos"] += 1
        USO_GROQ["ultima_chamada"] = {"numero": numero, "ok": True, "tokens": chat.usage.total_tokens if chat.usage else None}
        lim = USO_GROQ["limites_restantes"]
        print(
            f"[Groq] chamada #{numero} OK | tokens desta chamada: {USO_GROQ['ultima_chamada']['tokens']} "
            f"| requisições restantes hoje: {lim['requisicoes_dia_restantes']}/{lim['requisicoes_dia_limite']} "
            f"| tokens restantes neste minuto: {lim['tokens_minuto_restantes']}/{lim['tokens_minuto_limite']}",
            flush=True,
        )
        with _TRAVA_CACHE:
            CACHE_IA[chave] = resposta_json
        return resposta_json
    except Exception as e:
        USO_GROQ["falhas"] += 1
        USO_GROQ["ultima_chamada"] = {"numero": numero, "ok": False, "erro": type(e).__name__}
        print(f"[Groq] chamada #{numero} FALHOU: {type(e).__name__}: {str(e)[:200]}", flush=True)
        raise


def analisar_com_ia(payload_compacto: Dict[str, Any], forcar_ia: bool = False) -> Dict[str, Any]:
    """
    Sempre responde em até ~3,5 s:
      - grok_cache : mesmo estado já analisado pela IA
      - grok_live  : a Groq respondeu dentro do tempo
      - motor_local: dia nominal, sem chave, erro de rede ou tempo esgotado (análise a partir do resumo técnico)
    """
    semaforo = payload_compacto["triagem_python"]["codigo_semaforo"]

    # Economiza chamadas de API quando o dia é nominal (Verde), a menos que solicitado sob demanda
    # ou que o astronauta tenha relatado algum desconforto (aí vale a IA cruzar sintoma x sinais vitais)
    if (
        semaforo == 1
        and not forcar_ia
        and not payload_compacto.get("relatos_desconforto")
        and not payload_compacto.get("pergunta_operador")
    ):
        return _analise_local(payload_compacto)

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key or api_key in ("sua_chave_aqui", "minha_chave_aqui"):
        return _analise_local(payload_compacto, "chave da API não configurada")

    chave = _chave_estado(payload_compacto)
    if not forcar_ia:
        with _TRAVA_CACHE:
            guardada = CACHE_IA.get(chave)
        if guardada:
            return _finalizar(guardada, "grok_cache", payload_compacto)

    USO_GROQ["chamadas"] += 1
    futuro = _EXECUTOR.submit(_chamar_groq, payload_compacto, api_key, USO_GROQ["chamadas"], chave)
    try:
        resposta = futuro.result(timeout=TIMEOUT_IA_S)
        return _finalizar(resposta, "grok_live", payload_compacto)
    except TempoEsgotado:
        # A chamada segue em segundo plano e preenche o cache quando terminar
        return _analise_local(payload_compacto, f"IA demorou mais de {TIMEOUT_IA_S:g} s; a resposta dela ficará em cache")
    except Exception as e:
        return _analise_local(payload_compacto, f"falha na IA ({type(e).__name__})")
