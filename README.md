# PortSync — Berth & Yard Optimization Platform

> Enterprise-grade vessel stay prediction, berth intelligence, and terminal optimization platform.
>
> Built with Python 3.13 · FastAPI · React 18 · TypeScript · PostgreSQL · Machine Learning Ensemble Models

---

# Table of Contents

1. Overview
2. Core Features
3. System Architecture
4. Authentication & RBAC
5. Technology Stack
6. Project Structure
7. Getting Started
8. Environment Variables
9. API Reference
10. Data Ingestion Pipeline
11. Machine Learning Pipeline
12. Automated Retraining Flow
13. Frontend Architecture
14. Database Architecture
15. Data Flow
16. Request Flow
17. Training Lifecycle
18. Security Architecture
19. Configuration Reference
20. Future Scope

---

# Overview

PortSync is a production-grade vessel stay prediction and terminal intelligence platform designed for modern port and yard operations.

The platform ingests raw container movement data from Terminal Operating System (TOS) exports, stores operational history in PostgreSQL, trains machine learning models for vessel stay prediction, and exposes operational intelligence through an enterprise React dashboard.

The system supports:

* Continuous ingestion of vessel/container movement data
* Historical + live operational analytics
* Vessel stay prediction using ML ensemble models
* Terminal heatmap visualization
* Automated retraining pipelines
* Role-based access control (RBAC)
* Admin-controlled operations center
* Background ML processing
* Automated threshold-based retraining

---

# Core Features

The PortSync platform is currently packed with the following fully-implemented capabilities:

### Vessel & Terminal Operations
* **Vessel Stay Prediction**: An advanced ML ensemble (VotingRegressor) that accurately predicts the vessel stay duration in hours based on historical operations.
* **Current Operations Dashboard**: Live operational vessel intelligence tracking KPIs like crane productivity, reshuffle risks, and load/discharge balance.
* **3D Terminal Heatmap**: Dynamic yard block concentration visualization allowing operators to visually spot congestion hotspots and heavy container stacks.
* **Historical Analytics**: Deep-dive analysis of historical vessel operations to identify operational bottlenecks and past inefficiencies.

### Machine Learning & Data Pipeline
* **Unified Ingestion Endpoint**: A single, robust `/ingest/vessel-data` API that automatically processes and intelligently upserts both CSV and JSON operational payloads.
* **Automated Threshold Retraining**: The ML model automatically triggers background retraining when a predefined threshold of new operational records (e.g., 1000) is reached.
* **Scheduled Retraining**: Configurable APScheduler integration for nightly or weekly model maintenance.
* **Training Metadata Tracking**: Persistent storage of model performance, dataset size, and timestamps to maintain a complete ML audit trail.

### Security & Administration
* **Role-Based Access Control (RBAC)**: Secure multi-tier authorization differentiating between general `Users` and highly-privileged `Admins`.
* **Operations Center**: Centralized admin-only control panel for managing ingestion, users, system logs, and triggering manual model retraining.
* **JWT Authentication & Bcrypt**: Industry-standard cryptographic security for all user sessions.
* **SQL Injection & Payload Tampering Protection**: Fully parameterized SQLAlchemy architecture and rigorous Pydantic validation intercepting malicious inputs safely.

### QA & Reliability
* **100% Automated Test Coverage**: A split architecture Pytest & Playwright E2E suite executed via `run_tests.py` generating `.xlsx` and `.docx` QA reports.
* **PostgreSQL UPSERT Integrity**: Zero-downtime concurrent data ingestion utilizing `ON CONFLICT DO UPDATE` to gracefully handle duplicate streams.

---

# System Architecture
```mermaid
graph TD
    subgraph Frontend
        A[React 18 + TypeScript]
        B[Material UI Dashboard]
        C[Role-Based Routing]
    end

    subgraph Backend
        D[FastAPI]
        E[JWT Authentication]
        F[ML Training Services]
        G[Ingestion Services]
        H[Scheduler Services]
    end

    subgraph Database
        I[(PostgreSQL)]
        J[(History Tables)]
        K[(Current Tables)]
        L[(Training Metadata)]
    end

    subgraph ML
        M[Feature Engineering]
        N[VotingRegressor]
        O[XGBoost]
        P[Gradient Boosting]
        Q[Ridge Regression]
    end

    A --> D
    D --> I
    G --> J
    G --> K
    F --> M
    M --> N
    M --> O
    M --> P
    M --> Q
    F --> L
    H --> F
```

