# PortSync — Berth & Yard Optimization Platform

> **Enterprise-grade vessel stay time prediction and terminal intelligence system.**  
> FastAPI · React 18 + TypeScript · PostgreSQL · VotingRegressor ML ensemble

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
9. [Automated Retraining](#automated-retraining)
10. [Frontend Pages & Routing](#frontend-pages--routing)
11. [Database Schema](#database-schema)
12. [Data Flow](#data-flow)
13. [Configuration Reference](#configuration-reference)

---

## Overview

PortSync ingests raw container movement data from a Terminal Operating System (TOS) export, stores it in a normalized PostgreSQL schema, trains a machine learning ensemble to predict vessel stay times, and surfaces actionable terminal intelligence through a professional React dashboard.

**Core capabilities:**

| Capability | Description |
|---|---|
| **Stay Time Prediction** | VotingRegressor (Ridge + XGBoost + GBR) predicts vessel stay in hours |
| **History Analysis** | Retrospective review: visit records, berth rankings, stay trends |
| **Current Analysis** | Live operational view: berth assignment, yard heatmap, execution plan |
| **Terminal Heatmap** | 3D yard block map — container concentration (High / Medium / Low) |
| **Unified Ingestion** | Single `POST /ingest/vessel-data` endpoint — CSV file, JSON file, or raw JSON body |
| **Automated Retraining** | Nightly cron (02:00 AM) + ingest-triggered threshold check |
| **DB-backed Metadata** | Training run history persisted in `training_metadata` PostgreSQL table |
| **Light / Dark Mode** | MUI v6 two-step theme system — live toggle, all components adapt |

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          PortSync System                             │
│                                                                      │
│   ┌───────────────────────┐     HTTP      ┌──────────────────────┐  │
│   │  React + TypeScript   │◄────────────►│   FastAPI Backend     │  │
│   │  Vite 8 · MUI v6      │              │   Uvicorn · Python 3  │  │
│   │  localhost:5173        │              │   localhost:8000      │  │
│   └───────────────────────┘              └──────────┬───────────┘  │
│                                                      │               │
│                                         ┌────────────▼────────────┐  │
│                                         │   PostgreSQL Database    │  │
│                                         │  history_* / current_*   │  │
│                                         │  training_metadata       │  │
│                                         └─────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Automated Retraining Flow

```
POST /ingest/vessel-data → save_to_history()
                                  │
                                  ▼
                    check_and_trigger_retraining()
                                  │
                                  ├── current_count - last_trained_size ≥ 1000? ──► YES ──► background_train_and_update(df)
                                  │                                                                    │
                                  └── NO: skip                                                         ▼
                                                                                        train_stay_model(df)
                                                                                                    │
APScheduler (cron 02:00 AM) ──► scheduled_retraining_job()                                          ▼
                │                  (same threshold check)                              stay_model.pkl saved
                └──────────────────────────────────────────────────────►           save_training_metadata()
                                                                                   (PostgreSQL training_metadata)
```

---

## Tech Stack

### Backend

| Package | Purpose |
|---|---|
| **Python 3.11+** | Language runtime — type hints, `asyncio`, `match` statements |
| **FastAPI** | REST API framework with automatic OpenAPI docs (`/docs`) |
| **Uvicorn** | ASGI server (`--reload` in development) |
| **SQLAlchemy + psycopg2** | PostgreSQL ORM + raw COPY driver |
| **APScheduler** | `AsyncIOScheduler` — nightly cron job at 02:00 AM |
| **XGBoost** | `XGBRegressor` — gradient boosted tree |
| **scikit-learn** | `Ridge`, `GradientBoostingRegressor`, `VotingRegressor`, `Pipeline`, `StandardScaler` |
| **pandas** | DataFrame processing + SQL reads |
| **joblib** | Model serialization / deserialization |
| **python-dotenv** | `.env` configuration loading |

### Frontend

| Package | Purpose |
|---|---|
| **React 18** | UI framework with `lazy()` + `Suspense` per-page code splitting |
| **TypeScript** | Full type safety, zero `tsc` errors |
| **Vite 8** | Dev server + production bundler |
| **MUI v6 (Material UI)** | Component library — Cards, Tables, Chips, Accordions, Buttons |
| **React Router v7** | Client-side routing (`BrowserRouter`) |
| **Axios** | HTTP client (`baseURL: http://localhost:8000`) |

---

## Project Structure

```
port-system/
│
├── README.md
│
├── client/                              # React Frontend
│   ├── index.html                       # Inter font (Google Fonts), title: PortSync
│   └── src/
│       ├── App.tsx                      # Root: ThemeContextProvider + BrowserRouter + Routes
│       ├── api/
│       │   └── api.ts                   # Axios instance — baseURL: http://localhost:8000
│       ├── theme/
│       │   └── ThemeContext.tsx         # Two-step MUI theme factory + Light/Dark Context
│       ├── components/
│       │   ├── Layout.tsx               # Sticky 56px header + page title/subtitle + toggle
│       │   ├── Sidebar.tsx              # Collapsible sidebar (248px open / 56px closed)
│       │   ├── FileUpload.tsx           # Drag-and-drop CSV zone (theme-aware)
│       │   ├── TrainingStatusCard.tsx   # Polling status (3s when active) + Retry button
│       │   └── vessel-analysis/         # 8 data display components
│       │       ├── AnalysisHeader.tsx   # Vessel ID input + Run Analysis button
│       │       ├── PerformanceStats.tsx # 3-column stat grid (actual / predicted / variance)
│       │       ├── BerthRecommendation.tsx  # Large berth ID + concentration badge
│       │       ├── BerthImpactTable.tsx # Ranked berth table (expandable)
│       │       ├── ExecutionPlan.tsx    # Numbered step list
│       │       ├── RiskAndStrategy.tsx  # Severity-tagged risk list
│       │       ├── VisitTable.tsx       # Visit history table + inline bar chart
│       │       └── YardStrategy.tsx     # 3-col grid: weight / ports / reshuffle
│       └── pages/
│           ├── HistoryVesselAnalysis.tsx
│           ├── CurrentVesselAnalysis.tsx
│           ├── DataIngestion.tsx        # CSV / JSON file upload → POST /ingest/vessel-data
│           ├── TerminalMap.tsx          # 3D interactive heatmap (lazy loaded)
│           └── TrainModel.tsx           # Training status view + launch links
│
└── server/                              # FastAPI Backend
    ├── main.py                          # App factory, CORS, scheduler, HTTP middleware
    ├── config.py                        # Settings class — all constants + SQL templates
    ├── .env                             # Local secrets (not committed)
    │
    ├── routes/
    │   ├── vessel_routes.py             # /vessel/* — analysis + heatmap endpoints
    │   ├── model_routes.py              # /model/* — training trigger + status
    │   ├── ingest_routes.py             # /ingest/* — unified CSV/JSON ingestion
    │   └── config_routes.py             # /config/* — retraining config read/write
    │
    ├── services/
    │   ├── vessel_service.py            # Dashboard orchestration (predict + berth + risks)
    │   ├── heatmap_service.py           # Yard block concentration logic
    │   └── retraining_service.py        # Threshold trigger + nightly cron + metadata
    │
    ├── models/
    │   ├── stay_model.py                # VotingRegressor train + predict functions
    │   ├── training_status.py           # Thread-safe in-memory training state store
    │   ├── retraining_config.py         # Runtime-mutable retraining threshold config
    │   └── stay_model.pkl               # Auto-generated trained artifact
    │
    ├── db/
    │   ├── connection.py                # SQLAlchemy engine factory + DB init
    │   ├── schema.py                    # init_dataset_schema() — DDL per dataset type
    │   ├── queries.py                   # load_from_db / save_to_history / save_to_current
    │   └── training_metadata.py         # save_training_metadata / get_latest_training_metadata
    │
    └── utils/
        ├── data_loader.py               # load_from_file, validate_dataframe, clean_column_names
        ├── feature_utils.py             # create_features() — 13 ML features
        ├── stay_utils.py                # prepare_visit_data, compute_visit_stay
        ├── datetime_utils.py            # Timezone-aware datetime parsing
        ├── cache_utils.py               # In-memory vessel result cache (TTL)
        └── terminal_layout.py           # get_all_blocks(df) — yard position parsing
```

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 14+ running on `localhost:5432`

### 1 — Clone the repository

```bash
git clone https://github.com/SHATHISH-07/port-system.git
cd port-system
```

### 2 — Backend setup

```bash
cd server
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS / Linux
pip install -r requirements.txt
```

Create `server/.env`:

```env
DATABASE_URL=postgresql://postgres:yourpassword@127.0.0.1:5432/portsystem
MODEL_PATH=models/stay_model.pkl
RETRAIN_THRESHOLD_NEW_RECORDS=1000
RETRAIN_CHECK_INTERVAL_SECONDS=60
```

Start the server:

```bash
uvicorn main:app --reload
# API:   http://localhost:8000
# Docs:  http://localhost:8000/docs
```

### 3 — Frontend setup

```bash
cd client
npm install
npm run dev
# App:   http://localhost:5173
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@127.0.0.1:5432/portsystem` | PostgreSQL connection string |
| `MODEL_PATH` | `models/stay_model.pkl` | Path where the trained model artifact is saved |
| `RETRAIN_THRESHOLD_NEW_RECORDS` | `1000` | New history records required to auto-trigger retraining |
| `RETRAIN_CHECK_INTERVAL_SECONDS` | `60` | *(reserved — actual check is event-driven on ingest)* |

---

## API Reference

### Vessel Analysis — `POST /vessel/*`

All vessel endpoints accept `multipart/form-data` and return JSON.

| Endpoint | Description |
|---|---|
| `POST /vessel/vessel-history-analysis` | Historical dashboard for a vessel |
| `POST /vessel/current-vessel-analysis` | Live dashboard; optional manual override |
| `POST /vessel/heatmap` | Yard block concentration heatmap |

**Request fields:**

| Field | Type | Endpoints | Description |
|---|---|---|---|
| `vessel_id` | `string` | all | Outbound service / vessel identifier |
| `loaded` | `int` | current only | Override: loaded container count |
| `discharged` | `int` | current only | Override: discharged container count |

> Results are cached in memory (`vessel_cache`). The cache is cleared on every ingest.

**Analysis response shape:**

```json
{
  "mode": "history | current | current-override",
  "actual":   { "avg_hours": 42.5, "visits": { "VISIT_001": {...} } },
  "predicted": { "avg_hours": 39.2, "visits": 3 },
  "input":    { "loaded": 120, "discharged": 95 },
  "berth_analysis": [ { "berth": "B3", "cargo_concentration": "Low", "congestion_risk": "Low" } ],
  "execution_plan": ["Step 1...", "Step 2..."],
  "risks": ["Risk A...", "Risk B..."],
  "yard_strategy": { "weight_distribution": {}, "top_discharge_ports": {}, "reshuffle_risk": "Medium" }
}
```

---

### Data Ingestion — `POST /ingest/vessel-data`

Single unified endpoint that accepts data in three forms:

| Input mode | How to send |
|---|---|
| **CSV file** | `multipart/form-data` — `file` field with a `.csv` file |
| **JSON file** | `multipart/form-data` — `file` field with a `.json` file |
| **Raw JSON** | `multipart/form-data` — `json_data` field as a JSON string |

After a successful ingest the endpoint:
1. Validates required columns and drops null-key rows
2. Appends rows to `history_*` tables
3. Upserts rows into `current_*` tables
4. Clears the vessel analysis cache
5. Fires `check_and_trigger_retraining()` in the background if new history rows were saved

**Response:**

```json
{
  "status": "ok",
  "records_processed": 4230,
  "history_rows_saved": 4230,
  "current_rows_saved": 4230,
  "errors": [],
  "message": "Successfully ingested 4230 records into history and current tables."
}
```

**Validation rules:**
1. File extension must be `.csv` or `.json` (if uploading a file)
2. Required columns must be present: `move_complete_time`, `time_in`, `time_out`, `outbound_service`, `actual_outbound_carrier_visit_id`, `unit_id`
3. Rows with null primary key fields are dropped automatically
4. Extra columns beyond `DB_EXPECTED_COLUMNS` are discarded

---

### Model Training — `POST /model/*`

| Endpoint | Method | Description |
|---|---|---|
| `/model/vessel-stay/training` | `POST` | Start a training run |
| `/model/vessel-stay/training/status` | `GET` | Poll training state |

**Training request (`multipart/form-data`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `data_source` | `"db"` \| `"file"` | `"db"` | Load from PostgreSQL or uploaded CSV |
| `file` | `UploadFile` (.csv) | — | Required when `data_source = "file"` |
| `update_db` | `bool` | `false` | Also persist uploaded CSV into `history_*` tables |
| `config` | `JSON string` | — | Optional hyperparameter overrides (see below) |

**Hyperparameter config keys (all optional):**

```json
{ "n_estimators": 200, "max_depth": 12, "min_samples_leaf": 5, "random_state": 42 }
```

**Training response:**

```json
{ "status": "started", "message": "Training started on 12,540 records from database.", "config": {...} }
```

**Status response:**

```json
{
  "status": "idle | training | completed | error",
  "message": "Model trained successfully",
  "records_count": 12540,
  "data_source": "db",
  "training_type": "manual | automated | scheduled"
}
```

> A concurrent training request is rejected while one is already running.

---

### Retraining Config — `/config/*`

| Endpoint | Method | Description |
|---|---|---|
| `/config/retraining` | `GET` | Read current threshold and interval |
| `/config/retraining` | `PUT` | Update threshold / interval at runtime |

---

## ML Pipeline

### Model Architecture

```python
VotingRegressor(estimators=[
    ("ridge", Pipeline([
        ("scaler", StandardScaler()),
        ("ridge",  Ridge(alpha=10.0)),
    ])),
    ("xgb", XGBRegressor(
        n_estimators=80, max_depth=3, learning_rate=0.08,
        subsample=0.8, colsample_bytree=0.8,
        min_child_weight=5, reg_alpha=1.0, reg_lambda=5.0,
    )),
    ("gbr", GradientBoostingRegressor(
        n_estimators=60, max_depth=2, learning_rate=0.10,
        subsample=0.75, min_samples_leaf=8,
    )),
])
```

### Feature Set (13 features)

| Feature | Derivation |
|---|---|
| `loaded` | Loaded container count per visit |
| `discharged` | Discharged container count per visit |
| `total_moves` | `loaded + discharged` |
| `imbalance` | `abs(loaded - discharged)` |
| `load_ratio` | `loaded / (total_moves + 1)` |
| `discharge_ratio` | `discharged / (total_moves + 1)` |
| `container_count` | Total containers in visit |
| `avg_weight` | Mean `unit_weight_in_kg` |
| `heavy_count` | Containers with weight > threshold |
| `reefer_count` | `reefer == True` count |
| `hazard_count` | `hazardous_flag == True` count |
| `oog_count` | `oog_unit == True` count |
| `service_hash` | `hash(outbound_service) % 1_000_000` |

### Training Filters

| Filter | Threshold | Reason |
|---|---|---|
| Min stay | `TRAIN_MIN_HOURS = 2h` | Discard noise / incomplete ops |
| Max stay | `TRAIN_MAX_HOURS = 240h` | Discard outliers / data errors |
| Min rows/visit | `MIN_VISIT_ROWS = 5` | Require enough container records |

### Target Variable

Stay time is calculated per visit group:

```
stay = compute_visit_stay(visit_df)
     = mean of (time_out - time_in) per session within VESSEL_WINDOW_HOURS (96h)
```

---

## Automated Retraining

Two independent triggers share the same threshold logic.

### 1 — Ingest-triggered (event-driven)

Called immediately after every successful `POST /ingest/vessel-data` that saves new history rows:

```python
check_and_trigger_retraining(background_tasks)
  ├── get_history_count()       # SELECT COUNT(*) FROM history_containers WHERE deleted_at IS NULL
  ├── get_metadata()            # reads training_metadata table (latest row)
  ├── difference = current_count - last_trained_size
  └── if difference >= RETRAIN_THRESHOLD_NEW_RECORDS OR first_run:
          training_type = "automated"
          background_tasks.add_task(background_train_and_update, df, config)
```

### 2 — Nightly cron (APScheduler)

Registered at startup via `lifespan()`:

```python
scheduler.add_job(scheduled_retraining_job, 'cron', hour=2, minute=0)
```

Applies the same threshold logic. Uses `asyncio.to_thread()` for non-blocking DB reads. Sets `training_type = "scheduled"`.

### Metadata persistence

After each successful training run, a row is inserted into the `training_metadata` PostgreSQL table:

| Column | Description |
|---|---|
| `last_trained_dataset_size` | Number of history rows trained on |
| `last_trained_timestamp` | UTC timestamp of training completion |
| `data_source` | `"db"` or `"file"` |
| `training_type` | `"manual"`, `"automated"`, or `"scheduled"` |
| `status` | `"completed"` or `"error"` |
| `notes` | Error message if failed |

---

## Frontend Pages & Routing

| Route | Page | Description |
|---|---|---|
| `/` | → redirect | Redirects to `/history-analysis` |
| `/history-analysis` | `HistoryVesselAnalysis` | Historical vessel dashboard |
| `/current-analysis` | `CurrentVesselAnalysis` | Live vessel dashboard |
| `/heatmap` | `TerminalMap` | 3D yard container heatmap |
| `/data-ingestion` | `DataIngestion` | CSV / JSON file upload UI |
| `/train-model` | `TrainModel` | Training status + launch links |

All pages are **lazy-loaded** (`React.lazy`) with a `CircularProgress` fallback. `TerminalMap` is pre-fetched 2 seconds after initial load.

### Page Sections

#### History Analysis (`/history-analysis`)
- **AnalysisHeader** — Vessel ID input + Run Analysis (calls `POST /vessel/vessel-history-analysis`)
- Section 01: **PerformanceStats** — actual / predicted / variance
- Section 02: **VisitTable** — sorted visit records + inline stay bar
- Section 03: **Operational Intelligence** — BerthRecommendation + ExecutionPlan + RiskAndStrategy
- Section 04: **YardStrategy** — weight distribution + top discharge ports + reshuffle risk
- Section 05: **BerthImpactTable** — ranked berths (expandable beyond top 5)

#### Current Analysis (`/current-analysis`)
- **AnalysisHeader** — Vessel ID + optional Loaded / Discharged override
- Same sections as History + **Live Yard Heatmap** (Section 02, embedded from `POST /vessel/heatmap`)

#### Terminal Heatmap (`/heatmap`)
- Full-page 3D terminal map
- Yard block color = container concentration (`High`→Red, `Medium`→Amber, `Low`→Green)
- Vessel ID search + block-level drill-down

#### Data Ingestion (`/data-ingestion`)
- **CSV mode** — drag-and-drop or click-to-browse `.csv` file → `POST /ingest/vessel-data`
- **JSON mode** — paste raw JSON array/object → `POST /ingest/vessel-data`
- Inline result card: records processed, history rows saved, current rows saved
- Required column reference displayed below the upload zone

#### Train Model (`/train-model`)
- Live training status snapshot (polls `GET /model/vessel-stay/training/status`)
- Links to trigger training via API (`POST /model/vessel-stay/training`)
- **TrainingStatusCard** — full polling UI shown when training is active

---

## Database Schema

Two parallel schema groups — `history_*` for training, `current_*` for live analysis.

```sql
-- {type}_vessels
CREATE TABLE {type}_vessels (
    outbound_service  TEXT PRIMARY KEY,
    created_at        TIMESTAMPTZ,
    updated_at        TIMESTAMPTZ,
    deleted_at        TIMESTAMPTZ
);

-- {type}_visits
CREATE TABLE {type}_visits (
    actual_outbound_carrier_visit_id  TEXT PRIMARY KEY,
    outbound_service                  TEXT REFERENCES {type}_vessels(outbound_service),
    created_at                        TIMESTAMPTZ,
    updated_at                        TIMESTAMPTZ,
    deleted_at                        TIMESTAMPTZ
);

-- {type}_containers
CREATE TABLE {type}_containers (
    id                                UUID,
    actual_outbound_carrier_visit_id  TEXT REFERENCES {type}_visits,
    unit_id                           TEXT,
    move_complete_time                TIMESTAMPTZ,
    time_in                           TIMESTAMPTZ,
    time_out                          TIMESTAMPTZ,
    ctr_from_position                 TEXT,
    ctr_to_position                   TEXT,
    unit_weight_in_kg                 NUMERIC,
    verified_gross_mass_kg            NUMERIC,
    reefer                            BOOLEAN,
    hazardous_flag                    BOOLEAN,
    oog_unit                          BOOLEAN,
    port_of_discharge                 TEXT,
    created_at                        TIMESTAMPTZ,
    updated_at                        TIMESTAMPTZ,
    deleted_at                        TIMESTAMPTZ,
    PRIMARY KEY (actual_outbound_carrier_visit_id, unit_id)
);

-- training_metadata  (auto-initialized on startup)
CREATE TABLE training_metadata (
    id                         SERIAL PRIMARY KEY,
    last_trained_dataset_size  INTEGER,
    last_trained_timestamp     TIMESTAMPTZ,
    data_source                TEXT,
    training_type              TEXT,
    status                     TEXT,
    notes                      TEXT,
    created_at                 TIMESTAMPTZ,
    updated_at                 TIMESTAMPTZ,
    deleted_at                 TIMESTAMPTZ
);
```

### Write Strategies

| Table group | Strategy | SQL mechanism |
|---|---|---|
| `history_*` | **Append** — never delete existing rows | Containers: `to_sql(if_exists="append")`; Vessels/Visits: `ON CONFLICT DO UPDATE` |
| `current_*` | **Upsert** — full replace on conflict | All three tables: `ON CONFLICT DO UPDATE` via temp table + `COPY` |

Both strategies use PostgreSQL's `COPY` command for high-throughput bulk ingestion.

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│  POST /ingest/vessel-data                                   │
│       │  (CSV file / JSON file / json_data form field)      │
│       ▼                                                      │
│  load_from_file(bytes)   ← clean_column_names()             │
│    or pd.DataFrame(json_records)                            │
│       │                                                      │
│  validate_dataframe()    ← check required cols              │
│       │                    drop null PKs                     │
│       │                    parse datetimes                   │
│       ▼                                                      │
│  save_to_history()  ─── vessels/visits/containers UPSERT    │
│  save_to_current()  ─── vessels/visits/containers UPSERT    │
│       │                                                      │
│       ├──► check_and_trigger_retraining() (history only)    │
│       │         └──► background_train_and_update(df)        │
│       │                   ├──► stay_model.pkl               │
│       │                   └──► save_training_metadata()     │
│       │                                                      │
│       └──► vessel_cache.clear()                             │
│                                                              │
│  GET/POST Analysis Request                                   │
│       │                                                      │
│       ▼                                                      │
│  load_from_db(type, vessel_id)                              │
│       │                                                      │
│       ▼                                                      │
│  analyze_vessel_dashboard(df, vessel_id)                    │
│       ├─ predict_vessel_stay_duration()  ← stay_model.pkl   │
│       ├─ berth_analysis()               ← travel distance   │
│       ├─ execution_plan()               ← step generator    │
│       ├─ risk_assessment()              ← congestion flags  │
│       └─ yard_strategy()               ← weight/port dist  │
│                                                              │
│  get_vessel_heatmap(df, vessel_id)                          │
│       └─ per-block concentration (High / Medium / Low)      │
└─────────────────────────────────────────────────────────────┘
```

---

## Configuration Reference

All tunable parameters are in `server/config.py` (`Settings` class):

| Setting | Default | Env Override | Description |
|---|---|---|---|
| `DATABASE_URL` | `postgresql://...` | ✅ | PostgreSQL connection |
| `MODEL_PATH` | `models/stay_model.pkl` | ✅ | Artifact save path |
| `TRAIN_MIN_HOURS` | `2` | ❌ | Min stay for training sample |
| `TRAIN_MAX_HOURS` | `240` | ❌ | Max stay for training sample |
| `MIN_VISIT_ROWS` | `5` | ❌ | Min container rows per visit |
| `VESSEL_WINDOW_HOURS` | `96` | ❌ | Session grouping window |
| `RETRAIN_THRESHOLD_NEW_RECORDS` | `1000` | ✅ | New records to trigger auto-retrain |
| `RETRAIN_CHECK_INTERVAL_SECONDS` | `60` | ✅ | Reserved config key |

---

## License

MIT © [SHATHISH-07](https://github.com/SHATHISH-07)
