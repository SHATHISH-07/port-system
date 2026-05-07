"""
Tests for the Dynamic Schema Mapping Engine.

Validates fuzzy matching, dataset type detection,
alias resolution, and apply_mappings behavior.
"""
import sys
import os
import pytest
import pandas as pd

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../server")))

from services.schema_mapper import (
    detect_dataset_type,
    suggest_mappings,
    apply_mappings,
)


# ---------------------------------------------------------------------------
# Dataset type detection tests
# ---------------------------------------------------------------------------

class TestDatasetTypeDetection:

    def test_detects_container_inventory(self):
        cols = [
            "actual_outbound_carrier_visit_id", "outbound_service",
            "unit_id", "move_complete_time", "ctr_from_position", "ctr_to_position",
        ]
        result = detect_dataset_type(cols)
        assert result["dataset_type"] == "container_inventory"
        assert result["confidence"] >= 80

    def test_detects_crane_moves(self):
        cols = ["crane_che", "move_kind", "unit_nbr", "carrier_visit", "time_completed"]
        result = detect_dataset_type(cols)
        assert result["dataset_type"] == "crane_moves"
        assert result["confidence"] >= 80

    def test_unknown_dataset(self):
        cols = ["foo", "bar", "baz", "qux"]
        result = detect_dataset_type(cols)
        assert result["dataset_type"] == "unknown"

    def test_force_dataset_type_via_source_profile(self):
        cols = ["unit_id", "random_col"]
        sp = {"detection_rules": {"force_dataset_type": "crane_moves"}}
        result = detect_dataset_type(cols, source_profile=sp)
        assert result["dataset_type"] == "crane_moves"
        assert result["confidence"] == 100.0

    def test_scores_returned_for_all_types(self):
        cols = ["unit_id", "outbound_service"]
        result = detect_dataset_type(cols)
        assert "scores" in result
        assert "container_inventory" in result["scores"]
        assert "crane_moves" in result["scores"]


# ---------------------------------------------------------------------------
# Field mapping suggestion tests
# ---------------------------------------------------------------------------

class TestSuggestMappings:

    def test_exact_canonical_match(self):
        cols = ["outbound_service", "unit_id", "move_complete_time"]
        suggestions = suggest_mappings(cols, "container_inventory")
        by_raw = {s["raw_field"]: s for s in suggestions}
        assert by_raw["outbound_service"]["canonical_field"] == "outbound_service"
        assert by_raw["outbound_service"]["confidence"] == 100.0
        assert by_raw["outbound_service"]["match_method"] == "canonical_exact"

    def test_fuzzy_match_nonstandard_name(self):
        # "Unit Nbr" should fuzzy-match to canonical_unit_id
        cols = ["Unit Nbr"]
        suggestions = suggest_mappings(cols, "container_inventory")
        assert len(suggestions) == 1
        assert suggestions[0]["canonical_field"] is not None
        assert suggestions[0]["confidence"] > 0

    def test_alias_map_takes_priority(self):
        cols = ["Ctr Weight"]
        source_profile = {"alias_map": {"Ctr Weight": "unit_weight_in_kg"}}
        suggestions = suggest_mappings(cols, "container_inventory", source_profile)
        assert suggestions[0]["canonical_field"] == "unit_weight_in_kg"
        assert suggestions[0]["confidence"] == 100.0
        assert suggestions[0]["match_method"] == "alias_exact"

    def test_unmapped_field_flagged(self):
        cols = ["completely_unknown_col_xyz"]
        suggestions = suggest_mappings(cols, "container_inventory")
        assert suggestions[0]["is_unmapped"] is True
        assert suggestions[0]["canonical_field"] is None

    def test_crane_fields_resolved(self):
        cols = ["Crane CHE", "Move Kind", "Unit Nbr", "Carrier Visit", "Time Completed"]
        suggestions = suggest_mappings(cols, "crane_moves")
        mapped = [s for s in suggestions if not s["is_unmapped"]]
        assert len(mapped) >= 3

    def test_time_completed_aliases(self):
        for col_name in ["time_completed", "completion_time", "move_completed_at"]:
            sug = suggest_mappings([col_name], "container_inventory")
            assert sug[0]["canonical_field"] is not None, f"Failed for: {col_name}"

    def test_multiple_columns_returns_one_per_column(self):
        cols = ["unit_id", "outbound_service", "reefer", "hazardous_flag"]
        suggestions = suggest_mappings(cols, "container_inventory")
        assert len(suggestions) == len(cols)


# ---------------------------------------------------------------------------
# Apply mappings tests
# ---------------------------------------------------------------------------

class TestApplyMappings:

    def test_renames_columns(self):
        df = pd.DataFrame([{"Unit Nbr": "ABCD123", "Crane CHE": "CR01"}])
        confirmed = [
            {"raw_field": "Unit Nbr",  "canonical_field": "canonical_unit_id", "is_unmapped": False},
            {"raw_field": "Crane CHE", "canonical_field": "canonical_crane_id", "is_unmapped": False},
        ]
        result_df, dyn = apply_mappings(df, confirmed)
        assert "canonical_unit_id"  in result_df.columns
        assert "canonical_crane_id" in result_df.columns
        assert "Unit Nbr"  not in result_df.columns

    def test_unmapped_columns_captured_in_dynamic_attrs(self):
        df = pd.DataFrame([{"unit_id": "X1", "mystery_col": "value_A"}])
        confirmed = [
            {"raw_field": "unit_id",     "canonical_field": "canonical_unit_id", "is_unmapped": False},
            {"raw_field": "mystery_col", "canonical_field": None,               "is_unmapped": True},
        ]
        result_df, dyn = apply_mappings(df, confirmed)
        assert "mystery_col" not in result_df.columns
        assert dyn is not None
        assert "mystery_col" in dyn.iloc[0]
        assert dyn.iloc[0]["mystery_col"] == "value_A"

    def test_empty_dataframe_handled(self):
        df = pd.DataFrame(columns=["unit_id"])
        confirmed = [{"raw_field": "unit_id", "canonical_field": "canonical_unit_id", "is_unmapped": False}]
        result_df, dyn = apply_mappings(df, confirmed)
        assert result_df.empty
        assert "canonical_unit_id" in result_df.columns
