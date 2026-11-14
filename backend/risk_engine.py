import os
import random
import threading
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

# Base de dados oficial do projeto: data/astronaut_health_data_ok.xlsx (na raiz do projeto).
# Caminho calculado a partir deste arquivo, então funciona rodando o uvicorn de qualquer pasta.
# DATASET_PATH no .env permite apontar para outra base (ex.: uma cópia para testes).
RAIZ_PROJETO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_PADRAO = os.getenv(
    "DATASET_PATH",
    os.path.join(RAIZ_PROJETO, "data", "astronaut_health_data_ok.xlsx"),
)

AMBIENTES = ["Estacao Orbital", "Transito para Marte", "Base Marciana"]

# Indicadores com linha de base individual (coluna medida -> coluna base_*)
PARES_BASE = {
    "pa_sistolica": "base_pa_sistolica",
    "pa_diastolica": "base_pa_diastolica",
    "fc_repouso": "base_fc_repouso",
    "glicemia_mg_dl": "base_glicemia",
    "temperatura_c": "base_temperatura",
    "sono_horas": "base_sono",
}


def _ler_base(caminho: str) -> pd.DataFrame:
    """Lê .xlsx ou .csv conforme a extensão."""
    if caminho.lower().endswith((".xlsx", ".xls")):
        return pd.read_excel(caminho)
    return pd.read_csv(caminho)


def _gravar_base(df: pd.DataFrame, caminho: str) -> None:
    """Grava a base no mesmo formato. Falha com mensagem clara se o arquivo estiver aberto no Excel."""
    try:
        if caminho.lower().endswith((".xlsx", ".xls")):
            df.to_excel(caminho, index=False)
        else:
            df.to_csv(caminho, index=False)
    except PermissionError as e:
        raise RuntimeError(
            f"Não foi possível salvar em {os.path.basename(caminho)}. "
            "Feche o arquivo no Excel e tente de novo."
        ) from e


def _vazio(valor: Any) -> bool:
    return valor is None or (isinstance(valor, float) and np.isnan(valor)) or pd.isna(valor)


