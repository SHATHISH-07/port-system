import os
import sys
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
import time
from datetime import datetime

# Add server and tests directory to path so we can import app modules and test utils
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../server')))
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
os.environ["DATABASE_URL"] = "postgresql://postgres:postgres@127.0.0.1:5432/portsystem"
os.environ["MODEL_PATH"] = os.path.abspath(os.path.join(os.path.dirname(__file__), "models", "stay_model_test.pkl"))

from server.main import app
from server.db.connection import engine, get_engine
from server.db.schema import init_dataset_schema
from server.auth.utils import create_access_token

# Store test results
test_results = []

@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    # execute all other hooks to obtain the report object
    outcome = yield
    rep = outcome.get_result()

    if rep.when == "call":
        status = "PASS" if rep.passed else "FAIL"
        
        # Parse test info
        module = item.module.__name__.split('.')[-1]
        test_id = item.name
        doc = item.function.__doc__ or ""
        
        error_msg = ""
        if rep.failed:
            error_msg = str(rep.longrepr).split('\n')[-1]
            
        test_results.append({
            "Test ID": test_id,
            "Module": module,
            "Flow Name": module.replace('test_', '').capitalize(),
            "Test Description": doc.strip(),
            "Request Payload": "", # Optional context
            "Expected Result": "Success",
            "Actual Result": status,
            "Status": status,
            "Error Message": error_msg,
            "Execution Time": f"{rep.duration:.2f}s",
            "Timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })

def pytest_sessionfinish(session, exitstatus):
    # Generate reports at the end of the session
    from utils.report_generator import generate_excel_report, generate_docx_report
    if test_results:
        generate_excel_report(test_results)
        generate_docx_report(test_results)

@pytest_asyncio.fixture(scope="session")
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

@pytest.fixture(scope="session")
def db_engine():
    test_engine = get_engine()
    init_dataset_schema(test_engine, "history")
    init_dataset_schema(test_engine, "current")
    yield test_engine
    test_engine.dispose()

@pytest.fixture(scope="session")
def admin_token():
    return create_access_token(data={"sub": "admin", "role": "admin"})

@pytest.fixture(scope="session")
def user_token():
    return create_access_token(data={"sub": "testuser", "role": "user"})

@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}

@pytest.fixture(scope="session")
def user_headers(user_token):
    return {"Authorization": f"Bearer {user_token}"}
