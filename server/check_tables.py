from db.connection import get_engine
from sqlalchemy import text
engine = get_engine()
with engine.connect() as conn:
    res = conn.execute(text(
        "SELECT relname, relkind FROM pg_class WHERE relkind IN ('r','p') "
        "AND (relname LIKE '%_history_containers' OR relname LIKE '%_current_containers' OR relname LIKE '%_crane_movements') "
        "AND oid NOT IN (SELECT inhrelid FROM pg_inherits) ORDER BY relname"
    )).fetchall()
    print('=== YARD TABLES ===')
    for r in res:
        count = conn.execute(text(f'SELECT COUNT(*) FROM {r[0]}')).scalar()
        print(f'  {r[0]} ({r[1]}): {count} rows')
    
    # Also check what outbound_service values are in CWIT history if it exists
    cwit_check = conn.execute(text(
        "SELECT relname FROM pg_class WHERE relname = 'cwit_history_containers'"
    )).fetchone()
    if cwit_check:
        svcs = conn.execute(text(
            "SELECT DISTINCT outbound_service FROM cwit_history_containers LIMIT 10"
        )).fetchall()
        print('\n=== CWIT outbound_service samples ===')
        for s in svcs:
            print(f'  {s[0]}')
    else:
        print('\nNo cwit_history_containers table found - CWIT data not uploaded yet')
