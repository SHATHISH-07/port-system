# PortSync — Berth & Yard Optimization Platform

> Enterprise-grade vessel stay prediction, berth intelligence, and terminal optimization platform.
>
> Built with **Python 3.13** · **FastAPI** · **React 18** · **TypeScript** · **PostgreSQL** · **ML Ensemble Models**

---

## Table of Contents

1. [Overview](#overview)
2. [Core Features](#core-features)
3. [System Architecture](#system-architecture)
4. [Authentication & RBAC](#authentication--rbac)
5. [Technology Stack](#technology-stack)
6. [Project Structure](#project-structure)
7. [Getting Started](#getting-started)
8. [Environment Variables](#environment-variables)
9. [API Reference](#api-reference)
10. [Data Ingestion Pipeline](#data-ingestion-pipeline)
11. [Machine Learning Pipeline](#machine-learning-pipeline)
12. [Automated Retraining](#automated-retraining)
13. [Frontend Architecture](#frontend-architecture)
14. [Database Architecture](#database-architecture)
15. [Request System](#request-system)
16. [Security Architecture](#security-architecture)
17. [QA & Testing Framework](#qa--testing-framework)
18. [Configuration Reference](#configuration-reference)
19. [Future Scope](#future-scope)

---

## Overview

PortSync is a production-grade vessel stay prediction and terminal intelligence platform designed for modern port and yard operations.

The platform ingests raw container movement data from Terminal Operating System (TOS) exports, stores operational history in PostgreSQL, trains machine learning models for vessel stay prediction, and exposes operational intelligence through an enterprise React dashboard.

**The system supports:**

- Continuous ingestion of vessel/container movement data
- Historical + live operational analytics
- Vessel stay prediction using ML ensemble models
- Terminal heatmap visualization
- Automated retraining pipelines
- Role-based access control (RBAC)
- Admin-controlled operations center
- Background ML processing
- Automated threshold-based retraining

---

## Core Features

### Vessel & Terminal Operations

- **Vessel Stay Prediction** — Advanced ML ensemble (VotingRegressor) that accurately predicts vessel stay duration in hours based on historical operations.
- **Current Operations Dashboard** — Live operational vessel intelligence tracking KPIs like crane productivity, reshuffle risks, and load/discharge balance.
- **3D Terminal Heatmap** — Dynamic yard block concentration visualization allowing operators to visually spot congestion hotspots and heavy container stacks.
- **Historical Analytics** — Deep-dive analysis of historical vessel operations to identify operational bottlenecks and past inefficiencies.

### Machine Learning & Data Pipeline

- **Unified Ingestion Endpoint** — A single robust `/ingest/vessel-data` API that automatically processes and upserts both CSV and JSON operational payloads.
- **Automated Threshold Retraining** — The ML model automatically triggers background retraining when a predefined threshold of new operational records (e.g. 1,000) is reached.
- **Scheduled Retraining** — Configurable APScheduler integration for nightly or weekly model maintenance.
- **Training Metadata Tracking** — Persistent storage of model performance, dataset size, and timestamps to maintain a complete ML audit trail.

### Security & Administration

- **Role-Based Access Control (RBAC)** — Secure multi-tier authorization differentiating between general `Users` and highly-privileged `Admins`.
- **Operations Center** — Centralized admin-only control panel for managing ingestion, users, system logs, and triggering manual model retraining.
- **JWT Authentication & Bcrypt** — Industry-standard cryptographic security for all user sessions.
- **SQL Injection & Payload Tampering Protection** — Fully parameterized SQLAlchemy architecture and rigorous Pydantic validation intercepting malicious inputs safely.

### QA & Reliability

- **100% Automated Test Coverage** — A split-architecture Pytest & Playwright E2E suite executed via `run_tests.py` generating `.xlsx` and `.docx` QA reports.
- **PostgreSQL UPSERT Integrity** — Zero-downtime concurrent data ingestion utilizing `ON CONFLICT DO UPDATE` to gracefully handle duplicate streams.

---

## System Architecture

```mermaid
graph TD
    subgraph Frontend["Frontend"]
        F1[React 18 + TypeScript]
        F2[Material UI Dashboard]
        F3[Role-Based Routing]
    end

    subgraph Backend["Backend · FastAPI"]
        B1[JWT Authentication]
        B2[Ingestion Service]
        B3[ML Training Service]
        B4[Scheduler · APScheduler]
    end

    subgraph Database["Database · PostgreSQL"]
        D1[(History Tables)]
        D2[(Current Tables)]
        D3[(Training Metadata)]
    end

    subgraph ML["ML Pipeline"]
        M1[Feature Engineering]
        M2[XGBoost]
        M3[GradientBoostingRegressor]
        M4[Ridge Regression]
        M5[VotingRegressor]
        M6[Vessel Stay Prediction]
    end

    Frontend -->|REST / JWT| Backend
    B2 --> D1
    B2 --> D2
    B3 --> M1
    M1 --> M2
    M1 --> M3
    M1 --> M4
    M2 --> M5
    M3 --> M5
    M4 --> M5
    M5 --> M6
    B3 --> D3
    B4 --> B3
    D1 -->|Training data| M1
```

---

## Authentication & RBAC

The platform uses JWT-based authentication with role-based access control.

### Admin

Admins have full access to all platform capabilities:

- Access Operations Center
- Upload CSV/JSON datasets & trigger ML retraining
- Configure retraining thresholds
- Create users and additional admins
- Monitor ingestion and training status
- View logs and manage requests

### User

Standard users have read-only access:

- View dashboards, analytics, heatmaps, and predictions
- Create operational requests

Users **cannot** upload datasets, trigger retraining, access the Operations Center, or manage users.

### Authentication Flow

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as FastAPI
    participant DB as PostgreSQL

    U->>F: Login Request
    F->>B: POST /auth/login
    B->>DB: Validate Credentials
    DB-->>B: User Found
    B-->>F: JWT Token
    F-->>U: Redirect to Dashboard
```

### User Flow

```mermaid
graph TD
    A[User Opens Platform] --> B{Authenticated?}

    B -- No --> C[Login Page]
    B -- Yes --> D[Dashboard]

    C --> E[Submit Credentials]
    E --> F{Valid Credentials?}
    F -- No --> C
    F -- Yes --> D

    D --> G{Role?}
    G -- User --> H[Analytics · Heatmap · Predictions]
    G -- Admin --> I[Operations Center]
```

---

## Technology Stack

### Backend

| Technology | Purpose |
| --- | --- |
| Python 3.11+ | Runtime |
| FastAPI | REST API framework |
| PostgreSQL | Primary database |
| SQLAlchemy | ORM |
| APScheduler | Automated retraining |
| pandas | Data processing |
| scikit-learn | ML utilities |
| XGBoost | Gradient boosting model |
| joblib | Model persistence |
| passlib/bcrypt | Password hashing |
| python-jose | JWT authentication |

### Frontend

| Technology | Purpose |
| --- | --- |
| React 18 | UI framework |
| TypeScript | Type safety |
| Material UI v6 | Component system |
| React Router | Routing |
| Axios | API communication |
| Vite | Build system |

---

## Project Structure

```
port-system/
│
├── client/
│   └── src/
│       ├── api/
│       ├── components/
│       ├── context/
│       ├── pages/
│       ├── routes/
│       ├── theme/
│       └── utils/
│
├── server/
│   ├── db/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   ├── config.py
│   └── main.py
│
└── README.md
```

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 14+

### Backend Setup

```bash
cd server
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS / Linux
pip install -r requirements.txt
```

Create a `.env` file in the `server/` directory:

```env
DATABASE_URL=postgresql://postgres:password@127.0.0.1:5432/portsystem
MODEL_PATH=models/stay_model.pkl
JWT_SECRET_KEY=super_secret_key
RETRAIN_THRESHOLD_NEW_RECORDS=1000
```

Start the backend:

```bash
uvicorn main:app --reload
```

### Frontend Setup

```bash
cd client
npm install
npm run dev
```

---

## Environment Variables

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `MODEL_PATH` | ML model artifact path |
| `JWT_SECRET_KEY` | JWT signing secret |
| `RETRAIN_THRESHOLD_NEW_RECORDS` | Retraining trigger threshold (new records) |
| `RETRAIN_CHECK_INTERVAL_SECONDS` | Interval between retraining threshold checks |

---

## API Reference

### Authentication

| Endpoint | Method | Description |
| --- | --- | --- |
| `/auth/login` | `POST` | User login |
| `/auth/me` | `GET` | Current user profile |
| `/auth/logout` | `POST` | Logout |

### User Management

| Endpoint | Method | Description |
| --- | --- | --- |
| `/users/create` | `POST` | Create user |
| `/users/create-admin` | `POST` | Create admin |
| `/users/list` | `GET` | List users |
| `/users/deactivate` | `PUT` | Deactivate account |

### Vessel

| Endpoint | Method | Description |
| --- | --- | --- |
| `/vessel/vessel-history-analysis` | `POST` | Historical analysis |
| `/vessel/current-vessel-analysis` | `POST` | Current vessel analysis |
| `/vessel/heatmap` | `POST` | Heatmap generation |

### Ingestion

| Endpoint | Method | Description |
| --- | --- | --- |
| `/ingest/vessel-data` | `POST` | CSV/JSON ingestion |

### Model

| Endpoint | Method | Description |
| --- | --- | --- |
| `/model/vessel-stay/training` | `POST` | Trigger training |
| `/model/vessel-stay/training/status` | `GET` | Training status |

---

## Data Ingestion Pipeline

The ingestion system accepts **CSV files**, **JSON files**, and **raw JSON payloads**.

### Ingestion Flow

```mermaid
flowchart TD
    A[CSV / JSON Upload] --> B[Parse Data]
    B --> C[Validate Schema]
    C --> D[Clean Columns]
    D --> E[Save History Tables]
    D --> F[UPSERT Current Tables]
    E --> G[Increment Retraining Counter]
    G --> H{Threshold Reached?}
    H -- Yes --> I[Trigger Background Retraining]
    H -- No --> J[Finish]
```

### Available Data Fields

| Field | Field |
| --- | --- |
| `unit_id` | `unit_visit_gkey` |
| `complex_id` | `facility_id` |
| `yard_id` | `category_id` |
| `equipment_class` | `container_length` |
| `equipment_type` | `freight_kind` |
| `destination` | `unit_weight_kg` |
| `verified_gross_mass_kg` | `reefer` |
| `oog_unit` | `hazardous_flag` |
| `hazard_un_numbers` | `imdg_code` |
| `stow_code_1/2/3` | `port_of_discharge` |
| `actual_inbound_carrier_visit_id` | `inbound_service` |
| `actual_outbound_carrier_visit_id` | `outbound_service` |
| `arrival_mode` | `current_position` |
| `visit_state` | `transit_state` |
| `time_in` | `time_out` |
| `move_complete_time` | `ctr_from_position` |
| `ctr_to_position` | |

---

## Machine Learning Pipeline

### Model Architecture

The platform uses a **VotingRegressor** ensemble combining three complementary algorithms for improved prediction stability and generalization.

### ML Pipeline Flow

```mermaid
graph TD
    A[Historical Container Data] --> B[Feature Engineering]

    B --> C[Loaded Containers]
    B --> D[Discharged Containers]
    B --> E[Weight Features]
    B --> F[Hazard Features]
    B --> G[Service Features]

    C --> H[VotingRegressor]
    D --> H
    E --> H
    F --> H
    G --> H

    H --> I[XGBoost]
    H --> J[GradientBoostingRegressor]
    H --> K[Ridge Regression]

    I --> L[Predicted Vessel Stay · hours]
    J --> L
    K --> L
```

### Raw Data Fields Used

| Raw Dataset Column | Usage / Purpose |
| --- | --- |
| `actual_outbound_carrier_visit_id` | Primary grouping key for isolating individual vessel visits |
| `unit_id` | Unique identifier for tracking individual container lifecycle |
| `move_complete_time` | Core timestamp for calculating the start and end of yard moves |
| `time_in` / `time_out` | Fallbacks to calculate vessel stay windows and arrival bounds |
| `ctr_from_position` / `ctr_to_position` | Parsed to determine move types and yard block layout |
| `verified_gross_mass_kg` | Analyzed to classify container weight (Light / Medium / Heavy / Extra Heavy) |
| `hazardous_flag` | Boolean flag used to assess safety buffer requirements |
| `reefer` | Boolean flag used to assess power point allocation |
| `oog_unit` | Out-of-gauge boolean to detect oversized cargo requiring special handling |
| `port_of_discharge` | Grouped to calculate yard strategy and stowage concentration |

### Engineered ML Features

| Engineered Feature | Description |
| --- | --- |
| `loaded` | Total count of containers moved from Yard to Vessel |
| `discharged` | Total count of containers moved from Vessel to Yard |
| `total_moves` | Sum of loaded and discharged containers for a visit |
| `imbalance` | Absolute difference between loaded and discharged volumes |
| `avg_weight` | Mean `verified_gross_mass_kg` across all containers in the visit |
| `reefer_count` | Sum of all containers flagged as refrigerated |
| `hazard_count` | Sum of all containers flagged as hazardous |
| `oog_count` | Sum of all containers flagged as out-of-gauge |
| `service_hash` | Deterministic integer hash of the outbound service string |

---

## Automated Retraining

The platform supports two retraining mechanisms to keep the ML model current with evolving operational patterns.

**Threshold-based** — triggered automatically after 1,000 new ingested records.  
**Scheduled** — runs automatically every day at 2:00 AM via APScheduler.

### Retraining Flow

```mermaid
sequenceDiagram
    participant I as Ingestion
    participant B as Backend
    participant DB as Database
    participant ML as ML Pipeline

    I->>B: New Records
    B->>DB: Save History Tables
    B->>DB: Update Current Tables
    B->>B: Check Threshold

    alt Threshold Reached
        B->>ML: Start Background Retraining
        ML->>DB: Save Training Metadata
    end
```

---

## Frontend Architecture

### Main Pages

| Route | Description |
| --- | --- |
| `/dashboard` | Main analytics dashboard |
| `/history-analysis` | Historical vessel analysis |
| `/current-analysis` | Current vessel analysis |
| `/heatmap` | 3D yard heatmap |
| `/operations-center` | Admin operations dashboard |
| `/user-management` | User administration |
| `/train-model` | Training controls |

### Operations Center

The Operations Center is restricted to **Admin users only** and provides centralized control over:

- Data ingestion management
- Model training controls
- Retraining configuration
- Training status monitoring
- Pending requests review
- System monitoring and logs

---

## Database Architecture

The platform uses a **dual-table operational architecture** to serve two distinct purposes simultaneously.

### Database Flow

```mermaid
flowchart LR
    A[Incoming Data] --> B[(History Tables\nAppend-only)]
    A --> C[(Current Tables\nUPSERT)]
    B --> D[ML Training]
    C --> E[Live Dashboard]
```

**History Tables** — append-only storage used for ML training, historical analytics, and retraining.

**Current Tables** — UPSERT storage using `ON CONFLICT DO UPDATE` to always reflect the latest operational state without duplication.

---

## Request System

Users can submit the following types of operational requests for admin review:

- **Upload Requests** — request a dataset upload to be performed by an admin
- **Retraining Requests** — request a model retraining run
- **Config Update Requests** — request changes to system configuration

Admins review all pending requests through the Operations Center and manually execute the requested tasks.

---

## Security Architecture

The platform implements a multi-layered security model across every request.

```mermaid
graph TD
    A[Client Request] --> B[JWT Validation]
    B --> C{Valid Token?}

    C -- No --> D[401 Unauthorized]
    C -- Yes --> E[Role Validation]

    E --> F{Admin Route?}
    F -- Yes --> G[Admin Access Granted]
    F -- No --> H[User Access Granted]
```

**Security measures implemented:**

- JWT authentication with configurable expiry
- bcrypt password hashing
- Role-based authorization on every route
- Admin-only routes with elevated permission checks
- Fully parameterized SQLAlchemy queries (SQL injection prevention)
- Pydantic validation on all incoming payloads (payload tampering prevention)

---

## QA & Testing Framework

PortSync features a robust, enterprise-grade automated testing suite designed to validate the entire platform from the database layer up to the React frontend.

### Testing Architecture

The QA system uses **Pytest** and **Playwright** completely isolated from each other to prevent asynchronous event loop collisions.

- **API Tests** — validates FastAPI endpoints, security logic, RBAC, DB integrity, and ML inference
- **E2E Tests** — Playwright scripts simulate actual user interactions (Login, Navigation, Dashboard viewing)
- **Isolated Environment** — uses a dedicated PostgreSQL test database and sandboxes ML models (`tests/models/stay_model_test.pkl`) to prevent production pollution

### Running Tests

Run the complete automated suite:

```bash
python tests/run_tests.py
```

Run with a visible browser (headful mode):

```bash
python tests/run_tests.py --headful
```

The orchestrator runs the API suite and E2E suite sequentially, automatically generating professional `.xlsx` and `.docx` QA reports in the `tests/reports/` directory.

---

## Configuration Reference

| Config | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `MODEL_PATH` | Trained model artifact path |
| `JWT_SECRET_KEY` | JWT signing secret |
| `RETRAIN_THRESHOLD_NEW_RECORDS` | Auto-retraining trigger threshold |
| `TRAIN_MIN_HOURS` | Minimum vessel stay threshold for training data |
| `TRAIN_MAX_HOURS` | Maximum vessel stay threshold for training data |
| `MIN_VISIT_ROWS` | Minimum rows required per vessel visit to be included in training |

---

## Future Scope

Operational enhancements planned for future releases:

- **Crane intelligence** — predictive crane scheduling and productivity optimization
- **Berth optimization** — automated berth allocation recommendations
- **ITV tracking** — integrated tractor vehicle real-time tracking
- **Congestion simulation** — proactive yard congestion scenario modeling
- **Real-time ETA recalculation** — dynamic vessel arrival adjustments
- **Yard optimization AI** — AI-driven container placement recommendations
- **Predictive congestion analysis** — early warning system for operational bottlenecks