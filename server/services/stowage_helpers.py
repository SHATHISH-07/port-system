from auth.utils import logger
import re
import pandas as pd
from typing import Any, List
from utils.position_decoder import parse_vessel_slot
from utils.stowage_rules import classify_deck_position

def _normalize_column_name(name: str) -> str:
    """
    Normalizes a column name by lowercasing, stripping, and replacing special characters.
    """

    name = str(name).strip().lower()
    name = re.sub(r"[^a-z0-9]+", "_", name)
    return re.sub(r"_+", "_", name).strip("_")

def _normalize_dataframe_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Normalizes all column names in a DataFrame.
    """
    if df.empty:
        return df
    df = df.copy()
    df.columns = [_normalize_column_name(c) for c in df.columns]
    return df

def _first_existing_value(row: pd.Series, candidates: List[str]) -> Any:
    """
    Returns the first non-empty value found in the row for a given list of candidate columns.
    """
    for col in candidates:
        if col in row and pd.notna(row.get(col)) and str(row.get(col)).strip() != "":
            return row.get(col)
    return None

def _safe_str(value: Any, default: str = "") -> str:
    """
    Safely converts a value to a string, handling None, NaNs, and explicit null words.
    """
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return default
    text = str(value).strip()
    if text.lower() in {"nan", "none", "null"}:
        return default
    return text

def _dedupe_latest_per_unit(df: pd.DataFrame) -> pd.DataFrame:
    """
    Deduplicates a DataFrame by unit_id, keeping the latest record based on timestamp columns.
    """
    if df.empty or "unit_id" not in df.columns:
        return df
    df["unit_id"] = df["unit_id"].astype(str).str.strip().str.upper()
    sort_cols = []
    ascending = []
    for col in ["move_complete_time", "updated_at", "created_at"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")
            sort_cols.append(col)
            ascending.append(False)
    if sort_cols:
        df = df.sort_values(by=sort_cols, ascending=ascending, na_position="last")
    return df.drop_duplicates(subset=["unit_id"], keep="first").reset_index(drop=True)

def _derive_recommended_tier(weight_band: str, loading_priority: int) -> str:
    """
    Derives the recommended vessel tier based on weight band and loading priority.
    """
    band = str(weight_band).strip().upper()
    if band == "HEAVY":
        return "02"
    if band == "LIGHT":
        return "08" if loading_priority <= 7 else "10"
    return "04" if loading_priority <= 5 else "06"

def _determine_historical_deck(position_text: str, weight_band: str) -> str:
    """
    Determines if a vessel position was ABOVE_DECK or BELOW_DECK, falling back to weight heuristics.
    """
    if position_text:
        v_info = parse_vessel_slot(position_text)
        if v_info and v_info.get("decoded"):
            tier_str = v_info["decoded"].get("tier")
            if tier_str and str(tier_str).isdigit():
                return "ABOVE_DECK" if int(tier_str) >= 80 else "BELOW_DECK"
    return classify_deck_position(weight_band)


def _empty_history_response() -> dict:
    """
    Returns an empty dictionary structure for history analysis when no data is found.
    """
    return {
        "summary": {"totalContainers": 0, "heavyCount": 0, "lightCount": 0, "mediumCount": 0, "aboveDeckCount": 0, "belowDeckCount": 0},
        "freightKindDistribution": [],
        "containerSizeDistribution": [],
        "specialCargoSummary": {
            "reeferCount": 0,
            "hazardousCount": 0,
            "oogCount": 0,
        },
        "dischargePortGrouping": [],
        "weightDistribution": {"aboveDeck": [], "belowDeck": []},
        "equipmentClassDistribution": [],
        "historicalVisits": [],
        "dischargeSequence": [],
        "craneMetrics": {
            "totalMoves": 0, "loadMoves": 0, "dischargeMoves": 0,
            "restowMoves": 0, "reshuffleRate": 0.0,
            "dualCycleCount": 0, "dualCycleRate": 0.0,
            "avgMoveGapMinutes": 0.0, "reshuffleByBlock": []
        },
    }

def _empty_planning_response(vessel_id: str, total_requested: int) -> dict:
    """
    Returns an empty dictionary structure for current planning when no data is found.
    """
    return {
        "vesselId": vessel_id,
        "outboundService": vessel_id,
        "visitId": "UNASSIGNED",
        "terminal": "CWIT",
        "summary": {
            "totalRequested": total_requested,
            "resolvedCount": 0,
            "unresolvedCount": total_requested,
        },
        "recommendations": [],
        "dischargePortGrouping": [],
        "yardBlockSummary": [],
        "dischargePortStrategy": [],
        "reshuffleStats": {"baselineRate": 0.0, "podConcentration": 0.0, "projectedReduction": 0.0},
        "dischargeSequence": [],
        "strategyInsights": [],
        "equipmentClassDistribution": [],
    }


# --- Pre-Consolidation / Housekeeping Engine ---

_WEIGHT_RANK = {"HEAVY": 3, "MEDIUM": 2, "LIGHT": 1}



def _empty_pre_consolidation(vessel_id: str, yard_id) -> dict:
    return {
        "vesselId": vessel_id,
        "yardId": yard_id,
        "summary": {
            "totalContainersAnalyzed": 0,
            "totalStacksAnalyzed": 0,
            "totalMovesRequired": 0,
            "highPriorityMoves": 0,
            "mediumPriorityMoves": 0,
            "lowPriorityMoves": 0,
            "weightInversionsFound": 0,
            "dischargeInversionsFound": 0,
        },
        "moves": [],
        "stackViolations": [],
    }
