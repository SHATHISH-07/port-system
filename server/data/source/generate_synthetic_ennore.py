from __future__ import annotations

import collections
import csv
import json
import math
import random
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# NOTE: random.seed() is called at the top of main() so the seed is applied
# after all module-level code runs, giving deterministic output regardless of
# import-time side-effects.

TERMINALS = [
    {"terminal_id": "AECY", "complex_id": "USAEC", "facility_id": "AEC", "yard_id": "AECY", "format": "AECY", "berth_count": 1},
]

HISTORY_VESSELS_PER_TERMINAL = 16
VISITS_PER_VESSEL             = 12
DAYS_RANGE                    = 180
END_DATE                      = datetime.now()
START_DATE                    = END_DATE - timedelta(days=DAYS_RANGE)

# Active containers are discharged within this many days before END_DATE
ACTIVE_DISCHARGE_WINDOW_DAYS  = 14

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

STAY_MIN_HOURS        = 40.0
STAY_MAX_HOURS        = 80.0
LOW_PRODUCTIVITY_THRESHOLD  = LOW_VOLUME_MAX * 2
HIGH_PRODUCTIVITY_THRESHOLD = MAX_HISTORY_CONTAINERS_PER_VISIT

OUTPUT_DIR = Path(".")
BASE_OUTPUT_CONTAINER_FILE = "synthetic_container_dataset.csv"
BASE_OUTPUT_CRANE_FILE     = "synthetic_crane_dataset.csv"
BASE_OUTPUT_ACTIVE_JSON    = "active_unit_ids.json"

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

PEB_BLOCKS  = list("ABCDEFGH")
CWIT_BLOCKS = [f"{s}{b}" for s in "12345" for b in "ABCD"]
AECY_BLOCKS = ["1A", "1L", "1B", "1K", "1J", "1H", "1E", "1F", "1G", "1D", "1C", "DMY", "1R", "2R", "3R", "WB", "1M"]

# ── Sequence counters (module-level so they stay unique across terminals) ──────
_container_seq: int  = 6_000_000
_visit_seq: int      = 180_000
_unit_visit_seq: int = 3_000_000

_all_container_ids: set = set()

_gkey_cache: Dict[str, int] = {}


class YardSlotRegistry:
    MAX_TIER = 5

    def __init__(self):
        self._next_tier: Dict[tuple, int] = {}

    def next_tier_for(self, block: str, bay: int, row) -> Optional[int]:
        key = (block, bay, row)
        tier = self._next_tier.get(key, 1)
        if tier > self.MAX_TIER:
            return None
        self._next_tier[key] = tier + 1
        return tier

    def reset(self):
        self._next_tier.clear()


def next_container_id() -> str:
    global _container_seq
    while True:
        _container_seq += 1
        prefix = random.choice(CONTAINER_PREFIXES)
        cid    = f"{prefix}{_container_seq:07d}"
        if cid not in _all_container_ids:
            _all_container_ids.add(cid)
            return cid


def next_visit_id() -> str:
    global _visit_seq
    _visit_seq += 1
    return f"{random.choice(VISIT_PREFIXES)}{_visit_seq:06d}"


def get_or_create_gkey(unit_id: str) -> int:
    global _unit_visit_seq
    if unit_id not in _gkey_cache:
        _unit_visit_seq += 1
        _gkey_cache[unit_id] = _unit_visit_seq
    return _gkey_cache[unit_id]


def fmt_crane(dt: datetime) -> str:
    return dt.strftime("%y-%b-%d %H%M")


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
        return "Yes", str(random.randint(1, 9)), random.choice(IMDG_CODES)
    return "No", None, None


def generate_peb_position(block: str, registry: YardSlotRegistry = None) -> str:
    bay = random.randint(1, 30)
    row = random.randint(1, 10)
    if registry:
        for _ in range(20):
            tier = registry.next_tier_for(block, bay, row)
            if tier is not None:
                return f"Y-PEB-{block}{bay:03d}{row:02d}C{tier}"
            bay = random.randint(1, 30)
            row = random.randint(1, 10)
    tier = random.randint(1, 5)
    return f"Y-PEB-{block}{bay:03d}{row:02d}C{tier}"


def generate_cwit_position(block: str, registry: YardSlotRegistry = None) -> str:
    section = block[0]
    blk     = block[1]
    bay  = random.randint(1, 99)
    row  = random.choice(list("ABCDEFGHJKLMN"))
    if registry:
        for _ in range(20):
            tier = registry.next_tier_for(block, bay, row)
            if tier is not None:
                return f"Y-CWIT-{section}{blk}{bay:03d}{row}.{tier}"
            bay = random.randint(1, 99)
            row = random.choice(list("ABCDEFGHJKLMN"))
    tier = random.randint(1, 5)
    return f"Y-CWIT-{section}{blk}{bay:03d}{row}.{tier}"


