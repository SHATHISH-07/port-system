from db.connection import get_engine
from sqlalchemy import text
import pandas as pd
from utils.stay_utils import prepare_visit_data, compute_visit_stay
from utils.feature_utils import create_features
from models.stay_model import predict_visit_stay_duration, load_stay_model
from services.vessel_service import _enrich_history_group
import json

def debug_prediction(service_id):
    engine = get_engine()
    # Fetch all records for this service
    with engine.connect() as conn:
        res = conn.execute(text("SELECT relname FROM pg_class WHERE relkind IN ('p','r') AND relname LIKE '%_history_containers' AND oid NOT IN (SELECT inhrelid FROM pg_inherits)")).fetchall()
        tables = [r[0] for r in res]
    
    dfs = []
    for tbl in tables:
        with engine.connect() as conn:
            df_tbl = pd.read_sql_query(text(f"SELECT * FROM {tbl} WHERE outbound_service = :svc OR actual_outbound_carrier_visit_id = :svc"), conn, params={"svc": service_id})
            if not df_tbl.empty:
                dfs.append(df_tbl)
    
    if not dfs:
        print(f"No data for {service_id}")
        return
    
    df = pd.concat(dfs, ignore_index=True)
    
    # Group by visit
    grouped = df.groupby('actual_outbound_carrier_visit_id')
    
    bundle = load_stay_model()
    if bundle is None:
        print("Model not loaded")
        return
    model = bundle['model']
    feature_names = bundle['features']
    
    print(f"\n--- Prediction Debug for {service_id} ---")
    
    for vid, group in grouped:
        # Enrich
        enriched = _enrich_history_group(group.copy(), str(vid))
        prep = prepare_visit_data(enriched)
        stay = compute_visit_stay(prep)
        features = create_features(prep)
        
        X = pd.DataFrame([[features[f] for f in feature_names]], columns=feature_names)
        pred = model.predict(X)[0]
        
        print(f"\nVisit: {vid}")
        print(f"  Actual Stay: {stay}h")
        print(f"  Predicted Stay: {pred:.2f}h")
        print(f"  Features of Interest:")
        for f in ['total_moves', 'crane_count', 'crane_mphc', 'crane_intensity']:
            print(f"    {f}: {features.get(f)}")

debug_prediction('AA110')
