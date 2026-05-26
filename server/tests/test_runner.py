import os
import json
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tests.helpers import run_test_case

# Import all test case modules
from tests.test_auth_e2e import test_cases as auth_tests
from tests.test_vessel_e2e import test_cases as vessel_tests
from tests.test_heatmap_e2e import test_cases as heatmap_tests
from tests.test_stowage_e2e import test_cases as stowage_tests
from tests.test_ingest_e2e import test_cases as ingest_tests
from tests.test_model_e2e import test_cases as model_tests
from tests.test_system_e2e import test_cases as system_tests

all_tests = []
all_tests.extend(auth_tests)
all_tests.extend(vessel_tests)
all_tests.extend(heatmap_tests)
all_tests.extend(stowage_tests)
all_tests.extend(ingest_tests)
all_tests.extend(model_tests)
all_tests.extend(system_tests)

def run_all():
    results = []
    print(f"Starting Backend E2E Suite... ({len(all_tests)} tests)")
    print("-" * 60)
    
    passed_count = 0
    
    for tc in all_tests:
        print(f"Running: {tc['name']}")
        res = run_test_case(tc)
        results.append(res)
        
        status_tag = "PASS" if res["passed"] else "FAIL"
        err_msg = f" - ERROR: {res['error']}" if not res["passed"] else ""
        print(f"  [{status_tag}] {res['response_time_ms']}ms{err_msg}")
        
        if res["passed"]:
            passed_count += 1
            
    print("-" * 60)
    print(f"Suite completed. {passed_count}/{len(all_tests)} passed.")
    
    # Save to file
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_results.json")
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
        
    print(f"Results saved to {out_path}")

if __name__ == "__main__":
    run_all()
