import csv
import json
import math
import random
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple

random.seed(42)

TERMINALS = [
    {"terminal_id": "PEB",  "complex_id": "USPEB", "facility_id": "PEB", "yard_id": "PEB",  "format": "PEB",  "berth_count": 3, "target_rows": 69489, "pool_size": 8373},
    {"terminal_id": "CWIT", "complex_id": "USPEB", "facility_id": "CWF", "yard_id": "CWIT", "format": "CWIT", "berth_count": 3, "target_rows": 65269, "pool_size": 7805},
]

HISTORY_VESSELS_PER_TERMINAL = 16
VISITS_PER_VESSEL             = 12
DAYS_RANGE                    = 180
END_DATE                      = datetime.now()
START_DATE                    = END_DATE - timedelta(days=DAYS_RANGE)

MIN_HISTORY_CONTAINERS_PER_VISIT = 200
MAX_HISTORY_CONTAINERS_PER_VISIT = 500
LOW_VOLUME_MIN   = 30
LOW_VOLUME_MAX   = 50
LOW_VOLUME_RATIO = 0.05

TARGET_ACTIVE_PER_TERMINAL_MIN = 1000
TARGET_ACTIVE_PER_TERMINAL_MAX = 1250

BLOCK_CAPACITY   = 400
BLOCK_OCCUPANCY  = 0.70
SLOTS_PER_BLOCK  = int(BLOCK_CAPACITY * BLOCK_OCCUPANCY)

STAY_MIN_HOURS        = 20.0
STAY_MAX_HOURS        = 80.0
HIGH_VOL_THRESHOLD    = MAX_HISTORY_CONTAINERS_PER_VISIT

OUTPUT_DIR = Path(".")
BASE_OUTPUT_CONTAINER_FILE = "synthetic_container_dataset.csv"
BASE_OUTPUT_CRANE_FILE     = "synthetic_crane_dataset.csv"
BASE_OUTPUT_ACTIVE_FILE    = "active_yard_containers.csv"
BASE_OUTPUT_ACTIVE_JSON    = "active_yard_containers.json"

CONTAINER_PREFIXES = ["GCXU", "TRLU", "MSCU", "HLCU", "CMAU", "OOLU", "MAEU", "ONEY"]
VISIT_PREFIXES     = ["CQN", "8YF", "MAE", "HLC", "MSC", "CMA", "OOL", "ONE"]

FREIGHT_KINDS      = ["FCL", "MTY", "MTL"]
CONTAINER_LENGTHS  = ["BASIC20", "BASIC40"]
IMDG_CODES         = ["1.1", "2.1", "3", "4.1", "5.1", "6.1", "8", "9"]
CRANES             = ["STS01", "STS02", "STS03", "STS04", "STS05", "STS06"]
LINE_OPS           = ["MKL", "MSC", "ONE", "CMA", "HPL"]
UNIT_CATEGORIES    = ["Transship", "Import", "Export"]

RESTOW_RATIO = 0.06

CRANE_ACTIVE_MPH_MIN = 25
CRANE_ACTIVE_MPH_MAX = 35

PEB_BLOCKS  = list("ABCDEFGH")
CWIT_BLOCKS = [f"{s}{b}" for s in "12345" for b in "ABCD"]

_container_seq  = 6_000_000
_visit_seq      = 180_000
_unit_visit_seq = 3_000_000

def generate_unit_id_pool(pool_size: int) -> List[str]:
    pool = []
    global _container_seq
    for _ in range(pool_size):
        _container_seq += 1
        prefix = random.choice(CONTAINER_PREFIXES)
        pool.append(f"{prefix}{_container_seq:07d}")
    return pool

def next_visit_id() -> str:
    global _visit_seq
    _visit_seq += 1
    return f"{random.choice(VISIT_PREFIXES)}{_visit_seq:06d}"

def next_unit_visit_gkey() -> int:
    global _unit_visit_seq
    _unit_visit_seq += 1
    return _unit_visit_seq

def fmt_crane(dt: datetime) -> str:
    return dt.strftime("%d-%b-%y %H%M")

def fmt_time_mmddyyyy(dt: datetime) -> str:
    return dt.strftime("%m/%d/%Y %H:%M")

