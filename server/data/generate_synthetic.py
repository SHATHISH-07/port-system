from __future__ import annotations

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
    {"terminal_id": "PEB",  "complex_id": "USPEB", "facility_id": "PEB", "yard_id": "PEB",  "format": "PEB",  "berth_count": 3},
    {"terminal_id": "CWIT", "complex_id": "USPEB", "facility_id": "CWF", "yard_id": "CWIT", "format": "CWIT", "berth_count": 3},
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

# ── Block capacity model ─────────────────────────────────────────────────────
BLOCK_CAPACITY   = 400   # physical slots per block
BLOCK_OCCUPANCY  = 0.70  # fraction of slots that can hold a container
SLOTS_PER_BLOCK  = int(BLOCK_CAPACITY * BLOCK_OCCUPANCY)   # ≈ 280 usable slots

# ── Stay time bounds (hours) ──────────────────────────────────────────────────
# Low-volume visits  (load+discharge ≤ LOW_VOLUME_MAX*2) → 20 h
# High-volume visits (load+discharge ≥ HIGH_VOL_THRESHOLD) → 80 h
STAY_MIN_HOURS        = 20.0
STAY_MAX_HOURS        = 80.0
HIGH_VOL_THRESHOLD    = MAX_HISTORY_CONTAINERS_PER_VISIT  # 500 containers → full range

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

CATEGORY_BY_MOVE     = {"Load": "EXPRT",  "Discharge": "IMPRT", "Restow": "IMPRT"}
VISIT_STATE_BY_MOVE  = {"Load": "3DEPARTED", "Discharge": "IN_YARD", "Restow": "IN_YARD"}
TRANSIT_STATE_BY_MOVE= {"Load": "S70_DEPARTED", "Discharge": "S40_YARD", "Restow": "S40_YARD"}
ARRIVAL_MODE_BY_MOVE = {"Load": "TRUCK",  "Discharge": "VESSEL", "Restow": "TRUCK"}
CRANE_EVENT_BY_MOVE  = {"Load": "UNIT_LOAD", "Discharge": "UNIT_DISCHARGE", "Restow": "UNIT_RESTOW"}
RESTOW_RATIO = 0.06

CRANE_ACTIVE_MPH_MIN = 25
CRANE_ACTIVE_MPH_MAX = 35

# ── Block pools ───────────────────────────────────────────────────────────────
PEB_BLOCKS  = list("ABCDEFGH")                                    #  8 blocks
CWIT_BLOCKS = [f"{s}{b}" for s in "12345" for b in "ABCD"]       # 20 blocks

# ── Global sequences — each is strictly monotonically increasing ──────────────
_container_seq  = 6_000_000
_visit_seq      = 180_000
_unit_visit_seq = 3_000_000

# Tracks all generated container IDs to guarantee uniqueness within a session
_all_container_ids: set = set()


def next_container_id() -> str:
    """Return a globally unique container ID."""
    global _container_seq
    while True:
        _container_seq += 1
        prefix  = random.choice(CONTAINER_PREFIXES)
        cid     = f"{prefix}{_container_seq:07d}"
        if cid not in _all_container_ids:
            _all_container_ids.add(cid)
            return cid


def next_visit_id() -> str:
    global _visit_seq
    _visit_seq += 1
    return f"{random.choice(VISIT_PREFIXES)}{_visit_seq:06d}"


def next_unit_visit_gkey() -> int:
    """
    Unit Visit Gkey is a surrogate key for the (unit, visit) pair.
    It is always strictly increasing, guaranteeing no duplicates across
    the entire dataset.
    """
    global _unit_visit_seq
    _unit_visit_seq += 1
    return _unit_visit_seq


def fmt_crane(dt: datetime) -> str:
    return dt.strftime("%y-%b-%d %H%M")


def fmt_time_mmddyyyy(dt: datetime) -> str:
    return dt.strftime("%m/%d/%Y %H:%M")


def parse_time_mmddyyyy(value: str) -> datetime:
    return datetime.strptime(value, "%m/%d/%Y %H:%M")




def _split_evenly(total: int, parts: int) -> List[int]:
    """Split `total` items into `parts` nearly equal buckets."""
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
        return "Yes", str(random.randint(1, 9)), random.choice(IMDG_CODES)
    return "No", None, None


# ── Position generators ───────────────────────────────────────────────────────

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