def generate_aecy_position(block: str, registry: YardSlotRegistry = None) -> str:
    bay = random.randint(1, 40)
    row = random.randint(1, 10)
    if registry:
        for _ in range(20):
            tier = registry.next_tier_for(block, bay, row)
            if tier is not None:
                return f"Y-AECY-{block}{bay:03d}{row:02d}C{tier}"
            bay = random.randint(1, 40)
            row = random.randint(1, 10)
    tier = random.randint(1, 5)
    return f"Y-AECY-{block}{bay:03d}{row:02d}C{tier}"


def generate_position_in_block(yard_id: str, yard_format: str, block: str,
                                registry: YardSlotRegistry = None) -> str:
    if yard_id == "AECY" or yard_format == "AECY":
        return generate_aecy_position(block, registry)
    if yard_id == "PEB"  or yard_format == "PEB":
        return generate_peb_position(block, registry)
    if yard_id == "CWIT" or yard_format == "CWIT":
        return generate_cwit_position(block, registry)
    bay  = random.randint(100, 999)
    row  = random.randint(10, 99)
    tier = random.randint(1, 5)
    return f"Y-{yard_id}-{block}{bay:03d}{row:02d}C{tier}"


def blocks_needed_for(n_containers: int) -> int:
    return max(1, math.ceil(n_containers / SLOTS_PER_BLOCK))


def pick_blocks_for_count(yard_id: str, yard_format: str, n_containers: int,
                          preferred: List[str]) -> List[str]:
    if yard_id == "AECY" or yard_format == "AECY":
        pool = AECY_BLOCKS
    elif yard_id == "PEB"  or yard_format == "PEB":
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
    if terminal.get("yard_id") == "AECY":
        return "AECT1"
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


def estimate_stay_hours(load_count: int, discharge_count: int, crane_count: int) -> float:
    productive = load_count + discharge_count
    volume_t = max(
        0.0,
        min(
            1.0,
            (productive - LOW_PRODUCTIVITY_THRESHOLD)
            / max(1, HIGH_PRODUCTIVITY_THRESHOLD - LOW_PRODUCTIVITY_THRESHOLD),
        ),
    )
    volume_hours = STAY_MIN_HOURS + volume_t * (STAY_MAX_HOURS - STAY_MIN_HOURS)
    crane_effect = 1.0 - (max(1, crane_count) - 3) * 0.05
    crane_effect = max(0.88, min(1.10, crane_effect))
    base_hours = volume_hours * crane_effect
    jitter = random.uniform(-1.0, 1.0)
    return round(max(STAY_MIN_HOURS, min(STAY_MAX_HOURS, base_hours + jitter)), 2)