---

# Authentication & RBAC

The platform uses JWT-based authentication with role-based access control.

## Roles

### Admin

Admins can:

* Access Operations Center
* Upload CSV/JSON datasets
* Trigger ML retraining
* Configure retraining thresholds
* Create users
* Create additional admins
* Monitor ingestion status
* Monitor training status
* View logs
* Manage requests

### User

Users can:

* View dashboards
* View analytics
* View heatmaps
* View predictions
* Create operational requests

Users cannot:

* Upload datasets
* Trigger retraining
* Access Operations Center
* Manage users
* Access ingestion endpoints

---

# Authentication Flow
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

---

# User Flow
```mermaid
graph TD
    A[User Opens Platform] --> B{Authenticated?}

    B -- No --> C[Login Page]
    B -- Yes --> D[Dashboard]

    C --> E[Submit Credentials]
    E --> F{Valid Credentials?}

    F -- No --> C
    F -- Yes --> D

    D --> G{Role}

    G -- User --> H[Analytics + Heatmap + Predictions]
    G -- Admin --> I[Operations Center]
```

---

# Technology Stack

## Backend

| Technology     | Purpose                 |
| -------------- | ----------------------- |
| Python 3.11+   | Runtime                 |
| FastAPI        | REST API framework      |
| PostgreSQL     | Primary database        |
| SQLAlchemy     | ORM                     |
| APScheduler    | Automated retraining    |
| pandas         | Data processing         |
| scikit-learn   | ML utilities            |
| XGBoost        | Gradient boosting model |
| joblib         | Model persistence       |
| passlib/bcrypt | Password hashing        |
| python-jose    | JWT authentication      |

## Frontend

| Technology     | Purpose           |
| -------------- | ----------------- |
| React 18       | UI framework      |
| TypeScript     | Type safety       |
| Material UI v6 | Component system  |
| React Router   | Routing           |
| Axios          | API communication |
| Vite           | Build system      |

---

# Project Structure
```text
port-system/
│
├── client/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── context/
│   │   ├── pages/
│   │   ├── routes/
│   │   ├── theme/
│   │   └── utils/
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

# Getting Started

## Prerequisites

* Python 3.11+
* Node.js 18+
* PostgreSQL 14+

---

## Backend Setup
```bash
cd server
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Create `.env`

```env
DATABASE_URL=postgresql://postgres:password@127.0.0.1:5432/portsystem
MODEL_PATH=models/stay_model.pkl
JWT_SECRET_KEY=super_secret_key
RETRAIN_THRESHOLD_NEW_RECORDS=1000
```

Start Backend:

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

# Environment Variables

| Variable                       | Description                  |
| ------------------------------ | ---------------------------- |
| DATABASE_URL                   | PostgreSQL connection string |
| MODEL_PATH                     | ML model artifact path       |
| JWT_SECRET_KEY                 | JWT signing secret           |
| RETRAIN_THRESHOLD_NEW_RECORDS  | Retraining threshold         |
| RETRAIN_CHECK_INTERVAL_SECONDS | Retraining interval          |

---

# API Reference

## Authentication APIs

| Endpoint     | Method | Description          |
| ------------ | ------ | -------------------- |
| /auth/login  | POST   | User login           |
| /auth/me     | GET    | Current user profile |
| /auth/logout | POST   | Logout               |

---

## User Management APIs

| Endpoint            | Method | Description        |
| ------------------- | ------ | ------------------ |
| /users/create       | POST   | Create user        |
| /users/create-admin | POST   | Create admin       |
| /users/list         | GET    | List users         |
| /users/deactivate   | PUT    | Deactivate account |

---

## Vessel APIs

| Endpoint                        | Method | Description             |
| ------------------------------- | ------ | ----------------------- |
| /vessel/vessel-history-analysis | POST   | Historical analysis     |
| /vessel/current-vessel-analysis | POST   | Current vessel analysis |
| /vessel/heatmap                 | POST   | Heatmap generation      |