def parse_time_mmddyyyy(value: str) -> datetime:
    return datetime.strptime(value, "%m/%d/%Y %H:%M")

def _split_evenly(total: int, parts: int) -> List[int]:
    parts = max(1, min(parts, total))
    base, rem = divmod(total, parts)
    return [base + (1 if i < rem else 0) for i in range(parts)]

def choose_container_length() -> str:
    return random.choice(CONTAINER_LENGTHS)

def choose_equipment_type(container_length: str, reefer: bool) -> str:
    if container_length == "BASIC20" and reefer:
        return "20ft Reefer"
    if container_length == "BASIC20":
        return "20ft General"
    if container_length == "BASIC40" and reefer:
        return "40ft Hi-Cube Reefer"
    return "40ft Hi-Cube General"

def generate_hazard_fields():
    if random.random() < 0.18:
        code = random.choice(IMDG_CODES)
        cls = code.split('.')[0]
        return "Yes", cls, code
    return "No", None, None

def generate_peb_position(block: str) -> str:
    bay  = random.randint(100, 999)
    row  = random.randint(10, 99)
    tier = random.randint(1, 6)
    return f"Y-PEB-{block}{bay:03d}{row:02d}C{tier}"

def generate_cwit_position(block: str) -> str:
    section = block[0]
    blk     = block[1]
    bay  = random.randint(1, 999)
    row  = random.choice(list("ABCDEFGHJKLMN"))
    tier = random.randint(1, 6)
    return f"Y-CWIT-{section}{blk}{bay:03d}{row}.{tier}"

def generate_position_in_block(yard_id: str, yard_format: str, block: str) -> str:
    if yard_id == "PEB"  or yard_format == "PEB":
        return generate_peb_position(block)
    if yard_id == "CWIT" or yard_format == "CWIT":
        return generate_cwit_position(block)
    bay  = random.randint(100, 999)
    row  = random.randint(10, 99)
    tier = random.randint(1, 6)
    return f"Y-{yard_id}-{block}{bay:03d}{row:02d}C{tier}"

def blocks_needed_for(n_containers: int) -> int:
    return max(1, math.ceil(n_containers / SLOTS_PER_BLOCK))

def choose_berth(terminal: dict) -> str:
    return f"B{random.randint(1, terminal['berth_count'])}"

def vessel_side_position(visit_id: str) -> str:
    return f"V-{visit_id}-{random.randint(100000, 999999)}"

def assign_cranes(total_containers: int) -> List[str]:
    if total_containers <= 70:
        crane_count = 2
    elif total_containers <= 180:
        crane_count = random.choice([2, 3])
    elif total_containers <= 280:
        crane_count = random.choice([3, 4])
    else:
        crane_count = random.choice([4, 5])
    return random.sample(CRANES, min(crane_count, len(CRANES)))

def estimate_stay_hours(load_count: int, discharge_count: int) -> float:
    productive  = load_count + discharge_count
    lo_moves    = LOW_VOLUME_MAX * 2
    hi_moves    = HIGH_VOL_THRESHOLD
    t = max(0.0, min(1.0, (productive - lo_moves) / max(1, hi_moves - lo_moves)))
    base_hours  = STAY_MIN_HOURS + t * (STAY_MAX_HOURS - STAY_MIN_HOURS)
    jitter      = random.uniform(-1.0, 1.0)
    return round(max(STAY_MIN_HOURS, min(STAY_MAX_HOURS, base_hours + jitter)), 2)

