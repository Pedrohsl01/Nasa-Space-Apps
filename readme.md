# 🚀 Astro Health BR — Autonomous Space Health Monitoring

![NASA Space Apps Challenge 2026](https://img.shields.io/badge/NASA%20Space%20Apps-2026-0B3D91?style=for-the-badge&logo=nasa)
![Python](https://img.shields.io/badge/Backend-Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Frontend](https://img.shields.io/badge/Frontend-Vite%20%2B%20React-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![pnpm](https://img.shields.io/badge/Package%20Manager-pnpm-F69220?style=for-the-badge&logo=pnpm&logoColor=white)

Autonomous biomedical monitoring and clinical decision support system developed for the **NASA Space Apps Challenge 2026**. **Astro Health BR** is designed to operate with **onboard autonomy** and **low cognitive load**, assisting crews on long-duration missions and planetary habitats (such as Martian bases), where communication delays make real-time ground medical support unfeasible.

---

## 🧭 Overview

On missions beyond Low Earth Orbit, astronauts face severe and cumulative physiological and psychological stressors. **Astro Health BR** integrates hourly biomedical telemetry, longitudinal biomarker analysis, a deterministic risk triage engine, and AI-assisted analysis to detect early deviations and guide clinical protocols directly onboard.

### Scientific Foundation
The monitoring parameters and clinical triage rules are based on the risks mapped by the **NASA Human Research Program (HRP)** and research from the **Canadian Space Agency (CSA)**, addressing:
- **Space Radiation:** tracking cumulative exposure and correlated indicators.
- **Microgravity and Physiological Adaptation:** cardiovascular, hemodynamic, and musculoskeletal monitoring.
- **Isolation, Confinement, and Circadian Rhythm:** assessment of sleep quality, fatigue, and operational stress.

---

## ⚙️ System Architecture and Modules

The project is structured into a decoupled architecture separating the **Backend (API and Analytical Engines)** from the **Frontend (Operational Interface)**.

### 1. Backend (`backend/`)
- **`main.py`**: Entry point for the backend API, responsible for exposing telemetry, risk assessment, and clinical analysis endpoints to the frontend.
- **`risk_engine.py`**: Deterministic engine for clinical rules and physiological risk classification based on NASA/CSA operational thresholds.
- **`telemetria_horaria.py`**: Processing and ingestion of biometric time series at hourly granularity for acute anomaly detection.
- **`analise_longitudinal.py`**: Evaluation of historical trends and clinical progression of crew members across mission days.
- **`groq_analyzer.py`**: Analytical intelligence module integrated with the Groq API to synthesize alerts, correlate biomedical variables, and generate contextualized clinical recommendations.

### 2. Frontend (`frontend/`)
- Interactive web application built with **React + Vite** and managed via **pnpm**.
- Interface engineered for rapid readability under high operational workload, featuring real-time telemetry dashboards, risk indicators, longitudinal history, and mission ambient visuals (`public/video/base_marciana_loop.mp4`).

### 3. Dataset (`data/`)
- **`astronaut_health_data_ok.xlsx`**: Structured dataset of biometric measurements and physiological parameters used to feed, simulate, and validate the analytical engines.

---

## 📁 Repository Structure

```text
Nasa-Space-Apps/
├── assets/
│   └── style.css                     # Auxiliary stylesheets and visual identity
├── backend/
│   ├── analise_longitudinal.py       # Clinical progression and historical trend analysis
│   ├── groq_analyzer.py              # Groq integration for assisted clinical interpretation
│   ├── main.py                       # Backend API server and routes
│   ├── requirements.txt              # Backend Python dependencies
│   ├── risk_engine.py                # Deterministic triage and risk classification engine
│   └── telemetria_horaria.py         # Hourly biometric data processing
├── data/
│   └── astronaut_health_data_ok.xlsx # Crew biometric dataset
└── frontend/
    ├── public/
    │   ├── favicon.svg
    │   └── video/
    │       └── base_marciana_loop.mp4
    ├── src/                          # Web interface components, pages, and services
    ├── eslint.config.js
    ├── index.html
    ├── package.json
    ├── pnpm-lock.yaml
    └── pnpm-workspace.yaml
```

---

## 🚀 Running Locally

### Prerequisites
- **Python 3.10+**
- **Node.js 18+**
- **pnpm** (`npm install -g pnpm`)

### 1. Configure and Start the Backend
```bash
# Navigate to the backend directory
cd backend

# Create and activate a virtual environment
python -m venv .venv
# Linux/macOS:
source .venv/bin/activate
# Windows:
.venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set the Groq API key (if required for groq_analyzer.py)
export GROQ_API_KEY="your_api_key_here"   # Linux/macOS
# set GROQ_API_KEY="your_api_key_here"    # Windows (CMD)

# Start the backend server
python main.py
```

### 2. Configure and Start the Frontend
In a new terminal, from the project root:
```bash
# Navigate to the frontend directory
cd frontend

# Install dependencies via pnpm
pnpm install

# Start the development server
pnpm dev
```

---

## 🤖 Artificial Intelligence Transparency

In compliance with the **NASA Space Apps Challenge** guidelines:
- **At Runtime (Software):** The system uses the `backend/groq_analyzer.py` module to support the synthesis and contextual interpretation of biomedical alerts, always operating alongside the deterministic `risk_engine.py` engine.
- **During Development:** Generative AI tools were used to assist with code review, component structuring, and technical documentation drafting, with full validation by the team.

---

## 👥 Team Members — NERV Systems

- **Alexandra Silvestre de Souza da Silva**
- **Larissa Santana Silva**
- **Lucas Dutra Alves**
- **Pedro Henrique Soares Lage**
- **Rafael Baruc Silva**

---
