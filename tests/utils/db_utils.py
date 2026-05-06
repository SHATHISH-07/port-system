import os
import datetime
from sqlalchemy import text

def clean_database(engine):
    """Truncate tables to ensure clean state."""
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE history_containers, history_visits, history_vessels CASCADE;"))
        conn.execute(text("TRUNCATE TABLE current_containers, current_visits, current_vessels CASCADE;"))
        conn.execute(text("TRUNCATE TABLE training_metadata CASCADE;"))
        conn.execute(text("TRUNCATE TABLE audit_logs CASCADE;"))
        # DO NOT truncate users table as we need admin for auth tests

def create_dummy_csv(filepath, num_records=10):
    """Generates a dummy CSV for ingestion testing."""
    import pandas as pd
    from faker import Faker
    import uuid

    fake = Faker()
    data = []
    
    for i in range(num_records):
        move_complete = fake.date_time_between(start_date='-10d', end_date='now')
        time_in = move_complete - datetime.timedelta(hours=48)
        
        data.append({
            "unit_id": f"CONT_{i:04d}",
            "actual_outbound_carrier_visit_id": f"VISIT_{fake.random_int(1000, 9999)}",
            "outbound_service": f"SERVICE_{fake.random_int(100, 999)}",
            "move_complete_time": move_complete.strftime("%m/%d/%Y %H:%M"),
            "time_in": time_in.strftime("%m/%d/%Y %H:%M"),
            "time_out": move_complete.strftime("%m/%d/%Y %H:%M"),
            "unit_weight_in_kg": fake.random_int(min=5000, max=30000),
            "reefer": False,
            "hazardous_flag": False,
            "oog_unit": False,
            "port_of_discharge": "USLAX"
        })
        
    df = pd.DataFrame(data)
    df.to_csv(filepath, index=False)
    return filepath
