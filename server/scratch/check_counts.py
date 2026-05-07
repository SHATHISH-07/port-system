from db.connection import get_engine
from sqlalchemy import text

engine = get_engine()
with engine.connect() as conn:
    for table in ["history_containers", "current_containers", "crane_movements"]:
        count = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
        print(f"{table}: {count}")