def build_event_times(start: datetime, stay_hours: float,
                      count: int, crane_count: int) -> List[datetime]:
    if count <= 0:
        return []

    lead_in_hours  = min(1.5, max(0.25, stay_hours * 0.05))
    tail_out_hours = min(1.5, max(0.25, stay_hours * 0.05))

    window_start = start + timedelta(hours=lead_in_hours)
    window_end   = start + timedelta(hours=stay_hours - tail_out_hours)

    if window_end <= window_start:
        window_end = window_start + timedelta(minutes=30)

    if count == 1:
        return [window_start + (window_end - window_start) / 2]

    span_seconds = max(60.0, (window_end - window_start).total_seconds())

    target_mph    = random.uniform(CRANE_ACTIVE_MPH_MIN, CRANE_ACTIVE_MPH_MAX)
    combined_mph  = max(1.0, crane_count * target_mph)
    cycle_seconds = max(20.0, 3600.0 / combined_mph)

    batch_target = max(2, int(round(stay_hours / 12.0)))
    batch_limit  = max(2, int(count / 18) + 1)
    num_batches  = min(6, batch_target, batch_limit, count)
    num_batches  = max(2, num_batches)

    batch_sizes = _split_evenly(count, num_batches)

    batch_active_windows: List[float] = []
    for size in batch_sizes:
        batch_active_windows.append(
            max(size * cycle_seconds, random.uniform(20 * 60.0, 70 * 60.0))
        )

    total_active = sum(batch_active_windows)
    if total_active > span_seconds * 0.72:
        scale = (span_seconds * 0.72) / max(total_active, 1.0)
        batch_active_windows = [max(20 * 60.0, w * scale) for w in batch_active_windows]
        total_active = sum(batch_active_windows)

    gap_count  = max(0, num_batches - 1)
    gap_budget = max(0.0, span_seconds - total_active)

    gap_windows: List[float] = []
    if gap_count > 0:
        base_gap = gap_budget / gap_count if gap_count else 0.0
        for _ in range(gap_count):
            gap_windows.append(max(15 * 60.0, base_gap * random.uniform(0.85, 1.20)))
        gap_total = sum(gap_windows)
        if gap_total > 0 and gap_budget > 0:
            scale = gap_budget / gap_total
            gap_windows = [g * scale for g in gap_windows]

    times: List[datetime] = []
    cursor = window_start

    for batch_idx, batch_moves in enumerate(batch_sizes):
        batch_window = batch_active_windows[batch_idx]

        if batch_moves == 1:
            times.append(cursor + timedelta(seconds=batch_window / 2.0))
        else:
            step = batch_window / max(batch_moves - 1, 1)
            for move_idx in range(batch_moves):
                jitter = random.uniform(-8.0, 8.0)
                ts = cursor + timedelta(seconds=(move_idx * step) + jitter)
                times.append(ts)

        cursor += timedelta(seconds=batch_window)
        if batch_idx < len(gap_windows):
            cursor += timedelta(seconds=gap_windows[batch_idx])

    times.sort()

    for i in range(1, len(times)):
        if times[i] <= times[i - 1]:
            times[i] = times[i - 1] + timedelta(seconds=random.randint(15, 45))

    times = [max(window_start, min(window_end, t)) for t in times]

    for i in range(1, len(times)):
        if times[i] <= times[i - 1]:
            times[i] = times[i - 1] + timedelta(seconds=random.randint(15, 45))
            if times[i] > window_end:
                times[i] = window_end

    return times


def sort_key_move(row: dict) -> datetime:
    return parse_time_mmddyyyy(row["Move Complete Time"])


def sort_key_crane(row: dict) -> datetime:
    return datetime.strptime(row["Time Completed"], "%y-%b-%d %H%M")


CONTAINER_HEADERS = [
    "Unit ID", "Unit Visit Gkey", "Complex Id", "Facility Id", "Yard Id",
    "Category Id", "Equipment Class", "Container Length", "Equipment type",
    "Freight Kind", "Destination", "Unit Weight in kg", "Verified Gross Mass (Kg)",
    "Reefer", "OOG Unit", "Hazardous Flag", "Hazard UN Numbers", "IMDG Code",
    "Stow Code 1", "Stow Code 2", "Stow Code 3", "Port of Discharge",
    "Actual Inbound Carrier visit ID", "Inbound Service",
    "Actual Outbound Carrier visit ID", "Outbound Service", "Arrival Mode",
    "Current Position", "Visit State", "Transit State",
    "Time Out", "Time In", "Move Complete Time",
    "Ctr From Position", "Ctr To Position",
]