class SpaceHealthRiskEngine:
    def __init__(self, csv_path: str = BASE_PADRAO):
        self.csv_path = csv_path
        self.df = _ler_base(self.csv_path)
        self._lock = threading.Lock()

    def reload_csv(self):
        self.df = _ler_base(self.csv_path)

    def get_astronauts(self):
        resultado = []
        for (id_ast, nome, sexo), grupo in self.df.groupby(["id_astronauta", "nome", "sexo"], sort=True):
            ultimo = grupo.sort_values("dia_missao").iloc[-1]
            resultado.append({
                "id_astronauta": str(id_ast),
                "nome": str(nome),
                "sexo": str(sexo),
                "primeiro_dia": int(grupo["dia_missao"].min()),
                "ultimo_dia": int(ultimo["dia_missao"]),
                "ambiente_atual": str(ultimo["ambiente"]),
            })
        return resultado

    @staticmethod
    def desvios_base(linha: pd.Series) -> Dict[str, Any]:
        """Valor do dia, linha de base individual (base_*) e desvio absoluto/percentual."""
        saida: Dict[str, Any] = {}
        for medida, base in PARES_BASE.items():
            valor = float(linha[medida])
            ref = float(linha[base])
            saida[medida] = {
                "valor": round(valor, 2),
                "base": round(ref, 2),
                "desvio": round(valor - ref, 2),
                "desvio_pct": round(((valor - ref) / ref) * 100, 1) if ref else None,
            }
        # Sem coluna base_*: referência fixa do projeto (meta de treino) ou só o valor
        saida["treino_resistido_min"] = {
            "valor": int(linha["treino_resistido_min"]),
            "base": 60,
            "desvio": int(linha["treino_resistido_min"]) - 60,
            "desvio_pct": round(((int(linha["treino_resistido_min"]) - 60) / 60) * 100, 1),
        }
        saida["humor"] = {"valor": int(linha["humor"]), "base": None, "desvio": None, "desvio_pct": None}
        saida["radiacao_acumulada_msv"] = {
            "valor": round(float(linha["radiacao_acumulada_msv"]), 2),
            "base": None, "desvio": None, "desvio_pct": None,
        }
        saida["sintoma_neuro_ocular"] = str(linha["sintoma_neuro_ocular"])
        return saida

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

        triagem_motor = {
            "codigo_semaforo": int(np.max(severidades)),
            "categoria_risco": ";".join(categorias) if categorias else "Nominal",
            "partes_afetadas": ";".join(partes) if partes else "nenhuma",
        }

        # Fonte da verdade: as colunas do dataset. Se o dia ainda não tem triagem (registro novo), usa a do motor.
        if all(not _vazio(atual.get(c)) for c in ("codigo_semaforo", "categoria_risco", "partes_afetadas")):
            codigo_semaforo = int(atual["codigo_semaforo"])
            categoria_risco = str(atual["categoria_risco"])
            partes_afetadas = str(atual["partes_afetadas"])
        else:
            codigo_semaforo = triagem_motor["codigo_semaforo"]
            categoria_risco = triagem_motor["categoria_risco"]
            partes_afetadas = triagem_motor["partes_afetadas"]

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

        # Série dos últimos 7 dias com todos os indicadores e suas bases (gráfico de tendência)
        colunas_7d = ["dia_missao", "humor", "treino_resistido_min", "radiacao_acumulada_msv"] + [
            c for par in PARES_BASE.items() for c in par
        ]
        serie_7d = janela_7d[colunas_7d].to_dict(orient="records")

        return {
            "payload_compacto": payload_compacto,
            "serie_14_dias": serie_14d,
            "serie_7_dias": serie_7d,
            "medias_7_dias": media_7d,
            "telemetria_dia": self.desvios_base(atual),
            "triagem_motor": triagem_motor,
        }

    # ------------------------------------------------------------------
    # Registro de um novo dia (manual ou simulado) e persistência na base
    # ------------------------------------------------------------------

    CENARIOS_ANOMALIA = [
        "sono_isolamento",
        "sans_neuro_ocular",
        "febre_infeccao",
        "hipertensao",
        "sedentarismo",
        "tempestade_solar",
    ]

    def _simular_medicoes(self, ultimo: pd.Series, dose_diaria: float, anomalia: bool) -> tuple:
        """Gera medições plausíveis em torno da linha de base. Com anomalia, aplica um cenário de alerta."""
        r = random.Random()
        m = {
            "pa_sistolica": int(round(float(ultimo["base_pa_sistolica"]) + r.uniform(-5, 5))),
            "pa_diastolica": int(round(float(ultimo["base_pa_diastolica"]) + r.uniform(-4, 4))),
            "fc_repouso": int(round(float(ultimo["base_fc_repouso"]) + r.uniform(-4, 4))),
            "glicemia_mg_dl": int(round(float(ultimo["base_glicemia"]) * r.uniform(0.95, 1.05))),
            "temperatura_c": round(float(ultimo["base_temperatura"]) + r.uniform(-0.2, 0.2), 1),
            "sono_horas": round(float(ultimo["base_sono"]) + r.uniform(-0.4, 0.4), 1),
            "humor": r.choice([4, 4, 5]),
            "treino_resistido_min": r.randint(60, 85),
            "sintoma_neuro_ocular": "Nenhum",
            "radiacao_dia_msv": round(dose_diaria * r.uniform(0.9, 1.1), 2),
        }
        cenario = None
        if anomalia:
            cenario = r.choice(self.CENARIOS_ANOMALIA)
            if cenario == "sono_isolamento":
                m["sono_horas"] = round(float(ultimo["base_sono"]) - r.uniform(2.3, 3.0), 1)
                m["humor"] = 2
            elif cenario == "sans_neuro_ocular":
                m["sintoma_neuro_ocular"] = r.choice(["Leve pressao ocular", "Visao turva"])
                m["pa_sistolica"] = int(float(ultimo["base_pa_sistolica"]) + r.randint(12, 18))
            elif cenario == "febre_infeccao":
                m["temperatura_c"] = round(r.uniform(38.2, 38.8), 1)
                m["fc_repouso"] = int(round(float(ultimo["base_fc_repouso"]) * r.uniform(1.28, 1.35)))
            elif cenario == "hipertensao":
                m["pa_sistolica"] = int(float(ultimo["base_pa_sistolica"]) + r.randint(22, 30))
                m["pa_diastolica"] = int(float(ultimo["base_pa_diastolica"]) + r.randint(10, 16))
            elif cenario == "sedentarismo":
                m["treino_resistido_min"] = r.randint(5, 15)
            elif cenario == "tempestade_solar":
                m["radiacao_dia_msv"] = round(r.uniform(26, 35), 2)
        return m, cenario

    def registrar_dia(
        self,
        id_astronauta: str,
        medicoes: Optional[Dict[str, Any]] = None,
        simular_anomalia: bool = False,
        ambiente: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Cria o registro de (último dia + 1) para o astronauta.
        - medicoes informado: registro manual.
        - medicoes = None: simulação automática (normal ou com anomalia).
        Copia os campos base_* do último dia, calcula a triagem com as regras deste motor,
        grava codigo_semaforo/categoria_risco/partes_afetadas e persiste no arquivo da base.
        """
        with self._lock:
            df_ast = self.df[self.df["id_astronauta"] == id_astronauta].sort_values("dia_missao")
            if df_ast.empty:
                raise ValueError(f"Astronauta {id_astronauta} não encontrado na base.")
            if ambiente is not None and ambiente not in AMBIENTES:
                raise ValueError(f"Ambiente inválido: {ambiente}. Use um de {AMBIENTES}.")

            ultimo = df_ast.iloc[-1]
            novo_dia = int(ultimo["dia_missao"]) + 1

            # Dose diária típica = mediana do incremento de radiação nos últimos 7 dias
            # (mediana para um pico de tempestade solar não inflar os dias seguintes)
            incrementos = df_ast["radiacao_acumulada_msv"].tail(8).diff().dropna()
            dose_diaria = float(incrementos.median()) if not incrementos.empty else 0.7

            cenario = None
            if medicoes is None:
                medicoes, cenario = self._simular_medicoes(ultimo, dose_diaria, simular_anomalia)
                origem = "simulado_anomalia" if simular_anomalia else "simulado_normal"
            else:
                medicoes = dict(medicoes)
                origem = "manual"

            dose = medicoes.pop("radiacao_dia_msv", None)
            dose = dose_diaria if dose is None else float(dose)

            nova = {c: ultimo[c] for c in ["id_astronauta", "nome", "sexo"] + list(PARES_BASE.values())}
            nova.update({
                "dia_missao": novo_dia,
                "ambiente": ambiente or str(ultimo["ambiente"]),
                "pa_sistolica": int(medicoes["pa_sistolica"]),
                "pa_diastolica": int(medicoes["pa_diastolica"]),
                "fc_repouso": int(medicoes["fc_repouso"]),
                "glicemia_mg_dl": int(medicoes["glicemia_mg_dl"]),
                "temperatura_c": float(medicoes["temperatura_c"]),
                "sono_horas": float(medicoes["sono_horas"]),
                "humor": int(medicoes["humor"]),
                "treino_resistido_min": int(medicoes["treino_resistido_min"]),
                "sintoma_neuro_ocular": str(medicoes.get("sintoma_neuro_ocular") or "Nenhum"),
                "radiacao_acumulada_msv": round(float(ultimo["radiacao_acumulada_msv"]) + dose, 2),
                "codigo_semaforo": np.nan,
                "categoria_risco": np.nan,
                "partes_afetadas": np.nan,
            })

            df_novo = pd.concat([self.df, pd.DataFrame([nova])], ignore_index=True)
            df_anterior = self.df
            self.df = df_novo
            try:
                # Triagem pelas regras do motor (desvios em relação aos campos base_*)
                triagem = self.analyze_day(id_astronauta, novo_dia)["triagem_motor"]
                idx = self.df.index[-1]
                self.df.loc[idx, "codigo_semaforo"] = triagem["codigo_semaforo"]
                self.df.loc[idx, "categoria_risco"] = triagem["categoria_risco"]
                self.df.loc[idx, "partes_afetadas"] = triagem["partes_afetadas"]
                self.df["codigo_semaforo"] = self.df["codigo_semaforo"].astype(int)
                self.df = self.df[df_anterior.columns]
                _gravar_base(self.df, self.csv_path)
            except Exception:
                self.df = df_anterior  # não deixa o registro pela metade na memória
                raise

            return {
                "dia_registrado": novo_dia,
                "origem": origem,
                "cenario_simulado": cenario,
                "analise": self.analyze_day(id_astronauta, novo_dia),
            }
