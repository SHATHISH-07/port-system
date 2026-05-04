# PortSync — Advanced Port Optimization & Vessel Analytics

> Enterprise-grade container terminal intelligence platform with real-time vessel analysis, 3-D yard visualization, and ML-powered stay time prediction.

---

## Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Technology Stack](#technology-stack)
4. [API Reference](#api-reference)
5. [Machine Learning Model](#machine-learning-model)
6. [Core Algorithms](#core-algorithms)
7. [Stay Time Calculation](#stay-time-calculation)
8. [Heatmap Concentration Algorithm](#heatmap-concentration-algorithm)
9. [Performance & Caching](#performance--caching)
10. [Project Structure](#project-structure)
11. [Getting Started](#getting-started)

---

## Overview

PortSync bridges the gap between raw Terminal Operating System (TOS) data and actionable intelligence. It enables port authorities to:

- **Predict vessel stay times** based on planned cargo load and discharge volume.
- **Visualize yard concentration** through an interactive 3-D terminal heatmap powered by Three.js.
- **Analyze historical and current vessel performance** in under 3 seconds end-to-end.
- **Identify optimal berth assignments** and crane deployment strategies automatically.

---

## System Architecture

```mermaid
graph TD
    Client["React Client (Vite)"]
    subgraph Backend[FastAPI Backend]
        API_Vessel["/vessel/* Endpoints"]
        API_Upload["/upload/* Endpoints"]
        API_Model["/model/* Endpoints"]
        SVC_Retrain["Background Retraining Service (60s loop)"]
        ML["Stay Model (VotingRegressor)"]
    end
    DB[(PostgreSQL)]

    Client -->|HTTP| API_Vessel
    Client -->|HTTP| API_Upload
    Client -->|HTTP| API_Model

    API_Vessel --> ML
    API_Vessel --> DB
    API_Upload --> DB
    
    SVC_Retrain -->|Polls| DB
    SVC_Retrain -->|Triggers| ML
    API_Model --> ML
```

---

## Technology Stack

### Frontend
| Technology | Purpose |
|---|---|
| **React 18 + Vite** | SPA framework with HMR dev server |
| **Material UI (MUI v5)** | Dark-themed enterprise component library |
| **Three.js** | 3-D terminal map with ship models, heatblobs, and animated water |
| **React Router v6** | Client-side routing with `useSearchParams` |
| **Axios** | HTTP client with independent parallel fetch strategy |

### Backend
| Technology | Purpose |
|---|---|
| **FastAPI** | Async REST API with automatic OpenAPI docs |
| **PostgreSQL** | Relational persistence with UUID primary keys |
| **Pandas** | Vectorized data transformation and feature engineering |
| **Joblib** | ML model serialization (`.pkl`) |
| **python-dotenv** | Environment configuration |

### Machine Learning
| Technology | Purpose |
|---|---|
| **scikit-learn VotingRegressor** | Ensemble meta-model |
| **XGBoost** | Non-linear gradient boosting component |
| **Ridge Regression** | Scaled linear component |
| **GradientBoostingRegressor** | Shallow tree robustness component |

---

## API Reference

### Vessel Endpoints — `POST /vessel/*`

| Endpoint | Description |
|---|---|
| `POST /vessel/vessel-history-analysis` | Full analytics for a vessel's historical visit data. Returns stay times, berth analysis, risks, and execution plan. |
| `POST /vessel/current-vessel-analysis` | Analytics for the current operation. Accepts optional `loaded` and `discharged` form fields to trigger ML prediction override. |
| `POST /vessel/heatmap` | Yard block container concentration data for the 3-D terminal map. |

**Request body** (all vessel endpoints): `multipart/form-data`
- `vessel_id` (string, required)
- `loaded` (int, optional — only for current analysis)
- `discharged` (int, optional — only for current analysis)

---

### Upload Endpoints — `POST /upload/*`

| Endpoint | Description |
|---|---|
| `POST /upload/history` | Ingest a historical movement CSV into PostgreSQL. Normalizes to snake_case schema, generates UUID PKs, and creates tables automatically if they don't exist. |
| `POST /upload/current` | Ingest the current vessel operation CSV. |

---

### Model Endpoints — `POST /model/*`

| Endpoint | Description |
|---|---|
| `POST /model/vessel-stay/train` | Manually trigger a train/retrain of the ML model directly from the history data already in PostgreSQL. |
| `GET /model/status` | Check training status. Returns `training`, `completed`, or `failed`. |

---

## Machine Learning Model

### Why an Ensemble?

The current dataset yields ~126 valid training visits after filtering. For datasets of this size, pure XGBoost overfits — its cross-validated R² on this data was only **0.23**. A **VotingRegressor** ensemble that averages three diverse models reaches **R² 0.33** with a lower MAE, because each component is strong where the others are weak.

### Ensemble Components

| Component | Hyperparameters | Role |
|---|---|---|
| **Ridge** (with StandardScaler) | `alpha=10.0` | Captures the dominant linear relationship between volume and stay duration |
| **XGBoost** | `max_depth=3, reg_alpha=1.0, reg_lambda=5.0` | Heavy regularisation prevents memorising noise; captures non-linear cargo patterns |
| **GradientBoosting** | `max_depth=2, min_samples_leaf=8` | Shallow trees provide low-variance, robust estimates |

### Literature & Industry Validation

The use of gradient boosting for vessel stay time and container dwell time prediction is well-validated in maritime logistics research. Studies in *Maritime Policy & Management*, *IEEE Access*, and *Expert Systems with Applications* consistently demonstrate that ensemble methods outperform individual tree models or neural networks on TOS tabular data, particularly where sample counts are constrained by operational reality (one training sample per unique carrier visit).

### Model Performance (5-Fold Cross-Validation on current dataset)

| Metric | Value |
|---|---|
| Mean Absolute Error | **10.12 hours** |
| R² (fit quality) | **0.3342** |
| Training samples | 126 visits |
| Stay time range | 7.9h – 96.0h (mean 31.1h) |

### Feature Engineering

The model is trained exclusively on cargo-profile features. Duration-derived features (`operation_hours`, `moves_per_hour`) are **intentionally excluded** to prevent data leakage — these features are calculated from the stay duration itself and would make the model appear accurate in training while being useless for real-time prediction.

| Feature | Source | Description |
|---|---|---|
| `loaded` | Move positions | Containers moved `Y-` → `V-` (yard to vessel) |
| `discharged` | Move positions | Containers moved `V-` → `Y-` (vessel to yard) |
| `total_moves` | Derived | `loaded + discharged` |
| `imbalance` | Derived | `abs(loaded - discharged)` |
| `load_ratio` | Derived | `loaded / (total_moves + 1)` |
| `discharge_ratio` | Derived | `discharged / (total_moves + 1)` |
| `container_count` | Unit IDs | Unique container count in the visit window |
| `avg_weight` | `unit_weight_in_kg` | Mean container weight |
| `heavy_count` | `unit_weight_in_kg` | Containers > 20,000 kg |
| `reefer_count` | `reefer` flag | Refrigerated containers |
| `hazard_count` | `hazardous_flag` | Hazardous material containers |
| `oog_count` | `oog_unit` flag | Out-of-gauge containers |
| `service_hash` | `outbound_service` | MD5 hash of the carrier service name |

### Automated Retraining & Execution Flow

The system runs a continuous asynchronous background task attached to the FastAPI lifespan. It checks the PostgreSQL `history_containers` table every 60 seconds. If the row count exceeds the previous training size by `RETRAIN_THRESHOLD_NEW_RECORDS` (default: 1000), it automatically triggers a non-blocking model retraining process.

```mermaid
sequenceDiagram
    participant Client as Client / External
    participant API as FastAPI App
    participant Checker as Background Check (60s)
    participant DB as PostgreSQL
    participant ML as Stay Model

    Checker->>DB: Check total history records
    DB-->>Checker: Returns count (e.g., 5200)
    Note over Checker: count - last_size >= 1000
    Checker->>ML: Trigger background_train_and_update()
    ML->>DB: Fetch latest data
    ML->>ML: Fit VotingRegressor
    ML->>ML: Update metadata & Save .pkl
    
    Client->>API: POST /vessel/current-vessel-analysis
    API->>ML: predict_stay_duration_from_metrics()
    ML-->>API: Returns updated prediction
    API-->>Client: Real-time insights
```

---

## Core Algorithms

### Stay Time Calculation

Accurately computing the true stay duration from raw TOS movement logs is non-trivial due to multi-session visits, dormant periods, and incomplete timestamps. PortSync resolves this by:

1. **Operation Isolation** — Filtering rows to only Load moves (`ctr_from_position` starts with `Y-`, `ctr_to_position` starts with `V-`) and Discharge moves (reverse).
2. **Visit Sessionization** — Grouping all moves strictly by `actual_outbound_carrier_visit_id` so multi-leg voyages are handled independently.
3. **Window Clamping** — Applying a ±96-hour window around the vessel's modal `time_out` (departure). This removes unrelated yard moves that share the same visit ID but occurred days before or after the actual port call.
4. **Duration Computation** — The stay is: `vessel_departure - min(event_time)` within the clamped window, expressed in floating-point hours.

### Heatmap Concentration Algorithm

The yard heatmap determines block congestion and informs berth assignment recommendations:

1. **Container → Block mapping** — The block ID is extracted from the `ctr_position` field prefix (e.g., `G2.01.A` → block `G2`).
2. **Count per block** — Active outbound containers are tallied per block.
3. **Maximum block** — The block with the absolute highest count is designated the primary concentration point (rendered red / critical in the 3-D view).
4. **Relative intensity thresholds**:
   - `High` → > 65% of max block count (🔴 Red)
   - `Medium` → 30%–65% of max block count (🟠 Orange)
   - `Low` → < 30% of max block count (🟢 Green)

### 3-D Terminal Map (Three.js)

The Terminal Map page renders a fully interactive 3-D port scene:
- **Animated water** — Sinusoidal wave displacement on a high-resolution `PlaneGeometry` mesh.
- **Ship bobbing** — Per-ship sinusoidal Y-position and roll animation.
- **Heat blobs** — Additive-blended radial gradient sprites stacked at 3 altitude layers per block, with pulse animation.
- **Particle systems** — Rising particles above high and critical concentration blocks.
- **Orbit controls** — Left-drag to orbit, right-drag to pan, scroll to zoom.
- **Block hover** — Raycaster intersection identifies the hovered block and displays a KPI card overlay.

---

## Performance & Caching

### In-Memory API Cache (`_api_cache`)

All three vessel analysis endpoints (`history`, `current`, `heatmap`) check a process-level dictionary before hitting the database. Cache keys are `{mode}_{vessel_id}`. First call triggers the full pipeline (~2–3s). All subsequent calls for the same vessel return in **< 1ms**.

The cache is invalidated automatically when a new CSV is uploaded via `POST /upload/*`.

### Frontend Parallel Fetch

The current vessel analysis page fires `current-vessel-analysis` and `heatmap` as **independent promises** (not `Promise.all`). As soon as the main analysis resolves (~2.9s), the loading spinner stops and the dashboard renders. The heatmap data arrives a fraction of a second later and updates the 3-D map silently — eliminating the stacked wait time that would otherwise add both durations together.

### Verified End-to-End Latency

| Endpoint | Typical Response Time |
|---|---|
| `/vessel/vessel-history-analysis` | ~3.0s (first call) / < 1ms (cached) |
| `/vessel/current-vessel-analysis` | ~2.9s (first call) / < 1ms (cached) |
| `/vessel/heatmap` | ~0.3s (first call) / < 1ms (cached) |

---

## Project Structure

```
port-system/
├── client/                        # React + Vite frontend
│   └── src/
│       ├── api/api.ts             # Axios base client
│       ├── components/
│       │   └── vessel-analysis/   # AnalysisHeader, VisitTable, BerthImpactTable, ...
│       ├── pages/
│       │   ├── CurrentVesselAnalysis.tsx
│       │   ├── HistoryVesselAnalysis.tsx
│       │   └── TerminalMap.tsx    # Three.js 3-D scene
│       └── types/vessel.ts
│
└── server/                        # FastAPI backend
    ├── main.py                    # App entry point, ASGI middleware
    ├── routes/
    │   ├── vessel_routes.py       # /vessel/* endpoints + in-memory cache
    │   ├── upload_routes.py       # /upload/* endpoints
    │   └── model_routes.py        # /model/* endpoints (train, retrain-from-db, status)
    ├── services/
    │   ├── vessel_service.py      # Dashboard aggregation logic
    │   └── heatmap_service.py     # Block concentration calculation
    ├── models/
    │   ├── stay_model.py          # VotingRegressor ensemble (Ridge + XGBoost + GBR)
    │   ├── stay_model.pkl         # Serialized trained model
    │   └── training_status.py     # Singleton training state tracker
    ├── db/
    │   ├── connection.py          # PostgreSQL connection (auto-creates DB)
    │   ├── queries.py             # load_df_from_db, _api_cache
    │   └── schema.py              # Table definitions with UUID PKs
    └── utils/
        ├── feature_utils.py       # ML feature engineering (13 features, no leakage)
        ├── stay_utils.py          # Stay time computation, window clamping
        ├── datetime_utils.py      # Robust datetime parsing
        ├── data_loader.py         # CSV ingestion
        └── endpoint_cache.py      # Upload cache helpers
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.11+
- PostgreSQL 14+

### Backend

```bash
cd server
pip install -r requirements.txt

# Configure your .env file:
# DATABASE_URL=postgresql://user:pass@localhost:5432/portsync
# MODEL_PATH=models/stay_model.pkl

uvicorn main:app --reload
# API available at http://127.0.0.1:8000
# OpenAPI docs at http://127.0.0.1:8000/docs
```

### Frontend

```bash
cd client
npm install
npm run dev
# Dashboard at http://localhost:5173
```

### First-Time Data & Model Setup

```bash
# 1. Upload your history CSV
curl -X POST http://127.0.0.1:8000/upload/history -F "file=@history.csv"

# 2. Upload your current operations CSV
curl -X POST http://127.0.0.1:8000/upload/current -F "file=@current.csv"

# 3. Train the ML model from the DB
curl -X POST http://127.0.0.1:8000/model/vessel-stay/train

# 4. Check training status
curl http://127.0.0.1:8000/model/status
```
