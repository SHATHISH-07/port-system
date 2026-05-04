import csv
import uuid
import datetime
from io import StringIO
import pandas as pd
from sqlalchemy import text, inspect
from db.connection import get_engine, _ensure_database_exists, engine as _engine
from db.schema import init_dataset_schema
from fastapi import HTTPException
from config import settings

# Helper function for psql COPY
def psql_insert_copy(table, conn, keys, data_iter):
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




# Insert Data
def bulk_insert_df(df: pd.DataFrame, dataset_type: str):
    # Ensure Database & Engine
    _ensure_database_exists()
    _engine.dispose()
    engine = get_engine()

    # Initialize Schema
    init_dataset_schema(engine, dataset_type)

    # Get current time
    now = datetime.datetime.now()

    # Prepare DataFrames with audit columns
    vessels_df = df[['outbound_service']].drop_duplicates().reset_index(drop=True)
    vessels_df['created_at'] = now
    vessels_df['updated_at'] = now
    vessels_df['deleted_at'] = None

    visits_df = df[['actual_outbound_carrier_visit_id', 'outbound_service']].drop_duplicates().reset_index(drop=True)
    visits_df['created_at'] = now
    visits_df['updated_at'] = now
    visits_df['deleted_at'] = None

    containers_df = df.copy()
    containers_df['id'] = [str(uuid.uuid4()) for _ in range(len(containers_df))]
    containers_df['created_at'] = now
    containers_df['updated_at'] = now
    containers_df['deleted_at'] = None

    # Define expected column order
    expected_columns = settings.DB_EXPECTED_COLUMNS
    valid_cols = [col for col in expected_columns if col in containers_df.columns]
    containers_df = containers_df[valid_cols]

    # Insert Data into Tables
    with engine.begin() as conn:
        if dataset_type == "current":
            conn.execute(text(f'TRUNCATE TABLE "{dataset_type}_vessels" CASCADE;'))
            
            vessels_df.to_sql(f"{dataset_type}_vessels", conn, if_exists="append", index=False, method=psql_insert_copy)
            visits_df.to_sql(f"{dataset_type}_visits", conn, if_exists="append", index=False, method=psql_insert_copy)
            containers_df.to_sql(f"{dataset_type}_containers", conn, if_exists="append", index=False, method=psql_insert_copy)

        else:
            vessels_df.to_sql("tmp_vessels", conn, if_exists="replace", index=False, method=psql_insert_copy)
            visits_df.to_sql("tmp_visits", conn, if_exists="replace", index=False, method=psql_insert_copy)

            # Upsert Vessels
            conn.execute(text(settings.UPSERT_VESSELS_QUERY.format(dataset_type=dataset_type)))

            # Upsert Visits
            conn.execute(text(settings.UPSERT_VISITS_QUERY.format(dataset_type=dataset_type)))

            # Insert Containers
            containers_df.to_sql(f"{dataset_type}_containers", conn, if_exists="append", index=False, method=psql_insert_copy)

            # Cleanup
            conn.execute(text("DROP TABLE tmp_vessels;"))
            conn.execute(text("DROP TABLE tmp_visits;"))



    return len(df)

# Load Data from Database
def load_df_from_db(dataset_type: str, vessel_id: str = None) -> pd.DataFrame:
    # No cache, always fetch from DB

    # Get Engine
    engine = get_engine()

    # Check if table exists
    inspector = inspect(engine)
    if not inspector.has_table(f"{dataset_type}_containers"):
        raise HTTPException(
            status_code=400,
            detail=f"No dataset found for '{dataset_type}'. Please upload data first."
        )

    # Query
    query = settings.LOAD_CONTAINERS_QUERY.format(dataset_type=dataset_type)

    # Query Parameters
    params = {}
    if vessel_id:
        query += '\n          AND v.outbound_service = %(vessel_id)s'
        params["vessel_id"] = vessel_id

    # Read Data from Database
    with engine.connect() as conn:
        df = pd.read_sql_query(query, conn, params=params)

    # Convert Columns to Datetime
    for col in ["move_complete_time", "time_in", "time_out", "created_at", "updated_at", "deleted_at"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")



    return df.copy()