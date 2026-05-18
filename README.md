# PortSync — Intelligent Port & Vessel Operations Platform

Enterprise-grade berth intelligence, vessel stay prediction, yard optimization, and operational analytics platform for modern marine terminals.

Built using:

* FastAPI
* React + TypeScript
* PostgreSQL
* Machine Learning Ensemble Models
* Celery Background Workers
* Material UI
* Three.js Visualization

---

# Overview

PortSync is a real-time operational intelligence system designed for container terminals and marine port operations.

The platform ingests operational container movement data from Terminal Operating System (TOS) exports, transforms it into structured operational intelligence, trains machine learning models for vessel stay prediction, and visualizes yard congestion and operational KPIs through a modern analytics dashboard.

The system combines:

* Data engineering
* Operational analytics
* Machine learning
* Real-time visualization
* Role-based operational control

to support terminal planners, vessel coordinators, and operations teams.

---

# Core Features

## Vessel Stay Prediction

Machine learning ensemble models predict vessel stay duration based on:

* Load/discharge volumes
* Yard congestion
* Weight distribution
* Reefer/OOG/Hazard handling
* Service patterns
* Historical operational behavior

---

## Operational Analytics Dashboard

Provides:

* Crane productivity analytics
* Throughput KPIs
* Yard congestion indicators
* Vessel operational trends
* Load/discharge imbalance analysis
* Historical vessel intelligence

---

## Heatmap & Yard Visualization

Interactive visualization engine supporting:

* 2D yard map rendering
* 3D yard map rendering
* Block occupancy visualization
* Congestion heatmaps
* Grid-level concentration analysis
* Terminal layout intelligence

---

## Crane Analytics

Dedicated crane intelligence module includes:

* Terminal efficiency tracking
* Crane productivity metrics
* Asset deep dive analysis
* Operational performance scoring
* Historical crane trend analysis

---

## Unified Data Ingestion Pipeline

Supports ingestion of:

* CSV operational exports
* JSON datasets
* Raw operational payloads

The ingestion engine:

* Validates schemas
* Cleans operational data
* Performs UPSERT operations
* Stores historical records
* Triggers retraining pipelines

---

## Automated Machine Learning Retraining

Supports:

* Threshold-triggered retraining
* Scheduled retraining
* Background processing
* Training metadata tracking
* Model version monitoring

---

## Role-Based Access Control (RBAC)

Two-level access model:

### Admin

* Upload datasets
* Trigger retraining
* Configure ML settings
* Manage users
* Access operational controls

### User

* View dashboards
* Access analytics
* Submit operational requests

---

# Technology Stack

## Frontend

| Technology        | Purpose                  |
| ----------------- | ------------------------ |
| React 19          | UI Framework             |
| TypeScript        | Static typing            |
| Material UI       | Design system            |
| Recharts          | Analytics charts         |
| React Router      | Routing                  |
| Axios             | API communication        |
| Three.js          | 3D visualization         |
| React Three Fiber | Heatmap rendering        |
| Leaflet           | Geospatial visualization |
| Vite              | Frontend bundler         |

---

## Backend

| Technology   | Purpose              |
| ------------ | -------------------- |
| Python 3.11+ | Runtime              |
| FastAPI      | API framework        |
| PostgreSQL   | Database             |
| SQLAlchemy   | ORM                  |
| Celery       | Background jobs      |
| APScheduler  | Scheduled retraining |
| pandas       | Data processing      |
| scikit-learn | ML pipeline          |
| XGBoost      | Gradient boosting    |
| JWT          | Authentication       |
| bcrypt       | Password hashing     |

---

# Project Structure

```bash
shathish-07-port-system/
│
├── client/
│   ├── src/
│   │   ├── api/
│   │   ├── auth/
│   │   ├── layout/
│   │   ├── pages/
│   │   │   ├── CraneAnalytics/
│   │   │   ├── Heatmap/
│   │   │   ├── ingestion/
│   │   │   ├── ml/
│   │   │   ├── StayTimeAnalysis/
│   │   │   └── user/
│   │   ├── theme/
│   │   └── types/
│
├── server/
│   ├── auth/
│   ├── db/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   ├── worker/
│   ├── tests/
│   └── data/
│
└── README.md
```