CRANE_HEADERS = [
    "Time Completed", "Event Type", "Move Kind", "Unit Category", "Unit Nbr",
    "Crane CHE", "From Position", "To Position", "Carrier Visit", "Line Op", "Exclude",
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
    total_rows = max(3, int(total_rows))

    base_restow      = max(1, int(round(total_rows * RESTOW_RATIO)))
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

    if restow_count < 1:
        deficit = 1 - restow_count
        trim_discharge = min(deficit, max(0, discharge_count - 1))
        discharge_count -= trim_discharge
        deficit -= trim_discharge
        if deficit > 0:
            load_count = max(1, load_count - deficit)
        restow_count = total_rows - load_count - discharge_count

    return load_count, discharge_count, restow_count


def _make_physical_attrs() -> dict:
    """Generate and return a dict of physical container attributes."""
    container_length = choose_container_length()
    reefer           = random.random() < 0.10
    equipment_type   = choose_equipment_type(container_length, reefer)
    freight_kind     = random.choice(FREIGHT_KINDS)
    unit_weight      = round(random.uniform(2000, 32000), 6)
    vgm              = (round(unit_weight + random.uniform(50, 500), 5)
                        if random.random() > 0.15 else None)
    hazardous_flag, hazard_un, imdg_code = generate_hazard_fields()
    oog              = "Yes" if random.random() < 0.08 else "No"
    port_of_discharge = random.choice(["CNNGB", "SGSIN", "CNSHA", "NLRTM",
                                       "USLAX", "INMAA", "JPYOK", "KRPUS"])
    return {
        "container_length":  container_length,
        "reefer":            reefer,
        "equipment_type":    equipment_type,
        "freight_kind":      freight_kind,
        "unit_weight":       unit_weight,
        "vgm":               vgm,
        "hazardous_flag":    hazardous_flag,
        "hazard_un":         hazard_un,
        "imdg_code":         imdg_code,
        "oog":               oog,
        "port_of_discharge": port_of_discharge,
    }


def _build_container_row(terminal: dict, unit_id: str, unit_visit_gkey: int,
                         attrs: dict, category: str, visit_state: str,
                         transit_state: str, arrival_mode: str,
                         inbound_id, inbound_service,
                         outbound_id, outbound_service,
                         current_position: str, from_pos: str, to_pos: str,
                         move_time: datetime, time_in: datetime,
                         time_out: datetime) -> dict:
    return {
        "Unit ID":                          unit_id,
        "Unit Visit Gkey":                  unit_visit_gkey,
        "Complex Id":                       terminal["complex_id"],
        "Facility Id":                      terminal["facility_id"],
        "Yard Id":                          terminal["yard_id"],
        "Category Id":                      category,
        "Equipment Class":                  "CONTAINER",
        "Container Length":                 attrs["container_length"],
        "Equipment type":                   attrs["equipment_type"],
        "Freight Kind":                     attrs["freight_kind"],
        "Destination":                      None,
        "Unit Weight in kg":                attrs["unit_weight"],
        "Verified Gross Mass (Kg)":         attrs["vgm"],
        "Reefer":                           "Yes" if attrs["reefer"] else "No",
        "OOG Unit":                         attrs["oog"],
        "Hazardous Flag":                   attrs["hazardous_flag"],
        "Hazard UN Numbers":                attrs["hazard_un"],
        "IMDG Code":                        attrs["imdg_code"],
        "Stow Code 1":                      None,
        "Stow Code 2":                      None,
        "Stow Code 3":                      None,
        "Port of Discharge":                attrs["port_of_discharge"],
        "Actual Inbound Carrier visit ID":  inbound_id,
        "Inbound Service":                  inbound_service,
        "Actual Outbound Carrier visit ID": outbound_id,
        "Outbound Service":                 outbound_service,
        "Arrival Mode":                     arrival_mode,
        "Current Position":                 current_position,
        "Visit State":                      visit_state,
        "Transit State":                    transit_state,
        "Time Out":                         fmt_time_mmddyyyy(time_out),
        "Time In":                          fmt_time_mmddyyyy(time_in),
        "Move Complete Time":               fmt_time_mmddyyyy(move_time),
        "Ctr From Position":                from_pos,
        "Ctr To Position":                  to_pos,
    }


def generate_terminal_data(terminal: dict):
    """
    Two-phase generation:

    PHASE 1 — Historical vessel operations (180 days)
        Runs the original visit-loop over all vessel calls.  Produces a rich
        mix of Load / Discharge / Restow records across HISTORY_VESSELS_PER_TERMINAL
        × VISITS_PER_VESSEL vessel visits.  Containers that end their last
        historical record as a Load (departed) are NOT in the active JSON.

    PHASE 2 — Active containers (present state)
        Generates TARGET_ACTIVE_PER_TERMINAL_MIN … MAX fresh containers, each
        with exactly two records:
          Record 1  Yard → Vessel  3DEPARTED / S70_DEPARTED  (historical load,
                    move time in the 15–180 day window before now)
          Record 2  Vessel → Yard  IN_YARD   / S40_YARD      (recent discharge,
                    move time in the last ACTIVE_DISCHARGE_WINDOW_DAYS days)
        Every active container is guaranteed to end in yard.  All Unit IDs from
        this phase populate the active_unit_ids JSON.
    """
    container_rows: List[dict] = []
    crane_rows:     List[dict] = []

    visits      = build_visit_schedule(terminal)
    slot_registry = YardSlotRegistry()

    _all_pool  = (AECY_BLOCKS if terminal["format"] == "AECY" else
                  PEB_BLOCKS  if terminal["format"] == "PEB"  else
                  CWIT_BLOCKS if terminal["format"] == "CWIT" else list("ABCDEFG"))
    _zone_size = (5 if terminal["format"] == "AECY" else
                  6 if terminal["format"] == "PEB"  else
                  7 if terminal["format"] == "CWIT" else 5)
    _zone_pool = random.sample(_all_pool, min(_zone_size, len(_all_pool)))

    container_attrs: Dict[str, dict] = {}
    occupied_blocks: Dict[str, int]  = {}

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

    def _update_occupied_restow(from_block: str, to_block: str):
        if from_block in occupied_blocks:
            occupied_blocks[from_block] -= 1
            if occupied_blocks[from_block] <= 0:
                del occupied_blocks[from_block]
        occupied_blocks[to_block] = occupied_blocks.get(to_block, 0) + 1

    def _current_blocks() -> List[str]:
        blks = list(occupied_blocks.keys())
        return blks if blks else (PEB_BLOCKS[:2] if terminal["format"] == "PEB"
                                  else AECY_BLOCKS[:2] if terminal["format"] == "AECY"
                                  else CWIT_BLOCKS[:2])

    line_op = random.choice(LINE_OPS)

    # ── PHASE 1: Historical vessel operations ─────────────────────────────────
    active_set:  set = set()
    inactive_set: set = set()

    for visit in visits:
        slot_registry.reset()

        total_rows   = generate_container_count()
        active_count = len(active_set)
        load_count, discharge_count, restow_count = choose_operation_mix(
            active_count, TARGET_ACTIVE_PER_TERMINAL_MIN,
            TARGET_ACTIVE_PER_TERMINAL_MAX, total_rows,
        )
        total_ops = load_count + discharge_count + restow_count

        cranes_assigned = assign_cranes(total_rows)
        stay_hours = estimate_stay_hours(load_count, discharge_count, len(cranes_assigned))

        event_times = build_event_times(
            visit["visit_start"], stay_hours, total_ops, len(cranes_assigned),
        )
        while len(event_times) < total_ops:
            last = event_times[-1] if event_times else visit["visit_start"] + timedelta(hours=1)
            event_times.append(last + timedelta(seconds=random.randint(60, 300)))

        discharge_block_seq: List[str] = _select_discharge_blocks(discharge_count)
        discharge_idx = 0

        op_kinds: List[str] = (["Load"]      * load_count
                              + ["Discharge"] * discharge_count
                              + ["Restow"]    * restow_count)
        random.shuffle(op_kinds)

        for idx, move_kind in enumerate(op_kinds):
            if move_kind == "Load":
                if active_set:
                    unit_id = random.choice(list(active_set))
                    active_set.discard(unit_id)
                    inactive_set.add(unit_id)
                else:
                    move_kind = "Discharge"
                    unit_id   = next_container_id()
                    active_set.add(unit_id)

            if move_kind == "Discharge":
                inactive_list = list(inactive_set)
                if inactive_list and random.random() < 0.75:
                    unit_id = random.choice(inactive_list)
                    inactive_set.discard(unit_id)
                else:
                    unit_id = next_container_id()
                active_set.add(unit_id)

            elif move_kind == "Restow":
                if active_set:
                    unit_id = random.choice(list(active_set))
                else:
                    unit_id = next_container_id()
                    active_set.add(unit_id)

            unit_visit_gkey = get_or_create_gkey(unit_id)

            if unit_id not in container_attrs:
                container_attrs[unit_id] = _make_physical_attrs()
            attrs = container_attrs[unit_id]

            move_time        = event_times[idx]
            inbound_id       = None
            inbound_service  = None
            outbound_id      = visit["visit_id"] if move_kind == "Load" else None
            outbound_service = visit["service"]  if move_kind == "Load" else None

            if move_kind == "Discharge":
                yard_block = discharge_block_seq[discharge_idx]
                discharge_idx += 1
                _update_occupied_discharge([yard_block])
                from_pos         = vessel_side_position(visit["visit_id"])
                to_pos           = generate_position_in_block(
                                       terminal["yard_id"], terminal["format"],
                                       yard_block, registry=slot_registry)
                current_position = to_pos
                inbound_id       = visit["visit_id"]
                inbound_service  = visit["service"]
                time_in  = move_time
                time_out = move_time + timedelta(hours=random.uniform(2, 9))

            elif move_kind == "Load":
                live       = _current_blocks()
                yard_block = random.choice(live)
                _update_occupied_load(yard_block)
                from_pos         = generate_position_in_block(
                                       terminal["yard_id"], terminal["format"],
                                       yard_block, registry=slot_registry)
                to_pos           = vessel_side_position(visit["visit_id"])
                current_position = to_pos
                time_in  = move_time - timedelta(hours=random.uniform(1, 5))
                time_out = move_time + timedelta(hours=random.uniform(1, 4))

            else:  # Restow
                live = _current_blocks()
                b1   = random.choice(live)
                b2   = random.choice(live)
                from_pos         = generate_position_in_block(
                                       terminal["yard_id"], terminal["format"],
                                       b1, registry=slot_registry)
                to_pos           = generate_position_in_block(
                                       terminal["yard_id"], terminal["format"],
                                       b2, registry=slot_registry)
                current_position = to_pos
                _update_occupied_restow(b1, b2)
                time_in  = move_time - timedelta(hours=random.uniform(1, 3))
                time_out = move_time + timedelta(hours=random.uniform(1, 6))

            container_rows.append(_build_container_row(
                terminal, unit_id, unit_visit_gkey, attrs,
                CATEGORY_BY_MOVE[move_kind],
                VISIT_STATE_BY_MOVE[move_kind],
                TRANSIT_STATE_BY_MOVE[move_kind],
                ARRIVAL_MODE_BY_MOVE[move_kind],
                inbound_id, inbound_service,
                outbound_id, outbound_service,
                current_position, from_pos, to_pos,
                move_time, time_in, time_out,
            ))

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

    # ── PHASE 2: Active containers (exactly 2 records each) ──────────────────
    # These are brand-new Unit IDs not seen in Phase 1, ensuring no container
    # appears both as a historical record and an active record.
    #
    # Yard slots for Record 2 (current position) are pinned to specific blocks
    # with exact counts:
    #   1M → 200,  1L → 200,  1K → 200
    #   1J → 300,  1H → 100,  1G →  50      Total = 1,050
    #
    # Record 1 (Load):      move_time in history window (before discharge window)
    # Record 2 (Discharge): move_time in last ACTIVE_DISCHARGE_WINDOW_DAYS days
    # Both must be strictly ordered: move_time_1 < move_time_2.

    ACTIVE_BLOCK_DISTRIBUTION: List[Tuple[str, int]] = [
        ("1M", 200),
        ("1L", 200),
        ("1K", 200),
        ("1J", 300),
        ("1H", 100),
        ("1G",  50),
    ]
    # Build a flat list of blocks, one entry per container, in block order.
    active_block_assignments: List[str] = []
    for blk, cnt in ACTIVE_BLOCK_DISTRIBUTION:
        active_block_assignments.extend([blk] * cnt)

    n_active      = len(active_block_assignments)   # 1,050
    active_unit_ids: List[str] = []

    # Pick a recent vessel visit pool for the discharge leg (last 14 days of
    # the schedule).  Fall back to any visit if none are recent enough.
    active_discharge_start = END_DATE - timedelta(days=ACTIVE_DISCHARGE_WINDOW_DAYS)
    recent_visits = [v for v in visits if v["visit_start"] >= active_discharge_start]
    if not recent_visits:
        recent_visits = visits[-max(1, len(visits) // 4):]   # last 25 % of visits

    # Visits available for the historical load leg (older than the discharge window)
    old_visits = [v for v in visits if v["visit_start"] < active_discharge_start]
    if not old_visits:
        old_visits = visits[:max(1, len(visits) // 2)]

    cranes_active = assign_cranes(n_active)

    # Per-block slot registries so tier counts are tracked independently
    # within each block and never bleed across blocks.
    block_registries: Dict[str, YardSlotRegistry] = {
        blk: YardSlotRegistry() for blk, _ in ACTIVE_BLOCK_DISTRIBUTION
    }

    for yard_block_r2 in active_block_assignments:
        unit_id         = next_container_id()
        unit_visit_gkey = get_or_create_gkey(unit_id)
        attrs           = _make_physical_attrs()
        active_unit_ids.append(unit_id)

        # ── vessel visits for each leg ──────────────────────────────────────
        v_load      = random.choice(old_visits)
        v_discharge = random.choice(recent_visits)

        vessel_visit_load        = v_load["visit_id"]
        vessel_service_load      = v_load["service"]
        vessel_visit_discharge   = v_discharge["visit_id"]
        vessel_service_discharge = v_discharge["service"]

        # ── move times ──────────────────────────────────────────────────────
        # Load time: anywhere in the old-visit's operational window
        move_time_1 = v_load["visit_start"] + timedelta(hours=random.uniform(1, 60))
        # Clamp so it never spills into the active discharge window
        load_ceiling = active_discharge_start - timedelta(hours=1)
        if move_time_1 > load_ceiling:
            move_time_1 = load_ceiling - timedelta(hours=random.uniform(1, 24))

        # Discharge time: within the last ACTIVE_DISCHARGE_WINDOW_DAYS days
        move_time_2 = active_discharge_start + timedelta(
            seconds=random.uniform(0, (END_DATE - active_discharge_start).total_seconds())
        )
        # Guarantee strict ordering
        if move_time_2 <= move_time_1:
            move_time_2 = move_time_1 + timedelta(hours=random.uniform(24, 72))

        # ── positions ───────────────────────────────────────────────────────
        # Record 1: container was in any yard block before loading
        yard_block_r1 = random.choice(_all_pool)
        slot_registry.reset()
        yard_pos_r1   = generate_position_in_block(
                            terminal["yard_id"], terminal["format"],
                            yard_block_r1, registry=slot_registry)
        vessel_pos_r1 = vessel_side_position(vessel_visit_load)

        # Record 2: container is discharged into the assigned active block
        vessel_pos_r2 = vessel_side_position(vessel_visit_discharge)
        yard_pos_r2   = generate_position_in_block(
                            terminal["yard_id"], terminal["format"],
                            yard_block_r2, registry=block_registries[yard_block_r2])

        # ── Record 1: Yard → Vessel (historical load, 3DEPARTED) ────────────
        r1_time_in  = move_time_1 - timedelta(hours=random.uniform(1, 5))
        r1_time_out = move_time_1 + timedelta(hours=random.uniform(1, 4))

        container_rows.append(_build_container_row(
            terminal, unit_id, unit_visit_gkey, attrs,
            "EXPRT", "3DEPARTED", "S70_DEPARTED", "TRUCK",
            None, None,
            vessel_visit_load, vessel_service_load,
            vessel_pos_r1, yard_pos_r1, vessel_pos_r1,
            move_time_1, r1_time_in, r1_time_out,
        ))
        crane_rows.append({
            "Time Completed": fmt_crane(move_time_1),
            "Event Type":     "UNIT_LOAD",
            "Move Kind":      "Load",
            "Unit Category":  random.choice(UNIT_CATEGORIES),
            "Unit Nbr":       unit_id,
            "Crane CHE":      random.choice(cranes_active),
            "From Position":  yard_pos_r1,
            "To Position":    vessel_pos_r1,
            "Carrier Visit":  vessel_visit_load,
            "Line Op":        line_op,
            "Exclude":        random.choice(["No", "No", "No", "Yes"]),
        })

        # ── Record 2: Vessel → Yard (active discharge, IN_YARD) ─────────────
        r2_time_in  = move_time_2
        r2_time_out = move_time_2 + timedelta(hours=random.uniform(2, 9))

        container_rows.append(_build_container_row(
            terminal, unit_id, unit_visit_gkey, attrs,
            "IMPRT", "IN_YARD", "S40_YARD", "VESSEL",
            vessel_visit_discharge, vessel_service_discharge,
            None, None,
            yard_pos_r2, vessel_pos_r2, yard_pos_r2,
            move_time_2, r2_time_in, r2_time_out,
        ))
        crane_rows.append({
            "Time Completed": fmt_crane(move_time_2),
            "Event Type":     "UNIT_DISCHARGE",
            "Move Kind":      "Discharge",
            "Unit Category":  random.choice(UNIT_CATEGORIES),
            "Unit Nbr":       unit_id,
            "Crane CHE":      random.choice(cranes_active),
            "From Position":  vessel_pos_r2,
            "To Position":    yard_pos_r2,
            "Carrier Visit":  vessel_visit_discharge,
            "Line Op":        line_op,
            "Exclude":        random.choice(["No", "No", "No", "Yes"]),
        })

    container_rows.sort(key=sort_key_move)
    crane_rows.sort(key=sort_key_crane)

    return container_rows, crane_rows, active_unit_ids


def write_csv(path: Path, headers: List[str], rows: List[dict]):
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)


def write_json(path: Path, data) -> None:
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def main():
    random.seed(42)

    print("\n================================================")
    print("SYNTHETIC DATASET GENERATION STARTED")
    print(f"Block capacity          : {BLOCK_CAPACITY} slots  ({SLOTS_PER_BLOCK} usable @ {BLOCK_OCCUPANCY:.0%})")
    print(f"Active crane MPH        : {CRANE_ACTIVE_MPH_MIN}-{CRANE_ACTIVE_MPH_MAX} (within batches)")
    print(f"Vessel stay hours       : {STAY_MIN_HOURS:.0f} h (low volume) – {STAY_MAX_HOURS:.0f} h (high volume)")
    print(f"Max tier                : {YardSlotRegistry.MAX_TIER}  (from XML z-index-max)")
    print(f"History window          : {DAYS_RANGE} days")
    print(f"Active discharge window : last {ACTIVE_DISCHARGE_WINDOW_DAYS} days")
    print("================================================")

    total_c = total_cr = total_a = 0

    for terminal in TERMINALS:
        yard_id = terminal["yard_id"]
        print(f"\nProcessing Yard: {yard_id}")
        container_rows, crane_rows, active_unit_ids = generate_terminal_data(terminal)

        total_c  += len(container_rows)
        total_cr += len(crane_rows)
        total_a  += len(active_unit_ids)

        out_c  = OUTPUT_DIR / f"{yard_id}_{BASE_OUTPUT_CONTAINER_FILE}"
        out_cr = OUTPUT_DIR / f"{yard_id}_{BASE_OUTPUT_CRANE_FILE}"
        out_aj = OUTPUT_DIR / f"{yard_id}_{BASE_OUTPUT_ACTIVE_JSON}"

        write_csv(out_c,  CONTAINER_HEADERS, container_rows)
        write_csv(out_cr, CRANE_HEADERS,     crane_rows)
        write_json(out_aj, active_unit_ids)

        print(f"  -> {out_c.name}  ({len(container_rows):,} rows)")
        print(f"  -> {out_cr.name}  ({len(crane_rows):,} rows)")
        print(f"  -> {out_aj.name}  ({len(active_unit_ids):,} active unit IDs)")

        # ── Sanity checks ────────────────────────────────────────────────────
        active_set_check = set(active_unit_ids)

        # Active containers must each have exactly 2 rows
        rows_per_active: Dict[str, int] = collections.defaultdict(int)
        for r in container_rows:
            if r["Unit ID"] in active_set_check:
                rows_per_active[r["Unit ID"]] += 1
        bad_active = sum(1 for v in rows_per_active.values() if v != 2)
        print(f"  Active containers without exactly 2 rows   : {bad_active}  (should be 0)")

        # Active containers' last record must be IN_YARD
        latest_by_unit: Dict[str, dict] = {}
        for r in container_rows:
            if r["Unit ID"] in active_set_check:
                uid = r["Unit ID"]
                cur = latest_by_unit.get(uid)
                if cur is None or (parse_time_mmddyyyy(r["Move Complete Time"])
                                   > parse_time_mmddyyyy(cur["Move Complete Time"])):
                    latest_by_unit[uid] = r
        not_in_yard = sum(1 for r in latest_by_unit.values()
                          if not r.get("Current Position", "").startswith("Y-"))
        print(f"  Active containers not ending in yard        : {not_in_yard}  (should be 0)")

        # No gkey shared across different Unit IDs
        gkey_to_units: Dict[str, set] = collections.defaultdict(set)
        for r in container_rows:
            gkey_to_units[r["Unit Visit Gkey"]].add(r["Unit ID"])
        cross_gkeys = sum(1 for v in gkey_to_units.values() if len(v) > 1)
        print(f"  Gkeys shared across different Unit IDs      : {cross_gkeys}  (should be 0)")

        # IN_YARD rows must have null Outbound Service
        in_yard_with_outbound = sum(
            1 for r in container_rows
            if r.get("Visit State") == "IN_YARD" and r.get("Outbound Service") is not None
        )
        print(f"  IN_YARD rows with non-null Outbound Service : {in_yard_with_outbound}  (should be 0)")

        # Per-block active container count verification
        block_counts: Dict[str, int] = collections.defaultdict(int)
        for r in container_rows:
            if r["Unit ID"] in active_set_check and r["Visit State"] == "IN_YARD":
                pos = r["Current Position"]   # e.g. Y-AECY-1M02305C3
                m = re.match(r"Y-AECY-([A-Z0-9]+?)\d{3}", pos)
                if m:
                    block_counts[m.group(1)] += 1
        expected_blocks = [("1M", 200), ("1L", 200), ("1K", 200),
                           ("1J", 300), ("1H", 100), ("1G",  50)]
        print(f"  Per-block active container counts:")
        for blk, exp in expected_blocks:
            got = block_counts.get(blk, 0)
            ok  = "OK" if got == exp else f"MISMATCH (expected {exp})"
            print(f"    Block {blk}: {got:3d}  {ok}")

        # Historical row count (Phase 1 only)
        hist_rows = len(container_rows) - len(active_unit_ids) * 2
        print(f"  Historical rows (Phase 1)                   : {hist_rows:,}")
        print(f"  Active rows     (Phase 2, 2× each)          : {len(active_unit_ids) * 2:,}")

    print("\n================================================")
    print("GENERATION COMPLETED")
    print(f"Total Container rows    : {total_c:,}")
    print(f"Total Crane rows        : {total_cr:,}")
    print(f"Total Active unit IDs   : {total_a:,}")
    print("================================================")


if __name__ == "__main__":
    main()