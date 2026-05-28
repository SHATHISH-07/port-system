import sys
sys.path.append('d:/port-system/server')
from db.connection import get_engine
import pandas as pd
engine = get_engine()
with engine.connect() as conn:
    df = pd.read_sql("SELECT current_position FROM peb_container_operations WHERE outbound_service = 'VS-PEB-07' LIMIT 10", conn)
    print(df)
