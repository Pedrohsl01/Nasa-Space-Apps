// Tipos das respostas do backend FastAPI (backend/main.py)

export interface Astronauta {
  id_astronauta: string;
  nome: string;
  sexo: string;
  primeiro_dia: number;
  ultimo_dia: number;
  ambiente_atual: string;
}

export interface Desvio {
  valor: number;
  base: number | null;
  desvio: number | null;
  desvio_pct: number | null;
}

export interface TelemetriaDia {
  pa_sistolica: Desvio;
  pa_diastolica: Desvio;
  fc_repouso: Desvio;
  glicemia_mg_dl: Desvio;
  temperatura_c: Desvio;
  sono_horas: Desvio;
  treino_resistido_min: Desvio;
  humor: Desvio;
  radiacao_acumulada_msv: Desvio;
  sintoma_neuro_ocular: string;
}

export interface Triagem {
  codigo_semaforo: number;
  categoria_risco: string;
  partes_afetadas: string;
}

export interface PontoSerie {
  dia_missao: number;
  [coluna: string]: number;
}

export interface OrientacaoIA {
  resumo_alerta: string;
  explicacao_fisiologica: string;
  acao_imediata_astronauta: string[];
  nivel_escalonamento: string;
  fonte_analise: string;
}

export interface UsoGroq {
  chamadas: number;
  sucessos: number;
  falhas: number;
  tokens_total: number;
  limites_restantes: {
    requisicoes_dia_restantes?: string;
    requisicoes_dia_limite?: string;
    tokens_minuto_restantes?: string;
    tokens_minuto_limite?: string;
  };
}

export interface Analise {
  payload_compacto: {
    contexto_missao: {
      id_astronauta: string;
      nome: string;
      sexo: string;
      dia_missao: number;
      ambiente: string;
    };
    triagem_python: Triagem;
    indicadores_em_alerta: Record<string, unknown>;
  };
  serie_7_dias: PontoSerie[];
  medias_7_dias: Record<string, number>;
  telemetria_dia: TelemetriaDia;
  triagem_motor: Triagem;
  orientacao_ia: OrientacaoIA;
  uso_groq: UsoGroq;
  // Presentes só na resposta de /api/registrar-dia
  dia_registrado?: number;
  origem?: "manual" | "simulado_normal" | "simulado_anomalia";
  cenario_simulado?: string | null;
}

export interface Medicoes {
  pa_sistolica: number;
  pa_diastolica: number;
  fc_repouso: number;
  glicemia_mg_dl: number;
  temperatura_c: number;
  sono_horas: number;
  humor: number;
  treino_resistido_min: number;
  sintoma_neuro_ocular: "Nenhum" | "Leve pressao ocular" | "Visao turva";
  radiacao_dia_msv: number | null;
}
