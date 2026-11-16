import hashlib
import json
import os
import threading
from concurrent.futures import ThreadPoolExecutor, TimeoutError as TempoEsgotado
from i18n import ambiente_en, categoria_en
from typing import Any, Dict, List

from dotenv import load_dotenv
from groq import Groq

# Loads the .env from this folder, even when uvicorn runs from somewhere else
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

# Model configurable through .env. Default: the free model used by the team.
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

# Groq usage counter since the server started.
# "limites_restantes" comes from the x-ratelimit-* headers Groq itself returns with each response.
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


# AI answers already obtained, indexed by the SHA-256 of the biometric state + triage sent to the AI.
# Same state -> same key -> no new request. "Reanalyze" (forcar_ia=True) ignores the cache.
CACHE_IA: Dict[str, Dict[str, Any]] = {}
_TRAVA_CACHE = threading.Lock()

# Maximum wait for Groq before answering with the local analysis.
# The call keeps running in the background and, when it finishes, goes into the cache (the next query already comes from the AI).
TIMEOUT_IA_S = 3.5
_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="groq")


def _chave_estado(payload: Dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def _ler_limites(headers) -> Dict[str, Any]:
    """On Groq: 'requests' = requests per DAY; 'tokens' = tokens per MINUTE."""
    return {
        "requisicoes_dia_restantes": headers.get("x-ratelimit-remaining-requests"),
        "requisicoes_dia_limite": headers.get("x-ratelimit-limit-requests"),
        "tokens_minuto_restantes": headers.get("x-ratelimit-remaining-tokens"),
        "tokens_minuto_limite": headers.get("x-ratelimit-limit-tokens"),
        "reinicia_requisicoes_em": headers.get("x-ratelimit-reset-requests"),
        "reinicia_tokens_em": headers.get("x-ratelimit-reset-tokens"),
    }

SYSTEM_PROMPT = """
You are an Autonomous Aerospace Medical Copilot embedded in long-duration missions, grounded in the guidelines of the NASA Human Research Program (HRP) and the Canadian Space Agency (CSA).

Required scientific domain:
- The 5 hazards of human spaceflight: Space radiation, Isolation and confinement, Distance from Earth (communication delay of up to 20 min on Mars), Altered gravity fields and Hostile closed environments.
- Spaceflight Associated Neuro-ocular Syndrome (SANS): caused by the headward fluid shift in microgravity; countermeasures include thigh cuffs (Thigh Cuff) and daily B-complex supplementation (B-Complex).
- Bone and muscle loss (~1% per month without gravity): mitigated by daily resistance exercise (Zero T2 protocols and Spinal Health monitoring).
- Behavioral health and circadian cycle: monitored through sleep and activity patterns (ARCHeR study), mitigated by sleep hygiene with circadian lighting and growing vegetables (Space Gardening).
- Space radiation and neutrons (~30% of the dose on the ISS, continuously monitored by the CSA's autonomous CANS spectrometer): requires moving to shielded areas of the spacecraft during solar events.
- Closed environment and immunity: spaceflight stress can reactivate latent viruses and alter the microbiome.

Response rules:
0. LANGUAGE: write EVERY value of your answer in natural, professional English (en-US). The input JSON uses
   Portuguese field names and may contain Portuguese values (for example categoria_risco "Radiação" = Radiation,
   "Imunológico" = Immune, "Comportamental" = Behavioral, "Musculoesquelético" = Musculoskeletal, "Metabólico" = Metabolic;
   ambiente "Base Marciana" = Mars Base, "Transito para Marte" = Transit to Mars, "Estacao Orbital" = Orbital Station;
   "Visao turva" = blurred vision). Translate them; never answer in Portuguese. Keep the JSON keys below exactly as given.
1. Do not assume the astronaut has advanced medical knowledge; explain clearly, directly and practically.
2. Rely exclusively on the compact JSON you receive.
2b. If there are "relatos_desconforto" (symptoms reported by the astronaut by body region and intensity 1–5),
    cross-check them with the vital signs and alerts: say whether the symptom matches any measured deviation and include
    at least one specific action for each discomfort of intensity 4 or 5.
2c. If there is a "pergunta_operador" (a question asked in the Countermeasures Chat), answer it directly:
    the "resumo_alerta" must answer the question and the actions must be specific to it.
3. Answer EXCLUSIVELY with valid JSON, with no markdown or text outside the keys below:
{
  "resumo_alerta": "Short sentence summarizing the current state.",
  "explicacao_fisiologica": "Plain-language explanation of how the space environment causes this change.",
  "acao_imediata_astronauta": [
    "Practical countermeasure 1",
    "Practical countermeasure 2"
  ],
  "nivel_escalonamento": "Clear statement of whether the situation should be managed locally on board or requires a priority alert to the flight surgeons on Earth."
}
"""


# Why each category happens in space (local mode, no AI)
POR_QUE_CATEGORIA = {
    "Cardiovascular": "Without gravity, fluids move up to the chest and head and the heart adapts to a different load; blood pressure and HR above baseline point to extra cardiovascular strain.",
    "Imunológico": "Confinement, stress and radiation weaken immunity and can reactivate latent viruses; fever and a high HR suggest infection or inflammation.",
    "Radiação": "Outside Earth's protection, cosmic and solar radiation builds up: the dose is cumulative and raises the long-term risk of cancer and biological damage.",
    "Neuro-ocular": "The fluid shift toward the head raises pressure on the eye and the optic nerve (SANS), which can blur vision.",
    "Comportamental": "Isolation, confinement and an altered light cycle disrupt sleep and mood, reducing attention and performance.",
    "Musculoesquelético": "With little mechanical load, bones and muscles lose mass quickly if resistance training drops.",
    "Metabólico": "Changes in diet, sleep and activity alter glucose control in confinement.",
}


def _frases_indicadores(ind: Dict[str, Any]) -> List[str]:
    """Short 'value vs. baseline' phrases built from indicadores_em_alerta (most relevant first)."""
    f: List[str] = []
    temp = ind.get("temperatura_c")
    if isinstance(temp, dict):
        febre = float(temp.get("valor_dia", 0) or 0) >= 38.1
        f.append(f"{'fever' if febre else 'elevated temperature'} of {temp.get('valor_dia')} °C (baseline {temp.get('linha_base')} °C)")
    fc = ind.get("fc_repouso")
    if isinstance(fc, dict):
        f.append(f"resting HR {fc.get('valor_dia')} bpm ({fc.get('variacao_dia')} vs. baseline {fc.get('linha_base')})")
    pa = ind.get("pressao_arterial")
    if isinstance(pa, dict):
        f.append(f"blood pressure {pa.get('valor_dia')} (baseline {pa.get('linha_base')})")
    if isinstance(ind.get("sintoma_neuro_ocular"), str):
        f.append("blurred vision" if ind["sintoma_neuro_ocular"] == "Visao turva" else "eye pressure")
    glic = ind.get("glicemia_mg_dl")
    if isinstance(glic, dict):
        f.append(f"blood glucose {glic.get('valor_dia')} mg/dL (baseline {glic.get('linha_base')})")
    sono = ind.get("sono_horas")
    if isinstance(sono, dict):
        f.append(f"sleep of {sono.get('valor_dia')} h (baseline {sono.get('linha_base')} h)")
    rad = ind.get("radiacao_acumulada_msv")
    if isinstance(rad, dict):
        f.append(f"radiation +{rad.get('incremento_7_dias_msv')} mSv in 7 days (total {rad.get('valor_dia')} mSv)")
    humor = ind.get("humor")
    if isinstance(humor, dict):
        f.append(f"mood {humor.get('valor_dia')}/5")
    treino = ind.get("treino_resistido_min")
    if isinstance(treino, dict):
        f.append(f"average workout of {treino.get('media_ultimos_7_dias')} min/day (goal 60)")
    return f


def _gerar_fallback_offline(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Guarantees 100% autonomous operation even without internet or on nominal (Green) days."""
    triagem = payload["triagem_python"]
    semaforo = triagem["codigo_semaforo"]
    categorias = triagem["categoria_risco"]
    ambiente = payload["contexto_missao"]["ambiente"]

    if semaforo == 1:
        return {
            "resumo_alerta": "All physiological and environmental indicators are within your baseline.",
            "explicacao_fisiologica": f"Your body is keeping a stable adaptation to the environment ({ambiente_en(ambiente)}), with no significant deviations over the last 7 days.",
            "acao_imediata_astronauta": [
                "Keep the daily routine of 60 minutes of resistance training (Zero T2 protocol).",
                "Stay well hydrated and keep the daily B-complex supplementation (B-Complex)."
            ],
            "nivel_escalonamento": "Nominal operation: no corrective action or priority downlink to Earth needed."
        }

    acoes = []
    if "Neuro-ocular" in categorias:
        acoes.append("Apply thigh cuffs (Thigh Cuff) per protocol to reduce fluid in the head and check B-Complex supplementation.")
    if "Musculoesquelético" in categorias:
        acoes.append("Complete a resistance training session (Zero T2) today to limit bone density loss and protect the spine (Spinal Health).")
    if "Comportamental" in categorias:
        acoes.append("Start the circadian regulation protocol (ARCHeR study), reduce stimulation before bed and check in with the crew.")
    if "Cardiovascular" in categorias:
        acoes.append("Rest, drink 500 ml of water and repeat the blood pressure and heart rate measurement in 2 hours.")
    if "Imunológico" in categorias:
        acoes.append("Re-check temperature in 1 hour, hydrate, reinforce hygiene and look for a source of infection; preventive isolation if the fever persists.")
    if "Metabólico" in categorias:
        acoes.append("Confirm with capillary glucose, review the time of the last meal and follow the mission meal plan.")
    if "Radiação" in categorias:
        acoes.append("Check dosimetry (CANS standard) and move to the most shielded module of the spacecraft.")

    escalonamento = (
        "CRITICAL ALERT (Level 3): Immediately transmit a compressed telemetry package to the flight surgeons on Earth (accounting for signal delay) and call in the crew medical support."
        if semaforo == 3
        else "LOCAL WARNING (Level 2): Manage on board with the countermeasures above, notify the commander/crew and reassess in 24 hours."
    )

    # Summary built from the day's own data (value vs. baseline), without depending on the AI
    frases = _frases_indicadores(payload.get("indicadores_em_alerta") or {})
    nivel = "critical risk" if semaforo == 3 else "warning"
    cats = [c for c in str(categorias).split(";") if c and c != "Nominal"]
    if frases:
        texto = "; ".join(frases[:3])
        resumo = f"{texto[0].upper()}{texto[1:]}: {nivel} ({categoria_en(cats).lower()})."
    else:
        resumo = f"{'Critical alert' if semaforo == 3 else 'Warning'} in the categories: {categoria_en(cats)}."
    porques = [POR_QUE_CATEGORIA[c] for c in cats if c in POR_QUE_CATEGORIA]
    explicacao = (" ".join(porques) + " " if porques else "") + (
        f"Compared against your individual baseline over the last 7 days, in the '{ambiente_en(ambiente)}' phase."
    )

    return {
        "resumo_alerta": resumo,
        "explicacao_fisiologica": explicacao,
        "acao_imediata_astronauta": acoes or ["Repeat vital sign measurements in 1 hour and stay hydrated."],
        "nivel_escalonamento": escalonamento
    }


FONTES = {
    "groq_live": "AI Copilot (Groq {modelo} + NASA HRP/CSA protocols)",
    "groq_cache": "AI Copilot (Groq {modelo}): cached answer, no new request",
    "motor_local": "Local Autonomous Engine (Offline-First){motivo}",
}


def _finalizar(resultado: Dict[str, Any], fonte: str, payload: Dict[str, Any], motivo: str = "") -> Dict[str, Any]:
    """Adds the standardized fields: analise_ia, tags_acao, fonte_analise and fonte_descricao."""
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
    """Local actions for the reported discomforts (no AI)."""
    acoes = []
    for d in payload.get("relatos_desconforto", []):
        n = int(str(d.get("intensidade", "1")).split("/")[0])
        base = f"{d['regiao']} ({d['tipo'].lower()}, {d['intensidade']})"
        if n >= 4:
            acoes.append(f"{base}: stop any exertion involving the region, notify the crew and reassess in 1 hour.")
        else:
            acoes.append(f"{base}: log how it evolves, stretch/rest the region and reassess at the next check-in.")
    return acoes


def _analise_local(payload: Dict[str, Any], motivo: str = "") -> Dict[str, Any]:
    resultado = _gerar_fallback_offline(payload)
    # Reported discomforts go into the local analysis actions
    resultado["acao_imediata_astronauta"] = list(resultado.get("acao_imediata_astronauta", [])) + _acoes_desconforto(payload)
    resumo = payload.get("avaliacao", {}).get("resumo_tecnico")
    if resumo:
        # The local analysis uses the engine's technical summary (the day's real values); on alert, the physiological
        # "why" of each category comes first, so the crew understands the decision without the AI
        cats = [c for c in str(payload["triagem_python"]["categoria_risco"]).split(";") if c in POR_QUE_CATEGORIA]
        porques = " ".join(POR_QUE_CATEGORIA[c] for c in cats)
        resultado["explicacao_fisiologica"] = f"{porques} Today's data: {resumo}" if porques else resumo
    return _finalizar(resultado, "motor_local", payload, motivo)


def _chamar_groq(payload_compacto: Dict[str, Any], api_key: str, numero: int, chave: str) -> Dict[str, Any]:
    """Runs the call (in a thread). When done, writes to the cache, even if the original request has already given up."""
    try:
        client = Groq(api_key=api_key)
        extras: Dict[str, Any] = {}
        if GROQ_MODEL.startswith("openai/gpt-oss"):
            # gpt-oss models "think" before answering; low effort saves the free plan's 8K tokens/min limit
            extras["reasoning_effort"] = "low"
        # with_raw_response gives access to the headers with the remaining limits
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
            f"[Groq] call #{numero} OK | tokens in this call: {USO_GROQ['ultima_chamada']['tokens']} "
            f"| requests left today: {lim['requisicoes_dia_restantes']}/{lim['requisicoes_dia_limite']} "
            f"| tokens left this minute: {lim['tokens_minuto_restantes']}/{lim['tokens_minuto_limite']}",
            flush=True,
        )
        with _TRAVA_CACHE:
            CACHE_IA[chave] = resposta_json
        return resposta_json
    except Exception as e:
        USO_GROQ["falhas"] += 1
        USO_GROQ["ultima_chamada"] = {"numero": numero, "ok": False, "erro": type(e).__name__}
        print(f"[Groq] call #{numero} FAILED: {type(e).__name__}: {str(e)[:200]}", flush=True)
        raise


def analisar_com_ia(payload_compacto: Dict[str, Any], forcar_ia: bool = False) -> Dict[str, Any]:
    """
    Always answers within ~3.5 s:
      - groq_cache : same state already analyzed by the AI
      - groq_live  : Groq answered in time
      - motor_local: nominal day, no key, network error or timeout (analysis from the technical summary)
    """
    semaforo = payload_compacto["triagem_python"]["codigo_semaforo"]

    # Saves API calls when the day is nominal (Green), unless requested on demand
    # or the astronaut reported a discomfort (then it is worth having the AI cross-check symptom vs. vital signs)
    if (
        semaforo == 1
        and not forcar_ia
        and not payload_compacto.get("relatos_desconforto")
        and not payload_compacto.get("pergunta_operador")
    ):
        return _analise_local(payload_compacto)

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key or api_key in ("sua_chave_aqui", "minha_chave_aqui"):
        return _analise_local(payload_compacto, "API key not configured")

    chave = _chave_estado(payload_compacto)
    if not forcar_ia:
        with _TRAVA_CACHE:
            guardada = CACHE_IA.get(chave)
        if guardada:
            return _finalizar(guardada, "groq_cache", payload_compacto)

    USO_GROQ["chamadas"] += 1
    futuro = _EXECUTOR.submit(_chamar_groq, payload_compacto, api_key, USO_GROQ["chamadas"], chave)
    try:
        resposta = futuro.result(timeout=TIMEOUT_IA_S)
        return _finalizar(resposta, "groq_live", payload_compacto)
    except TempoEsgotado:
        # The call keeps running in the background and fills the cache when it finishes
        return _analise_local(payload_compacto, f"the AI took longer than {TIMEOUT_IA_S:g} s; its answer will be cached")
    except Exception as e:
        return _analise_local(payload_compacto, f"AI failure ({type(e).__name__})")
