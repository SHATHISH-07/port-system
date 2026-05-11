# PortSync System Flow & Architecture Guide

This guide explains the end-to-end flow of the PortSync analytics platform, detailing every major function and component.

---

## 1. Data Ingestion Flow

When data (CSV/JSON) is uploaded via the API or bulk script:

1.  **Entry Point**: `ingest_routes.py` -> `upload_data()`
2.  **Yard Detection**: `utils/position_parser.py` -> `get_yard_id()`
    - It looks at `ctr_from_position` or `ctr_to_position`.
    - If it starts with `Y-PEB-`, it assigns `yard_id = 'PEB'`.
    - If it starts with `Y-CWIT-`, it assigns `yard_id = 'CWIT'`.
3.  **Table Routing**: `db/queries.py` -> `ensure_yard_tables()`
    - Dynamically creates tables like `peb_history_containers` if they don't exist.
    - Tables are partitioned by `time_in` (for history) or HASH of `carrier_visit` (for cranes).
4.  **Batch Insertion**: Records are inserted into the specific yard table.
    - If no yard is detected, data goes into the monolithic `history_containers`, `current_containers`, or `crane_movements` table as a fallback.

---

## 2. Vessel Analytics Flow (Vessel Dashboard)

When a user selects a vessel in the UI:

1.  **Backend Call**: `vessel_routes.py` -> `get_vessel_analysis(vessel_id)`
2.  **Service Logic**: `vessel_service.py` -> `analyze_vessel_dashboard(vessel_id)`
3.  **Data Retrieval**: `db/queries.py` -> `load_from_db()`
    - **Global Search**: Discovers ALL tables ending in `_history_containers`, `_current_containers`, etc.
    - **Union/Concat**: Loads data from all yard-specific tables and the monolithic legacy tables.
    - **Pandas Refinement**: Merges schemas and filters for the specific `vessel_id`.
4.  **ML Stay-Time Prediction**: `models/stay_model.pkl`
    - Uses a `VotingRegressor` (Ridge + XGBoost + GradientBoosting).
    - Calculates features: `total_moves`, `imbalance`, `hazard_count`, `block_concentration`, etc.
    - Predicts the `stay_hours` for current vessels.
5.  **Operational Predictions**: `vessel_service.py` -> `_predict_operational_metrics()`
    - **Crane Assignment**: Calculates required MPH based on total moves and ML-predicted stay time.
    - **Strategy**: Recommends `HIGH_DENSITY_FIRST`, `BALANCED_DUAL_CRANE`, or `BLOCK_SEQUENTIAL` based on crane count and yard spread.
    - **Conflict Risk**: Analyzes block intensity and ITV travel estimates.
6.  **Crane Analytics**: `vessel_service.py` -> `_get_crane_analytics()`
    - Calculates individual productivity (Moves Per Hour) for every crane assigned to the vessel.
    - Detects temporal overlaps (conflicts) between cranes working in the same block.

---

## 3. ML Training Pipeline

1.  **Trigger**: `scheduled_retraining_job` (main.py) or `trigger_training.py`.
2.  **Dataset Preparation**: `models/stay_model.py` -> `prepare_training_data()`
    - Aggregates history into "Visit Summary" records.
    - Filters out noise (visits < 2 hours or > 10 days).
3.  **Feature Engineering**: Encodes categorical data (services) and calculates numerical features.
4.  **Model Training**: Trains and pickles the model to `models/stay_model.pkl`.
5.  **Versioning**: Records training metrics and sample size in `training_metadata` table.

---

## 4. Frontend Integration

1.  **State Management**: React components (`VesselAnalytics.tsx`, `RiskAndStrategy.tsx`) fetch from the backend via `vesselService.ts`.
2.  **Dynamic UI**: 
    - **Risk & Strategy**: Displays the `OperationalPredictions` (ML-driven recommendations).
    - **Terminal Map**: Visualizes `HeatmapBlock` data showing cargo concentration.
    - **Crane Productivity**: Interactive charts showing individual crane performance.

---

## Key Files Summary

| Component | Responsibility |
| :--- | :--- |
| `main.py` | FastAPI setup, Lifespan (Auth/Schema init), Scheduling. |
| `db/queries.py` | Dynamic yard table creation and global data loading (Pandas Concat). |
| `services/vessel_service.py` | Core business logic, Crane analytics, Strategy prediction. |
| `models/stay_model.py` | ML Pipeline (Training & Inference). |
| `utils/position_parser.py` | Terminal/Yard detection and position string parsing. |
| `fast_ingest.py` | High-performance batch data loading tool. |
| `clean_db.py` | Database reset and schema initialization tool. |