---

# Frontend Architecture

## Heatmap Module

Files:

* HeatmapPage.tsx
* HeatmapView.tsx
* TerminalMap2D.tsx
* BerthRecommendation.tsx

Features:

* Dynamic congestion visualization
* Yard occupancy analytics
* Berth recommendation support

---

## Stay Time Analysis

Files:

* StayTimeAnalysis.tsx
* StayTimeTrendChart.tsx
* OperationalProfile.tsx

Features:

* Historical vessel analysis
* Stay prediction trends
* Operational KPI breakdown

---

## Crane Analytics

Files:

* CraneAnalytics.tsx
* GlobalKPIs.tsx
* TerminalEfficiency.tsx
* AssetDeepDive.tsx

Features:

* Crane productivity scoring
* Terminal throughput metrics
* Operational asset analytics

---

# Backend Architecture

## Route Layer

Handles:

* Authentication
* Vessel analytics
* Heatmap APIs
* Ingestion
* Model training
* System administration

Main route files:

* auth_routes.py
* vessel_routes.py
* crane_routes.py
* ingest_routes.py
* model_routes.py

---

## Service Layer

Encapsulates operational business logic.

Services:

* vessel_service.py
* heatmap_service.py
* retraining_service.py

Responsibilities:

* Data aggregation
* Feature extraction
* Prediction orchestration
* Heatmap generation

---

## Utility Layer

Core operational intelligence logic.

Utilities:

* extractContainerMoves.py
* classifyWeight.py
* feature_utils.py
* position_parser.py
* stay_utils.py

Responsibilities:

* Container move parsing
* Yard position decoding
* Feature engineering
* Stay time calculations

---

# System Architecture Diagram

```mermaid
graph TB

    subgraph Frontend
        A1[React Dashboard]
        A2[Heatmap Engine]
        A3[Crane Analytics]
        A4[Stay Time Analysis]
        A5[Admin Operations Center]
    end

    subgraph API["FastAPI Backend"]
        B1[Auth Routes]
        B2[Vessel Routes]
        B3[Crane Routes]
        B4[Ingestion Routes]
        B5[Model Routes]
        B6[System Routes]
    end

    subgraph Services
        C1[Vessel Service]
        C2[Heatmap Service]
        C3[Retraining Service]
    end

    subgraph Utils
        D1[Feature Engineering]
        D2[Position Parser]
        D3[Weight Classification]
        D4[Stay Calculations]
        D5[Container Move Extraction]
    end

    subgraph ML
        E1[XGBoost]
        E2[Gradient Boosting]
        E3[Ridge Regression]
        E4[VotingRegressor]
    end

    subgraph Database
        F1[(History Tables)]
        F2[(Current Tables)]
        F3[(Training Metadata)]
        F4[(User Tables)]
    end

    subgraph Workers
        G1[Celery Worker]
        G2[Scheduled Retraining]
    end

    Frontend --> API
    API --> Services
    Services --> Utils
    Services --> Database
    Services --> ML
    Workers --> ML
    Workers --> Database
```

---

# Operational Data Flow

```mermaid
flowchart LR

    A[TOS Export Data]
    B[CSV / JSON Upload]
    C[Ingestion API]
    D[Validation Engine]
    E[Feature Extraction]
    F[History Storage]
    G[Current State UPSERT]
    H[Operational Analytics]
    I[ML Training Dataset]
    J[Vessel Stay Prediction]
    K[Frontend Dashboard]

    A --> B
    B --> C
    C --> D
    D --> E
    E --> F
    E --> G
    F --> I
    I --> J
    G --> H
    H --> K
    J --> K
```

---

# Machine Learning Pipeline

## Model Architecture

Ensemble-based VotingRegressor using:

* XGBoost
* GradientBoostingRegressor
* Ridge Regression

---

## Engineered Features

Generated features include:

* Loaded containers
* Discharged containers
* Total moves
* Weight classifications
* Reefer count
* Hazard count
* OOG count
* Port concentration
* Service hash