def build_event_times(start: datetime, stay_hours: float, count: int, crane_count: int) -> List[datetime]:
    if count <= 0:
        return []
    if count == 1:
        offset = stay_hours * random.uniform(0.35, 0.60)
        return [start + timedelta(hours=offset)]

    stay_sec = stay_hours * 3600.0
    span_hours = max(6.0, min(stay_hours * random.uniform(0.80, 0.95), stay_hours - 0.25))
    span_sec   = span_hours * 3600.0

    target_mph    = random.uniform(CRANE_ACTIVE_MPH_MIN, CRANE_ACTIVE_MPH_MAX)
    combined_mph   = max(1.0, crane_count * target_mph)
    cycle_seconds  = max(20.0, 3600.0 / combined_mph)

    batch_target = max(2, int(round(stay_hours / 4.0)))
    batch_limit  = max(2, int(count / 18) + 1)
    num_batches  = min(6, batch_target, batch_limit, count)
    num_batches  = max(2, num_batches)

    batch_sizes = _split_evenly(count, num_batches)
    batch_active_windows = []
    for size in batch_sizes:
        active_window = max(size * cycle_seconds, random.uniform(25 * 60.0, 70 * 60.0))
        batch_active_windows.append(active_window)

    total_active = sum(batch_active_windows)
    if total_active > span_sec * 0.70:
        scale = (span_sec * 0.70) / max(total_active, 1.0)
        batch_active_windows = [max(20 * 60.0, w * scale) for w in batch_active_windows]
        total_active = sum(batch_active_windows)

    gap_count = max(0, num_batches - 1)
    gap_budget = max(span_sec - total_active, gap_count * 25 * 60.0)

    gap_windows = []
    if gap_count > 0:
        base_gap = gap_budget / gap_count
        for _ in range(gap_count):
            gap_windows.append(max(20 * 60.0, base_gap * random.uniform(0.85, 1.20)))
        gap_total = sum(gap_windows)
        if gap_total > 0:
            scale = gap_budget / gap_total
            gap_windows = [g * scale for g in gap_windows]

    start_offset = max(20 * 60.0, stay_sec * random.uniform(0.08, 0.15))
    first_time = start + timedelta(seconds=start_offset)

    times = []
    cursor = first_time

    for batch_idx, batch_moves in enumerate(batch_sizes):
        batch_window = batch_active_windows[batch_idx]
        if batch_moves == 1:
            times.append(cursor + timedelta(seconds=batch_window / 2))
        else:
            step = batch_window / max(batch_moves - 1, 1)
            for move_idx in range(batch_moves):
                jitter = random.uniform(-6.0, 6.0)
                ts = cursor + timedelta(seconds=(move_idx * step) + jitter)
                times.append(ts)
        cursor += timedelta(seconds=batch_window)
        if batch_idx < len(gap_windows):
            cursor += timedelta(seconds=gap_windows[batch_idx])

    times.sort()
    for i in range(1, len(times)):
        if times[i] <= times[i - 1]:
            times[i] = times[i - 1] + timedelta(seconds=random.randint(15, 45))

    end_window = start + timedelta(hours=stay_hours) - timedelta(minutes=5)
    if times and times[-1] > end_window:
        first_t = times[0]
        last_t  = times[-1]
        span    = (last_t - first_t).total_seconds()
        window  = (end_window - first_t).total_seconds()
        if span > 0 and window > 0:
            scale = window / span
            times = [first_t + timedelta(seconds=(t - first_t).total_seconds() * scale) for t in times]
            for i in range(1, len(times)):
                if times[i] <= times[i - 1]:
                    times[i] = times[i - 1] + timedelta(seconds=random.randint(15, 45))

    return times

def sort_key_move(row: dict) -> datetime:
    return parse_time_mmddyyyy(row["Move Complete Time"])

def sort_key_crane(row: dict) -> datetime:
    return datetime.strptime(row["Time Completed"], "%d-%b-%y %H%M")

def derive_yard_block(position: str, yard_id: str) -> Optional[str]:
    if not position.startswith("Y-"):
        return None
    if position.startswith("Y-PEB-"):
        m = re.match(r"^Y-PEB-([A-H])", position)
        return f"PEB-{m.group(1)}" if m else "PEB-UNK"
    if position.startswith("Y-CWIT-"):
        m = re.match(r"^Y-CWIT-(\d)([A-D])", position)
        return f"CWIT-{m.group(1)}{m.group(2)}" if m else "CWIT-UNK"
    m = re.match(rf"^Y-{re.escape(yard_id)}-([A-Z0-9])", position)
    return f"{yard_id}-{m.group(1)}" if m else f"{yard_id}-UNK"

