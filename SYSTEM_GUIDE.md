# PortSync — System Guide

> **Read this first.** If you are new to this codebase, this document explains the entire system — why it exists, how it works end-to-end, what every layer does, and how to run it locally without any cloud services, Docker, or external queues.

---

## Table of Contents

1. [What This System Does](#1-what-this-system-does)
2. [Core Architecture — 7 Layers](#2-core-architecture--7-layers)
3. [Project Structure](#3-project-structure)
4. [Local Environment Setup (No Docker)](#4-local-environment-setup-no-docker)
5. [System Operational Rules](#5-system-operational-rules)
6. [Dynamic Schema Adaptation](#6-dynamic-schema-adaptation)
7. [Automated ML Retraining Pipeline](#7-automated-ml-retraining-pipeline)
8. [API Reference Summary](#8-api-reference-summary)
9. [Frontend Architecture](#9-frontend-architecture)
10. [Authentication & RBAC](#10-authentication--rbac)
11. [Adding a New Terminal](#11-adding-a-new-terminal)
12. [Known Constraints](#12-known-constraints)

---

## 1. What This System Does

**PortSync** is a Terminal Operating System (TOS) intelligence platform. It takes raw container movement data uploaded from any port terminal — regardless of format or field naming convention — and produces:

- **Vessel stay-time predictions** using a trained Random Forest model
- **Live yard heatmaps** showing container concentration by block
- **Crane move analytics** (productivity per crane, move type distribution)
- **Berth recommendations** based on cargo density
- **Yard preparation strategies** (hazardous, reefer, OOG segregation)

The system is **terminal-agnostic**. It never assumes a fixed schema. Every data source is mapped to a canonical internal schema at ingestion time. New terminals are onboarded by configuring a Source Profile — no code changes needed.

---

## 2. Core Architecture — 7 Layers

```mermaid
flowchart TD
    L1["**LAYER 1 — Raw Upload**\nUser uploads .csv or .json via /ingest/vessel-data or /mapping/suggest\nFiles can use ANY column names from ANY terminal's TOS export"]
    L2["**LAYER 2 — Schema Detection & Mapping**  _(schema_mapper.py)_\n• detect_dataset_type(): scores columns against signature fields\n  → classifies as container_inventory or crane_moves\n• suggest_mappings(): maps raw column names to canonical names via\n  1) alias_map from Source Profile (exact, priority 1)\n  2) canonical alias registry (exact, priority 2)\n  3) RapidFuzz token_sort_ratio (fuzzy, priority 3)\n• Unmapped columns → JSONB dynamic_attributes (never lost)"]
    L3["**LAYER 3 — Canonical Transformation**  _(canonical_transformer.py)_\n• Renames columns to canonical names\n• Parses datetimes using formats from Source Profile\n• Derives vessel stay hours (time_out - time_in)\n• Computes per-visit features: loaded, discharged, total_moves, etc.\n• Splits data into history_* tables (training) + current_* tables (live)"]
    L4["**LAYER 4 — PostgreSQL Storage**  _(db/)_\nTables:\n• history_containers / history_visits / history_vessels — training data\n• current_containers / current_visits / current_vessels — live operations\n• crane_moves — canonical crane move records\n• source_profiles — per-source schema config\n• schema_mappings — confirmed field mappings (upserted, reusable)\n• training_metadata — audit log of every training run\n• users / terminals — auth and terminal registry"]
    L5["**LAYER 5 — ML Model**  _(models/stay_model.py)_\n• Algorithm: RandomForestRegressor (scikit-learn)\n• Target: vessel stay hours\n• Features: loaded, discharged, total_moves, imbalance, load_ratio,\n  discharge_ratio, container_count, avg_weight, heavy_count,\n  reefer_count, hazard_count, oog_count, service_hash\n• Saved to: server/models/stay_model.pkl\n• Min training hours: 2h  |  Max: 240h  |  Min rows per visit: 5"]
    L6["**LAYER 6 — Analytical Services**  _(services/, routes/)_\n• vessel_service.py: runs prediction, builds berth & yard analysis\n• heatmap_service.py: aggregates block-level container density\n• analytics_routes.py: crane move queries & aggregations"]
    L7["**LAYER 7 — React Dashboard**  _(client/)_\n• Vessel Analysis (current + history)\n• Live Yard Heatmap\n• Crane Analytics\n• Data Ingestion\n• Schema Mapping wizard\n• Source Profiles management\n• Model Training & Status\n• User Management (admin only)"]

    L1 --> L2 --> L3 --> L4 --> L5 --> L6 --> L7
```

---

## 3. Project Structure

```
port-system/
├── client/                         # React + Vite frontend
│   ├── src/
│   │   ├── api/api.ts              # Axios instance (auto-attaches JWT)
│   │   ├── auth/AuthContext.tsx    # Auth state + JWT provider
│   │   ├── theme/ThemeContext.tsx  # Slate & Indigo MUI theme (dark/light)
│   │   ├── components/            # Reusable UI components
│   │   │   ├── vessel-analysis/   # AnalysisHeader, BerthTable, etc.
│   │   │   ├── Sidebar.tsx        # Navigation
│   │   │   └── Layout.tsx         # Root layout wrapper
│   │   ├── pages/                 # Route-level page components
│   │   │   ├── CurrentVesselAnalysis.tsx
│   │   │   ├── HistoryVesselAnalysis.tsx
│   │   │   ├── HeatmapPage.tsx
│   │   │   ├── CraneAnalytics.tsx
│   │   │   ├── DataIngestion.tsx
│   │   │   ├── SchemaMapping.tsx
│   │   │   ├── SourceProfiles.tsx
│   │   │   ├── TrainModel.tsx
│   │   │   ├── UserManagement.tsx
│   │   │   └── Login.tsx
│   │   └── types/                 # TypeScript interfaces
│   └── vite.config.ts
│
├── server/                         # FastAPI backend
│   ├── main.py                     # App entry point, lifespan, scheduler
│   ├── config.py                   # Settings class (all constants & queries)
│   ├── auth/
│   │   └── utils.py               # JWT encode/decode, password hashing
│   ├── db/
│   │   ├── connection.py          # SQLAlchemy engine singleton
│   │   ├── schema.py              # Table DDL (init_* functions)
│   │   ├── queries.py             # load_from_db, insert helpers
│   │   └── training_metadata.py  # save/get training run records
│   ├── models/
│   │   ├── stay_model.py          # train_stay_model(), predict()
│   │   ├── training_status.py     # In-memory training state singleton
│   │   └── retraining_config.py  # Runtime-adjustable threshold config
│   ├── routes/                    # FastAPI routers (one file per domain)
│   │   ├── ingest_routes.py       # POST /ingest/vessel-data
│   │   ├── vessel_routes.py       # POST /vessel/current-vessel-analysis
│   │   ├── model_routes.py        # POST /model/vessel-stay/training
│   │   ├── mapping_routes.py      # POST /mapping/suggest, /mapping/confirm
│   │   ├── source_profile_routes.py
│   │   ├── analytics_routes.py    # GET /analytics/crane-moves
│   │   ├── auth_routes.py         # POST /auth/login, GET /auth/me
│   │   └── user_routes.py         # CRUD /users/
│   ├── services/
│   │   ├── schema_mapper.py       # Dataset detection + fuzzy field mapping
│   │   ├── canonical_transformer.py # Column rename + feature derivation
│   │   ├── vessel_service.py      # Analysis orchestration
│   │   ├── heatmap_service.py     # Block-level density aggregation
│   │   └── retraining_service.py  # Threshold checks + background training
│   ├── utils/
│   │   └── position_parser.py     # Parses "A01.01" style yard positions
│   └── worker/
│       └── tasks.py               # Celery task stub (disabled by default)
│
├── tests/                          # Pytest test suite
├── SYSTEM_GUIDE.md                 # ← You are here
├── README.md                       # Project overview & Mermaid diagrams
└── .gitignore
```

---

## 4. Local Environment Setup (No Docker)

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Python | 3.11+ | Use `py -3.11` on Windows |
| Node.js | 18+ | LTS recommended |
| PostgreSQL | 14+ | Running locally on port 5432 |

### 4.1 — Database

```sql
-- In psql or pgAdmin, create the database:
CREATE DATABASE portsystem;
```

Tables are created **automatically** on first server startup via `init_*_schema()` calls in `main.py`. You do not need to run any migration scripts manually.

### 4.2 — Server (FastAPI)

```powershell
cd port-system\server

# Create and activate virtual environment
python -m venv .venv
.venv\Scripts\Activate.ps1      # Windows PowerShell
# source .venv/bin/activate      # Mac / Linux

# Install dependencies
pip install fastapi uvicorn sqlalchemy psycopg2-binary python-dotenv
pip install scikit-learn pandas numpy rapidfuzz apscheduler python-jose passlib[bcrypt]

# Configure environment
copy .env.example .env           # If .env.example exists, otherwise create .env:
```

**`server/.env`** (minimum required):

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/portsystem
JWT_SECRET=your-secret-key-change-this
DEFAULT_ADMIN_USER=admin
DEFAULT_ADMIN_PASSWORD=admin123
MODEL_PATH=models/stay_model.pkl

# Retraining thresholds
RETRAIN_THRESHOLD_NEW_RECORDS=1000
RETRAIN_CHECK_INTERVAL_SECONDS=60

# Celery is DISABLED by default — all background work uses FastAPI BackgroundTasks
USE_CELERY=false
```

```powershell
# Start the server
uvicorn main:app --reload --port 8000
```

On startup, the server will:

1. Create all missing DB tables
2. Seed the default `admin` user (if it doesn't already exist)
3. Start the APScheduler cron job for nightly retraining at 02:00

### 4.3 — Client (React / Vite)

```powershell
cd port-system\client

npm install

# Configure API URL (optional — defaults to localhost:8000)
# Create client/.env.local:
# VITE_API_URL=http://localhost:8000

npm run dev
```

The app starts at `http://localhost:5173`.

**Default credentials:**
- Username: `admin`
- Password: `admin123`

> **Change the default password immediately after first login** via User Management.

### 4.4 — Verify Everything Works

```
Browser → http://localhost:5173 → Login → Data Ingestion → Upload a CSV
Server logs → should show: POST /ingest/vessel-data - 200
```

---

## 5. System Operational Rules

These rules are **non-negotiable** — violating them corrupts data integrity or breaks the ML pipeline.

### ✅ DO

- **Always preserve raw data.** The `history_containers` table is append-only (soft-delete only). Never `TRUNCATE` or hard-delete history rows — they are the training dataset.
- **Let the schema mapper handle field names.** Add aliases to Source Profile `alias_map` rather than hardcoding field names in Python.
- **Use `BackgroundTasks` for all long-running work.** Do not introduce blocking `time.sleep()` calls in route handlers.
- **Commit confirmed mappings to `schema_mappings`.** Once a user confirms field mappings via the Schema Mapping wizard, they are saved. Future uploads from the same source are auto-mapped without user intervention.
- **Read all config from `config.py / Settings`.** SQL queries, feature names, thresholds — they live in `Settings`, not scattered across route files.
- **Keep `current_*` tables as upserts, not appends.** The current tables represent the live state of the yard. Use `ON CONFLICT DO UPDATE`.

### ❌ DO NOT

- **Do not hardcode column names in routes or services.** Always derive them from the canonical field registries in `schema_mapper.py`.
- **Do not add Celery / Redis as a hard dependency.** Celery is optional (`USE_CELERY=false` by default). The system must work 100% locally using `FastAPI BackgroundTasks`.
- **Do not remove the `dynamic_attributes` JSONB pattern.** Unmapped columns from any dataset must always be preserved in this field — they may contain terminal-specific data needed later.
- **Do not modify `history_containers` rows.** History is the ground truth for model training. Modifying it silently degrades the model.
- **Do not add hardcoded schema names (e.g., `container_inventory_containers`).** Always use the `{dataset_type}` interpolation pattern from `config.py`.
- **Do not block the event loop.** CPU-heavy operations (model training) use `asyncio.to_thread()` or `BackgroundTasks`.

---

## 6. Dynamic Schema Adaptation

This is the core capability that makes the system terminal-agnostic.

### How field mapping works

```mermaid
flowchart TD
    subgraph TerminalA["Terminal A"]
        A1["Raw columns:\n'Unit Nbr', 'Time Completed', ..."]
        A2["Source Profile A\nalias_map:\n'Unit Nbr' → canonical_unit_id\n'Time Completed' → time_completed"]
        A1 --> A2
    end

    subgraph TerminalB["Terminal B"]
        B1["Raw columns:\n'container_id', 'move_complete_time', ..."]
        B2["Source Profile B\nalias_map: {}"]
        B1 --> B2
    end

    A2 --> MAPPER
    B2 --> MAPPER

    MAPPER["schema_mapper.suggest_mappings()\nPriority: alias_exact › canonical_exact › fuzzy"]

    MAPPER --> CANONICAL["Canonical column names:\ncanonical_unit_id, time_completed, move_kind, ..."]

    CANONICAL --> TRANSFORM["canonical_transformer.py\n• Renames columns\n• Parses datetimes\n• Derives features"]

    TRANSFORM --> DB1["history_* tables\n(training data)"]
    TRANSFORM --> DB2["current_* tables\n(live operations)"]
```

### `position_parser.py` — Yard Position Parsing

Container positions follow the pattern `BLOCK.ROW.BAY.TIER`, for example `A01.02.03.04`.

`position_parser.py` extracts:

| Field | Description |
|-------|-------------|
| `block` | Lettered storage block (A, B, C…) |
| `row` | Numeric row within the block |
| `bay` | Numeric bay within the block |
| `tier` | Numeric tier within the block |

The heatmap service uses these parsed coordinates to aggregate container counts by block, which feeds the live yard heatmap displayed in the dashboard.

### Dynamic Attribute JSONB

Any column that cannot be mapped to a canonical field is stored in `dynamic_attributes` as a JSONB object:

```json
{
  "terminal_custom_field_1": "value",
  "local_reference_code": "ABC123"
}
```

This ensures no data is lost even when a terminal's export contains proprietary fields. These attributes can be promoted to canonical fields later by updating the Source Profile `alias_map`.

### Datetime Format Detection

Source Profile `datetime_formats` is a JSON array of `strptime` format strings:

```json
["%d/%m/%Y %H:%M", "%Y-%m-%dT%H:%M:%S", "%m-%d-%Y"]
```

`canonical_transformer.py` tries each format in order. If none work, the field is left as `null` with a warning in the server log.

---

## 7. Automated ML Retraining Pipeline

The model self-updates as new data accumulates — no human intervention required.

```mermaid
flowchart TD
    INGEST["New data ingested\nPOST /ingest/vessel-data"]
    CHECK["check_and_trigger_retraining(background_tasks)\n• Count history_containers rows\n• Get last_trained_dataset_size from training_metadata\n• Compute difference"]
    THRESHOLD{{"difference >=\nRETRAIN_THRESHOLD_NEW_RECORDS\n(default: 1000)?"}}
    CELERY{{"USE_CELERY=true?"}}
    CELERY_TASK["Dispatch Celery task\n(optional / skipped if false)"]
    BG["FastAPI BackgroundTasks\n(always available)"]
    TRAIN["background_train_and_update(df, config)\n• train_stay_model(df)\n  → overwrites stay_model.pkl\n• save_training_metadata()\n  → audit log entry"]
    CRON["APScheduler cron job\n02:00 nightly\n→ scheduled_retraining_job()\n→ asyncio.to_thread() training"]
    SKIP["No retraining\n(threshold not met)"]

    INGEST --> CHECK
    CHECK --> THRESHOLD
    THRESHOLD -- YES --> CELERY
    THRESHOLD -- NO --> SKIP
    CELERY -- YES --> CELERY_TASK --> TRAIN
    CELERY -- NO --> BG --> TRAIN
    CRON --> CHECK
```

### Adjusting Thresholds at Runtime

The retraining threshold can be changed **without restarting the server** via the Config API:

```http
PUT /config/retraining
Content-Type: application/json
Authorization: Bearer <admin-token>

{"threshold": 500}
```

The `retraining_config` singleton (in-memory) updates immediately. The new threshold persists for the server's lifetime — restart resets to the `.env` value.

### Training Status Polling

`GET /model/vessel-stay/training/status` returns the current training state:

```json
{
  "status": "training",         // idle | training | completed | failed
  "message": "Training started",
  "records_count": 12450,
  "data_source": "db",
  "training_type": "automated"  // manual | automated | scheduled
}
```

The React `TrainingStatusCard` component polls this endpoint every 3 seconds during active training.

---

## 8. API Reference Summary

All routes are prefixed as shown. Full interactive docs at `http://localhost:8000/docs`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/login` | None | OAuth2 password grant → JWT token |
| `GET` | `/auth/me` | JWT | Current user info |
| `GET` | `/users/` | Admin | List all users |
| `POST` | `/users/` | Admin | Create user |
| `PUT` | `/users/{id}/toggle-active` | Admin | Enable / disable account |
| `PUT` | `/users/{id}/reset-password` | Admin | Force password reset |
| `POST` | `/ingest/vessel-data` | JWT | Upload CSV or JSON container data |
| `POST` | `/vessel/current-vessel-analysis` | JWT | Run analysis for a vessel ID |
| `POST` | `/vessel/heatmap` | JWT | Get yard heatmap for a vessel |
| `POST` | `/vessel/history-analysis` | JWT | Historical analysis with date range |
| `POST` | `/model/vessel-stay/training` | JWT | Trigger manual model training |
| `GET` | `/model/vessel-stay/training/status` | JWT | Poll training progress |
| `POST` | `/mapping/suggest` | JWT | Upload file → get schema suggestions |
| `POST` | `/mapping/confirm` | JWT | Persist confirmed mappings |
| `GET` | `/source-profiles/` | JWT | List source profiles |
| `POST` | `/source-profiles/` | JWT | Create source profile |
| `PUT` | `/source-profiles/{id}` | JWT | Update source profile |
| `DELETE` | `/source-profiles/{id}` | JWT | Soft-delete source profile |
| `GET` | `/analytics/crane-moves` | JWT | Query crane move records |
| `GET` | `/config/retraining` | JWT | Get current retraining config |
| `PUT` | `/config/retraining` | Admin | Update retraining threshold |

---

## 9. Frontend Architecture

### Theme System

All UI uses the **Slate & Indigo** design system defined in `ThemeContext.tsx`:

| Mode | Background | Primary | Text |
|------|-----------|---------|------|
| Dark | `#202020` | `#60a5fa` | `#f0f2f5` |
| Light | `#ffffff` | `#1a73e8` | `#111827` |

Font: Inter (Google Fonts), fallback to system sans-serif. Toggle via the moon/sun icon in the sidebar header.

### Page Aesthetic Standard

All pages follow the **vessel analysis pattern**:
- `borderBottom` header with title + subtitle (no `Paper` wraps)
- Monospace section numbers (`01`, `02`, `03`) for content sections
- `TableContainer` without heavy elevation — borders from theme divider
- Text buttons for non-destructive actions, `variant="contained"` only for primary CTA

### Authentication Flow

```mermaid
flowchart TD
    LOAD["App loads"]
    READ["AuthProvider reads token\nfrom localStorage"]
    VALIDATE["GET /auth/me\n(validates token)"]
    SETSTATE["Sets user state"]
    PROTECTED["Protected route accessed"]
    CHECK{{"Valid session?"}}
    ROLECHECK{{"Role check\n(admin route?)"}}
    RENDER["Render page"]
    LOGIN_REDIRECT["Redirect to /login"]
    HIDDEN["Route hidden from\nnon-admin users"]

    LOAD --> READ --> VALIDATE --> SETSTATE
    SETSTATE --> PROTECTED --> CHECK
    CHECK -- YES --> ROLECHECK
    CHECK -- NO --> LOGIN_REDIRECT
    ROLECHECK -- PASS --> RENDER
    ROLECHECK -- FAIL --> HIDDEN
```

### API Client

`src/api/api.ts` exports an Axios instance that:
- Automatically attaches `Authorization: Bearer <token>` from `localStorage`
- Base URL from `VITE_API_URL` env (defaults to `http://localhost:8000`)

---

## 10. Authentication & RBAC

### Roles

| Role | Capabilities |
|------|-------------|
| `admin` | Full access: user management, model training, all data operations |
| `user` | Read & analysis only: vessel analysis, heatmap, crane analytics |

### JWT

| Setting | Value |
|---------|-------|
| Algorithm | `HS256` |
| Expiry | 7 days (configurable via `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`) |
| Secret | `JWT_SECRET` in `.env` — **always override the default in production** |

### Securing the Default Admin

On first startup, the system seeds:
- Username: value of `DEFAULT_ADMIN_USER` (default: `admin`)
- Password: value of `DEFAULT_ADMIN_PASSWORD` (default: `admin123`)

> **Change both values in `.env` before deploying to any non-local environment.**

---

## 11. Adding a New Terminal

No code changes needed. Follow this three-step workflow:

```mermaid
flowchart LR
    S1["**Step 1**\nCreate Source Profile\n(sidebar → Source Profiles\n→ New Profile)"]
    S2["**Step 2**\nRun Schema Mapping Wizard\n(sidebar → Schema Mapping\n→ upload sample file\n→ confirm mappings)"]
    S3["**Step 3**\nIngest Data\n(sidebar → Data Ingestion\n→ select file\n→ click Ingest Data)"]

    S1 --> S2 --> S3
```

### Step 1 — Create a Source Profile

Navigate to **Source Profiles** in the sidebar and click **New Profile**:

```json
{
  "name": "Terminal B — TOS Export",
  "description": "Raw exports from TerminalOS v4",
  "dataset_type": "container_inventory",
  "alias_map": {
    "Unit Nbr": "canonical_unit_id",
    "Time Completed": "move_complete_time",
    "Arrival DT": "time_in",
    "Departure DT": "time_out"
  },
  "datetime_formats": ["%d/%m/%Y %H:%M:%S", "%Y-%m-%d %H:%M"],
  "detection_rules": {}
}
```

### Step 2 — Run Schema Mapping Wizard

Navigate to **Schema Mapping**:

1. Select the Source Profile you created
2. Upload a sample file from Terminal B
3. Review the auto-suggested mappings (adjust any incorrect ones)
4. Click **Confirm & Save Template**

Future uploads from Terminal B will use this template automatically.

### Step 3 — Ingest Data

Navigate to **Data Ingestion**, select the file, click **Ingest Data**.

The system will:
- Apply the Source Profile alias map
- Parse datetimes using the configured formats
- Insert into `history_*` and `current_*` tables
- Trigger automated retraining if the threshold is met

---

## 12. Known Constraints

| Constraint | Detail |
|-----------|--------|
| **Single model** | One `stay_model.pkl` shared across all terminals. Per-terminal models are not yet supported. |
| **Berth count** | Heatmap hardcodes 3 berths (Berth 1, 2, 3). The SVG connector lines assume this. |
| **No real-time events** | The system is polling-based. Live push (WebSocket/SSE) is not implemented. |
| **Celery is optional** | Background retraining via `FastAPI BackgroundTasks` runs in-process. For heavy workloads (>100k rows), enabling Celery with a Redis broker is recommended. |
| **Model file is local** | `stay_model.pkl` is written to the server filesystem. In a multi-instance deployment, this must be replaced with shared storage (S3, NFS). |
| **No soft-delete UI** | Source profiles and schema mappings can be deactivated via the API but there is no bulk restore UI. |