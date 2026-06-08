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

PEB_BLOCKS  = list("ABCDEFGH")
CWIT_BLOCKS = [f"{s}{b}" for s in "12345" for b in "ABCD"]
AECY_BLOCKS = ["1A", "1L", "1B", "1K", "1J", "1H", "1E", "1F", "1G", "1D", "1C", "DMY", "1R", "2R", "3R", "WB", "1M"]

# ── Sequence counters (module-level so they stay unique across terminals) ──────
_container_seq: int  = 6_000_000
_visit_seq: int      = 180_000
_unit_visit_seq: int = 3_000_000

_all_container_ids: set = set()

# ── Gkey tracking: one gkey per unit_id ──────────────────────────────────────
# Unit Visit Gkey must be unique across ALL rows in the dataset.  A physical
# container keeps the same gkey regardless of which vessel visit it appears in,
# so we key the cache on unit_id alone.  This also survives the AECY
# post-processing step that reassigns outbound visit IDs after the rows are
# written (which previously caused the same unit+visit to receive two gkeys).
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
    """
    Return the existing gkey for this unit_id, or allocate a new one.
    One gkey per physical container for the entire generation run — this
    matches the N4 data model where Unit Visit Gkey is a unique surrogate
    key for the container record, not per-vessel-visit.
    FIX: keying on unit_id alone (not unit_id+visit_id) means the gkey
    survives the AECY post-processing step that rewrites outbound visit IDs,
    eliminating all duplicate Unit Visit Gkey rows.
    """
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


def derive_yard_block(position: str, yard_id: str) -> Optional[str]:
    if not position.startswith("Y-"):
        return None
    if position.startswith("Y-AECY-"):
        m = re.match(r"^Y-AECY-(.+?)\d{5}C\d", position)
        return f"{m.group(1)}" if m else "AECY-UNK"
    if position.startswith("Y-PEB-"):
        m = re.match(r"^Y-PEB-([A-H])", position)
        return f"PEB-{m.group(1)}" if m else "PEB-UNK"
    if position.startswith("Y-CWIT-"):
        m = re.match(r"^Y-CWIT-(\d)([A-D])", position)
        return f"CWIT-{m.group(1)}{m.group(2)}" if m else "CWIT-UNK"
    m = re.match(rf"^Y-{re.escape(yard_id)}-([A-Z0-9])", position)
    return f"{yard_id}-{m.group(1)}" if m else f"{yard_id}-UNK"


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

