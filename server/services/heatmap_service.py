import re
from collections import defaultdict
from utils.data_loader import get_data


# -------------------------------------------------
# REGEX
# Example: Y-PEB-G32343C1
# G3 = block | 23 = row | 43 = bay | C1 = tier
# -------------------------------------------------
POSITION_REGEX = re.compile(r'Y-[A-Z0-9]+-(G\d)(\d{2})(\d{2})(C\d)')
BLOCK_REGEX = re.compile(r'Y-[A-Z0-9]+-(G\d)')


def is_yes(val):
    return str(val).strip().upper() == "YES"


# -------------------------------------------------
# GET ALL BLOCKS
# -------------------------------------------------
def get_all_blocks(df):
    blocks = set()

    for pos in df["Ctr From Position"].dropna():
        pos = str(pos)

        if not pos.startswith("Y-"):
            continue

        match = BLOCK_REGEX.search(pos)
        if match:
            blocks.add(match.group(1))

    return sorted(blocks)


# -------------------------------------------------
# BUILD LAYOUT
# -------------------------------------------------
def build_layout(blocks):
    layout = {}

    if not blocks:
        return layout

    cols = int(len(blocks) ** 0.5) + 1

    for i, block in enumerate(blocks):
        x = i % cols
        y = i // cols
        layout[block] = {"x": x, "y": y}

    return layout


# -------------------------------------------------
# MAIN HEATMAP FUNCTION
# -------------------------------------------------
def get_vessel_heatmap(vessel_service: str):

    df = get_data()

    # -----------------------------
    # FILTER VESSEL
    # -----------------------------
    vessel_df = df[
        df["Outbound Service"].astype(str).str.strip() == str(vessel_service)
    ].copy()

    if vessel_df.empty:
        return {"error": f"No data for vessel {vessel_service}"}

    # -----------------------------
    # PICK VISIT WITH MAX CONTAINERS
    # -----------------------------
    visit_counts = vessel_df["Actual Outbound Carrier visit ID"].value_counts()
    top_visit_id = visit_counts.index[0]

    visit_df = vessel_df[
        vessel_df["Actual Outbound Carrier visit ID"] == top_visit_id
    ].copy()

    # -----------------------------
    # FILTER YARD → VESSEL
    # -----------------------------
    visit_df = visit_df[
        visit_df["Ctr From Position"].astype(str).str.startswith("Y-") &
        visit_df["Ctr To Position"].astype(str).str.startswith("V-")
    ]

    if visit_df.empty:
        return {
            "vessel": vessel_service,
            "visit_id": str(top_visit_id),
            "layout": {},
            "blocks": {},
            "summary": {"hazardous": 0, "reefer": 0, "oog": 0},
            "error": "No yard-to-vessel moves"
        }

    # -----------------------------
    # BUILD BLOCK DATA
    # -----------------------------
    blocks = defaultdict(lambda: {
        "count": 0,
        "hazardous": 0,
        "reefer": 0,
        "oog": 0,
        "cells": {}
    })

    for _, row in visit_df.iterrows():

        pos = str(row.get("Ctr From Position", ""))
        unit = str(row.get("Unit ID"))

        match = POSITION_REGEX.search(pos)
        if not match:
            continue

        block = match.group(1)
        row_id = int(match.group(2))
        bay = int(match.group(3))
        tier = match.group(4)

        key = f"{row_id}-{bay}"

        if key not in blocks[block]["cells"]:
            blocks[block]["cells"][key] = {
                "containers": set(),
                "tiers": defaultdict(int)
            }

        # -----------------------------
        # UNIQUE CONTAINER STORAGE
        # -----------------------------
        blocks[block]["cells"][key]["containers"].add(unit)
        blocks[block]["cells"][key]["tiers"][tier] += 1

        # FLAGS
        if is_yes(row.get("Hazardous Flag")):
            blocks[block]["hazardous"] += 1

        if is_yes(row.get("Reefer")):
            blocks[block]["reefer"] += 1

        if is_yes(row.get("OOG Unit")):
            blocks[block]["oog"] += 1

    # -----------------------------
    # FORMAT OUTPUT
    # -----------------------------
    max_count = 1

    for block in blocks:

        total_set = set()
        formatted_cells = []

        for key, val in blocks[block]["cells"].items():
            r, b = key.split("-")

            count = len(val["containers"])
            total_set.update(val["containers"])

            formatted_cells.append({
                "row": int(r),
                "bay": int(b),
                "count": count,
                "tiers": dict(val["tiers"])
            })

        # ✅ BLOCK TOTAL CONTAINER COUNT
        blocks[block]["count"] = len(total_set)

        # ✅ KEEP CELL STRUCTURE
        blocks[block]["cells"] = formatted_cells

        max_count = max(max_count, blocks[block]["count"])

    # -----------------------------
    # SAFETY CHECK
    # -----------------------------
    if not blocks:
        return {
            "vessel": vessel_service,
            "visit_id": str(top_visit_id),
            "layout": {},
            "blocks": {},
            "summary": {"hazardous": 0, "reefer": 0, "oog": 0},
            "error": "No valid container positions found"
        }

    # -----------------------------
    # ADD INTENSITY + CONCENTRATION
    # -----------------------------
    for block in blocks:

        intensity = blocks[block]["count"] / max_count

        # numeric value (useful for frontend scaling)
        blocks[block]["intensity"] = round(intensity, 4)

        # 🔥 concentration level
        if intensity >= 0.7:
            level = "High"
        elif intensity >= 0.4:
            level = "Medium"
        else:
            level = "Low"

        blocks[block]["concentration"] = level

    # -----------------------------
    # LAYOUT
    # -----------------------------
    all_blocks = get_all_blocks(df)
    layout = build_layout(all_blocks)

    # -----------------------------
    # RECOMMENDED BERTH
    # -----------------------------
    max_block = max(blocks.keys(), key=lambda b: blocks[b]["count"])

    # -----------------------------
    # SUMMARY
    # -----------------------------
    total_haz = sum(b["hazardous"] for b in blocks.values())
    total_ref = sum(b["reefer"] for b in blocks.values())
    total_oog = sum(b["oog"] for b in blocks.values())

    # -----------------------------
    # FINAL RESPONSE
    # -----------------------------
    return {
        "vessel": vessel_service,
        "visit_id": str(top_visit_id),

        "recommended_berth": f"PEB-{max_block}",
        "max_block": max_block,

        "summary": {
            "hazardous": total_haz,
            "reefer": total_ref,
            "oog": total_oog
        },

        "layout": layout,
        "blocks": dict(blocks)
    }