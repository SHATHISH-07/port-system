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
from io import StringIO

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

def bulk_insert_df(df: pd.DataFrame, dataset_type: str):
    """
    Store the entire dataset into the database using a table named after dataset_type.
    We let Pandas infer and create the schema so all columns are preserved.
    """
    engine = get_engine()

    # Validate required columns
    df.columns = df.columns.str.strip()
    missing = [c for c in REQUIRED_COLS if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns: {missing}")

    # Parse datetimes so they enter the DB cleanly
    for col in ["Move Complete Time", "Time In", "Time Out"]:
        if col in df.columns:
            df[col] = parse_datetime(df[col])

    table_name = f"{dataset_type}_data"
    
    # Store the entire DataFrame (replacing existing data)
    with engine.begin() as conn:
        df.to_sql(
            table_name,
            conn,
            if_exists="replace",
            index=False,
            method=psql_insert_copy
        )

    # Invalidate cache
    if dataset_type in _df_cache:
        del _df_cache[dataset_type]

    return len(df)


def load_df_from_db(dataset_type: str) -> pd.DataFrame:
    """
    Load the entire dataset from the given table. Uses in-memory caching to prevent slow repeated DB reads.
    """
    if dataset_type in _df_cache:
        return _df_cache[dataset_type].copy()

    engine = get_engine()
    table_name = f"{dataset_type}_data"

    # Check if table exists
    inspector = inspect(engine)
    if not inspector.has_table(table_name):
        raise HTTPException(
            status_code=400,
            detail=f"No dataset found for '{dataset_type}'. "
                   f"Please upload data first via POST /upload/{dataset_type}."
        )

    with engine.connect() as conn:
        df = pd.read_sql_table(table_name, conn)

    # Parse datetime columns back
    for col in ["Move Complete Time", "Time In", "Time Out"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")

    # Save to cache
    _df_cache[dataset_type] = df

    return df.copy()
