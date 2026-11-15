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

export type StatusRisco = "NORMAL" | "ATENCAO" | "CRITICO";

/** Desconforto relatado pelo astronauta numa região do corpo (salvo no navegador e enviado à IA). */
export interface RelatoDesconforto {
  regiaoId: string;
  vista: "frente" | "costas";
  nome: string;
  tipo: string;
  intensidade: number; // 1 (leve) a 5 (intensa)
  detalhe: string;
  criadoEm: string;
  hora?: number; // hora do relógio virtual (0–23) em que foi relatado; passa a pesar na prontidão a partir dela
}

// ---------------- Prontidão cumulativa (POST /api/prontidao) ----------------
export interface FatorProntidao {
  rotulo: string;
  pontos: number; // negativo = desconta
}

export interface PontoProntidao {
  hora: number;
  rotulo: string;
  atividade: string | null;
  estado: "sono" | "repouso" | "estresse" | "contramedida";
  prontidao: number;
  desgaste: number;
  desgaste_esforco: number;
  desgaste_carga: number;
  delta_desgaste: number;
  recuperacao_hora: number;
  penalidade_aguda: number;
  lambda_esforco: number;
  lambda_carga: number;
  semaforo_hora: number;
}

export interface ProntidaoCumulativa {
  hora: number;
  prontidao_atual: number;
  aptidao_eva: number;
  status_eva: "APTO" | "RESTRICAO" | "INAPTO";
  rotulo_eva: string;
  faixa: "apto" | "atencao" | "critico";
  base: { valor: number; fatores: FatorProntidao[] };
  desgaste_acumulado: number;
  desgaste_esforco: number;
  desgaste_carga: number;
  recuperacao_acumulada: number;
  penalidade_aguda: number;
  fatores_agudos: FatorProntidao[];
  bloqueios: { nivel: "INAPTO" | "RESTRICAO"; motivo: string }[];
  estado_atual: PontoProntidao["estado"];
  contramedidas_consideradas: number;
  desconfortos_considerados: number;
  fadiga_residual: number;
  historico_prontidao: PontoProntidao[];
  nota: string;
}

export interface OrientacaoIA {
  resumo_alerta: string;
  explicacao_fisiologica: string;
  acao_imediata_astronauta: string[];
  nivel_escalonamento: string;
  analise_ia: string;
  tags_acao: string[];
  status?: StatusRisco;
  score_risco?: number;
  fonte_analise: "groq_live" | "groq_cache" | "motor_local";
  fonte_descricao: string;
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

export interface RiscoTendencia {
  id: string;
  titulo: string;
  categoria: string;
  perigo_nasa: string;
  severidade: "emergente" | "provavel";
  evidencias: string[];
  contramedidas_preventivas: string[];
}

export interface PredicaoTendencia {
  janela_dias: number;
  inicio?: number;
  fim?: number;
  riscos: RiscoTendencia[];
  nivel: "estavel" | "observacao" | "atencao" | "dados_insuficientes";
  resumo: string;
}

export interface ExameSugerido {
  exame: string;
  motivo: string;
  procedimento: string;
  prioridade: "alta" | "media" | "baixa";
  tipo: "ausente" | "inconsistente" | "inconclusivo";
}

export interface AlertaHora {
  sinal: string;
  nivel: number;
  texto: string;
}

export interface PontoHorario {
  hora: number;
  rotulo: string;
  atividade: string;
  descricao: string;
  perfil: string;
  treino_min: number;
  treino_min_acumulado: number;
  sem_sinal: boolean;
  pico_simulado: string | null;
  esperado: Record<string, number>;
  fc_bpm: number | null;
  pa_sistolica: number | null;
  pa_diastolica: number | null;
  temperatura_c: number | null;
  spo2_pct: number | null;
  hrv_ms: number | null;
  estresse_wearable: number | null;
  semaforo_hora: number;
  partes_afetadas: string;
  alertas: AlertaHora[];
  ao_vivo?: boolean;
  lido_em?: string;
  efeitos?: string[]; // eventos que modularam esta leitura (dor, contramedida, fadiga)
}

export interface CoachExercicio {
  meta_diaria_min: number;
  concluido_min: number;
  deficit_min: number;
  progresso_dia_pct: number;
  semana_min: number;
  meta_semana_min: number;
  progresso_semana_pct: number;
  streak_dias: number;
  hora: number;
  atividade_atual: string;
  status: "meta_cumprida" | "no_caminho" | "atencao" | "critico";
  recomendacao: string;
}

export interface TelemetriaHoraria {
  id_astronauta: string;
  dia_missao: number;
  ambiente: string;
  inicio_sono: number;
  horas_sem_sinal: number[];
  picos: number[];
  pontos: PontoHorario[];
  hora: number;
  ponto_atual: PontoHorario;
  coach_exercicio: CoachExercicio;
  exames_sugeridos: ExameSugerido[];
  prontidao?: ProntidaoCumulativa;
  nota: string;
  // Fluxo ao vivo (/api/dia/reiniciar, /api/telemetria/avancar-hora, /api/telemetria/estado):
  // "pontos" traz SÓ as horas já coletadas (00:00 até "hora")
  ultima_leitura?: string;
  horas_coletadas?: number;
  dia_completo?: boolean;
  virada?: { de: number; para: number; registrado: boolean } | null;
}

export interface Analise {
  status: StatusRisco;
  score_risco: number;
  tags_acao: string[];
  resumo_tecnico: string;
  predicao_tendencia: PredicaoTendencia;
  exames_sugeridos: ExameSugerido[];
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
