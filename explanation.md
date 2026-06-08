# Deck Optimizer: Technical Implementation & Managerial Presentation Guide

This document is structured as a "presentation script" and technical study guide. You can use it to walk your manager through the features you've built, explaining the logic, the algorithms, and the direct business value of each module.

---

## 🎬 Introduction

**What to say:**
> "Hi team, today I want to walk you through the Deck Optimizer (Port System) we've been building. The primary goal of this system is to transition our terminal operations from *reactive* decision-making to *proactive*, data-driven planning. I'll be demonstrating five core modules we've developed that optimize berth assignments, predict port stay times using machine learning, detect crane conflicts, analyze historical delays, and optimize yard preparation."

---

## 📍 1. Berth Selection Based on Yard Cargo Distribution & Yard Heat Map

**Business Value:** Minimizes internal truck travel distance (ITVs), reduces fuel consumption, and maximizes crane efficiency by bringing the ship to the cargo, rather than the cargo to the ship.

### Technical Implementation & Logic:
1. **Container Extraction & Profiling:** When a vessel is queried, the system scans the yard for all containers nominated for that `outbound_service`. It profiles them by block, row, bay, and weight class.
2. **Density Scoring:** We don't just count containers. The algorithm uses a weighted scoring mechanism where `HEAVY` containers (e.g., > 20,000kg) count double. This ensures we prioritize short travel distances for the heaviest loads, reducing ITV strain.
3. **Heatmap Generation (Grid/XML Algorithm):**
   - The system utilizes `xml_layout_service.py` to map actual terminal geometry or falls back to a deterministic Manhattan-distance grid.
   - It identifies the "focal point" (the block with the highest density score).
   - Blocks are then assigned dynamic proximity labels (`CLOSE`, `MID`, `FAR`) and a concentration color (`Red` for >=70% density, `Orange` for >=40%, and `Green` for <40%).
4. **Berth Simulation:** It calculates the distance from the high-density blocks to available berths (Berth 1, Berth 2, etc.) to recommend the berth with the lowest travel distance and congestion risk.

---

## ⏱️ 2. Port Stay Time Prediction (Machine Learning)

**Business Value:** Accurately predicting how long a vessel will stay at the berth allows for tighter marine scheduling, better manpower planning, and prevents berth window clashes.

### Technical Implementation & Algorithms:
For this, we've implemented a robust Machine Learning pipeline in `models/stay_model.py`.

1. **The Algorithm (Ensemble Model):**
   We use a **`VotingRegressor`**, which combines the strengths of three different algorithms:
   - **`XGBRegressor` (XGBoost):** Excellent at handling non-linear relationships and complex interactions (e.g., how the combination of heavy containers + reefers impacts time).
   - **`GradientBoostingRegressor` (GBR):** Another strong tree-based model to reduce variance and prevent overfitting.
   - **`Ridge` Regression:** A linear model with L2 regularization to ensure stable baseline predictions.
2. **Feature Engineering:**
   The ML model is fed critical operational features: `total_moves`, `loaded/discharged` ratios, `crane_count`, `heavy_count`, `reefer_count`, `hazard_count`, and `imbalance`.
3. **Physics-Based Guardrails (Heuristic Fallback):**
   ML models can sometimes hallucinate on extreme outlier data. We implemented a safety guardrail. If the ML predicts a stay that breaks the laws of physics, the system falls back to a deterministic heuristic calculation:
   `Stay Hours = Total Moves / (Assigned Cranes * Historical Moves_Per_Hour_Per_Crane)`

---

## 🏗️ 3. Berth Conflict & Crane Clash Analysis

**Business Value:** Prevents costly operational bottlenecks where cranes physically block each other, or ITVs cause traffic jams in the yard corridors.

### Technical Implementation & Logic:
Implemented inside `vessel_service.py`, the system scans the planned operations for conflicts.
1. **Crane Crossing Conflicts Algorithm:**
   - The system parses the "bay" positions of the containers that each crane is assigned to work on (e.g., Crane 1 working on Bays 10-20).
   - It calculates the `min` and `max` bay for every crane.
   - **Overlap Logic:** `if (Crane1_Max >= Crane2_Min) and (Crane1_Min <= Crane2_Max)`, it registers a physical clash risk.
2. **Corridor Congestion & Long Unladen Travel:**
   - The system calculates the distance from the yard block to the berth. If > 30% of the load moves originate from blocks > 800 meters away, it flags a High Congestion Risk, prompting planners to adjust the crane or ITV allocation.

---

## 🔍 4. Historical Delay Root Cause Analysis

**Business Value:** By understanding exactly why a previous vessel was delayed, planners can adjust strategies for the next arriving vessel of the same service.

### Technical Implementation & Rules Engine:
Instead of ML, this uses a high-precision Rules Engine (`_calculate_delay_analysis`) that scans raw timestamps:
1. **Crane Idle Time:** Looks at the `move_complete_time` delta. If `gap_minutes > 30`, it flags a "Crane Idle Time" delay.
2. **Late Container Readiness:** Compares the container's `time_in` (gate-in time) against the first load `move_complete_time`. If a container arrived *after* loading already began, it flags "Container Not Ready."
3. **M-Cycle (Dual Cycle) Efficiency:** It tracks the sequence of `LOAD` and `DISCHARGE` moves. If operations are purely sequential rather than interleaved (Dual Cycle rate < 15%), it flags poor stacking strategy.
4. **High Restow Rate:** Fast vectorized logic detects if the `crane_move_kind` is `SHIFT` or `RESTOW`. >20 restows triggers a penalty flag, recommending better pre-consolidation.

---

## 📦 5. Yard Preparation & Weight Distribution Strategy

**Business Value:** Reduces reshuffles (digging out containers) and optimizes crane speeds by ensuring heavy containers are placed correctly before the ship arrives.

### Technical Implementation & Logic:
1. **Weight Class Profiling:** Containers are grouped into `HEAVY` (>= 20,000kg), `MEDIUM`, and `LIGHT` using the `verified_gross_mass_kg`.
2. **Yard Staging:** The system identifies the stack heights in the yard (`avg_stack_height`, `max_stack`). 
3. By generating the Yard Heat Map prior to arrival, it highlights if heavy containers are buried under light containers or scattered far from the optimal berth. This allows the yard manager to issue proactive "housekeeping" or "pre-consolidation" moves before the vessel even docks.

---

## 💡 Summary for the Manager
> "In short, we are using **Machine Learning (XGBoost/Ensembles)** for predictive timing, **Computational Geometry (Manhattan/XML routing)** for distance and heatmap optimizations, and **Rules-Based Heuristics** for conflict and delay analysis. This ecosystem significantly cuts down idle time, fuel costs, and scheduling conflicts."
