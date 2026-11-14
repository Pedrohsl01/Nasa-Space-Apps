from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from grok_analyzer import analisar_com_ia
from risk_engine import SpaceHealthRiskEngine

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


@app.get("/api/astronautas")
def listar_astronautas():
    return engine.get_astronauts()


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
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
