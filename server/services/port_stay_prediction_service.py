import logging
import math
import pandas as pd
from sqlalchemy import text
from db.queries import get_engine
from services.crane_analytics_service import _fetch_crane_counts_batch

logger = logging.getLogger('port_system.services')

def predict_port_stay(vessel_id: str, load_moves: int) -> dict:
    """
    Predicts port stay hours based on historical average crane assignment and productivity.
    """
    avg_crane_mph = 25.0
    dynamic_crane_capacity = 60.0
    avg_stay = 12.0

    try:
        query = text("""
            SELECT 
                visit_id as actual_outbound_carrier_visit_id,
                MIN(move_complete_time) as first_move,
                MAX(move_complete_time) as last_move,
                COUNT(unit_id) as total_moves
            FROM containers 
            WHERE UPPER(TRIM(outbound_service)) = :svc
              AND visit_id IS NOT NULL
              AND move_complete_time IS NOT NULL
            GROUP BY visit_id
        """)
        engine = get_engine()
        hist_df = pd.read_sql(query, engine, params={"svc": vessel_id.strip().upper()})
        
        if not hist_df.empty:
            hist_df["first_move"] = pd.to_datetime(hist_df["first_move"])
            hist_df["last_move"] = pd.to_datetime(hist_df["last_move"])
            hist_df["stay_hours"] = (hist_df["last_move"] - hist_df["first_move"]).dt.total_seconds() / 3600.0
            
            valid_stays = hist_df[hist_df["stay_hours"] > 0].copy()
            if not valid_stays.empty:
                valid_stays["mph"] = valid_stays["total_moves"] / valid_stays["stay_hours"]
                avg_stay = valid_stays["stay_hours"].mean()
                
                visit_ids = valid_stays["actual_outbound_carrier_visit_id"].tolist()
                crane_counts = _fetch_crane_counts_batch(visit_ids)
                
                mph_list = []
                for _, row in valid_stays.iterrows():
                    v_id = row["actual_outbound_carrier_visit_id"]
                    cc = crane_counts.get(v_id, 0)
                    if cc > 0:
                        mph_list.append(row["mph"] / cc)
                        
                if mph_list:
                    avg_crane_mph = sum(mph_list) / len(mph_list)
                
                dynamic_crane_capacity = max(10.0, avg_stay * avg_crane_mph)
                
    except Exception as e:
        logging.getLogger("port_system").error(f"Error predicting port stay: {e}")

    # Calculate prediction
   
    recommended_cranes = min(5, max(1, math.ceil(load_moves / dynamic_crane_capacity)))
    predicted_port_stay_hours = round(load_moves / (recommended_cranes * avg_crane_mph), 1) if (recommended_cranes * avg_crane_mph) > 0 else 0.0

    return {
        "vessel_id": vessel_id,
        "total_moves": load_moves,
        "historical_avg_cranes": recommended_cranes, # Proxy based on total load moves
        "historical_avg_mph": round(avg_crane_mph, 1),
        "recommended_cranes": recommended_cranes,
        "predicted_port_stay_hours": predicted_port_stay_hours
    }
