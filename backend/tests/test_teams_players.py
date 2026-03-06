import uuid

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _register(email_prefix: str, password: str = "Password123!") -> tuple[str, str]:
    email = f"{email_prefix}-{uuid.uuid4().hex[:10]}@test.local"
    register_response = client.post("/auth/register", json={"email": email, "password": password})
    assert register_response.status_code == 201
    return email, password


def _login(email: str, password: str) -> None:
    login_response = client.post("/auth/login", json={"email": email, "password": password})
    assert login_response.status_code == 200


def test_team_creator_gets_admin_membership_and_can_manage_players() -> None:
    owner_email, owner_password = _register("owner")
    _login(owner_email, owner_password)

    create_team_response = client.post(
        "/teams",
        json={"club_name": "Arrows", "team_name": "FC"},
    )
    assert create_team_response.status_code == 201
    team_id = create_team_response.json()["id"]

    members_response = client.get(f"/teams/{team_id}/members")
    assert members_response.status_code == 200
    assert len(members_response.json()) == 1
    assert members_response.json()[0]["role"] == "admin"

    create_player_response = client.post(
        "/players",
        json={
            "team_id": team_id,
            "display_name": "Mina Cole",
            "shirt_number": 9,
            "position": "ST",
        },
    )
    assert create_player_response.status_code == 201


def test_data_enterer_cannot_modify_team_or_players() -> None:
    owner_email, owner_password = _register("owner2")
    _login(owner_email, owner_password)

    create_team_response = client.post(
        "/teams",
        json={"club_name": "Rangers", "team_name": "First XI"},
    )
    assert create_team_response.status_code == 201
    team_id = create_team_response.json()["id"]

    data_email, data_password = _register("data")

    _login(owner_email, owner_password)
    assign_response = client.post(
        f"/teams/{team_id}/members",
        json={"user_email": data_email, "role": "data_enterer"},
    )
    assert assign_response.status_code == 201

    _login(data_email, data_password)

    list_teams_response = client.get("/teams")
    assert list_teams_response.status_code == 200
    assert any(team["id"] == team_id for team in list_teams_response.json())

    create_player_response = client.post(
        "/players",
        json={
            "team_id": team_id,
            "display_name": "Blocked User",
            "shirt_number": 10,
            "position": "CM",
        },
    )
    assert create_player_response.status_code == 403

    update_team_response = client.patch(
        f"/teams/{team_id}",
        json={"club_name": "Hacked", "team_name": "Team"},
    )
    assert update_team_response.status_code == 403
