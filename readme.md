# 🛰️ NERV Systems — Astronaut Health Monitoring System

![NASA Space Apps 2026](https://img.shields.io/badge/NASA%20Space%20Apps-2026-0B3D91?style=for-the-badge&logo=nasa)
![Status](https://img.shields.io/badge/Status-In%20Development-success?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

Autonomous monitoring and clinical decision support system developed by the **NERV Systems** team for the **2026 NASA Space Apps Challenge** (*Create Health Monitoring Software for Astronauts on Space Missions*).

---

## 📋 About the Project

On long-duration space missions — such as the Artemis program, lunar base operations and future trips to Mars — the communication delay with Earth requires astronauts to have the autonomy to assess, prevent and treat physiological and behavioral changes on board.

The **NERV Systems** system works as a visual and analytical space health assistant that collects biometric indicators, cross-checks the data with the protocols of **NASA's Human Research Program (HRP)** and guides the crew through intuitive alerts and preventive action plans.

---

## 🧬 Scientific Foundation (NASA HRP & CSA)

The monitoring architecture was designed to mitigate the **Five Hazards of Human Spaceflight** mapped by NASA:

1. **Space Radiation:** Tracking of cumulative exposure and associated risks, inspired by research from the **Canadian Space Agency (CSA)** and NASA.
2. **Isolation and Confinement:** Monitoring of the crew's mood, sleep quality and behavioral performance.
3. **Distance from Earth:** Offline assisted diagnosis with simplified self-examination instructions, with no immediate dependence on doctors on the ground.
4. **Altered Gravity Fields:** Assessment of cardiovascular adaptation, bone density loss, sensorimotor balance and Spaceflight Associated Neuro-ocular Syndrome (SANS).
5. **Hostile Closed Environments:** Correlation between cabin/habitat environmental conditions and immune or respiratory responses.

### Monitored Indicators
* **Vital & Metabolic Signs:** Blood pressure, heart rate, body temperature and blood glucose (`mg/dL`).
* **Behavioral Health & Routine:** Daily sleep hours, cognitive fatigue and mood records.
* **Complementary Exams & Environment:** Support for the analysis of medical images (such as onboard ultrasound) and radiation exposure levels.

---

## ✨ Main Features

* **🩺 Visual Dashboard & Interactive Body Map:** A graphical interface that lets you inspect human body systems, view physiological functions and quickly identify areas at risk.
* **🚦 Color Code and Smart Triage:** Immediate classification of the indicators into status levels (*Normal*, *Warning* and *Critical*) for quick reading in high cognitive load situations.
* **📈 Time Analysis and Dynamic Charts:** Tracking of the historical evolution of biomarkers throughout the mission for early trend detection.
* **📖 Self-Assessment Guides and Countermeasures:** Step-by-step instructions on how to take measurements on board, why each exam is needed and which preventive actions to take.
* **🚀 Multi-Environment Adaptation & Engagement:** Configurable profiles for spacecraft in transit, orbital stations, rovers or planetary bases, with routine reminders and gamification to encourage adherence to health protocols.

---

## 📂 Repository Structure

```text
├── assets/
│   └── style.css          # Styling and visual identity of the interface
├── notebooks/
│   └── EDA.ipynb          # Exploratory Data Analysis (EDA) and validation of the health indicators
├── src/                   # Application source code and monitoring logic
└── README.md              # Project documentation
```
