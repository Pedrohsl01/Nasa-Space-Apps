# 🚀 NERV Systems — Autonomous Space Health Monitoring

![NASA Space Apps Challenge 2026](https://img.shields.io/badge/NASA%20Space%20Apps-2026-0B3D91?style=for-the-badge&logo=nasa)
![Python](https://img.shields.io/badge/Backend-Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Frontend](https://img.shields.io/badge/Frontend-Vite%20%2B%20React-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![pnpm](https://img.shields.io/badge/Package%20Manager-pnpm-F69220?style=for-the-badge&logo=pnpm&logoColor=white)

Sistema autônomo de monitoramento biomédico e suporte à decisão clínica desenvolvido para o **NASA Space Apps Challenge 2026**. O **NERV Systems** foi projetado para operar com **autonomia embarcada** e **baixa carga cognitiva**, auxiliando tripulações em missões de longa duração e habitats planetários (como bases marcianas), onde atrasos de comunicação inviabilizam o suporte médico terrestre em tempo real.

---

## 🧭 Visão Geral

Em missões além da órbita terrestre baixa, astronautas enfrentam estressores fisiológicos e psicológicos severos e cumulativos. O **NERV Systems** integra telemetria biomédica horária, análise longitudinal de biomarcadores, um motor determinístico de triagem de risco e análise assistida por IA para detectar desvios precoces e orientar condutas clínicas diretamente a bordo.

### Fundamentação Científica
Os parâmetros de monitoramento e regras de triagem clínica baseiam-se nos riscos mapeados pelo **NASA Human Research Program (HRP)** e em pesquisas da **Agência Espacial Canadense (CSA)**, contemplando:
- **Radiação Espacial:** acompanhamento de exposição cumulativa e indicadores correlatos.
- **Microgravidade e Adaptação Fisiológica:** monitoramento cardiovascular, hemodinâmico e musculoesquelético.
- **Isolamento, Confinamento e Ritmo Circadiano:** avaliação de qualidade do sono, fadiga e estresse operacional.

---

## ⚙️ Arquitetura e Módulos do Sistema

O projeto foi reestruturado em uma arquitetura desacoplada entre **Backend (API e Motores Analíticos)** e **Frontend (Interface Operacional)**.

### 1. Backend (`backend/`)
- **`main.py`**: Ponto de entrada da API backend, responsável por expor os endpoints de telemetria, avaliação de risco e análises clínicas para o frontend.
- **`risk_engine.py`**: Motor determinístico de regras clínicas e classificação de risco fisiológico baseado nos limiares operacionais da NASA/CSA.
- **`telemetria_horaria.py`**: Processamento e leitura de séries temporais biométricas em granularidade horária para detecção de anomalias agudas.
- **`analise_longitudinal.py`**: Avaliação de tendências históricas e evolução clínica dos tripulantes ao longo dos dias de missão.
- **`groq_analyzer.py`**: Módulo de inteligência analítica integrado à API do groq (xAI) para sintetizar alertas, correlacionar variáveis biomédicas e gerar recomendações clínicas contextualizadas.

### 2. Frontend (`frontend/`)
- Aplicação web interativa construída com **React + Vite** e gerenciada via **pnpm**.
- Interface projetada para leitura rápida sob alta carga operacional, apresentando painéis de telemetria em tempo real, indicadores de risco, histórico longitudinal e ambientação visual de missão (`public/video/base_marciana_loop.mp4`).

### 3. Base de Dados (`data/`)
- **`astronaut_health_data_ok.xlsx`**: Conjunto de dados biométricos e parâmetros fisiológicos estruturados utilizados para alimentação, simulação e validação dos motores de análise.

---

## 📁 Estrutura do Repositório

```text
Nasa-Space-Apps/
├── assets/
│   └── style.css                     # Estilos auxiliares e identidade visual
├── backend/
│   ├── analise_longitudinal.py       # Análise de evolução clínica e tendências históricas
│   ├── groq_analyzer.py              # Integração com groq para interpretação clínica assistida
│   ├── main.py                       # Servidor e rotas da API backend
│   ├── requirements.txt              # Dependências Python do backend
│   ├── risk_engine.py                # Motor determinístico de triagem e classificação de risco
│   └── telemetria_horaria.py         # Processamento de dados biométricos horários
├── data/
│   └── astronaut_health_data_ok.xlsx # Dataset biométrico da tripulação
└── frontend/
    ├── public/
    │   ├── favicon.svg
    │   └── video/
    │       └── base_marciana_loop.mp4
    ├── src/                          # Componentes, páginas e serviços da interface web
    ├── eslint.config.js
    ├── index.html
    ├── package.json
    ├── pnpm-lock.yaml
    └── pnpm-workspace.yaml

```

---

## 🚀 Como Executar Localmente

### Pré-requisitos

* **Python 3.10+**
* **Node.js 18+**
* **pnpm** (`npm install -g pnpm`)

### 1. Configurar e iniciar o Backend

```bash
# Acesse a pasta do backend
cd backend

# Crie e ative um ambiente virtual
python -m venv .venv
# Linux/macOS:
source .venv/bin/activate
# Windows:
.venv\Scripts\activate

# Instale as dependências
pip install -r requirements.txt

# Configure a chave de API do groq (se necessário para o groq_analyzer.py)
export groq_API_KEY="sua_chave_aqui"   # Linux/macOS
# set groq_API_KEY="sua_chave_aqui"    # Windows (CMD)

# Inicie o servidor backend
python main.py

```

### 2. Configurar e iniciar o Frontend

Em um novo terminal, a partir da raiz do projeto:

```bash
# Acesse a pasta do frontend
cd frontend

# Instale as dependências via pnpm
pnpm install

# Inicie o servidor de desenvolvimento
pnpm dev

```

---

## 🤖 Transparência sobre Uso de Inteligência Artificial

Em conformidade com as diretrizes do **NASA Space Apps Challenge**:

* **Em tempo de execução (Software):** O sistema utiliza o módulo `backend/groq_analyzer.py` para apoiar a síntese e interpretação contextual de alertas biomédicos, operando sempre em conjunto com o motor determinístico `risk_engine.py`.
* **Durante o desenvolvimento:** Ferramentas de IA generativa foram empregadas como apoio na revisão de código, estruturação de componentes e elaboração da documentação técnica, com validação integral pela equipe.

---

## 👥 Integrantes — Equipe NERV Systems

* **Alexandra Silvestre de Souza da Silva**
* **Larissa Santana Silva**
* **Lucas Dutra Alves**
* **Pedro Henrique Soares Lage**
* **Rafael Baruc Silva**

```

---