CONTAINER_HEADERS = [
    "Unit ID","Unit Visit Gkey","Complex Id","Facility Id","Yard Id",
    "Category Id","Equipment Class","Container Length","Equipment type",
    "Freight Kind","Destination","Unit Weight in kg","Verified Gross Mass (Kg)",
    "Reefer","OOG Unit","Hazardous Flag","Hazard UN Numbers","IMDG Code",
    "Stow Code 1","Stow Code 2","Stow Code 3","Port of Discharge",
    "Actual Inbound Carrier visit ID","Inbound Service",
    "Actual Outbound Carrier visit ID","Outbound Service","Arrival Mode",
    "Current Position","Visit State","Transit State",
    "Time Out","Time In","Move Complete Time",
    "Ctr From Position","Ctr To Position",
]

CRANE_HEADERS = [
    "Time Completed","Event Type","Move Kind","Unit Category","Unit Nbr",
    "Crane CHE","From Position","To Position","Carrier Visit","Line Op","Exclude",
]

ACTIVE_LIST_HEADERS = [
    "Unit ID","Unit Visit Gkey","Actual Outbound Carrier visit ID",
    "Current Yard Block","Current Slot Position","Move Complete Time",
]

def build_visit_schedule(terminal: dict) -> List[dict]:
    visit_gap_days  = DAYS_RANGE / VISITS_PER_VESSEL
    vessel_services = [f"VS-{terminal['yard_id']}-{i:02d}" for i in range(1, HISTORY_VESSELS_PER_TERMINAL + 1)]
    visits = []
    for service in vessel_services:
        vessel_anchor = START_DATE + timedelta(days=random.uniform(0, visit_gap_days))
        for v in range(VISITS_PER_VESSEL):
            start = vessel_anchor + timedelta(
                days=v * visit_gap_days + random.uniform(0, visit_gap_days * 0.2),
                hours=random.randint(0, 12),
                minutes=random.randint(0, 59),
            )
            if start > END_DATE - timedelta(days=1):
                start = END_DATE - timedelta(days=random.uniform(1, 3))
            visits.append({
                "visit_id":    next_visit_id(),
                "service":     service,
                "visit_start": start,
                "berth":       choose_berth(terminal),
            })
    visits.sort(key=lambda x: x["visit_start"])
    return visits

def choose_operation_mix(total_rows: int) -> Tuple[int, int, int]:
    total_rows = max(3, int(total_rows))
    base_restow = max(1, int(round(total_rows * RESTOW_RATIO)))
    operational_pool = max(2, total_rows - base_restow)

    discharge_ratio = random.uniform(0.45, 0.55)
    load_ratio      = random.uniform(0.35, 0.45)

    discharge_count = max(1, int(round(operational_pool * discharge_ratio)))
    discharge_count = min(discharge_count, operational_pool - 1)
    load_count = max(1, int(round(operational_pool * load_ratio)))
    load_count = min(load_count, operational_pool - discharge_count)

    restow_count = total_rows - load_count - discharge_count
    if restow_count < 1:
        deficit = 1 - restow_count
        trim_discharge = min(deficit, max(0, discharge_count - 1))
        discharge_count -= trim_discharge
        deficit -= trim_discharge
        if deficit > 0:
            load_count = max(1, load_count - deficit)
        restow_count = total_rows - load_count - discharge_count

    return load_count, discharge_count, restow_count