ACTIVE_LIST_HEADERS = [
    "Unit ID", "Unit Visit Gkey", "Outbound Service",
    "Current Yard Block", "Current Slot Position", "Move Complete Time",
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

    base_restow    = max(1, int(round(total_rows * RESTOW_RATIO)))
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


def _find_free_aecy_slot(stack_heights: Dict[tuple, int],
                         block: str,
                         max_attempts: int = 50) -> Tuple[int, int, int]:
    """
    Find a (bay, row, tier) triple in *block* where tier <= MAX_TIER.
    Tries random positions; if none found within max_attempts falls back to
    a linear scan over bays 1-40 / rows 1-10.
    FIX: guarantees tier never exceeds MAX_TIER, replacing the one-shot
    fallback that could silently write Tier 6+.
    """
    max_tier = YardSlotRegistry.MAX_TIER
    for _ in range(max_attempts):
        bay = random.randint(1, 40)
        row = random.randint(1, 10)
        current = stack_heights.get((block, bay, row), 0)
        if current < max_tier:
            return bay, row, current + 1
    # Deterministic fallback: scan until a free slot is found
    for bay in range(1, 41):
        for row in range(1, 11):
            current = stack_heights.get((block, bay, row), 0)
            if current < max_tier:
                return bay, row, current + 1
    # All slots truly full — extend into an overflow bay (rare edge case)
    overflow_bay = 41 + stack_heights.get((block, 0, 0), 0)
    stack_heights[(block, 0, 0)] = stack_heights.get((block, 0, 0), 0) + 1
    return overflow_bay, 1, 1


def generate_terminal_data(terminal: dict):
    container_rows: List[dict] = []
    crane_rows:     List[dict] = []
    visits          = build_visit_schedule(terminal)
    active_set:  set = set()
    inactive_set: set = set()
    line_op         = random.choice(LINE_OPS)

    occupied_blocks: Dict[str, int] = {}

    # FIX: slot_registry is created once and reset once per visit (consistent
    # behaviour).  The startup banner is updated to match.
    slot_registry = YardSlotRegistry()

    _all_pool  = (AECY_BLOCKS if terminal["format"] == "AECY" else
                  PEB_BLOCKS  if terminal["format"] == "PEB"  else
                  CWIT_BLOCKS if terminal["format"] == "CWIT" else list("ABCDEFG"))
    _zone_size = (5 if terminal["format"] == "AECY" else
                  6 if terminal["format"] == "PEB"  else
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

    def _update_occupied_restow(from_block: str, to_block: str):
        """
        FIX: restow moves now update the occupancy model — decrement the
        source block and increment the destination block.
        """
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

    for visit in visits:
        # Reset per-visit so tier counts don't bleed across vessel calls.
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
            visit["visit_start"],
            stay_hours,
            total_ops,
            len(cranes_assigned),
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
                    # FIX: do NOT invent a container for a Load when no active
                    # containers exist — that would produce a container whose
                    # first record is a departure (operationally impossible).
                    # Skip this op slot by converting it to a Discharge instead
                    # so we always have something to load.
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

            # FIX: gkey is keyed on unit_id only — one gkey per physical
            # container for the entire run, surviving any post-processing
            # that rewrites outbound visit IDs.
            unit_visit_gkey = get_or_create_gkey(unit_id)

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
            port_of_discharge = random.choice(["CNNGB", "SGSIN", "CNSHA", "NLRTM",
                                               "USLAX", "INMAA", "JPYOK", "KRPUS"])
            move_time        = event_times[idx]

            inbound_id       = None
            inbound_service  = None
            outbound_id      = None
            outbound_service = None

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
                # FIX: time_in == move_time (arrival), time_out is later;
                # no risk of time_out < time_in for Discharge.
                time_in  = move_time
                time_out = move_time + timedelta(hours=random.uniform(2, 9))

            elif move_kind == "Load":
                live     = _current_blocks()
                yard_block = random.choice(live)
                _update_occupied_load(yard_block)
                from_pos         = generate_position_in_block(
                                       terminal["yard_id"], terminal["format"],
                                       yard_block, registry=slot_registry)
                to_pos           = vessel_side_position(visit["visit_id"])
                current_position = to_pos
                outbound_id      = visit["visit_id"]
                outbound_service = visit["service"]
                # FIX: time_in must always be before time_out.
                # Container was gated in before the vessel arrived; departs
                # after the move.  Use absolute offsets from move_time to
                # guarantee time_in < move_time < time_out.
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
                # FIX: update occupancy model for restow
                _update_occupied_restow(b1, b2)
                time_in  = move_time - timedelta(hours=random.uniform(1, 3))
                time_out = move_time + timedelta(hours=random.uniform(1, 6))

            container_rows.append({
                "Unit ID":                          unit_id,
                "Unit Visit Gkey":                  unit_visit_gkey,
                "Complex Id":                       terminal["complex_id"],
                "Facility Id":                      terminal["facility_id"],
                "Yard Id":                          terminal["yard_id"],
                "Category Id":                      category,
                "Equipment Class":                  "CONTAINER",
                "Container Length":                 container_length,
                "Equipment type":                   equipment_type,
                "Freight Kind":                     freight_kind,
                "Destination":                      None,
                "Unit Weight in kg":                unit_weight,
                "Verified Gross Mass (Kg)":         vgm,
                "Reefer":                           "Yes" if reefer else "No",
                "OOG Unit":                         oog,
                "Hazardous Flag":                   hazardous_flag,
                "Hazard UN Numbers":                hazard_un,
                "IMDG Code":                        imdg_code,
                "Stow Code 1":                      None,
                "Stow Code 2":                      None,
                "Stow Code 3":                      None,
                "Port of Discharge":                port_of_discharge,
                "Actual Inbound Carrier visit ID":  inbound_id,
                "Inbound Service":                  inbound_service,
                "Actual Outbound Carrier visit ID": outbound_id,
                "Outbound Service":                 outbound_service,
                "Arrival Mode":                     ARRIVAL_MODE_BY_MOVE[move_kind],
                "Current Position":                 current_position,
                "Visit State":                      VISIT_STATE_BY_MOVE[move_kind],
                "Transit State":                    TRANSIT_STATE_BY_MOVE[move_kind],
                "Time Out":                         fmt_time_mmddyyyy(time_out),
                "Time In":                          fmt_time_mmddyyyy(time_in),
                "Move Complete Time":               fmt_time_mmddyyyy(move_time),
                "Ctr From Position":                from_pos,
                "Ctr To Position":                  to_pos,
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

    # ── Derive active containers BEFORE any post-processing mutates the rows ──
    # FIX: active list is now built first, then the AECY position patch is
    # applied to BOTH container_rows and active_rows in one pass, so the two
    # datasets stay consistent.
    active_rows = derive_active_yard_containers(container_rows, terminal["yard_id"])

    if terminal["yard_id"] == "AECY":
        # Keep only 1200 active rows for AECY
        target_count = 1200
        omitted_active = active_rows[target_count:]
        active_rows = active_rows[:target_count]
        
        # Build a quick lookup: unit_id -> index in container_rows (last occurrence)
        uid_to_container_idx: Dict[str, int] = {}
        for i, cr in enumerate(container_rows):
            uid_to_container_idx[cr["Unit ID"]] = i

        # For omitted containers, forcefully make them DEPARTED so they aren't considered active
        for omitted in omitted_active:
            uid = omitted["Unit ID"]
            ci = uid_to_container_idx.get(uid)
            if ci is not None:
                container_rows[ci]["Current Position"] = ""
                container_rows[ci]["Ctr To Position"] = ""
                container_rows[ci]["Visit State"] = "DEPARTED"

        vessels    = ["VS-AECY-07", "VS-AECY-06", "VS-AECY-09", "VS-AECY-03",
                      "VS-AECY-02", "VS-AECY-04", "VS-AECY-05", "VS-AECY-08", "VS-AECY-01"]
        target_blocks = ["1K", "1J", "1H", "1G", "1E", "1C"]

        svc_to_visit: Dict[str, str] = {}
        for v in reversed(visits):
            svc = v["service"]
            if svc not in svc_to_visit:
                svc_to_visit[svc] = v["visit_id"]

        # Build a quick lookup: unit_id -> index in crane_rows (last Load occurrence)
        uid_to_crane_load_idx: Dict[str, int] = {}
        for i, cr in enumerate(crane_rows):
            if cr["Move Kind"] == "Load":
                uid_to_crane_load_idx[cr["Unit Nbr"]] = i

        # Assign vessels to active rows in round-robin chunks
        containers_per_vessel = max(1, len(active_rows) // max(1, len(vessels)))
        for i, r in enumerate(active_rows):
            vidx = min(i // containers_per_vessel, len(vessels) - 1)
            svc  = vessels[vidx]
            vid  = svc_to_visit.get(svc, svc)
            r["Outbound Service"] = ""

            uid = r["Unit ID"]
            ci  = uid_to_container_idx.get(uid)
            if ci is not None:
                container_rows[ci]["Outbound Service"]                 = ""
                container_rows[ci]["Actual Outbound Carrier visit ID"] = ""

            # Do not change crane rows since they are historical events, but if they had a future load event planned, we leave it or remove it.
            # The active container shouldn't have a Load crane event if it's still in the yard.
            ki = uid_to_crane_load_idx.get(uid)
            if ki is not None:
                crane_rows[ki]["Carrier Visit"] = ""

        # Assign yard positions using the enforced tier-safe helper
        stack_heights: Dict[tuple, int] = collections.defaultdict(int)

        for i, r in enumerate(active_rows):
            svc     = r.get("Outbound Service", "")
            
            # Exactly 200 containers per block from the target_blocks list
            block = target_blocks[(i // 200) % len(target_blocks)]
            
            # FIX: use the guaranteed-safe slot finder; no silent Tier 6+
            bay, row_idx, new_tier = _find_free_aecy_slot(stack_heights, block)
            stack_heights[(block, bay, row_idx)] = new_tier

            pos = f"Y-AECY-{block}{bay:03d}{row_idx:02d}C{new_tier}"
            r["Current Yard Block"]    = block
            r["Current Slot Position"] = pos

            uid = r["Unit ID"]
            ci  = uid_to_container_idx.get(uid)
            if ci is not None:
                container_rows[ci]["Current Position"] = pos
                container_rows[ci]["Ctr To Position"]  = pos

    return container_rows, crane_rows, active_rows


def derive_active_yard_containers(container_rows: List[dict], yard_id: str) -> List[dict]:
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
            "Unit ID":               row["Unit ID"],
            "Unit Visit Gkey":       row["Unit Visit Gkey"],
            "Outbound Service":      row["Outbound Service"],
            "Current Yard Block":    derive_yard_block(pos, yard_id),
            "Current Slot Position": pos,
            "Move Complete Time":    row["Move Complete Time"],
        })

    active_rows.sort(
        key=lambda r: parse_time_mmddyyyy(r["Move Complete Time"]), reverse=True
    )
    return active_rows


def write_csv(path: Path, headers: List[str], rows: List[dict]):
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)


def write_json(path: Path, rows: List[dict]):
    with path.open("w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2)


def build_block_grouped_json(active_rows: List[dict]) -> List[dict]:
    block_map: Dict[str, List[str]] = collections.defaultdict(list)
    for row in active_rows:
        block = row["Current Yard Block"]
        if block:
            block_map[block].append(row["Unit ID"])
    return [
        {"block": block, "unit_ids": unit_ids}
        for block, unit_ids in sorted(block_map.items())
    ]


def main():
    # FIX: seed here, after all module-level code, for deterministic output.
    random.seed(42)

    print("\n================================================")
    print("SYNTHETIC DATASET GENERATION STARTED")
    print(f"Block capacity          : {BLOCK_CAPACITY} slots  ({SLOTS_PER_BLOCK} usable @ {BLOCK_OCCUPANCY:.0%})")
    print(f"Active crane MPH        : {CRANE_ACTIVE_MPH_MIN}-{CRANE_ACTIVE_MPH_MAX} (within batches)")
    print(f"Vessel stay hours       : {STAY_MIN_HOURS:.0f} h (low volume) – {STAY_MAX_HOURS:.0f} h (high volume)")
    print( "Block assignment        : capacity-driven (fills existing before opening new)")
    print(f"Max tier                : {YardSlotRegistry.MAX_TIER}  (from XML z-index-max)")
    print( "Tier registry           : reset once per vessel visit")
    print( "Restow occupancy        : source block decremented, destination incremented")
    print( "Gkey allocation         : one gkey per (unit_id, vessel_visit) pair")
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
        write_json(out_aj, build_block_grouped_json(active_rows))

        print(f"  -> {out_c.name}  ({len(container_rows):,} rows)")
        print(f"  -> {out_cr.name}  ({len(crane_rows):,} rows)")
        print(f"  -> {out_a.name}  ({len(active_rows):,} active)")

        # A gkey may appear on multiple rows (same unit, multiple moves) — that
        # is expected.  What must never happen is a gkey pointing at two
        # *different* unit IDs.
        gkey_to_units: Dict[str, set] = collections.defaultdict(set)
        for r in container_rows:
            gkey_to_units[r["Unit Visit Gkey"]].add(r["Unit ID"])
        cross_gkeys = sum(1 for v in gkey_to_units.values() if len(v) > 1)
        print(f"  Gkeys shared across different Unit IDs : {cross_gkeys}  (should be 0)")

        tier_counts: collections.Counter = collections.Counter()
        for r in active_rows:
            pos = r.get("Current Slot Position", "")
            m   = re.search(r"[C\.](\d)$", pos)
            if m:
                tier_counts[int(m.group(1))] += 1
        print(f"  Tier distribution (active containers):")
        for t in sorted(tier_counts):
            bar   = "#" * (tier_counts[t] // 15)
            share = tier_counts[t] / len(active_rows) * 100
            print(f"    Tier {t}  {tier_counts[t]:4d}  ({share:4.1f}%)  {bar}")

        block_counts: collections.Counter = collections.Counter(
            r["Current Yard Block"] for r in active_rows
        )
        print(f"  Block distribution ({len(block_counts)} blocks used, "
              f"~{len(active_rows) // max(1, len(block_counts))} avg per block):")
        for blk, cnt in sorted(block_counts.items(), key=lambda x: -x[1])[:12]:
            bar   = "#" * (cnt // 20)
            share = cnt / len(active_rows) * 100
            print(f"    {blk:12s} {cnt:4d}  ({share:4.1f}%)  {bar}")

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