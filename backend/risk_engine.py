import os
from typing import Any, Dict

import numpy as np
import pandas as pd

# Base de dados oficial do projeto: fica na raiz (uma pasta acima de backend/).
# Caminho calculado a partir deste arquivo, então funciona rodando o uvicorn de qualquer pasta.
BASE_PADRAO = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "astronaut_health_data_ok.xlsx",
)


def _ler_base(caminho: str) -> pd.DataFrame:
    """Lê .xlsx ou .csv conforme a extensão."""
    if caminho.lower().endswith((".xlsx", ".xls")):
        return pd.read_excel(caminho)
    return pd.read_csv(caminho)


class SpaceHealthRiskEngine:
    def __init__(self, csv_path: str = BASE_PADRAO):
        self.csv_path = csv_path
        self.df = _ler_base(self.csv_path)

    def reload_csv(self):
        self.df = _ler_base(self.csv_path)

    def get_astronauts(self):
        return (
            self.df[["id_astronauta", "nome", "sexo"]]
            .drop_duplicates()
            .to_dict(orient="records")
        )

    def analyze_day(self, id_astronauta: str, dia_missao: int) -> Dict[str, Any]:
        df_ast = self.df[self.df["id_astronauta"] == id_astronauta].sort_values("dia_missao")
        if df_ast.empty:
            raise ValueError(f"Astronauta {id_astronauta} não encontrado no CSV.")

        # Janela móvel dos últimos 7 dias (dia_missao - 6 até dia_missao)
        inicio_janela = max(1, dia_missao - 6)
        janela_7d = df_ast[
            (df_ast["dia_missao"] >= inicio_janela) & (df_ast["dia_missao"] <= dia_missao)
        ].copy()

        if janela_7d.empty or dia_missao not in janela_7d["dia_missao"].values:
            raise ValueError(f"Dia de missão {dia_missao} não encontrado para {id_astronauta}.")

        atual = janela_7d[janela_7d["dia_missao"] == dia_missao].iloc[0]

        # Médias móveis de 7 dias
        media_7d = {
            "pa_sistolica": round(float(janela_7d["pa_sistolica"].mean()), 1),
            "pa_diastolica": round(float(janela_7d["pa_diastolica"].mean()), 1),
            "fc_repouso": round(float(janela_7d["fc_repouso"].mean()), 1),
            "glicemia_mg_dl": round(float(janela_7d["glicemia_mg_dl"].mean()), 1),
            "temperatura_c": round(float(janela_7d["temperatura_c"].mean()), 2),
            "sono_horas": round(float(janela_7d["sono_horas"].mean()), 1),
            "humor": round(float(janela_7d["humor"].mean()), 1),
            "treino_resistido_min": round(float(janela_7d["treino_resistido_min"].mean()), 1),
        }

        # Variação de radiação nos últimos 7 dias
        rad_inicio = float(janela_7d["radiacao_acumulada_msv"].iloc[0])
        rad_atual = float(atual["radiacao_acumulada_msv"])
        delta_rad_7d = round(rad_atual - rad_inicio, 2)

        # Avaliação determinística por domínio clínico
        severidades = [1]
        categorias = []
        partes = []
        indicadores_alerta: Dict[str, Any] = {}

        def registrar_alerta(sev: int, cat: str, zonas: list):
            severidades.append(sev)
            if cat not in categorias:
                categorias.append(cat)
            for z in zonas:
                if z not in partes:
                    partes.append(z)

        # 1. Risco Neuro-ocular (SANS - Gravidade Alterada)
        sintoma_ocular = str(atual["sintoma_neuro_ocular"]).strip()
        if sintoma_ocular == "Visao turva":
            registrar_alerta(3, "Neuro-ocular", ["cabeca"])
            indicadores_alerta["sintoma_neuro_ocular"] = sintoma_ocular
        elif sintoma_ocular == "Leve pressao ocular":
            registrar_alerta(2, "Neuro-ocular", ["cabeca"])
            indicadores_alerta["sintoma_neuro_ocular"] = sintoma_ocular

        # 2. Risco Cardiovascular (Pressão, FC, Temperatura e Metabolismo)
        desvio_pas_dia = int(atual["pa_sistolica"]) - int(atual["base_pa_sistolica"])
        desvio_pas_7d = media_7d["pa_sistolica"] - float(atual["base_pa_sistolica"])
        if desvio_pas_dia >= 22 or int(atual["pa_sistolica"]) >= 140:
            registrar_alerta(3, "Cardiovascular", ["peito", "cabeca"])
            indicadores_alerta["pressao_arterial"] = {
                "valor_dia": f"{int(atual['pa_sistolica'])}/{int(atual['pa_diastolica'])} mmHg",
                "linha_base": f"{int(atual['base_pa_sistolica'])}/{int(atual['base_pa_diastolica'])} mmHg",
                "media_sistolica_7_dias": media_7d["pa_sistolica"],
            }
        elif desvio_pas_dia >= 12 or desvio_pas_7d >= 10:
            registrar_alerta(2, "Cardiovascular", ["peito"])
            indicadores_alerta["pressao_arterial"] = {
                "valor_dia": f"{int(atual['pa_sistolica'])}/{int(atual['pa_diastolica'])} mmHg",
                "linha_base": f"{int(atual['base_pa_sistolica'])}/{int(atual['base_pa_diastolica'])} mmHg",
                "media_sistolica_7_dias": media_7d["pa_sistolica"],
            }

        var_fc_pct = ((float(atual["fc_repouso"]) - float(atual["base_fc_repouso"])) / float(atual["base_fc_repouso"])) * 100
        if var_fc_pct >= 28:
            registrar_alerta(3, "Cardiovascular", ["peito", "pulmao"])
            indicadores_alerta["fc_repouso"] = {
                "valor_dia": int(atual["fc_repouso"]),
                "linha_base": int(atual["base_fc_repouso"]),
                "media_ultimos_7_dias": media_7d["fc_repouso"],
                "variacao_dia": f"+{round(var_fc_pct, 1)}%",
            }
        elif var_fc_pct >= 15:
            registrar_alerta(2, "Cardiovascular", ["peito"])
            indicadores_alerta["fc_repouso"] = {
                "valor_dia": int(atual["fc_repouso"]),
                "linha_base": int(atual["base_fc_repouso"]),
                "media_ultimos_7_dias": media_7d["fc_repouso"],
                "variacao_dia": f"+{round(var_fc_pct, 1)}%",
            }

        # Temperatura & Glicemia (Resposta Imune / Metabólica em Ambiente Fechado)
        temp_atual = float(atual["temperatura_c"])
        if temp_atual >= 38.1:
            registrar_alerta(3, "Cardiovascular", ["peito", "pele"])
            indicadores_alerta["temperatura_c"] = {
                "valor_dia": temp_atual,
                "linha_base": float(atual["base_temperatura"]),
                "media_ultimos_7_dias": media_7d["temperatura_c"],
            }
        elif temp_atual >= 37.5:
            registrar_alerta(2, "Cardiovascular", ["pele"])
            indicadores_alerta["temperatura_c"] = {
                "valor_dia": temp_atual,
                "linha_base": float(atual["base_temperatura"]),
                "media_ultimos_7_dias": media_7d["temperatura_c"],
            }

        var_glic_pct = ((float(atual["glicemia_mg_dl"]) - float(atual["base_glicemia"])) / float(atual["base_glicemia"])) * 100
        if abs(var_glic_pct) >= 22:
            registrar_alerta(2 if abs(var_glic_pct) < 32 else 3, "Cardiovascular", ["peito"])
            indicadores_alerta["glicemia_mg_dl"] = {
                "valor_dia": int(atual["glicemia_mg_dl"]),
                "linha_base": int(atual["base_glicemia"]),
                "media_ultimos_7_dias": media_7d["glicemia_mg_dl"],
                "variacao_dia": f"{round(var_glic_pct, 1)}%",
            }

        # 3. Risco Musculoesquelético (Meta NASA: ~60 min/dia de treino resistido)
        meta_treino = 60
        treino_dia = int(atual["treino_resistido_min"])
        if media_7d["treino_resistido_min"] < 30 or (treino_dia < 20 and media_7d["treino_resistido_min"] < 40):
            registrar_alerta(3, "Musculoesquelético", ["coluna", "pernas"])
            indicadores_alerta["treino_resistido_min"] = {
                "valor_dia": treino_dia,
                "linha_base_esperada": meta_treino,
                "media_ultimos_7_dias": media_7d["treino_resistido_min"],
            }
        elif media_7d["treino_resistido_min"] < 45 or treino_dia < 35:
            registrar_alerta(2, "Musculoesquelético", ["pernas"])
            indicadores_alerta["treino_resistido_min"] = {
                "valor_dia": treino_dia,
                "linha_base_esperada": meta_treino,
                "media_ultimos_7_dias": media_7d["treino_resistido_min"],
            }

        # 4. Risco Comportamental (Sono e Humor - Isolamento e Confinamento)
        base_sono = float(atual["base_sono"])
        var_sono_7d_pct = ((media_7d["sono_horas"] - base_sono) / base_sono) * 100
        humor_dia = int(atual["humor"])

        if var_sono_7d_pct <= -25 or float(atual["sono_horas"]) <= base_sono - 2.2 or humor_dia == 1:
            registrar_alerta(3, "Comportamental", ["cabeca"])
            indicadores_alerta["sono_horas"] = {
                "valor_dia": float(atual["sono_horas"]),
                "linha_base": base_sono,
                "media_ultimos_7_dias": media_7d["sono_horas"],
                "variacao_7_dias": f"{round(var_sono_7d_pct, 1)}%",
            }
            indicadores_alerta["humor"] = {"valor_dia": humor_dia, "media_ultimos_7_dias": media_7d["humor"]}
        elif var_sono_7d_pct <= -14 or float(atual["sono_horas"]) <= base_sono - 1.3 or humor_dia == 2:
            registrar_alerta(2, "Comportamental", ["cabeca"])
            indicadores_alerta["sono_horas"] = {
                "valor_dia": float(atual["sono_horas"]),
                "linha_base": base_sono,
                "media_ultimos_7_dias": media_7d["sono_horas"],
                "variacao_7_dias": f"{round(var_sono_7d_pct, 1)}%",
            }
            indicadores_alerta["humor"] = {"valor_dia": humor_dia, "media_ultimos_7_dias": media_7d["humor"]}

        # 5. Risco de Radiação (Dose acumulada e picos de tempestade solar)
        if rad_atual >= 650.0 or delta_rad_7d >= 25.0:
            registrar_alerta(3, "Radiação", ["pele", "peito"])
            indicadores_alerta["radiacao_acumulada_msv"] = {
                "valor_dia": round(rad_atual, 2),
                "incremento_7_dias_msv": delta_rad_7d,
            }
        elif rad_atual >= 450.0 or delta_rad_7d >= 15.0:
            registrar_alerta(2, "Radiação", ["pele"])
            indicadores_alerta["radiacao_acumulada_msv"] = {
                "valor_dia": round(rad_atual, 2),
                "incremento_7_dias_msv": delta_rad_7d,
            }

        codigo_semaforo = int(np.max(severidades))
        categoria_risco = ";".join(categorias) if categorias else "Nominal"
        partes_afetadas = ";".join(partes) if partes else "nenhuma"

        # Payload compacto exato para a IA
        payload_compacto = {
            "contexto_missao": {
                "id_astronauta": str(atual["id_astronauta"]),
                "nome": str(atual["nome"]),
                "sexo": str(atual["sexo"]),
                "dia_missao": int(atual["dia_missao"]),
                "ambiente": str(atual["ambiente"]),
            },
            "triagem_python": {
                "codigo_semaforo": codigo_semaforo,
                "categoria_risco": categoria_risco,
                "partes_afetadas": partes_afetadas,
            },
            "indicadores_em_alerta": indicadores_alerta,
            "telemetria_nominal_resumida": {
                "pa_atual": f"{int(atual['pa_sistolica'])}/{int(atual['pa_diastolica'])} mmHg (Base: {int(atual['base_pa_sistolica'])}/{int(atual['base_pa_diastolica'])})",
                "fc_repouso": f"{int(atual['fc_repouso'])} bpm (Base: {int(atual['base_fc_repouso'])})",
                "glicemia_mg_dl": int(atual["glicemia_mg_dl"]),
                "temperatura_c": float(atual["temperatura_c"]),
                "humor": int(atual["humor"]),
                "radiacao_acumulada_msv": round(rad_atual, 2),
            },
        }

        # Série dos últimos 14 dias para gráficos dinâmicos no React
        inicio_grafico = max(1, dia_missao - 13)
        serie_14d = df_ast[
            (df_ast["dia_missao"] >= inicio_grafico) & (df_ast["dia_missao"] <= dia_missao)
        ][
            [
                "dia_missao",
                "pa_sistolica",
                "base_pa_sistolica",
                "fc_repouso",
                "base_fc_repouso",
                "sono_horas",
                "base_sono",
                "treino_resistido_min",
                "temperatura_c",
                "radiacao_acumulada_msv",
                "humor",
            ]
        ].to_dict(orient="records")

        return {
            "payload_compacto": payload_compacto,
            "serie_14_dias": serie_14d,
            "medias_7_dias": media_7d,
        }