---

## Ingestion APIs

| Endpoint            | Method | Description        |
| ------------------- | ------ | ------------------ |
| /ingest/vessel-data | POST   | CSV/JSON ingestion |

---

## Model APIs

| Endpoint                           | Method | Description      |
| ---------------------------------- | ------ | ---------------- |
| /model/vessel-stay/training        | POST   | Trigger training |
| /model/vessel-stay/training/status | GET    | Training status  |

---

# Data Ingestion Pipeline

The ingestion system accepts:

* CSV files
* JSON files
* Raw JSON payloads

The ingestion pipeline:

1. Parses incoming data
2. Validates schema
3. Cleans columns
4. Stores history records
5. Updates current operational state
6. Clears cache
7. Checks retraining threshold

---

# Ingestion Flow
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

---

# Current Available Fields

The current platform supports the following operational fields:
```text
unit ID
Unit Visit Gkey
Complex Id
Facility Id
Yard Id
Category Id
Equipment Class
Container Length
Equipment type
Freight Kind
Destination
Unit Weight in kg
Verified Gross Mass (Kg)
Reefer
OOG Unit
Hazardous Flag
Hazard UN Numbers
IMDG Code
Stow Code 1
Stow Code 2
Stow Code 3
Port of Discharge
Actual Inbound Carrier visit ID
Inbound Service
Actual Outbound Carrier visit ID
Outbound Service
Arrival Mode
Current Position
Visit State
Transit State
Time Out
Time In
Move Complete Time
Ctr From Position
Ctr To Position
```

---

# Machine Learning Pipeline

## Model Architecture

The platform uses a VotingRegressor ensemble.

### Ensemble Models

* Ridge Regression
* XGBoost Regressor
* GradientBoostingRegressor

---

# ML Pipeline Flow
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

    H --> I[Predicted Vessel Stay Time]
```

---

# Dataset Features Used

To power the analytics and machine learning pipeline, PortSync extracts and utilizes the following raw fields from the Terminal Operating System (TOS) export dataset:

### 1. Extracted Raw Data Fields
| Raw Dataset Column | Usage / Purpose |
| :--- | :--- |
| `actual_outbound_carrier_visit_id` | Primary grouping key for isolating individual vessel visits. |
| `unit_id` | Unique identifier for tracking individual container lifecycle. |
| `move_complete_time` | Core timestamp for calculating the start and end of yard moves. |
| `time_in` / `time_out` | Used as fallbacks to calculate vessel stay windows and arrival bounds. |
| `ctr_from_position` / `ctr_to_position` | Parsed to determine move types (Loaded vs. Discharged) and Yard Block layout (e.g., `Y-A01` -> Block `A`). |
| `verified_gross_mass_kg` | Analyzed to classify container weight (Light, Medium, Heavy, Extra Heavy). |
| `hazardous_flag` | Boolean flag used to assess safety buffer requirements. |
| `reefer` | Boolean flag used to assess power point allocation. |
| `oog_unit` | Out-Of-Gauge boolean to detect oversized cargo requiring special handling. |
| `port_of_discharge` | Grouped to calculate yard strategy and stowage concentration. |

### 2. Engineered ML Features
The raw fields above are transformed into the following structured features used directly by the `VotingRegressor` ML Model:

| Engineered Feature | Description |
| :--- | :--- |
| `loaded` | Total count of containers moved from Yard to Vessel. |
| `discharged` | Total count of containers moved from Vessel to Yard. |
| `total_moves` | The sum of loaded and discharged containers for a visit. |
| `imbalance` | The absolute difference between loaded and discharged volumes. |
| `avg_weight` | The mean `verified_gross_mass_kg` across all containers in the visit. |
| `reefer_count` | Sum of all containers flagged as refrigerated. |
| `hazard_count` | Sum of all containers flagged as hazardous. |
| `oog_count` | Sum of all containers flagged as out-of-gauge. |
| `service_hash` | A deterministic integer hash of the outbound service string for categorical encoding. |

---

# Automated Retraining Flow

The platform supports:

## Threshold Retraining

Triggered after:

* 1000 new records

## Scheduled Retraining

Runs automatically:

* Daily at 2:00 AM

---

# Retraining Flow Diagram
```mermaid
sequenceDiagram
    participant I as Ingestion
    participant B as Backend
    participant DB as Database
    participant ML as ML Pipeline

    I->>B: New Records
    B->>DB: Save History
    B->>DB: Update Current
    B->>B: Check Threshold

    alt Threshold Reached
        B->>ML: Start Retraining
        ML->>DB: Save Metadata
    end