def generate_terminal_data(terminal: dict):
    global _unit_visit_seq
    if terminal["yard_id"] == "PEB":
        _unit_visit_seq = 3_000_000
    elif terminal["yard_id"] == "CWIT":
        _unit_visit_seq = 3_069_489

    container_rows = []
    crane_rows = []
    visits = build_visit_schedule(terminal)
    line_op = random.choice(LINE_OPS)

    rows_per_visit = _split_evenly(terminal["target_rows"], len(visits))
    random.shuffle(rows_per_visit)

    inactive_units = generate_unit_id_pool(terminal["pool_size"])
    active_units = []

    occupied_blocks = {}
    _all_pool  = (PEB_BLOCKS if terminal["format"] == "PEB" else CWIT_BLOCKS if terminal["format"] == "CWIT" else list("ABCDEFG"))
    _zone_size = (6 if terminal["format"] == "PEB" else 7 if terminal["format"] == "CWIT" else 5)
    _zone_pool = random.sample(_all_pool, min(_zone_size, len(_all_pool)))

    def _select_discharge_blocks(n: int) -> List[str]:
        existing = [b for b in _zone_pool if b in occupied_blocks]
        unopened = [b for b in _zone_pool if b not in occupied_blocks]
        work_order = existing + unopened
        if not work_order:
            work_order = list(_zone_pool)
        assignments = []
        remaining = n
        wi = 0
        loop_counter = 0
        while remaining > 0:
            loop_counter += 1
            if loop_counter > 1000:
                assignments.extend([random.choice(_all_pool)] * remaining)
                break
            if wi >= len(work_order): wi = 0
            blk = work_order[wi]
            space = SLOTS_PER_BLOCK - occupied_blocks.get(blk, 0)
            if space <= 0:
                wi += 1
                if wi >= len(work_order):
                    extra = [b for b in _all_pool if b not in work_order]
                    if extra: work_order.append(random.choice(extra))
                continue
            cap_this_pass = max(1, SLOTS_PER_BLOCK // len(work_order))
            take = min(remaining, cap_this_pass)
            assignments.extend([blk] * take)
            remaining -= take
            wi += 1
        return assignments

    def _update_occupied_discharge(blocks_used: List[str]):
        for b in blocks_used:
            occupied_blocks[b] = occupied_blocks.get(b, 0) + 1

    def _update_occupied_load(block_chosen: str):
        if block_chosen in occupied_blocks:
            occupied_blocks[block_chosen] -= 1
            if occupied_blocks[block_chosen] <= 0:
                del occupied_blocks[block_chosen]

    def _current_blocks() -> List[str]:
        blks = list(occupied_blocks.keys())
        return blks if blks else (PEB_BLOCKS[:2] if terminal["format"] == "PEB" else CWIT_BLOCKS[:2])

    for i, visit in enumerate(visits):
        total_rows = rows_per_visit[i]
        load_count, discharge_count, restow_count = choose_operation_mix(total_rows)
        total_ops = load_count + discharge_count + restow_count
        stay_hours = estimate_stay_hours(load_count, discharge_count)
        cranes_assigned = assign_cranes(total_rows)
        event_times = build_event_times(visit["visit_start"] + timedelta(hours=0.5), stay_hours, total_ops, len(cranes_assigned))

        while len(event_times) < total_ops:
            last = event_times[-1] if event_times else visit["visit_start"] + timedelta(hours=1)
            event_times.append(last + timedelta(seconds=random.randint(60, 300)))

        discharge_block_seq = _select_discharge_blocks(discharge_count)
        discharge_idx = 0

        op_kinds = (["Load"] * load_count + ["Discharge"] * discharge_count + ["Restow"] * restow_count)
        random.shuffle(op_kinds)

        for idx, move_kind in enumerate(op_kinds):
            if move_kind == "Load":
                if active_units:
                    unit_id = random.choice(active_units)
                    active_units.remove(unit_id)
                    inactive_units.append(unit_id)
                else:
                    unit_id = random.choice(inactive_units)
            elif move_kind == "Discharge":
                if inactive_units:
                    unit_id = random.choice(inactive_units)
                    inactive_units.remove(unit_id)
                    active_units.append(unit_id)
                else:
                    unit_id = random.choice(active_units) # fallback
            else:
                if active_units:
                    unit_id = random.choice(active_units)
                else:
                    unit_id = random.choice(inactive_units)
                    inactive_units.remove(unit_id)
                    active_units.append(unit_id)

            unit_visit_gkey  = next_unit_visit_gkey()
            container_length = choose_container_length()
            reefer           = random.random() < 0.10
            equipment_type   = choose_equipment_type(container_length, reefer)
            freight_kind     = random.choice(FREIGHT_KINDS)
            unit_weight      = round(random.uniform(2000, 32000), 6)
            vgm              = (round(unit_weight + random.uniform(50, 500), 5) if random.random() > 0.15 else None)
            hazardous_flag, hazard_un, imdg_code = generate_hazard_fields()
            oog              = "Yes" if random.random() < 0.08 else "No"
            port_of_discharge = random.choice(["CNNGB","SGSIN","CNSHA","NLRTM","USLAX","INMAA","JPYOK","KRPUS"])
            move_time        = event_times[idx]
            crane_che        = cranes_assigned[idx % len(cranes_assigned)]

            if move_kind == "Discharge":
                arrival_mode = "VESSEL" if random.random() < 0.75 else "TRUCK"
            elif move_kind == "Load":
                arrival_mode = "TRUCK"
            else:
                arrival_mode = "VESSEL" if random.random() < 0.75 else "TRUCK"

            category    = "IMPRT" if move_kind in ["Discharge", "Restow"] else "EXPRT"
            visit_state = "IN_YARD" if move_kind in ["Discharge", "Restow"] else "3DEPARTED"
            transit     = "S40_YARD" if move_kind in ["Discharge", "Restow"] else "S70_DEPARTED"

            inbound_id       = None
            inbound_service  = None
            outbound_id      = visit["visit_id"]
            outbound_service = visit["service"]

            if arrival_mode == "VESSEL":
                if move_kind == "Discharge":
                    inbound_id = visit["visit_id"]
                    inbound_service = visit["service"]
                else:
                    inb_visit = random.choice(visits)
                    inbound_id = inb_visit["visit_id"]
                    inbound_service = inb_visit["service"]

            if move_kind == "Discharge":
                yard_block = discharge_block_seq[discharge_idx]
                discharge_idx += 1
                _update_occupied_discharge([yard_block])
                to_pos = generate_position_in_block(terminal["yard_id"], terminal["format"], yard_block)
                if arrival_mode == "VESSEL":
                    from_pos = vessel_side_position(visit["visit_id"])
                else:
                    live = _current_blocks()
                    from_pos = generate_position_in_block(terminal["yard_id"], terminal["format"], random.choice(live))
                current_position = to_pos
            elif move_kind == "Load":
                live = _current_blocks()
                yard_block = random.choice(live)
                _update_occupied_load(yard_block)
                from_pos = generate_position_in_block(terminal["yard_id"], terminal["format"], yard_block)
                to_pos = vessel_side_position(visit["visit_id"])
                current_position = to_pos
            else:
                live = _current_blocks()
                b1 = random.choice(live)
                b2 = random.choice(live)
                from_pos = generate_position_in_block(terminal["yard_id"], terminal["format"], b1)
                to_pos = generate_position_in_block(terminal["yard_id"], terminal["format"], b2)
                current_position = to_pos

            if move_kind == "Load":
                time_in  = move_time - timedelta(hours=random.uniform(1, 5))
                time_out = move_time + timedelta(hours=random.uniform(1, 4))
            elif move_kind == "Discharge":
                time_in  = move_time
                time_out = time_in + timedelta(hours=random.uniform(2, 9))
            else:
                time_in  = move_time - timedelta(hours=random.uniform(1, 3))
                time_out = time_in + timedelta(hours=random.uniform(2, 9))

            container_rows.append({
                "Unit ID": unit_id,
                "Unit Visit Gkey": unit_visit_gkey,
                "Complex Id": terminal["complex_id"],
                "Facility Id": terminal["facility_id"],
                "Yard Id": terminal["yard_id"],
                "Category Id": category,
                "Equipment Class": "CONTAINER",
                "Container Length": container_length,
                "Equipment type": equipment_type,
                "Freight Kind": freight_kind,
                "Destination": None,
                "Unit Weight in kg": unit_weight,
                "Verified Gross Mass (Kg)": vgm,
                "Reefer": "Yes" if reefer else "No",
                "OOG Unit": oog,
                "Hazardous Flag": hazardous_flag,
                "Hazard UN Numbers": hazard_un,
                "IMDG Code": imdg_code,
                "Stow Code 1": None,
                "Stow Code 2": None,
                "Stow Code 3": None,
                "Port of Discharge": port_of_discharge,
                "Actual Inbound Carrier visit ID": inbound_id,
                "Inbound Service": inbound_service,
                "Actual Outbound Carrier visit ID": outbound_id,
                "Outbound Service": outbound_service,
                "Arrival Mode": arrival_mode,
                "Current Position": current_position,
                "Visit State": visit_state,
                "Transit State": transit,
                "Time Out": fmt_time_mmddyyyy(time_out),
                "Time In": fmt_time_mmddyyyy(time_in),
                "Move Complete Time": fmt_time_mmddyyyy(move_time),
                "Ctr From Position": from_pos,
                "Ctr To Position": to_pos,
            })

            crane_rows.append({
                "Time Completed": fmt_crane(move_time),
                "Event Type": "UNIT_LOAD" if move_kind == "Load" else "UNIT_DISCHARGE" if move_kind == "Discharge" else "UNIT_RESTOW",
                "Move Kind": move_kind,
                "Unit Category": random.choice(UNIT_CATEGORIES),
                "Unit Nbr": unit_id,
                "Crane CHE": crane_che,
                "From Position": from_pos,
                "To Position": to_pos,
                "Carrier Visit": visit["visit_id"],
                "Line Op": line_op,
                "Exclude": random.choice(["No", "No", "No", "Yes"]),
            })

    container_rows.sort(key=sort_key_move)
    crane_rows.sort(key=sort_key_crane)
    active_rows = derive_active_yard_containers(container_rows, terminal["yard_id"])
    return container_rows, crane_rows, active_rows

def derive_active_yard_containers(container_rows: List[dict], yard_id: str) -> List[dict]:
    latest_by_unit = {}
    for row in container_rows:
        uid = row["Unit ID"]
        cur = latest_by_unit.get(uid)
        if cur is None or (parse_time_mmddyyyy(row["Move Complete Time"]) > parse_time_mmddyyyy(cur["Move Complete Time"])):
            latest_by_unit[uid] = row

    active_rows = []
    for row in latest_by_unit.values():
        pos = row.get("Current Position", "")
        if not pos.startswith("Y-"):
            continue
        active_rows.append({
            "Unit ID": row["Unit ID"],
            "Unit Visit Gkey": row["Unit Visit Gkey"],
            "Actual Outbound Carrier visit ID": row["Actual Outbound Carrier visit ID"],
            "Current Yard Block": derive_yard_block(pos, yard_id),
            "Current Slot Position": pos,
            "Move Complete Time": row["Move Complete Time"],
        })

    active_rows.sort(key=lambda r: parse_time_mmddyyyy(r["Move Complete Time"]), reverse=True)
    target = random.randint(TARGET_ACTIVE_PER_TERMINAL_MIN, TARGET_ACTIVE_PER_TERMINAL_MAX)
    return active_rows[:target]

def write_csv(path: Path, headers: List[str], rows: List[dict]):
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)

