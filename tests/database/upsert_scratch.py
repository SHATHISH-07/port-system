import os
import sys
import pandas as pd
from datetime import datetime

# Setup path to include server
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../server')))

from server.db.queries import save_to_current

df = pd.DataFrame([
    {
        "outbound_service": "TEST_SERVICE",
        "actual_outbound_carrier_visit_id": "TEST_VISIT",
        "unit_id": "TEST_UNIT",
        "move_complete_time": datetime.now(),
        "time_in": datetime.now(),
        "time_out": datetime.now(),
    }
])

print("Saving first time...")
save_to_current(df)
print("Saving second time...")
try:
    save_to_current(df)
    print("SUCCESS")
except Exception as e:
    import traceback
    traceback.print_exc()
