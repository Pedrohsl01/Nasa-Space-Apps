import json
import os
from typing import Any, Dict

from dotenv import load_dotenv
from groq import Groq

# Carrega o .env desta pasta, mesmo rodando o uvicorn de outro lugar
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

# Modelo configurável pelo .env. Padrão: o modelo gratuito usado pela equipe.
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

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
        acoes.append("Repousar, hidratar 500 ml de água, repetir aferição de pressão/temperatura em 2 horas e monitorar sinais de infecção.")
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


def analisar_com_ia(payload_compacto: Dict[str, Any], forcar_ia: bool = False) -> Dict[str, Any]:
    semaforo = payload_compacto["triagem_python"]["codigo_semaforo"]

    # Economiza chamadas de API quando o dia é nominal (Verde), a menos que solicitado sob demanda
    if semaforo == 1 and not forcar_ia:
        resultado = _gerar_fallback_offline(payload_compacto)
        resultado["fonte_analise"] = "Motor Autônomo Local (Offline-First)"
        return resultado

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key or api_key in ("sua_chave_aqui", "minha_chave_aqui"):
        resultado = _gerar_fallback_offline(payload_compacto)
        resultado["fonte_analise"] = "Fallback Local (Chave API não configurada)"
        return resultado

    try:
        client = Groq(api_key=api_key)
        extras: Dict[str, Any] = {}
        if GROQ_MODEL.startswith("openai/gpt-oss"):
            # Modelos gpt-oss "pensam" antes de responder; esforço baixo poupa o limite de 8K tokens/min do plano gratuito
            extras["reasoning_effort"] = "low"
        chat = client.chat.completions.create(
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
        resposta_json = json.loads(chat.choices[0].message.content)
        resposta_json["fonte_analise"] = f"Copiloto IA (Groq {GROQ_MODEL} + Protocolos NASA HRP/CSA)"
        return resposta_json
    except Exception as e:
        # Se houver perda de conexão ou erro na API, o astronauta nunca fica sem resposta
        resultado = _gerar_fallback_offline(payload_compacto)
        resultado["fonte_analise"] = f"Fallback Offline Ativado ({type(e).__name__})"
        return resultado