def pick_blocks_for_count(yard_id: str, yard_format: str, n_containers: int,
                          preferred: List[str]) -> List[str]:
    if yard_id == "PEB"  or yard_format == "PEB":
        pool = PEB_BLOCKS
    elif yard_id == "CWIT" or yard_format == "CWIT":
        pool = CWIT_BLOCKS
    else:
        pool = list("ABCDEFG")

    needed = min(blocks_needed_for(n_containers), len(pool))
    chosen = [b for b in preferred if b in pool][:needed]
    if len(chosen) < needed:
        extras = [b for b in pool if b not in chosen]
        random.shuffle(extras)
        chosen += extras[: needed - len(chosen)]
    return chosen


def choose_berth(terminal: dict) -> str:
    return f"B{random.randint(1, terminal['berth_count'])}"


def vessel_side_position(visit_id: str) -> str:
    return f"V-{visit_id}-{random.randint(100000, 999999)}"


def generate_container_count() -> int:
    if random.random() < LOW_VOLUME_RATIO:
        return int(random.triangular(LOW_VOLUME_MIN, LOW_VOLUME_MAX, 42))
    return int(random.triangular(MIN_HISTORY_CONTAINERS_PER_VISIT,
                                 MAX_HISTORY_CONTAINERS_PER_VISIT, 430))


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
    """
    Map productive move count (load + discharge) linearly onto [20 h, 80 h].

    Low  end: LOW_VOLUME_MAX * 2 ≈ 100 productive moves → ~20 h
    High end: HIGH_VOL_THRESHOLD productive moves       → ~80 h

    A small ±jitter (±1 h) is added so consecutive visits aren't identical.
    """
    productive  = load_count + discharge_count
    lo_moves    = LOW_VOLUME_MAX * 2          # ~100
    hi_moves    = HIGH_VOL_THRESHOLD          # 500

    t = max(0.0, min(1.0, (productive - lo_moves) / max(1, hi_moves - lo_moves)))
    base_hours  = STAY_MIN_HOURS + t * (STAY_MAX_HOURS - STAY_MIN_HOURS)
    jitter      = random.uniform(-1.0, 1.0)
    return round(max(STAY_MIN_HOURS, min(STAY_MAX_HOURS, base_hours + jitter)), 2)



def build_event_times(start: datetime, stay_hours: float,
                      count: int, crane_count: int) -> List[datetime]:
    """
    Build a realistic move-completion sequence.

    The generator does two things:
      1. spreads moves across several active batches;
      2. keeps the full first-to-last move span close to the intended stay.

    That makes the downstream stay calculation see a proper multi-hour visit
    instead of a dense sub-hour burst.
    """
    if count <= 0:
        return []

    if count == 1:
        # Single event: place it in the middle of the visit window.
        offset = stay_hours * random.uniform(0.35, 0.60)
        return [start + timedelta(hours=offset)]

    stay_sec = stay_hours * 3600.0

    # The actual move span should cover most of the stay window.
    span_hours = max(6.0, min(stay_hours * random.uniform(0.80, 0.95), stay_hours - 0.25))
    span_sec   = span_hours * 3600.0

    target_mph    = random.uniform(CRANE_ACTIVE_MPH_MIN, CRANE_ACTIVE_MPH_MAX)
    combined_mph   = max(1.0, crane_count * target_mph)
    cycle_seconds  = max(20.0, 3600.0 / combined_mph)  # seconds per move

    # Use multiple batches so the timestamps do not collapse into one tight block.
    batch_target = max(2, int(round(stay_hours / 4.0)))
    batch_limit  = max(2, int(count / 18) + 1)
    num_batches  = min(6, batch_target, batch_limit, count)
    num_batches  = max(2, num_batches)

    batch_sizes = _split_evenly(count, num_batches)

    # Each batch gets a short active window, then there is a gap before the next.
    batch_active_windows: List[float] = []
    for size in batch_sizes:
        active_window = max(
            size * cycle_seconds,
            random.uniform(25 * 60.0, 70 * 60.0),
        )
        batch_active_windows.append(active_window)

    total_active = sum(batch_active_windows)
    if total_active > span_sec * 0.70:
        scale = (span_sec * 0.70) / max(total_active, 1.0)
        batch_active_windows = [max(20 * 60.0, w * scale) for w in batch_active_windows]
        total_active = sum(batch_active_windows)

    gap_count = max(0, num_batches - 1)
    gap_budget = max(span_sec - total_active, gap_count * 25 * 60.0)

    gap_windows: List[float] = []
    if gap_count > 0:
        base_gap = gap_budget / gap_count
        for _ in range(gap_count):
            gap_windows.append(max(20 * 60.0, base_gap * random.uniform(0.85, 1.20)))
        gap_total = sum(gap_windows)
        if gap_total > 0:
            scale = gap_budget / gap_total
            gap_windows = [g * scale for g in gap_windows]

    # Start a little after arrival; end a little before departure.
    start_offset = max(20 * 60.0, stay_sec * random.uniform(0.08, 0.15))
    first_time = start + timedelta(seconds=start_offset)

    times: List[datetime] = []
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

    # Enforce strict monotonicity.
    for i in range(1, len(times)):
        if times[i] <= times[i - 1]:
            times[i] = times[i - 1] + timedelta(seconds=random.randint(15, 45))

    # Keep the full sequence inside the planned stay window.
    end_window = start + timedelta(hours=stay_hours) - timedelta(minutes=5)
    if times and times[-1] > end_window:
        first_t = times[0]
        last_t  = times[-1]
        span    = (last_t - first_t).total_seconds()
        window  = (end_window - first_t).total_seconds()
        if span > 0 and window > 0:
            scale = window / span
            times = [
                first_t + timedelta(seconds=(t - first_t).total_seconds() * scale)
                for t in times
            ]
            for i in range(1, len(times)):
                if times[i] <= times[i - 1]:
                    times[i] = times[i - 1] + timedelta(seconds=random.randint(15, 45))

    return times