def write_json(path: Path, rows: List[dict]):
    with path.open("w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2)

def main():
    print("\n================================================")
    print("SYNTHETIC DATASET GENERATION STARTED")
    print("================================================")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    total_c = total_cr = total_a = 0

    for terminal in TERMINALS:
        yard_id = terminal["yard_id"]
        print(f"\nProcessing Yard: {yard_id}")
        container_rows, crane_rows, active_rows = generate_terminal_data(terminal)
        total_c  += len(container_rows)
        total_cr += len(crane_rows)
        total_a  += len(active_rows)

        out_c  = OUTPUT_DIR / f"{yard_id}_{BASE_OUTPUT_CONTAINER_FILE}"
        out_cr = OUTPUT_DIR / f"{yard_id}_{BASE_OUTPUT_CRANE_FILE}"
        out_a  = OUTPUT_DIR / f"{yard_id}_{BASE_OUTPUT_ACTIVE_FILE}"
        out_aj = OUTPUT_DIR / f"{yard_id}_{BASE_OUTPUT_ACTIVE_JSON}"

        write_csv(out_c,  CONTAINER_HEADERS,  container_rows)
        write_csv(out_cr, CRANE_HEADERS,       crane_rows)
        write_csv(out_a,  ACTIVE_LIST_HEADERS, active_rows)
        write_json(out_aj, active_rows)

        print(f"  -> {out_c.name}  ({len(container_rows):,} rows)")
        print(f"  -> {out_cr.name}  ({len(crane_rows):,} rows)")
        print(f"  -> {out_a.name}  ({len(active_rows):,} active)")

    print("\n================================================")
    print("GENERATION COMPLETED")
    print("================================================")

if __name__ == "__main__":
    main()