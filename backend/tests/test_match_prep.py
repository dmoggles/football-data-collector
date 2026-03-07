import uuid

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.session import SessionLocal
from app.main import app
from app.models.global_role import GlobalRole, GlobalRoleType
from app.models.user import User

client = TestClient(app)


def _register(email_prefix: str, password: str = "Password123!") -> tuple[str, str]:
    email = f"{email_prefix}-{uuid.uuid4().hex[:10]}@test.local"
    response = client.post("/auth/register", json={"email": email, "password": password})
    assert response.status_code == 201
    return email, password


def _login(email: str, password: str) -> None:
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200


def _grant_super_admin(email: str) -> None:
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        assert user is not None
        role = db.scalar(
            select(GlobalRole).where(
                GlobalRole.user_id == user.id,
                GlobalRole.role == GlobalRoleType.SUPER_ADMIN.value,
            )
        )
        if role is None:
            db.add(GlobalRole(user_id=user.id, role=GlobalRoleType.SUPER_ADMIN.value))
            db.commit()


def _create_club(club_name: str) -> None:
    email, password = _register("prep-super")
    _grant_super_admin(email)
    _login(email, password)
    response = client.post("/admin/clubs", json={"name": club_name})
    assert response.status_code in [201, 409]


def test_match_prep_plan_upsert_and_fetch() -> None:
    club_name = f"PrepClub-{uuid.uuid4().hex[:6]}"
    _create_club(club_name)

    owner_email, owner_password = _register("prep-owner")
    _login(owner_email, owner_password)

    team_response = client.post(
        "/teams",
        json={"club_name": club_name, "team_name": f"U11-{uuid.uuid4().hex[:4]}"},
    )
    assert team_response.status_code == 201
    team_id = team_response.json()["id"]

    opponent_response = client.post(
        "/teams",
        json={"club_name": club_name, "team_name": f"Opp-{uuid.uuid4().hex[:4]}"},
    )
    assert opponent_response.status_code == 201
    opponent_team_id = opponent_response.json()["id"]

    p1 = client.post(
        "/players",
        json={"team_id": team_id, "display_name": "Player One", "shirt_number": 1, "position": "GK"},
    )
    p2 = client.post(
        "/players",
        json={"team_id": team_id, "display_name": "Player Two", "shirt_number": 2, "position": "CB"},
    )
    assert p1.status_code == 201
    assert p2.status_code == 201

    fixture = client.post(
        "/matches",
        json={
            "home_team_id": team_id,
            "away_team_id": opponent_team_id,
            "format": "5_aside",
            "period_format": "halves",
            "period_length_minutes": 20,
            "status": "scheduled",
        },
    )
    assert fixture.status_code == 201
    fixture_id = fixture.json()["id"]

    fixtures = client.get(f"/match-prep/fixtures?team_id={team_id}")
    assert fixtures.status_code == 200
    assert any(row["id"] == fixture_id for row in fixtures.json())

    get_plan = client.get(f"/match-prep/plan?match_id={fixture_id}&team_id={team_id}")
    assert get_plan.status_code == 200
    assert get_plan.json()["required_starting_count"] == 5
    assert get_plan.json()["formation_options"]

    upsert = client.put(
        "/match-prep/plan",
        json={
            "match_id": fixture_id,
            "team_id": team_id,
            "formation": "2-1-1",
            "players": [
                {
                    "player_id": p1.json()["id"],
                    "is_available": True,
                    "in_matchday_squad": True,
                    "is_starting": True,
                    "lineup_slot": "GK",
                },
                {
                    "player_id": p2.json()["id"],
                    "is_available": True,
                    "in_matchday_squad": False,
                    "is_starting": False,
                    "lineup_slot": None,
                },
            ],
        },
    )
    assert upsert.status_code == 200
    assert upsert.json()["formation"] == "2-1-1"
    second_player = next(
        row for row in upsert.json()["players"] if row["player_id"] == p2.json()["id"]
    )
    assert second_player["is_available"] is True
    assert second_player["in_matchday_squad"] is True

    get_plan_again = client.get(f"/match-prep/plan?match_id={fixture_id}&team_id={team_id}")
    assert get_plan_again.status_code == 200
    assert get_plan_again.json()["formation"] == "2-1-1"


def test_match_prep_rejects_invalid_lineup_slot() -> None:
    club_name = f"PrepClubInvalid-{uuid.uuid4().hex[:6]}"
    _create_club(club_name)
    owner_email, owner_password = _register("prep-owner-invalid")
    _login(owner_email, owner_password)

    team_response = client.post(
        "/teams",
        json={"club_name": club_name, "team_name": f"U12-{uuid.uuid4().hex[:4]}"},
    )
    assert team_response.status_code == 201
    team_id = team_response.json()["id"]

    opponent_response = client.post(
        "/teams",
        json={"club_name": club_name, "team_name": f"Opp-{uuid.uuid4().hex[:4]}"},
    )
    assert opponent_response.status_code == 201
    opponent_team_id = opponent_response.json()["id"]

    player = client.post(
        "/players",
        json={"team_id": team_id, "display_name": "Player X", "shirt_number": 7, "position": "CM"},
    )
    assert player.status_code == 201

    fixture = client.post(
        "/matches",
        json={
            "home_team_id": team_id,
            "away_team_id": opponent_team_id,
            "format": "7_aside",
            "period_format": "halves",
            "period_length_minutes": 25,
            "status": "scheduled",
        },
    )
    assert fixture.status_code == 201
    fixture_id = fixture.json()["id"]

    bad = client.put(
        "/match-prep/plan",
        json={
            "match_id": fixture_id,
            "team_id": team_id,
            "formation": "2-3-1",
            "players": [
                {
                    "player_id": player.json()["id"],
                    "is_available": True,
                    "in_matchday_squad": False,
                    "is_starting": True,
                    "lineup_slot": "BAD_SLOT",
                }
            ],
        },
    )
    assert bad.status_code == 400