```

---

# Frontend Architecture

## Main Pages

| Route              | Description                |
| ------------------ | -------------------------- |
| /dashboard         | Main analytics dashboard   |
| /history-analysis  | Historical vessel analysis |
| /current-analysis  | Current vessel analysis    |
| /heatmap           | 3D yard heatmap            |
| /operations-center | Admin operations dashboard |
| /user-management   | User administration        |
| /train-model       | Training controls          |

---

# Operations Center

The Operations Center is admin-only.

Contains:

* Data Ingestion
* Model Training
* Retraining Configuration
* Training Status
* Pending Requests
* System Monitoring

---

# Database Architecture

The platform uses dual-table operational architecture.

## History Tables

Append-only storage.

Used for:

* ML training
* historical analytics
* retraining

## Current Tables

UPSERT latest operational state.

Used for:

* live dashboards
* current analysis
* heatmaps

---

# Database Flow
```mermaid
flowchart LR
    A[Incoming Data]

    A --> B[History Tables]
    A --> C[Current Tables]

    B --> D[ML Training]
    C --> E[Live Dashboard]
```

---

# Request System

Users can create:

* Upload Requests
* Retraining Requests
* Config Update Requests

Admins review requests and manually execute operational tasks.

---

# Security Architecture

The platform implements:

* JWT authentication
* bcrypt password hashing
* role-based authorization
* protected API routes
* admin-only routes
* token validation middleware

---

# Security Flow
```mermaid
graph TD
    A[Client Request] --> B[JWT Validation]
    B --> C{Valid Token?}

    C -- No --> D[401 Unauthorized]
    C -- Yes --> E[Role Validation]

    E --> F{Admin Route?}

    F -- Yes --> G[Admin Access]
    F -- No --> H[User Access]
```

---

# QA & Testing Framework

PortSync features a robust, enterprise-grade automated testing suite designed to validate the entire platform from the database layer up to the React frontend.

## Testing Architecture

The QA system uses **Pytest** and **Playwright** completely isolated from each other to prevent asynchronous event loop collisions.

* **API Tests**: Validates FastAPI endpoints, security logic, RBAC, DB integrity, and ML inference.
* **E2E Tests**: Playwright scripts simulate actual user interactions (Login, Navigation, Dashboard viewing).
* **Isolated Environment**: Uses a dedicated PostgreSQL test database and securely sandboxes ML models (`tests/models/stay_model_test.pkl`) to prevent production pollution.

## Executing Tests

To run the complete automated suite:
```bash
python tests/run_tests.py
```

To run tests with a visible browser (headful mode):
```bash
python tests/run_tests.py --headful
```

The orchestrator runs the API suite and E2E suite sequentially, automatically generating professional `.xlsx` and `.docx` QA reports in the `tests/reports/` directory.

---

# Configuration Reference

| Config                        | Description               |
| ----------------------------- | ------------------------- |
| DATABASE_URL                  | PostgreSQL connection     |
| MODEL_PATH                    | Trained model path        |
| JWT_SECRET_KEY                | JWT secret                |
| RETRAIN_THRESHOLD_NEW_RECORDS | Auto retraining threshold |
| TRAIN_MIN_HOURS               | Minimum stay threshold    |
| TRAIN_MAX_HOURS               | Maximum stay threshold    |
| MIN_VISIT_ROWS                | Minimum rows per visit    |

---

# Future Scope

Future operational enhancements may include:

* Crane intelligence
* Berth optimization
* ITV tracking
* Congestion simulation
* Real-time ETA recalculation
* Yard optimization AI
* Predictive congestion analysis

---