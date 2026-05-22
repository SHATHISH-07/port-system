from db.connection import get_engine
import pandas as pd
from sqlalchemy import text
with get_engine().connect() as conn:
    df = pd.read_sql_query(text("SELECT * FROM peb_crane_operations WHERE carrier_visit = '8YF180002' LIMIT 5"), conn)
    print(df.columns)
    print(df[['crane_id', 'time_completed']].head())
