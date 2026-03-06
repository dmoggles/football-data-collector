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


def test_logout_invalidates_existing_session() -> None:
    client = TestClient(app)
    email = f"logout-{uuid.uuid4().hex[:10]}@test.local"
    password = "Password123!"

    register_response = client.post("/auth/register", json={"email": email, "password": password})
    assert register_response.status_code == 201

    login_response = client.post("/auth/login", json={"email": email, "password": password})
    assert login_response.status_code == 200

    logout_response = client.post("/auth/logout")
    assert logout_response.status_code == 204

    me_response = client.get("/auth/me")
    assert me_response.status_code == 401


def test_change_password_requires_current_password_and_rotates_session() -> None:
    client = TestClient(app)
    email = f"pw-change-{uuid.uuid4().hex[:10]}@test.local"
    old_password = "Password123!"
    new_password = "Password456!"

    register_response = client.post(
        "/auth/register",
        json={"email": email, "password": old_password},
    )
    assert register_response.status_code == 201

    login_response = client.post("/auth/login", json={"email": email, "password": old_password})
    assert login_response.status_code == 200

    change_response = client.post(
        "/auth/change-password",
        json={"current_password": old_password, "new_password": new_password},
    )
    assert change_response.status_code == 204

    me_response = client.get("/auth/me")
    assert me_response.status_code == 401

    old_login_response = client.post("/auth/login", json={"email": email, "password": old_password})
    assert old_login_response.status_code == 401

    new_login_response = client.post("/auth/login", json={"email": email, "password": new_password})
    assert new_login_response.status_code == 200


def test_change_password_rejects_wrong_current_password() -> None:
    client = TestClient(app)
    email = f"pw-change-wrong-{uuid.uuid4().hex[:10]}@test.local"
    password = "Password123!"

    register_response = client.post("/auth/register", json={"email": email, "password": password})
    assert register_response.status_code == 201

    login_response = client.post("/auth/login", json={"email": email, "password": password})
    assert login_response.status_code == 200

    change_response = client.post(
        "/auth/change-password",
        json={"current_password": "WrongPassword123!", "new_password": "Password456!"},
    )
    assert change_response.status_code == 401
