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

* Stowage planning analytics
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
* XML-based dynamic yard layout integration (e.g., `ENNORE_OPT_V1.0.xml`)

---

## Stowage Planning

Dedicated stowage intelligence module includes:

* Current planning visualization
* Historical stowage analysis
* Stowage optimization visualization
* Container load planning

---

## Unified Data Ingestion Pipeline

Supports ingestion of:

* CSV operational exports
* JSON datasets
* Raw operational payloads

The ingestion engine:

* Validates schemas
* Cleans operational data
* Processes massive datasets asynchronously via background tasks
* Provides status polling endpoints (`/ingest/status/{ingestion_id}`) for UI progress tracking
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
│   │   │   ├── Heatmap/
│   │   │   ├── StayTimeAnalysis/
│   │   │   ├── StowagePlanning/
│   │   │   ├── auth/
│   │   │   ├── ingestion/
│   │   │   ├── ml/
│   │   │   └── user/
│   │   ├── theme/
│   │   └── types/
│
├── server/
│   ├── auth/
│   ├── config.py
│   ├── db/
│   ├── main.py
│   ├── models/
│   ├── routes/
│   ├── schemas/
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
* XML-based terminal map generation and layout parsing

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

## Stowage Planning

Files:

* StowagePlanning.tsx
* CurrentPlanningTab.tsx
* HistoryAnalysisTab.tsx
* StowageVisualizationTab.tsx
* StowageHeader.tsx

Features:

* Visualization of container load sequences
* Historical stowage pattern analysis
* 3D visualization of container stacks

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
* stowage_routes.py
* ingest_routes.py
* model_routes.py

---

## Service Layer

Encapsulates operational business logic.

Services:

* vessel_service.py
* heatmap_service.py
* retraining_service.py
* stowage_service.py
* stowage_visualizer_service.py

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
        A3[Stowage Planning]
        A4[Stay Time Analysis]
        A5[Admin Operations Center]
    end

    subgraph API["FastAPI Backend"]
        B1[Auth Routes]
        B2[Vessel Routes]
        B3[Stowage Routes]
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

# Async Ingestion Polling Flow

```mermaid
sequenceDiagram
    participant UI as Frontend (React)
    participant API as FastAPI
    participant Worker as Background Task
    participant DB as Database

    UI->>API: POST /ingest/upload (CSV/JSON)
    API->>DB: Create ingestion_log (Status: PROCESSING)
    API->>Worker: Dispatch Async Task
    API-->>UI: 202 Accepted (Return ingestion_id)
    
    loop Every 2 seconds
        UI->>API: GET /ingest/status/{ingestion_id}
        API->>DB: Query status
        API-->>UI: Status (PROCESSING)
    end
    
    Worker->>DB: Complete processing & UPSERT data
    Worker->>DB: Update ingestion_log (Status: COMPLETED)
    
    UI->>API: GET /ingest/status/{ingestion_id}
    API->>DB: Query status
    API-->>UI: Status (COMPLETED) + Results
    UI->>UI: Show completion dashboard
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
    B --> E[Stowage Planning]
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
# Database Configuration
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/portsystem

# Authentication
JWT_SECRET=super-secret-jwt-key-for-portsync
DEFAULT_ADMIN_USER=admin
DEFAULT_ADMIN_PASSWORD=admin123

# Machine Learning & Automated Retraining
MODEL_PATH=models/stay_model.pkl
RETRAIN_THRESHOLD_NEW_RECORDS=1000
RETRAIN_CHECK_INTERVAL_SECONDS=60

# Celery & Redis Background Worker
REDIS_URL=redis://localhost:6379/0
REDIS_RESULT_URL=redis://localhost:6379/1
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

# Testing

The backend includes a comprehensive End-to-End (E2E) test suite covering authentication, vessel metrics, heatmaps, stowage planning, ingestion, ML models, configurations, and user management.

To run the automated test suite (36 tests):

```bash
cd server
python tests/test_runner.py
```

Test results are automatically output to the console and saved to `server/tests/test_results.json`.

---

# API Modules

| Module     | Description       |
| ---------- | ----------------- |
| `/auth`    | Authentication    |
| `/vessel`  | Vessel analytics  |
| `/heatmap` | Yard congestion   |
| `/stowage` | Stowage planning  |
| `/ingest`  | Data ingestion    |
| `/model`   | ML training       |
| `/users`   | User management   |
| `/config`  | Dynamic settings  |
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

# Deck Optimizer Framework Implementation Status

Based on the `deck_optimizer_text.txt` operational specification, the following features have been implemented and tracked:

## Fully Implemented Features

*   **Berth Selection & Yard Cargo Distribution (Section 2.1 - 2.3)**
    *   Dynamic extraction of loading container locations (Yard Block, Row, Bay, Tier).
    *   Classification of containers by equipment class (Reefer, OOG, Hazmat) and weight class (Light, Medium, Heavy).
    *   Interactive 3D Yard Heat Map visually highlighting block concentration (Red/High, Orange/Medium, Green/Low).
*   **Port Stay Time Prediction (Section 3)**
    *   Implementation of the precise mathematical formula: `Total Moves ÷ (Number of Cranes × Average Productivity)`.
    *   Side-by-side comparison with historical ML-predicted baselines.
*   **Berth Conflict & Crane Clash Analysis (Section 4)**
    *   Dynamic multi-vessel overlap detection based on working time windows.
    *   Identification and percentage breakdown of shared yard blocks.
    *   Severity-based risk flagging (Low/Medium/High Risk) surfaced in the UI.
*   **Historical Delay Root Cause Analysis (Section 5)**
    *   Detection of Crane Idle Time (identifying operation gaps > 60 minutes).
    *   Analysis of Poor Stacking Strategy (high reshuffle rates).
    *   M-Cycle efficiency tracking (dual-cycle vs single-cycle ratio extraction).
*   **Yard Preparation & Weight Distribution Strategy (Section 6)**
    *   Stowage rule engine enforcing `HEAVY` containers below deck and `LIGHT` containers above deck.
    *   Berth proximity matching (recommending Heavy containers to `CLOSE` yard blocks).
    *   Dynamic Discharge Port Grouping powered by an OpenStreetMap Geocoding API that learns and tracks real-world port coordinates to calculate nearest-neighbor sequences.
    *   ISO-compliant Bay/Row/Tier slot generation algorithms.

## Features Pending Implementation (Future Scope)

*   **Distance Impact Simulation (Section 2.4)**
    *   *Requirement*: Calculate physical "Total Laden Travel Distance" and "Estimated Unladen Travel".
    *   *Blocker*: Requires live integration with physical yard and berth coordinate telemetry mappings.
*   **Advanced Conflict Checks (Section 4.3)**
    *   *Requirement*: Detect internal corridor overlaps, crane rail overlap, and equipment demand conflicts.
    *   *Blocker*: Awaiting granular terminal infrastructure layouts and active ITV telemetry tracking in the dataset.
*   **ITV Arrival Delay & Congestion Analysis (Section 5.2 / 5.3)**
    *   *Requirement*: Identify ITV congestion and arrival delays.
    *   *Blocker*: Requires GPS/RFID telemetry logs from the Internal Terminal Vehicles (ITVs).
*   **Dynamic Recalculation Based on ETA Accuracy (Section 7)**
    *   *Requirement*: Real-time recalculation of the berth simulation if vessel ETA changes.
    *   *Blocker*: Requires a live socket integration with Vessel Traffic Services (VTS) to stream live ETA updates.

---

# License

Internal Enterprise Project — Proprietary
