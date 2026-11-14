# 🛰️ NERV Systems — Astronaut Health Monitoring System

![NASA Space Apps 2026](https://img.shields.io/badge/NASA%20Space%20Apps-2026-0B3D91?style=for-the-badge&logo=nasa)
![Status](https://img.shields.io/badge/Status-In%20Development-success?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

Sistema de monitoramento autônomo e suporte à decisão clínica desenvolvido pela equipe **NERV Systems** para o **2026 NASA Space Apps Challenge** (*Create Health Monitoring Software for Astronauts on Space Missions*).

---

## 📋 Sobre o Projeto

Em missões espaciais de longa duração — como o programa Artemis, operações em bases lunares e futuras viagens a Marte —, o atraso nas comunicações com a Terra exige que os astronautas tenham autonomia para avaliar, prevenir e tratar alterações fisiológicas e comportamentais a bordo.

O sistema da **NERV Systems** funciona como um assistente visual e analítico de saúde espacial que coleta indicadores biométricos, cruza dados com os protocolos do **Human Research Program (HRP) da NASA** e orienta a tripulação por meio de alertas intuitivos e planos de ação preventivos.

---

## 🧬 Fundamentação Científica (NASA HRP & CSA)

A arquitetura de monitoramento foi projetada para mitigar os **Cinco Riscos do Voo Espacial Humano** mapeados pela NASA:

1. **Radiação Espacial:** Acompanhamento de exposição cumulativa e riscos associados, inspirado nas pesquisas da **Agência Espacial Canadense (CSA)** e da NASA.
2. **Isolamento e Confinamento:** Monitoramento de humor, qualidade do sono e desempenho comportamental da tripulação.
3. **Distância da Terra:** Diagnóstico assistido offline com instruções simplificadas para autoexame sem dependência imediata de médicos em solo.
4. **Campos Gravitacionais Alterados:** Avaliação de adaptação cardiovascular, perda de densidade óssea, equilíbrio sensório-motor e Síndrome Neuro-ocular Associada ao Voo Espacial (SANS).
5. **Ambientes Fechados e Hostis:** Correlação entre condições ambientais da cabine/habitat e respostas imunológicas ou respiratórias.

### Indicadores Monitorados
* **Sinais Vitais & Metabólicos:** Pressão arterial, frequência cardíaca, temperatura corporal e glicemia (`mg/dL`).
* **Saúde Comportamental & Rotina:** Horas diárias de sono, fadiga cognitiva e registros de humor.
* **Exames Complementares & Ambiente:** Suporte à análise de imagens médicas (como ultrassonografia a bordo) e níveis de exposição à radiação.

---

## ✨ Funcionalidades Principais

* **🩺 Painel Visual & Mapeamento Corporal Interativo:** Interface gráfica que permite inspecionar sistemas do corpo humano, visualizar funções fisiológicas e identificar rapidamente áreas sob risco.
* **🚦 Código de Cores e Triagem Inteligente:** Classificação imediata dos indicadores em níveis de status (*Normal*, *Atenção* e *Crítico*) para leitura rápida em situações de alta carga cognitiva.
* **📈 Análise Temporal e Gráficos Dinâmicos:** Acompanhamento da evolução histórica dos biomarcadores ao longo da missão para detecção precoce de tendências.
* **📖 Guias de Autoavaliação e Contramedidas:** Instruções passo a passo sobre como realizar medições a bordo, por que cada exame é necessário e quais ações preventivas adotar.
* **🚀 Adaptação Multi-Ambiente & Engajamento:** Perfis configuráveis para espaçonaves em trânsito, estações orbitais, rovers ou bases planetárias, com lembretes de rotina e gamificação para adesão aos protocolos de saúde.

---

## 📂 Estrutura do Repositório

```text
├── assets/
│   └── style.css          # Estilização e identidade visual da interface
├── notebooks/
│   └── EDA.ipynb          # Análise Exploratória de Dados (EDA) e validação dos indicadores de saúde
├── src/                   # Código-fonte da aplicação e lógica de monitoramento
└── README.md              # Documentação do projeto
