import pandas as pd
import numpy as np
import random
from datetime import datetime, timedelta
import string

# -------------------------------
# CONFIG
# -------------------------------
NUM_VESSELS = 10
SERVICES_PER_VESSEL = 10
VISITS_PER_SERVICE = 10

START_DATE = datetime(2025, 1, 1)
END_DATE   = datetime(2025, 6, 30)

OUTPUT_FILE = "synthetic_vessel_data.csv"

random.seed(42)
np.random.seed(42)

# -------------------------------
# FIXED TERMINAL
# -------------------------------
FACILITY_ID = "PEB"
YARD_ID     = "PEB"

COMPLEX_IDS = ["USPEB", "USLAX", "USNYC", "USSIN"]

EQUIPMENT_TYPES = [
    "20ft General",
    "40ft General",
    "40ft Hi-Cube General",
    "20ft Reefer",
    "40ft Reefer",
    "40ft Hi-Cube Reefer"
]

# -------------------------------
# HELPERS
# -------------------------------
def rand_container_id():
    return "C" + "".join(random.choices(string.ascii_uppercase + string.digits, k=10))

def rand_yes_no(prob=0.1):
    return "Yes" if random.random() < prob else "No"

def rand_weight():
    return round(random.uniform(2000, 30000), 3)

def format_time(dt):
    return dt.strftime("%m/%d/%Y %H:%M")

def random_start():
    delta = END_DATE - START_DATE
    return START_DATE + timedelta(seconds=random.randint(0, int(delta.total_seconds())))

# -------------------------------
# POSITION GENERATORS
# -------------------------------
def gen_yard_position():
    bay = random.randint(10, 40)
    row = random.randint(10, 40)
    tier = random.choice(["A1", "B1", "C1", "D1"])
    return f"Y-{YARD_ID}-{bay}{row}{tier}"

def gen_vessel_position(visit_id):
    return f"V-{visit_id}-{random.randint(100000,999999)}"

def gen_truck_position():
    return f"T-{random.randint(10000000,99999999)}-A"

def gen_rail_position():
    return f"R-{random.choice(['CSX','BNSF','UP'])}"

def gen_current_position(visit_id):
    return random.choice([
        gen_yard_position(),
        gen_vessel_position(visit_id),
        gen_truck_position(),
        gen_rail_position()
    ])

# -------------------------------
# HAZARD
# -------------------------------
def gen_hazard():
    if random.random() < 0.05:
        return random.randint(1, 10), f"IMDG-{random.randint(1,9)}"
    return "", ""

# -------------------------------
# CORE LOGIC: REALISTIC STAY
# -------------------------------
def compute_duration_hours(loaded, discharged):
    total_moves = loaded + discharged

    if total_moves <= 0:
        return 4

    # -------------------------------
    # NORMALIZE MOVES RANGE
    # -------------------------------
    MIN_MOVES = 1
    MAX_MOVES = 2500   # your expected max

    normalized = (total_moves - MIN_MOVES) / (MAX_MOVES - MIN_MOVES)

    # -------------------------------
    # MAP TO HOURS (4 → 80)
    # -------------------------------
    min_hours = 4
    max_hours = 80

    duration = min_hours + normalized * (max_hours - min_hours)

    # -------------------------------
    # SMALL REALISTIC VARIATION
    # -------------------------------
    duration *= random.uniform(0.95, 1.05)

    return round(max(min_hours, min(duration, max_hours)), 2)

# -------------------------------
# MAIN GENERATION
# -------------------------------
rows = []

for v in range(NUM_VESSELS):
    for s in range(SERVICES_PER_VESSEL):
        service_name = f"SERVICE_{v+1}_{s+1}"

        current_time = random_start()

        for visit in range(VISITS_PER_SERVICE):

            visit_id = f"CQN{random.randint(100,999)}W"

            # -------------------------------
            # VARIED LOAD/DISCHARGE
            # -------------------------------
            loaded = random.choice([
                random.randint(0, 20),
                random.randint(20, 200),
                random.randint(200, 1000),
                random.randint(1000, 2000)
            ])

            discharged = random.choice([
                random.randint(0, 20),
                random.randint(20, 200),
                random.randint(200, 800),
                random.randint(800, 1500)
            ])

            total_moves = max(1, loaded + discharged)

            # -------------------------------
            # REALISTIC DURATION
            # -------------------------------
            duration_hours = compute_duration_hours(loaded, discharged)

            visit_start = current_time
            visit_end = visit_start + timedelta(hours=duration_hours)

            if visit_end > END_DATE:
                break

            # -------------------------------
            # EVENT TIMES
            # -------------------------------
            event_times = sorted([
                visit_start + timedelta(
                    seconds=random.randint(0, int((visit_end - visit_start).total_seconds()))
                )
                for _ in range(total_moves)
            ])

            # -------------------------------
            # MOVEMENTS
            # -------------------------------
            for i in range(total_moves):

                if i < loaded:
                    from_pos = gen_yard_position()
                    to_pos   = gen_vessel_position(visit_id)
                else:
                    from_pos = gen_vessel_position(visit_id)
                    to_pos   = gen_yard_position()

                event_time = event_times[i]
                haz_un, imdg = gen_hazard()

                row = {
                    "Unit ID": rand_container_id(),
                    "Unit Visit Gkey": random.randint(100000, 999999),

                    "Complex Id": random.choice(COMPLEX_IDS),
                    "Facility Id": FACILITY_ID,
                    "Yard Id": YARD_ID,

                    "Category Id": random.choice(["IMPORT", "EXPORT"]),
                    "Equipment Class": "CTR",
                    "Container Length": random.choice([20, 40]),
                    "Equipment type": random.choice(EQUIPMENT_TYPES),
                    "Freight Kind": random.choice(["FCL", "MTL"]),

                    "Destination": "",

                    "Unit Weight in kg": rand_weight(),
                    "Verified Gross Mass (Kg)": rand_weight(),

                    "Reefer": rand_yes_no(0.1),
                    "OOG Unit": rand_yes_no(0.05),
                    "Hazardous Flag": "Yes" if haz_un else "No",

                    "Hazard UN Numbers": haz_un,
                    "IMDG Code": imdg,

                    "Stow Code 1": "",
                    "Stow Code 2": "",
                    "Stow Code 3": "",

                    "Port of Discharge": "CNNGH",

                    "Actual Inbound Carrier visit ID": f"IN_{visit_id}",
                    "Inbound Service": f"IN_SVC_{v}",

                    "Actual Outbound Carrier visit ID": visit_id,
                    "Outbound Service": service_name,

                    "Arrival Mode": random.choice(["TRUCK", "VESSEL"]),
                    "Current Position": gen_current_position(visit_id),

                    "Visit State": random.choice(["ACTIVE", "DEPARTED"]),

                    "Time In": format_time(visit_start),
                    "Move Complete Time": format_time(event_time),
                    "Time Out": format_time(visit_end),

                    "Ctr From Position": from_pos,
                    "Ctr To Position": to_pos
                }

                rows.append(row)

            current_time = visit_end + timedelta(hours=random.randint(6, 24))

# -------------------------------
# SAVE
# -------------------------------
df = pd.DataFrame(rows)
df.to_csv(OUTPUT_FILE, index=False)

print(f"[OK] Dataset generated: {OUTPUT_FILE}")
print(f"Total rows: {len(df)}")