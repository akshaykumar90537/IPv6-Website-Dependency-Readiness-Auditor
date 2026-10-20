import os
import tempfile

# Must be set before the app is imported.
os.environ["AUDITOR_DB_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    """Shared across every test file (moved here from test_api.py in Phase 9 so
    test_security_hardening.py can use it too without duplicating the definition)."""
    with TestClient(app) as c:
        yield c
