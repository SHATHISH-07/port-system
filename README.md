# PortSync — Berth & Yard Optimization Platform

> **Enterprise-grade vessel stay time prediction and terminal intelligence system.**
> Built with FastAPI, React + TypeScript, and a VotingRegressor ML ensemble.

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Tech Stack](#tech-stack)
4. [Project Structure](#project-structure)
5. [Getting Started](#getting-started)
6. [Environment Variables](#environment-variables)
7. [API Reference](#api-reference)
8. [ML Pipeline](#ml-pipeline)
9. [Frontend Pages](#frontend-pages)
10. [Database Schema](#database-schema)
11. [Data Flow](#data-flow)
12. [Configuration Reference](#configuration-reference)

---

## Overview

PortSync is an end-to-end vessel operations platform for container terminals. It ingests raw container movement data, stores it in a normalized PostgreSQL schema, trains a machine learning model to predict vessel stay times, and surfaces actionable intelligence through a professional dashboard.

**Core capabilities:**

| Feature | Description |
|---|---|
| **Stay Time Prediction** | VotingRegressor ensemble (Ridge + XGBoost + GBR) predicts vessel stay hours |
| **History Analysis** | Retrospective review of vessel visits, berth performance, and stay trends |
| **Current Analysis** | Live operational view — berth assignment, yard heatmap, execution plan |
| **Terminal Heatmap** | Yard block container concentration (High / Medium / Low) visualization |
| **Manual Training** | Trigger model retraining from the UI using DB data or an uploaded CSV |
| **Automated Retraining** | Nightly job (02:00 AM) auto-retrains when ≥1000 new records accumulate |
| **Dual Data Upload** | Separate upload endpoints for `history` (append) and `current` (upsert) datasets |
| **Light / Dark Mode** | Full MUI theme system with live toggle — all components adapt seamlessly |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PortSync System                             │
│                                                                     │
│  ┌──────────────────────┐         ┌──────────────────────────────┐  │
│  │   React + TypeScript  │  HTTP   │      FastAPI Backend          │  │
│  │   (Vite, MUI v6)      │◄──────►│      (Python 3.13)           │  │
│  │   localhost:5173      │        │      localhost:8000           │  │
│  └──────────────────────┘        └──────────────┬───────────────┘  │
│                                                  │                  │
│                                   ┌──────────────▼───────────────┐  │
│                                   │       PostgreSQL DB           │  │
│                                   │   history_* / current_*       │  │
│                                   │   tables (containers,         │  │
│                                   │   visits, vessels)            │  │
│                                   └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Automated ML Retraining Flow

```
PostgreSQL DB
     │
     │  record count check (every 60s)
     ▼
RetrainingService ──► threshold reached? (≥1000 new records)
                              │
                              ▼  Yes
               background_train_and_update(df)
                              │
                              ▼
               stay_model.pkl  ←  VotingRegressor
                  (saved to disk, cache invalidated)
```

---

## Tech Stack

### Backend
| Package | Version | Purpose |
|---|---|---|
| **FastAPI** | latest | REST API framework |
| **Uvicorn** | latest | ASGI server with `--reload` |
| **SQLAlchemy** / **psycopg2** | latest | PostgreSQL ORM & driver |
| **APScheduler** | latest | Nightly automated retraining (cron) |
| **XGBoost** | latest | Gradient boosted tree regressor |
| **scikit-learn** | latest | Ridge, GBR, VotingRegressor, Pipeline |
| **pandas** | latest | DataFrame processing |
| **joblib** | latest | Model serialization |
| **python-dotenv** | latest | `.env` configuration |

### Frontend
| Package | Version | Purpose |
|---|---|---|
| **React 18** | latest | UI framework |
| **TypeScript** | latest | Type safety |
| **Vite 8** | latest | Build tool & dev server |
| **MUI v6** | latest | Component library |
| **React Router v7** | latest | Client-side routing |
| **Axios** | latest | HTTP client |

---

## Project Structure

```
port-system/
├── client/                         # React frontend
│   ├── index.html                  # Entry — Inter font, PortSync title
│   ├── src/
│   │   ├── App.tsx                 # Root — ThemeContextProvider + Routes
│   │   ├── api/
│   │   │   └── api.ts              # Axios instance (baseURL: :8000)
│   │   ├── theme/
│   │   │   └── ThemeContext.tsx    # MUI Light/Dark theme factory + provider
│   │   ├── components/
│   │   │   ├── Layout.tsx          # Sticky header + page title + mode toggle
│   │   │   ├── Sidebar.tsx         # Collapsible nav (248px / 56px)
│   │   │   ├── FileUpload.tsx      # Drag-and-drop CSV uploader
│   │   │   ├── TrainingStatusCard.tsx  # Polling status + Retry button
│   │   │   └── vessel-analysis/    # 8 data-display components (all theme-aware)
│   │   │       ├── AnalysisHeader.tsx
│   │   │       ├── PerformanceStats.tsx
│   │   │       ├── BerthRecommendation.tsx
│   │   │       ├── BerthImpactTable.tsx
│   │   │       ├── ExecutionPlan.tsx
│   │   │       ├── RiskAndStrategy.tsx
│   │   │       ├── VisitTable.tsx
│   │   │       └── YardStrategy.tsx
│   │   └── pages/
│   │       ├── HistoryVesselAnalysis.tsx
│   │       ├── CurrentVesselAnalysis.tsx
│   │       ├── HeatmapPage.tsx
│   │       ├── TerminalMap.tsx
│   │       └── TrainModel.tsx
│
└── server/                         # FastAPI backend
    ├── main.py                     # App factory, CORS, scheduler, middleware
    ├── config.py                   # Settings class — all env/tuning variables
    ├── .env                        # Local environment variables (not committed)
    ├── routes/
    │   ├── vessel_routes.py        # Vessel analysis & heatmap endpoints
    │   ├── model_routes.py         # Training trigger + status endpoints
    │   └── upload_routes.py        # CSV upload (history append / current upsert)
    ├── services/
    │   ├── vessel_service.py       # Dashboard analysis orchestration
    │   ├── heatmap_service.py      # Yard block concentration logic
    │   └── retraining_service.py   # Scheduled & threshold-triggered retraining
    ├── models/
    │   ├── stay_model.py           # VotingRegressor training + prediction
    │   ├── training_status.py      # Thread-safe training state object
    │   └── stay_model.pkl          # Trained model artifact (auto-generated)
    ├── db/
    │   └── queries.py              # load_from_db / save_to_history / save_to_current
    └── utils/
        ├── data_loader.py          # load_from_file, validate_dataframe, clean_column_names
        ├── feature_utils.py        # Feature engineering for ML
        ├── stay_utils.py           # Visit grouping + stay calculation
        ├── datetime_utils.py       # Timezone-aware date parsing
        ├── cache_utils.py          # In-memory vessel result cache
        └── terminal_layout.py     # Yard block extraction from position strings
```

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 14+ (running on `localhost:5432`)

### 1 — Clone & install

```bash
git clone https://github.com/SHATHISH-07/port-system.git
cd port-system
```

### 2 — Backend setup

```bash
cd server
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
```

Create `server/.env`:

```env
DATABASE_URL=postgresql://postgres:yourpassword@127.0.0.1:5432/portsystem
MODEL_PATH=models/stay_model.pkl
RETRAIN_THRESHOLD_NEW_RECORDS=1000
RETRAIN_CHECK_INTERVAL_SECONDS=60
```

Start the backend:

```bash
uvicorn main:app --reload
# → http://localhost:8000
# → Swagger docs: http://localhost:8000/docs
```

### 3 — Frontend setup

```bash
cd client
npm install
npm run dev
# → http://localhost:5173
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@127.0.0.1:5432/portsystem` | PostgreSQL connection string |
| `MODEL_PATH` | `models/stay_model.pkl` | Path to saved model artifact |
| `RETRAIN_THRESHOLD_NEW_RECORDS` | `1000` | New DB records required to trigger auto-retrain |
| `RETRAIN_CHECK_INTERVAL_SECONDS` | `60` | How often the background service checks for new records |

---

## API Reference

### Vessel Analysis

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/vessel/vessel-history-analysis` | Historical vessel analysis for a given vessel ID |
| `POST` | `/vessel/current-vessel-analysis` | Live analysis; optionally override with `loaded` / `discharged` |
| `POST` | `/vessel/heatmap` | Yard container concentration heatmap for a vessel |

**Form fields for analysis endpoints:**

| Field | Type | Required | Description |
|---|---|---|---|
| `vessel_id` | `string` | ✅ | Outbound service / vessel identifier |
| `loaded` | `int` | ❌ | Override: loaded container count (current only) |
| `discharged` | `int` | ❌ | Override: discharged container count (current only) |

---

### Model Training

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/model/vessel-stay/training` | Trigger training run (multipart/form-data) |
| `GET` | `/model/vessel-stay/training/status` | Poll current training status |

**Training request fields:**

| Field | Type | Default | Description |
|---|---|---|---|
| `data_source` | `"db"` \| `"file"` | `"db"` | Load from PostgreSQL or from uploaded CSV |
| `file` | `UploadFile` | — | Required when `data_source = "file"` |
| `update_db` | `bool` | `false` | Persist uploaded CSV data into history table |

**Training status response:**

```json
{
  "status": "idle | training | completed | error",
  "message": "...",
  "records_count": 12540,
  "data_source": "db",
  "training_type": "manual"
}
```

---

### Data Upload

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/upload/history` | **Append** CSV rows into the `history_*` tables |
| `POST` | `/upload/current` | **Upsert** CSV rows into the `current_*` tables |

**Upload form fields:**

| Field | Type | Description |
|---|---|---|
| `file` | `UploadFile` | CSV file matching expected schema |

> **Schema validation** — Extra columns are silently ignored. Records missing `outbound_service`, `actual_outbound_carrier_visit_id`, or `unit_id` are dropped before insert.

---

## ML Pipeline

### Model Architecture

```
VotingRegressor(
    estimators=[
        ("ridge", Pipeline([StandardScaler, Ridge(alpha=10)])),
        ("xgb",   XGBRegressor(n_estimators=80, max_depth=3, lr=0.08)),
        ("gbr",   GradientBoostingRegressor(n_estimators=60, max_depth=2)),
    ]
)
```

### Feature Set (13 features)

| Feature | Description |
|---|---|
| `loaded` | Loaded container count |
| `discharged` | Discharged container count |
| `total_moves` | Total container operations |
| `imbalance` | `abs(loaded - discharged)` |
| `load_ratio` | `loaded / (total_moves + 1)` |
| `discharge_ratio` | `discharged / (total_moves + 1)` |
| `container_count` | Total containers in visit |
| `avg_weight` | Average container weight (kg) |
| `heavy_count` | Heavy containers (>24t) |
| `reefer_count` | Refrigerated containers |
| `hazard_count` | Hazardous cargo containers |
| `oog_count` | Out-of-gauge containers |
| `service_hash` | Hashed outbound service ID |

### Training Filters

| Filter | Value | Reason |
|---|---|---|
| Min stay | 2 hours | Remove noise / incomplete operations |
| Max stay | 240 hours | Remove outlier / data entry errors |
| Min rows per visit | 5 | Require sufficient container records |

### Automated Retraining

- **Nightly cron**: Runs daily at **02:00 AM** via APScheduler
- **Threshold trigger**: Also runs when `≥ RETRAIN_THRESHOLD_NEW_RECORDS` new records are detected in the history table (checked every `RETRAIN_CHECK_INTERVAL_SECONDS`)
- **Concurrency guard**: A second training run cannot start while one is already in progress

---

## Frontend Pages

### History Analysis (`/history-analysis`)
- Upload historical CSV dataset (Accordion)
- Enter vessel ID → Run Analysis
- Sections rendered: **Performance Metrics**, **Visit History table**, **Operational Intelligence** (Berth + Execution + Risks), **Yard Preparation Strategy**, **Berth Impact Table**

### Current Analysis (`/current-analysis`)
- Upload current CSV dataset (Accordion)
- Enter vessel ID + optional loaded/discharged override → Run Analysis
- Same sections as History + embedded **Live Yard Heatmap**

### Terminal Heatmap (`/heatmap`)
- Full-page interactive 3D terminal map
- Yard block color = container concentration (`High` → Red, `Medium` → Amber, `Low` → Green)

### Train Model (`/train-model`)
- **Data Source** selection: `Use Database` or `Upload CSV File`
- `Upload CSV` mode shows drag-and-drop zone + option to persist to DB
- Real-time **Training Status card** with 3-second polling when active
- **Retry** button appears on failure, reuses last configuration

---

## Database Schema

The system uses three normalized table groups, with **`history_*`** for training data and **`current_*`** for live operational data.

```sql
-- history_vessels / current_vessels
CREATE TABLE {type}_vessels (
    outbound_service TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

-- history_visits / current_visits
CREATE TABLE {type}_visits (
    actual_outbound_carrier_visit_id TEXT PRIMARY KEY,
    outbound_service TEXT REFERENCES {type}_vessels,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

-- history_containers / current_containers
CREATE TABLE {type}_containers (
    id TEXT,
    actual_outbound_carrier_visit_id TEXT REFERENCES {type}_visits,
    unit_id TEXT,
    move_complete_time TIMESTAMPTZ,
    time_in TIMESTAMPTZ,
    time_out TIMESTAMPTZ,
    ctr_from_position TEXT,
    ctr_to_position TEXT,
    unit_weight_in_kg NUMERIC,
    verified_gross_mass_kg NUMERIC,
    reefer BOOLEAN,
    hazardous_flag BOOLEAN,
    oog_unit BOOLEAN,
    port_of_discharge TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    PRIMARY KEY (actual_outbound_carrier_visit_id, unit_id)  -- unique constraint
);
```

**Write strategies:**
- `history_*` → **APPEND** (INSERT with `ON CONFLICT DO UPDATE`)  
- `current_*` → **UPSERT** (INSERT with `ON CONFLICT (visit_id, unit_id) DO UPDATE`)

---

## Data Flow

```
CSV Upload ──► validate_dataframe()
                  │ drop nulls, clean columns, parse datetimes
                  ▼
             save_to_history() / save_to_current()
                  │ bulk upsert via temp table
                  ▼
             PostgreSQL (history_* or current_*)
                  │
                  ├──► load_from_db(type, vessel_id)
                  │         │
                  │         ▼
                  │    analyze_vessel_dashboard()
                  │         ├─ predict_vessel_stay_duration()   [ML model]
                  │         ├─ berth_analysis()                 [travel distance ranking]
                  │         ├─ execution_plan()                 [step-by-step ops]
                  │         ├─ risk_assessment()                [congestion flags]
                  │         └─ yard_strategy()                  [weight / port distribution]
                  │
                  └──► get_vessel_heatmap()
                            └─ block concentration (High/Med/Low)
```

---

## Configuration Reference

All tunable parameters live in `server/config.py` under the `Settings` class:

| Setting | Default | Description |
|---|---|---|
| `TRAIN_MIN_HOURS` | `2` | Minimum stay to include in training |
| `TRAIN_MAX_HOURS` | `240` | Maximum stay to include in training |
| `MIN_VISIT_ROWS` | `5` | Minimum container rows per visit |
| `VESSEL_WINDOW_HOURS` | `96` | Time window for grouping vessel operations |
| `RETRAIN_THRESHOLD_NEW_RECORDS` | `1000` | Auto-retrain trigger (env override supported) |
| `RETRAIN_CHECK_INTERVAL_SECONDS` | `60` | Background check frequency (env override supported) |
| `MODEL_PATH` | `models/stay_model.pkl` | Artifact path (env override supported) |

---

## License

MIT © SHATHISH-07
