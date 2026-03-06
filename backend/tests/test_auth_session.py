import uuid

from fastapi.testclient import TestClient

from app.main import app


def test_login_persists_session_for_me_endpoint() -> None:
    client = TestClient(app)
    email = f"session-{uuid.uuid4().hex[:10]}@test.local"
    password = "Password123!"

    register_response = client.post("/auth/register", json={"email": email, "password": password})
    assert register_response.status_code == 201

    login_response = client.post("/auth/login", json={"email": email, "password": password})
    assert login_response.status_code == 200

    me_response = client.get("/auth/me")
    assert me_response.status_code == 200
    assert me_response.json()["email"] == email
