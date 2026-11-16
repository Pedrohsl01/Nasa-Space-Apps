from typing import List, Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# groq_analyzer first: it loads .env (GROQ_API_KEY, DATASET_PATH) before the engine reads the dataset
from groq_analyzer import analisar_com_ia, obter_uso_groq
from risk_engine import AMBIENTES, SpaceHealthRiskEngine

app = FastAPI(title="AstroHealth Copilot API - NASA Space Apps")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = SpaceHealthRiskEngine()


class Desconforto(BaseModel):
    """Symptom reported by the astronaut on a body map region."""
    regiao: str = Field(max_length=40)
    nome: str = Field(max_length=60)
    vista: Literal["frente", "costas"]
    tipo: str = Field(max_length=40)
    intensidade: int = Field(ge=1, le=5)
    detalhe: str = Field(default="", max_length=200)


class AnaliseRequest(BaseModel):
    id_astronauta: str
    dia_missao: int
    forcar_ia: bool = False
    desconfortos: List[Desconforto] = Field(default_factory=list, max_length=30)
    # Question from the Countermeasures Chat (e.g. "Validate EVA fitness"); the AI focuses its answer on it
    pergunta: Optional[str] = Field(default=None, max_length=200)


class DesconfortoHora(Desconforto):
    """Discomfort with the hour (virtual clock 0–23) it was reported at: it starts weighing from then on."""
    hora: int = Field(ge=0, le=23)


class Contramedida(BaseModel):
    """Countermeasure marked as applied in the protocol panel, at the virtual clock hour."""
    hora: int = Field(ge=0, le=23)
    texto: str = Field(default="", max_length=300)


class ProntidaoRequest(BaseModel):
    id_astronauta: str
    dia_missao: int
    hora: int = Field(default=23, ge=0, le=23)
    picos: List[int] = Field(default_factory=list, max_length=24)
    desconfortos: List[DesconfortoHora] = Field(default_factory=list, max_length=30)
    contramedidas: List[Contramedida] = Field(default_factory=list, max_length=50)


class EventosAoVivo(BaseModel):
    """Events from the body map and the day's countermeasures panel, each with the hour it happened."""
    id_astronauta: str
    dia_missao: Optional[int] = None
    desconfortos: List[DesconfortoHora] = Field(default_factory=list, max_length=30)
    contramedidas: List[Contramedida] = Field(default_factory=list, max_length=50)


class ReiniciarDiaRequest(EventosAoVivo):
    # true: closes the live day and opens the next one (00:00); false: restarts dia_missao (or the session's day) at 00:00
    proximo: bool = False


class AvancarHoraRequest(EventosAoVivo):
    # true: the generated reading carries a simulated acute spike ("Next reading with spike" button)
    pico: bool = False


class Medicoes(BaseModel):
    """Manual measurements for the day. Wide ranges only to catch typos; they are not clinical limits."""
    pa_sistolica: int = Field(ge=60, le=250)
    pa_diastolica: int = Field(ge=30, le=150)
    fc_repouso: int = Field(ge=25, le=220)
    glicemia_mg_dl: int = Field(ge=30, le=500)
    temperatura_c: float = Field(ge=33.0, le=43.0)
    sono_horas: float = Field(ge=0, le=16)
    humor: int = Field(ge=1, le=5)
    treino_resistido_min: int = Field(ge=0, le=300)
    sintoma_neuro_ocular: Literal["Nenhum", "Leve pressao ocular", "Visao turva"] = "Nenhum"
    radiacao_dia_msv: Optional[float] = Field(default=None, ge=0, le=500)


class RegistroRequest(BaseModel):
    id_astronauta: str
    # Without "medicoes": the day is simulated automatically (normal or with anomaly)
    medicoes: Optional[Medicoes] = None
    simular_anomalia: bool = False
    ambiente: Optional[str] = None


@app.get("/api/astronautas")
def listar_astronautas():
    return engine.get_astronauts()


@app.get("/api/ambientes")
def listar_ambientes():
    return AMBIENTES


@app.get("/api/uso-ia")
def uso_ia():
    """How many Groq calls were made since the server started, and the remaining limits."""
    return obter_uso_groq()


@app.get("/api/saude/{id_astronauta}/{dia_missao}")
def obter_telemetria_dia(id_astronauta: str, dia_missao: int):
    try:
        return engine.analyze_day(id_astronauta, dia_missao)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/telemetria-horaria/{id_astronauta}/{dia_missao}")
def obter_telemetria_horaria(id_astronauta: str, dia_missao: int, hora: int = 23, picos: str = "", ao_vivo: bool = False):
    """
    24 wearable points (00:00–23:00) generated from the day's record, without writing to the .xlsx.
    - hora: virtual clock hour (0–23), used by the exercise coach
    - picos: hours with a simulated acute spike, comma-separated (e.g. "14,15")
    - ao_vivo: true applies real-time micro-variations to the hour's reading (HR ±2, HRV ±3, SpO₂ ±0.3)
    """
    try:
        lista_picos = [int(h) for h in picos.split(",") if h.strip() != ""]
    except ValueError:
        raise HTTPException(status_code=400, detail="picos must be a comma-separated list of hours, e.g. 14,15")
    try:
        return engine.telemetria_horaria(id_astronauta, dia_missao, hora, lista_picos, ao_vivo)
    except ValueError as e:
        raise HTTPException(status_code=404 if "not found" in str(e) else 400, detail=str(e))


