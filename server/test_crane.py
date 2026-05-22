from db.connection import get_engine
from sqlalchemy import text
with get_engine().connect() as conn:
    print(conn.execute(text("SELECT carrier_visit, COUNT(1) FROM peb_crane_operations GROUP BY carrier_visit LIMIT 10")).fetchall())
