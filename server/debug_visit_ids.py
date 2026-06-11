from db.connection import get_engine
from sqlalchemy import text

e = get_engine()
with e.connect() as c:
    r = c.execute(text("SELECT DISTINCT visit_id FROM cranes LIMIT 10")).fetchall()
    print("Crane visit_ids:", [x[0] for x in r])
    
    r2 = c.execute(text("SELECT DISTINCT actual_outbound_carrier_visit_id FROM containers WHERE outbound_service='AA7' LIMIT 10")).fetchall()
    print("Container visit_ids:", [x[0] for x in r2])
    
    # Check if ANY crane data exists for AA7's visits
    container_vids = [x[0] for x in r2]
    if container_vids:
        r3 = c.execute(text("SELECT visit_id, COUNT(DISTINCT crane_id) as crane_count FROM cranes WHERE visit_id = ANY(:vids) GROUP BY visit_id"), {"vids": container_vids}).fetchall()
        print("Crane matches for container visits:", [(x[0], x[1]) for x in r3])
    
    # Also check container visit_id (not actual_outbound...)
    r4 = c.execute(text("SELECT DISTINCT visit_id FROM containers WHERE outbound_service='AA7' LIMIT 10")).fetchall()
    print("Container visit_id (not actual_outbound):", [x[0] for x in r4])
    
    # Check if crane data exists for container visit_ids
    container_vids2 = [x[0] for x in r4]
    if container_vids2:
        r5 = c.execute(text("SELECT visit_id, COUNT(DISTINCT crane_id) as crane_count FROM cranes WHERE visit_id = ANY(:vids) GROUP BY visit_id"), {"vids": container_vids2}).fetchall()
        print("Crane matches for container visit_id:", [(x[0], x[1]) for x in r5])