---

# ML Architecture Flow

```mermaid
graph TD

    A[Historical Vessel Data]
    --> B[Feature Engineering]

    B --> C[Load Features]
    B --> D[Weight Features]
    B --> E[Hazard Features]
    B --> F[Yard Features]

    C --> G[Voting Regressor]
    D --> G
    E --> G
    F --> G

    G --> H[XGBoost]
    G --> I[Gradient Boosting]
    G --> J[Ridge Regression]

    H --> K[Final Prediction]
    I --> K
    J --> K
```

---

# Authentication & RBAC Flow

```mermaid
sequenceDiagram

    participant U as User
    participant FE as Frontend
    participant API as FastAPI
    participant DB as PostgreSQL

    U->>FE: Login
    FE->>API: POST /auth/login
    API->>DB: Verify credentials
    DB-->>API: User + Role
    API-->>FE: JWT Token
    FE->>API: Protected Request
    API->>API: Validate JWT
    API->>API: Validate Role
    API-->>FE: Authorized Response
```

---

# Heatmap Processing Flow

```mermaid
flowchart TD

    A[Container Positions]
    --> B[Position Parser]

    B --> C[Yard Block Extraction]
    C --> D[Grid Mapping]
    D --> E[Occupancy Aggregation]
    E --> F[Congestion Classification]
    F --> G[2D / 3D Heatmap]
```

---

# Retraining Automation Flow

```mermaid
sequenceDiagram

    participant Ingestion
    participant Backend
    participant Counter
    participant Worker
    participant ML
    participant Database

    Ingestion->>Backend: New Records
    Backend->>Counter: Increment Counter

    Counter-->>Backend: Threshold Check

    alt Threshold Reached
        Backend->>Worker: Trigger Retraining
        Worker->>ML: Train Model
        ML->>Database: Save Metadata
    end
```

---

# Frontend Navigation Flow

```mermaid
graph TD

    A[Login]
    --> B[Dashboard]

    B --> C[Heatmap]
    B --> D[Stay Time Analysis]
    B --> E[Crane Analytics]
    B --> F[Data Ingestion]
    B --> G[ML Training]
    B --> H[User Management]

    H --> I[Requests]
    H --> J[System Logs]
```

---

# Database Architecture

```mermaid
flowchart LR

    A[Incoming Data]
    --> B[(History Tables)]

    A --> C[(Current Tables)]

    B --> D[ML Training]

    C --> E[Live Operational Dashboard]
```

---

# Setup Instructions

## Backend Setup

```bash
cd server

python -m venv venv

# Windows
venv\Scripts\activate

# Linux / macOS
source venv/bin/activate

pip install -r requirements.txt
```

Create `.env`:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/portsync
JWT_SECRET_KEY=super_secret_key
MODEL_PATH=models/stay_model.pkl
RETRAIN_THRESHOLD_NEW_RECORDS=1000
```

Run backend:

```bash
uvicorn main:app --reload
```

---

## Frontend Setup

```bash
cd client

npm install

npm run dev
```

---

# API Modules

| Module     | Description       |
| ---------- | ----------------- |
| `/auth`    | Authentication    |
| `/vessel`  | Vessel analytics  |
| `/heatmap` | Yard congestion   |
| `/crane`   | Crane analytics   |
| `/ingest`  | Data ingestion    |
| `/model`   | ML training       |
| `/users`   | User management   |
| `/system`  | Logs & operations |

---

# Background Processing

The platform supports asynchronous processing using Celery workers.

Worker responsibilities:

* ML retraining
* Long-running ingestion tasks
* Heavy analytics computation
* Scheduled operational jobs

---

# Security Features

* JWT authentication
* bcrypt password hashing
* RBAC enforcement
* Protected API routes
* SQL injection protection
* Pydantic request validation

---

# Future Enhancements

* Real-time streaming analytics
* Predictive berth allocation
* AI-powered yard optimization
* Crane scheduling intelligence
* Digital twin simulation
* Real-time ETA recalculation
* Congestion forecasting
* IoT equipment integration

---

# License

Internal Enterprise Project — Proprietary
