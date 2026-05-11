from db.queries import load_from_db
from services.vessel_service import analyze_vessel_dashboard

print("=" * 60)
print("FIX 1: FF161 - CWIT vessel by outbound_service")
print("=" * 60)
df = load_from_db("history")
r = analyze_vessel_dashboard(df, "FF161")
if "error" in r:
    print("ERROR:", r["error"])
else:
    print("OK - visits:", len(r.get("actual", {}).get("visits", {})))
    print("OK - crane_assignment rows:", len(r.get("crane_assignment", [])))

print()
print("=" * 60)
print("FIX 3: Stay time changes with load/discharge override")
print("=" * 60)
df_curr = load_from_db("current")
if not df_curr.empty:
    v = df_curr["outbound_service"].dropna().iloc[0]
    print(f"Vessel: {v}")

    r_base = analyze_vessel_dashboard(df_curr, v)
    pred_base = r_base.get("predicted", {})
    actual_base = r_base.get("actual", {})
    print(f"Without overrides: actual_avg={actual_base.get('avg_hours')}h  predicted_avg={pred_base.get('avg_hours')}h")

    r_override = analyze_vessel_dashboard(df_curr, v, loaded_override=300, discharged_override=50)
    pred_ov = r_override.get("predicted", {})
    actual_ov = r_override.get("actual", {})
    strat_ov = r_override.get("operational_predictions", {}).get("strategy_label")
    print(f"With 300L/50D:     actual_avg={actual_ov.get('avg_hours')}h  predicted_avg={pred_ov.get('avg_hours')}h  strategy={strat_ov}")

    r_ov2 = analyze_vessel_dashboard(df_curr, v, loaded_override=50, discharged_override=500)
    pred_ov2 = r_ov2.get("predicted", {})
    actual_ov2 = r_ov2.get("actual", {})
    strat_ov2 = r_ov2.get("operational_predictions", {}).get("strategy_label")
    print(f"With 50L/500D:     actual_avg={actual_ov2.get('avg_hours')}h  predicted_avg={pred_ov2.get('avg_hours')}h  strategy={strat_ov2}")
else:
    print("No current data in DB")

print()
print("=" * 60)
print("FIX 2 CHECK: FF161 also searchable by visit ID")
print("=" * 60)
# Grab a CWIT visit ID that was used to find FF161
if "error" not in r and r.get("actual", {}).get("visits"):
    vid = next(iter(r["actual"]["visits"]))
    print(f"Testing lookup by visit_id: {vid}")
    r2 = analyze_vessel_dashboard(df, vid)
    print("OK" if "error" not in r2 else "ERROR: " + r2["error"])
