import os

# Must be set before the app is imported.
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-that-is-long-enough-0123456789"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.core.database import Base, get_db
from app.main import app
from app.seed import seed

PASSWORD = "Demo@1234"


@pytest.fixture()
def client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with TestSession() as db:
        seed(db, PASSWORD)

    def override_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def login(client, email: str) -> dict:
    res = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200, res.text
    return res.json()


@pytest.fixture()
def as_role(client):
    emails = {
        "super_admin": "admin@visionedge.com",
        "dentist": "dr.smith@visionedge.com",
        "receptionist": "john.reception@visionedge.com",
        "admin": "priya.admin@visionedge.com",
        "patient": "patient@example.com",
    }

    def _headers(role: str) -> dict:
        token = login(client, emails[role])["accessToken"]
        return {"Authorization": f"Bearer {token}"}

    return _headers