@app.post("/api/prontidao")
def calcular_prontidao(req: ProntidaoRequest):
    """
    Cumulative intraday readiness and EVA Fitness from 00:00 to `hora`:
    daily base − accumulated wear (with exponential recovery) − the hour's acute penalty,
    with body map discomforts and applied countermeasures entering at the hour they happened.
    """
    try:
        return engine.prontidao_dia(
            req.id_astronauta,
            req.dia_missao,
            req.hora,
            req.picos,
            desconfortos=[d.model_dump() for d in req.desconfortos],
            contramedidas=[c.model_dump() for c in req.contramedidas],
        )
    except ValueError as e:
        raise HTTPException(status_code=404 if "not found" in str(e) else 400, detail=str(e))


def _eventos(req: EventosAoVivo) -> dict:
    return {
        "desconfortos": [d.model_dump() for d in req.desconfortos],
        "contramedidas": [c.model_dump() for c in req.contramedidas],
    }


def _erro_ao_vivo(e: Exception) -> HTTPException:
    if isinstance(e, RuntimeError):  # e.g. dataset open in Excel when writing the next day
        return HTTPException(status_code=409, detail=str(e))
    return HTTPException(status_code=404 if "not found" in str(e) else 400, detail=str(e))


@app.post("/api/dia/reiniciar")
def reiniciar_dia(req: ReiniciarDiaRequest):
    """
    Starts an operational day at 00:00 with ONE wearable reading (the other hours are yet to be collected).
    The base readiness already accounts for the night's sleep and the residual fatigue from the previous day's close.
    proximo=true closes the current day and opens the next one (simulates and saves a normal day if it does not exist yet).
    """
    try:
        return engine.reiniciar_dia(req.id_astronauta, req.dia_missao, req.proximo, **_eventos(req))
    except (ValueError, RuntimeError) as e:
        raise _erro_ao_vivo(e)


@app.post("/api/telemetria/avancar-hora")
def avancar_hora(req: AvancarHoraRequest):
    """
    Smartwatch tick: generates and appends ONLY the next hour's reading (continuous with the previous one and reacting
    to activity, pain and countermeasures), updates the accumulated readiness and returns the state.
    After 23:00, the next tick rolls the day over ("virada" field in the response).
    """
    try:
        return engine.avancar_hora(req.id_astronauta, req.dia_missao, pico=req.pico, **_eventos(req))
    except (ValueError, RuntimeError) as e:
        raise _erro_ao_vivo(e)


@app.post("/api/telemetria/estado")
def estado_ao_vivo(req: EventosAoVivo):
    """Live state of the day (opens at 00:00 if there is no session yet) with the body map/chat events applied, without generating a reading."""
    if req.dia_missao is None:
        raise HTTPException(status_code=400, detail="dia_missao is required.")
    try:
        return engine.estado_ao_vivo(req.id_astronauta, req.dia_missao, **_eventos(req))
    except (ValueError, RuntimeError) as e:
        raise _erro_ao_vivo(e)


@app.post("/api/analisar-ia")
def executar_analise_completa(req: AnaliseRequest):
    try:
        analise_local = engine.analyze_day(req.id_astronauta, req.dia_missao)
        payload = analise_local["payload_compacto"]
        if req.desconfortos:
            # The AI cross-checks the reported subjective symptoms with the day's vital signs
            payload["relatos_desconforto"] = [
                {"regiao": d.nome, "vista": d.vista, "tipo": d.tipo, "intensidade": f"{d.intensidade}/5", "detalhe": d.detalhe}
                for d in req.desconfortos
            ]
        if req.pergunta and req.pergunta.strip():
            payload["pergunta_operador"] = req.pergunta.strip()
        orientacao_ia = analisar_com_ia(payload, forcar_ia=req.forcar_ia)
        return {
            **analise_local,
            "orientacao_ia": orientacao_ia,
            "uso_groq": obter_uso_groq(),
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/registrar-dia")
def registrar_dia(req: RegistroRequest):
    """
    Records the day after the astronaut's last one (dia_missao + 1):
    - with "medicoes": manual record;
    - without "medicoes": automatic simulation (simular_anomalia true/false).
    Recomputes the deviations from the base_* fields, writes the new record to the dataset
    and calls the AI (groq_analyzer) only when codigo_semaforo > 1.
    """
    try:
        # The next day is recorded for the WHOLE crew; the AI only analyzes the requested crew member
        resultado = engine.registrar_tripulacao(
            req.id_astronauta,
            medicoes=req.medicoes.model_dump() if req.medicoes else None,
            simular_anomalia=req.simular_anomalia,
            ambiente=req.ambiente,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))

    analise = resultado["analise"]
    # analisar_com_ia already answers locally (without calling Groq) when the status is 1
    orientacao_ia = analisar_com_ia(analise["payload_compacto"], forcar_ia=False)
    return {
        **analise,
        "dia_registrado": resultado["dia_registrado"],
        "origem": resultado["origem"],
        "cenario_simulado": resultado["cenario_simulado"],
        "tripulacao_registrada": resultado["tripulacao"],
        "orientacao_ia": orientacao_ia,
        "uso_groq": obter_uso_groq(),
    }
