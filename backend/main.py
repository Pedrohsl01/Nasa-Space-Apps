from typing import Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# grok_analyzer primeiro: ele carrega o .env (GROQ_API_KEY, DATASET_PATH) antes do motor ler a base
from grok_analyzer import analisar_com_ia, obter_uso_groq
from risk_engine import AMBIENTES, SpaceHealthRiskEngine

app = FastAPI(title="AstroHealth Copilot API - NASA Space Apps")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = SpaceHealthRiskEngine()


class AnaliseRequest(BaseModel):
    id_astronauta: str
    dia_missao: int
    forcar_ia: bool = False


class Medicoes(BaseModel):
    """Medições manuais do dia. Faixas largas só para barrar erro de digitação, não são limites clínicos."""
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
    # Sem "medicoes": o dia é simulado automaticamente (normal ou com anomalia)
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
    """Quantas chamadas à Groq foram feitas desde que o servidor iniciou, e os limites restantes."""
    return obter_uso_groq()


@app.get("/api/saude/{id_astronauta}/{dia_missao}")
def obter_telemetria_dia(id_astronauta: str, dia_missao: int):
    try:
        return engine.analyze_day(id_astronauta, dia_missao)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/analisar-ia")
def executar_analise_completa(req: AnaliseRequest):
    try:
        analise_local = engine.analyze_day(req.id_astronauta, req.dia_missao)
        orientacao_ia = analisar_com_ia(
            analise_local["payload_compacto"],
            forcar_ia=req.forcar_ia,
        )
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
    Registra o dia seguinte ao último do astronauta (dia_missao + 1):
    - com "medicoes": registro manual;
    - sem "medicoes": simulação automática (simular_anomalia true/false).
    Recalcula os desvios em relação aos campos base_*, grava o novo registro na base
    e chama a IA (grok_analyzer) apenas quando codigo_semaforo > 1.
    """
    try:
        resultado = engine.registrar_dia(
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
    # analisar_com_ia já responde localmente (sem chamar a Groq) quando o semáforo é 1
    orientacao_ia = analisar_com_ia(analise["payload_compacto"], forcar_ia=False)
    return {
        **analise,
        "dia_registrado": resultado["dia_registrado"],
        "origem": resultado["origem"],
        "cenario_simulado": resultado["cenario_simulado"],
        "orientacao_ia": orientacao_ia,
        "uso_groq": obter_uso_groq(),
    }