def sort_key_move(row: dict) -> datetime:
    return parse_time_mmddyyyy(row["Move Complete Time"])


def sort_key_crane(row: dict) -> datetime:
    return datetime.strptime(row["Time Completed"], "%y-%b-%d %H%M")


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
    vessel_services = [
        f"VS-{terminal['yard_id']}-{i:02d}"
        for i in range(1, HISTORY_VESSELS_PER_TERMINAL + 1)
    ]
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



def choose_operation_mix(active_count: int, target_min: int, target_max: int,
                         total_rows: int) -> Tuple[int, int, int]:
    """
    Return an exact (load, discharge, restow) split that always sums to
    `total_rows`.

    The mix is biased by yard pressure:
      - below target yard occupancy → more discharge work
      - above target yard occupancy → more load work
      - within range → balanced mix
    """
    total_rows = max(3, int(total_rows))

    base_restow = max(1, int(round(total_rows * RESTOW_RATIO)))
    operational_pool = max(2, total_rows - base_restow)

    if active_count < target_min:
        discharge_ratio = random.uniform(0.58, 0.68)
        load_ratio      = random.uniform(0.24, 0.34)
    elif active_count > target_max:
        discharge_ratio = random.uniform(0.34, 0.44)
        load_ratio      = random.uniform(0.48, 0.58)
    else:
        discharge_ratio = random.uniform(0.45, 0.55)
        load_ratio      = random.uniform(0.35, 0.45)

    discharge_count = max(1, int(round(operational_pool * discharge_ratio)))
    discharge_count = min(discharge_count, operational_pool - 1)

    load_count = max(1, int(round(operational_pool * load_ratio)))
    load_count = min(load_count, operational_pool - discharge_count)

    restow_count = total_rows - load_count - discharge_count

    # Guarantee a valid remainder and exact sum.
    if restow_count < 1:
        deficit = 1 - restow_count
        # Prefer trimming discharge first, then load.
        trim_discharge = min(deficit, max(0, discharge_count - 1))
        discharge_count -= trim_discharge
        deficit -= trim_discharge
        if deficit > 0:
            load_count = max(1, load_count - deficit)
        restow_count = total_rows - load_count - discharge_count

    return load_count, discharge_count, restow_count

