# 🏥 AI-Powered Patient Healthcare Assistant

An integrated web-based healthcare platform that helps patients navigate the initial healthcare process — from symptom description to doctor consultation to prescription management.

> **AIH Mini-Project** | Team: Aishwarya, Umera, Pranav

---

## 🧭 Patient Journey

```
Describe Symptoms (Text / Voice in English/Indian Languages)
        ↓
AI Symptom Analysis (Google Gemini)
        ↓
Case-Study-Based Clinical Assessment (Text & Audio TTS Output)
        ↓
Specialist Recommendation
        ↓
Nearby Doctor Discovery
        ↓
Appointment Booking
        ↓
AI Consultation Summary
        ↓
Prescription Digitization & Storage
        ↓
Hospital/Doctor Portal (Doctors view patient's digitized history)
```

> ⚠️ **Disclaimer:** The AI provides a *likely* clinical assessment based on predefined medical case studies. It is a decision-support tool, **not** a replacement for a qualified medical professional.

---

## 🏗️ Architecture

```
┌─────────────────┐     REST API      ┌─────────────────┐    Internal API    ┌─────────────────┐
│                 │ ←───────────────→  │                 │ ←───────────────→  │                 │
│    Frontend     │   Port 5173       │    Backend      │   Port 8000       │   AI Service    │
│  React + Vite   │                   │  Node + Express │                   │ Python + FastAPI│
│  Tailwind CSS   │                   │    MongoDB      │                   │  Gemini API     │
│                 │                   │     JWT         │                   │  PaddleOCR      │
└─────────────────┘                   └─────────────────┘                   └─────────────────┘
     Port 5173                              Port 5000                           Port 8000
```

---

## 👥 Team & Branches

| Member      | Branch              | Module         | Key Tech                                     |
|-------------|---------------------|----------------|----------------------------------------------|
| Aishwarya   | `aishwarya/backend` | `backend/`     | Node.js, Express, MongoDB, Mongoose, JWT      |
| Umera       | `umera/ai-service`  | `ai-service/`  | Python, FastAPI, Google Gemini API, PaddleOCR  |
| Pranav      | `pranav/frontend`   | `frontend/`    | React, Vite, Tailwind, Leaflet, Web Speech API |

---

## 📂 Project Structure

```
project-root/
├── frontend/          ← Pranav
├── backend/           ← Aishwarya
├── ai-service/        ← Umera
├── docs/
│   ├── API_CONTRACT.md
│   ├── AISHWARYA_BACKEND.md
│   ├── UMERA_AI_SERVICE.md
│   └── PRANAV_FRONTEND.md
├── .gitignore
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.10+
- MongoDB (local or Atlas)
- Google Gemini API key (free tier)

### 1. Clone & Branch
```bash
git clone https://github.com/Aishwarya-Ramesh-Shetty/Clinova-AI-Powered-Virtual-Patient-Simulation-Clinical-Skills-Training-Platform.git
cd Clinova-AI-Powered-Virtual-Patient-Simulation-Clinical-Skills-Training-Platform
git checkout -b <your-branch>
```

### 2. Start Backend (Port 5000)
```bash
cd backend
cp .env.example .env          # Fill in values
npm install
npm run dev
```

### 3. Start AI Service (Port 8000)
```bash
cd ai-service
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
cp .env.example .env          # Fill in GEMINI_API_KEY
uvicorn app.main:app --reload --port 8000
```

### 4. Start Frontend (Port 5173)
```bash
cd frontend
cp .env.example .env          # Fill in values
npm install
npm run dev
```

---

## 🔗 Key Ports & URLs

| Service     | URL                        |
|-------------|----------------------------|
| Frontend    | `http://localhost:5173`     |
| Backend API | `http://localhost:5000/api` |
| AI Service  | `http://localhost:8000`     |

---

## 🛠️ Technology Stack

| Layer        | Technology                               |
|--------------|------------------------------------------|
| Frontend     | React 18, Vite, Tailwind CSS             |
| Backend      | Node.js, Express.js                      |
| Database     | MongoDB + Mongoose                       |
| AI / LLM     | Google Gemini API (gemini-2.0-flash)     |
| OCR          | PaddleOCR                                |
| Voice Input  | Web Speech API (browser-native)          |
| Maps         | Leaflet + OpenStreetMap                  |
| Auth         | JWT (jsonwebtoken + bcryptjs)            |

### ✅ 100% Free & Open-Source Stack — No paid AI APIs required (Gemini free tier)

---

## 📖 Documentation

- [API Contract](docs/API_CONTRACT.md) — Shared endpoint & data shape definitions
- [Aishwarya's Guide](docs/AISHWARYA_BACKEND.md) — Backend implementation
- [Umera's Guide](docs/UMERA_AI_SERVICE.md) — AI service implementation
- [Pranav's Guide](docs/PRANAV_FRONTEND.md) — Frontend implementation
