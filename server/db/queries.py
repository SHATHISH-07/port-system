import pandas as pd
from sqlalchemy import text, inspect
from db.connection import get_engine
from utils.datetime_utils import parse_datetime
from fastapi import HTTPException

REQUIRED_COLS = [
    "Move Complete Time",
    "Time In",
    "Time Out",
    "Outbound Service",
]

import csv
import uuid
import datetime
from io import StringIO
import pandas as pd
from sqlalchemy import inspect
from db.connection import get_engine
from utils.datetime_utils import parse_datetime
from fastapi import HTTPException

REQUIRED_COLS = [
    "Move Complete Time",
    "Time In",
    "Time Out",
    "Outbound Service",
    "Actual Outbound Carrier visit ID"
]

def psql_insert_copy(table, conn, keys, data_iter):
    """
    Execute SQL statement inserting data using PostgreSQL COPY
    """
    dbapi_conn = conn.connection
    with dbapi_conn.cursor() as cur:
        s_buf = StringIO()
        writer = csv.writer(s_buf)
        writer.writerows(data_iter)
        s_buf.seek(0)

        columns = ', '.join(f'"{k}"' for k in keys)
        table_name = f'"{table.name}"'
        if getattr(table, "schema", None):
            table_name = f'"{table.schema}".{table_name}'

        sql = f'COPY {table_name} ({columns}) FROM STDIN WITH CSV'
        cur.copy_expert(sql=sql, file=s_buf)

_df_cache = {}
_api_cache = {}

def bulk_insert_df(df: pd.DataFrame, dataset_type: str):
    """
    Normalize the dataset into vessels, visits, and containers.
    Add UUID and Timestamp tracking columns to all tables.
    Auto-creates the database if it does not exist.
    """
    # Always ensure the database exists before attempting any write.
    # This recovers from scenarios where the DB was dropped while the server is running.
    from db.connection import _ensure_database_exists, engine as _engine
    _ensure_database_exists()

    # After creating the DB, the existing engine pool may have stale/failed connections.
    # Invalidate the pool so fresh connections are made to the now-existing database.
    _engine.dispose()
    engine = get_engine()

    df.columns = df.columns.str.strip()
    missing = [c for c in REQUIRED_COLS if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns: {missing}")

    for col in ["Move Complete Time", "Time In", "Time Out"]:
        if col in df.columns:
            df[col] = parse_datetime(df[col])

    now = datetime.datetime.now()

    # 1. Vessels
    vessels_df = df[['Outbound Service']].drop_duplicates().reset_index(drop=True)
    vessels_df['id'] = [str(uuid.uuid4()) for _ in range(len(vessels_df))]
    vessels_df['created_at'] = now
    vessels_df['updated_at'] = now
    vessels_df['deleted_at'] = pd.NaT

    # 2. Visits
    visits_df = df[['Actual Outbound Carrier visit ID', 'Outbound Service']].drop_duplicates().reset_index(drop=True)
    visits_df = visits_df.merge(vessels_df[['Outbound Service', 'id']], on='Outbound Service', how='left').rename(columns={'id': 'vessel_id'})
    visits_df['id'] = [str(uuid.uuid4()) for _ in range(len(visits_df))]
    visits_df['created_at'] = now
    visits_df['updated_at'] = now
    visits_df['deleted_at'] = pd.NaT

    # 3. Containers (all original columns preserved + visit_id FK)
    containers_df = df.merge(visits_df[['Actual Outbound Carrier visit ID', 'id']], on='Actual Outbound Carrier visit ID', how='left').rename(columns={'id': 'visit_id'})
    containers_df['id'] = [str(uuid.uuid4()) for _ in range(len(containers_df))]
    containers_df['created_at'] = now
    containers_df['updated_at'] = now
    containers_df['deleted_at'] = pd.NaT

    # Drop relational columns from containers (stored in visits/vessels tables)
    containers_df = containers_df.drop(columns=['Outbound Service', 'Actual Outbound Carrier visit ID'])

    from sqlalchemy import text
    with engine.begin() as conn:
        vessels_df.to_sql(f"{dataset_type}_vessels", conn, if_exists="replace", index=False, method=psql_insert_copy)
        visits_df.to_sql(f"{dataset_type}_visits", conn, if_exists="replace", index=False, method=psql_insert_copy)
        containers_df.to_sql(f"{dataset_type}_containers", conn, if_exists="replace", index=False, method=psql_insert_copy)

        # Create indexes to drastically speed up JOIN queries
        conn.execute(text(f'CREATE INDEX IF NOT EXISTS idx_{dataset_type}_visits_vessel_id ON "{dataset_type}_visits" (vessel_id)'))
        conn.execute(text(f'CREATE INDEX IF NOT EXISTS idx_{dataset_type}_containers_visit_id ON "{dataset_type}_containers" (visit_id)'))
        conn.execute(text(f'CREATE INDEX IF NOT EXISTS idx_{dataset_type}_vessels_service ON "{dataset_type}_vessels" ("Outbound Service")'))

    # Clear entire cache when new data is uploaded
    _df_cache.clear()
    _api_cache.clear()

    return len(df)


def load_df_from_db(dataset_type: str, vessel_id: str = None) -> pd.DataFrame:
    """
    Reconstruct the flat dataset from the normalized tables via SQL JOIN.
    If vessel_id is provided, filters at the SQL level for lightning-fast lookups.
    """
    cache_key = f"{dataset_type}_{vessel_id}" if vessel_id else dataset_type
    
    if cache_key in _df_cache:
        return _df_cache[cache_key].copy()

    engine = get_engine()
    from sqlalchemy import inspect
    inspector = inspect(engine)
    if not inspector.has_table(f"{dataset_type}_containers"):
        raise HTTPException(
            status_code=400,
            detail=f"No dataset found for '{dataset_type}'. "
                   f"Please upload data first via POST /upload/{dataset_type}."
        )

    # Reconstruct flat dataframe using a highly optimized SQL JOIN
    query = f"""
        SELECT 
            c.*,
            v."Actual Outbound Carrier visit ID",
            ve."Outbound Service"
        FROM "{dataset_type}_containers" c
        JOIN "{dataset_type}_visits" v ON c.visit_id = v.id
        JOIN "{dataset_type}_vessels" ve ON v.vessel_id = ve.id
    """
    params = {}
    if vessel_id:
        query += '\n        WHERE ve."Outbound Service" = %(vessel_id)s'
        params["vessel_id"] = vessel_id

    with engine.connect() as conn:
        import pandas as pd
        df = pd.read_sql_query(query, conn, params=params)

    # Parse datetime columns back
    for col in ["Move Complete Time", "Time In", "Time Out"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")

    _df_cache[cache_key] = df

    return df.copy()