def generate_terminal_data(terminal: dict):
    container_rows: List[dict] = []
    crane_rows:     List[dict] = []
    visits          = build_visit_schedule(terminal)
    active_units:   List[str] = []   # unit IDs currently sitting in the yard
    inactive_units: List[str] = []
    line_op         = random.choice(LINE_OPS)

    # ── Yard-level block state ────────────────────────────────────────────────
    occupied_blocks: Dict[str, int] = {}   # block_label -> container count

    _all_pool  = (PEB_BLOCKS  if terminal["format"] == "PEB"  else
                  CWIT_BLOCKS if terminal["format"] == "CWIT" else list("ABCDEFG"))
    _zone_size = (6 if terminal["format"] == "PEB" else
                  7 if terminal["format"] == "CWIT" else 5)
    _zone_pool = random.sample(_all_pool, min(_zone_size, len(_all_pool)))

    def _select_discharge_blocks(n: int) -> List[str]:
        existing   = [b for b in _zone_pool if b in occupied_blocks]
        unopened   = [b for b in _zone_pool if b not in occupied_blocks]
        work_order = existing + unopened
        if not work_order:
            work_order = list(_zone_pool)

        assignments: List[str] = []
        remaining = n
        wi = 0
        while remaining > 0:
            if wi >= len(work_order):
                wi = 0
            blk   = work_order[wi]
            space = SLOTS_PER_BLOCK - occupied_blocks.get(blk, 0)
            if space <= 0:
                wi += 1
                if wi >= len(work_order):
                    extra = [b for b in _all_pool if b not in work_order]
                    if extra:
                        work_order.append(random.choice(extra))
                continue
            cap_this_pass = max(1, SLOTS_PER_BLOCK // len(work_order))
            take          = min(remaining, cap_this_pass)
            assignments.extend([blk] * take)
            remaining -= take
            wi        += 1
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
        return blks if blks else (PEB_BLOCKS[:2] if terminal["format"] == "PEB"
                                  else CWIT_BLOCKS[:2])

    for visit in visits:
        total_rows   = generate_container_count()
        active_count = len(active_units)
        load_count, discharge_count, restow_count = choose_operation_mix(
            active_count, TARGET_ACTIVE_PER_TERMINAL_MIN,
            TARGET_ACTIVE_PER_TERMINAL_MAX, total_rows,
        )
        total_ops = load_count + discharge_count + restow_count

        # ── Stay time: 20 h (low volume) → 80 h (high volume) ────────────────
        stay_hours = estimate_stay_hours(load_count, discharge_count)

        cranes_assigned = assign_cranes(total_rows)
        event_times     = build_event_times(
            visit["visit_start"] + timedelta(hours=0.5),   # 30-min pilot/mooring offset
            stay_hours,
            total_ops,
            len(cranes_assigned),
        )

        # ── Guard: event_times must exactly match total_ops ───────────────────
        # build_event_times can return fewer entries if count is 0; pad if needed.
        while len(event_times) < total_ops:
            last = event_times[-1] if event_times else visit["visit_start"] + timedelta(hours=1)
            event_times.append(last + timedelta(seconds=random.randint(60, 300)))

        # Pre-assign discharge blocks (capacity-aware, vectorised)
        discharge_block_seq: List[str] = _select_discharge_blocks(discharge_count)
        discharge_idx = 0

        # Build & shuffle operation list (preserves exact counts)
        op_kinds: List[str] = (["Load"]      * load_count
                              + ["Discharge"] * discharge_count
                              + ["Restow"]    * restow_count)
        random.shuffle(op_kinds)

        for idx, move_kind in enumerate(op_kinds):
            # ── Unit ID assignment ────────────────────────────────────────────
            if move_kind == "Load":
                if active_units:
                    unit_id = random.choice(active_units)
                    active_units.remove(unit_id)
                    inactive_units.append(unit_id)
                else:
                    unit_id = next_container_id()
                    inactive_units.append(unit_id)

            elif move_kind == "Discharge":
                if inactive_units and random.random() < 0.75:
                    unit_id = random.choice(inactive_units)
                    inactive_units.remove(unit_id)
                else:
                    unit_id = next_container_id()
                active_units.append(unit_id)

            else:  # Restow
                if active_units:
                    unit_id = random.choice(active_units)
                else:
                    unit_id = next_container_id()
                    active_units.append(unit_id)

            # ── Unique gkey for every (unit, visit) row ───────────────────────
            unit_visit_gkey  = next_unit_visit_gkey()

            container_length = choose_container_length()
            reefer           = random.random() < 0.10
            equipment_type   = choose_equipment_type(container_length, reefer)
            freight_kind     = random.choice(FREIGHT_KINDS)
            category         = CATEGORY_BY_MOVE[move_kind]
            unit_weight      = round(random.uniform(2000, 32000), 6)
            vgm              = (round(unit_weight + random.uniform(50, 500), 5)
                                if random.random() > 0.15 else None)
            hazardous_flag, hazard_un, imdg_code = generate_hazard_fields()
            oog              = "Yes" if random.random() < 0.08 else "No"
            port_of_discharge = random.choice(["CNNGB","SGSIN","CNSHA","NLRTM",
                                               "USLAX","INMAA","JPYOK","KRPUS"])
            move_time        = event_times[idx]

            inbound_id       = None
            inbound_service  = None
            outbound_id      = visit["visit_id"]
            outbound_service = visit["service"]

            # ── Position assignment ───────────────────────────────────────────
            if move_kind == "Discharge":
                yard_block = discharge_block_seq[discharge_idx]
                discharge_idx += 1
                _update_occupied_discharge([yard_block])
                from_pos         = vessel_side_position(visit["visit_id"])
                to_pos           = generate_position_in_block(
                                       terminal["yard_id"], terminal["format"], yard_block)
                current_position = to_pos
                inbound_id       = visit["visit_id"]
                inbound_service  = visit["service"]

            elif move_kind == "Load":
                live             = _current_blocks()
                yard_block       = random.choice(live)
                _update_occupied_load(yard_block)
                from_pos         = generate_position_in_block(
                                       terminal["yard_id"], terminal["format"], yard_block)
                to_pos           = vessel_side_position(visit["visit_id"])
                current_position = to_pos

            else:  # Restow
                live     = _current_blocks()
                b1       = random.choice(live)
                b2       = random.choice(live)
                from_pos         = generate_position_in_block(
                                       terminal["yard_id"], terminal["format"], b1)
                to_pos           = generate_position_in_block(
                                       terminal["yard_id"], terminal["format"], b2)
                current_position = to_pos

            # ── Time In / Time Out ────────────────────────────────────────────
            if move_kind == "Load":
                time_in  = move_time - timedelta(hours=random.uniform(1, 5))
                time_out = move_time + timedelta(hours=random.uniform(1, 4))
            elif move_kind == "Discharge":
                time_in  = move_time
                time_out = move_time + timedelta(hours=random.uniform(2, 9))
            else:  # Restow
                time_in  = move_time - timedelta(hours=random.uniform(1, 3))
                time_out = move_time + timedelta(hours=random.uniform(1, 6))

            container_rows.append({
                "Unit ID":                        unit_id,
                "Unit Visit Gkey":                unit_visit_gkey,
                "Complex Id":                     terminal["complex_id"],
                "Facility Id":                    terminal["facility_id"],
                "Yard Id":                        terminal["yard_id"],
                "Category Id":                    category,
                "Equipment Class":                "CONTAINER",
                "Container Length":               container_length,
                "Equipment type":                 equipment_type,
                "Freight Kind":                   freight_kind,
                "Destination":                    None,
                "Unit Weight in kg":              unit_weight,
                "Verified Gross Mass (Kg)":       vgm,
                "Reefer":                         "Yes" if reefer else "No",
                "OOG Unit":                       oog,
                "Hazardous Flag":                 hazardous_flag,
                "Hazard UN Numbers":              hazard_un,
                "IMDG Code":                      imdg_code,
                "Stow Code 1":                    None,
                "Stow Code 2":                    None,
                "Stow Code 3":                    None,
                "Port of Discharge":              port_of_discharge,
                "Actual Inbound Carrier visit ID": inbound_id,
                "Inbound Service":                inbound_service,
                "Actual Outbound Carrier visit ID": outbound_id,
                "Outbound Service":               outbound_service,
                "Arrival Mode":                   ARRIVAL_MODE_BY_MOVE[move_kind],
                "Current Position":               current_position,
                "Visit State":                    VISIT_STATE_BY_MOVE[move_kind],
                "Transit State":                  TRANSIT_STATE_BY_MOVE[move_kind],
                "Time Out":                       fmt_time_mmddyyyy(time_out),
                "Time In":                        fmt_time_mmddyyyy(time_in),
                "Move Complete Time":             fmt_time_mmddyyyy(move_time),
                "Ctr From Position":              from_pos,
                "Ctr To Position":                to_pos,
            })

            crane_rows.append({
                "Time Completed": fmt_crane(move_time),
                "Event Type":     CRANE_EVENT_BY_MOVE[move_kind],
                "Move Kind":      move_kind,
                "Unit Category":  random.choice(UNIT_CATEGORIES),
                "Unit Nbr":       unit_id,
                "Crane CHE":      random.choice(cranes_assigned),
                "From Position":  from_pos,
                "To Position":    to_pos,
                "Carrier Visit":  visit["visit_id"],
                "Line Op":        line_op,
                "Exclude":        random.choice(["No", "No", "No", "Yes"]),
            })

    container_rows.sort(key=sort_key_move)
    crane_rows.sort(key=sort_key_crane)
    active_rows = derive_active_yard_containers(container_rows, terminal["yard_id"])
    return container_rows, crane_rows, active_rows


def derive_active_yard_containers(container_rows: List[dict], yard_id: str) -> List[dict]:
    """
    For each unit keep only the most recent row.
    A container is 'active in the yard' iff its current position starts with 'Y-'.
    Unit Visit Gkey uniqueness is already guaranteed by next_unit_visit_gkey().
    """
    latest_by_unit: Dict[str, dict] = {}
    for row in container_rows:
        uid = row["Unit ID"]
        cur = latest_by_unit.get(uid)
        if cur is None or (parse_time_mmddyyyy(row["Move Complete Time"])
                           > parse_time_mmddyyyy(cur["Move Complete Time"])):
            latest_by_unit[uid] = row

    active_rows: List[dict] = []
    for row in latest_by_unit.values():
        pos = row.get("Current Position", "")
        if not pos.startswith("Y-"):
            continue
        active_rows.append({
            "Unit ID":                          row["Unit ID"],
            "Unit Visit Gkey":                  row["Unit Visit Gkey"],
            "Actual Outbound Carrier visit ID": row["Actual Outbound Carrier visit ID"],
            "Current Yard Block":               derive_yard_block(pos, yard_id),
            "Current Slot Position":            pos,
            "Move Complete Time":               row["Move Complete Time"],
        })

    active_rows.sort(
        key=lambda r: parse_time_mmddyyyy(r["Move Complete Time"]), reverse=True
    )
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
    from collections import Counter

    print("\n================================================")
    print("SYNTHETIC DATASET GENERATION STARTED")
    print(f"Block capacity          : {BLOCK_CAPACITY} slots  ({SLOTS_PER_BLOCK} usable @ {BLOCK_OCCUPANCY:.0%})")
    print(f"Active crane MPH        : {CRANE_ACTIVE_MPH_MIN}-{CRANE_ACTIVE_MPH_MAX} (within batches)")
    print(f"Vessel stay hours       : {STAY_MIN_HOURS:.0f} h (low volume) – {STAY_MAX_HOURS:.0f} h (high volume)")
    print( "Block assignment        : capacity-driven (fills existing before opening new)")
    print("================================================")

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

        # ── Duplicate checks ──────────────────────────────────────────────────
        gkeys = [r["Unit Visit Gkey"] for r in container_rows]
        dup_gkeys = len(gkeys) - len(set(gkeys))
        print(f"  Duplicate Unit Visit Gkeys : {dup_gkeys}  (should be 0)")

        # ── Stay time sample ──────────────────────────────────────────────────
        print(f"  Move-span check           : multi-batch sequence scaled across 20 h → 80 h")

        # ── Block distribution ────────────────────────────────────────────────
        block_counts = Counter(r["Current Yard Block"] for r in active_rows)
        print(f"  Block distribution ({len(block_counts)} blocks used, "
              f"~{len(active_rows) // max(1, len(block_counts))} avg per block):")
        for blk, cnt in sorted(block_counts.items(), key=lambda x: -x[1])[:12]:
            bar   = "#" * (cnt // 20)
            share = cnt / len(active_rows) * 100
            print(f"    {blk:12s} {cnt:4d}  ({share:4.1f}%)  {bar}")
        if len(block_counts) > 12:
            print(f"    ... and {len(block_counts) - 12} more blocks")

        max_realistic = math.ceil(len(active_rows) / SLOTS_PER_BLOCK)
        print(f"  Sanity: {len(active_rows)} containers -> needs >= {max_realistic} block(s) "
              f"@ {SLOTS_PER_BLOCK} slots each  [got {len(block_counts)}]")

    print("\n================================================")
    print("GENERATION COMPLETED")
    print(f"Total Container rows    : {total_c:,}")
    print(f"Total Crane rows        : {total_cr:,}")
    print(f"Total Active containers : {total_a:,}")
    print("================================================")


if __name__ == "__main__":
    main()