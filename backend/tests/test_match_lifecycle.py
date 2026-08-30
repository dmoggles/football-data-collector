import uuid

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.session import SessionLocal
from app.main import app
from app.models.collection_session import CollectionSession
from app.models.event import Event
from app.models.global_role import GlobalRole, GlobalRoleType
from app.models.user import User

client = TestClient(app)


def register(email_prefix: str) -> tuple[str, str]:
    password = "Password123!"
    email = f"{email_prefix}-{uuid.uuid4().hex[:10]}@test.local"
    response = client.post("/auth/register", json={"email": email, "password": password})
    assert response.status_code == 201
    return email, password


def login(email: str, password: str) -> None:
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200


def create_club(name: str) -> None:
    email, password = register("lifecycle-super")
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        assert user
        db.add(GlobalRole(user_id=user.id, role=GlobalRoleType.SUPER_ADMIN.value))
        db.commit()
    login(email, password)
    assert client.post("/admin/clubs", json={"name": name}).status_code == 201


def test_team_scoped_start_lock_and_reset() -> None:
    club_name = f"Lifecycle-{uuid.uuid4().hex[:8]}"
    create_club(club_name)
    manager_email, manager_password = register("lifecycle-manager")
    login(manager_email, manager_password)

    home = client.post(
        "/teams",
        json={"club_name": club_name, "team_name": f"Home-{uuid.uuid4().hex[:4]}"},
    )
    away = client.post(
        "/teams",
        json={"club_name": club_name, "team_name": f"Away-{uuid.uuid4().hex[:4]}"},
    )
    assert home.status_code == away.status_code == 201
    home_id = home.json()["id"]
    away_id = away.json()["id"]

    player = client.post(
        "/players",
        json={
            "team_id": home_id,
            "display_name": "Lifecycle Player",
            "shirt_number": 9,
            "position": "ST",
        },
    )
    assert player.status_code == 201
    player_id = player.json()["id"]

    fixture = client.post(
        "/matches",
        json={
            "home_team_id": home_id,
            "away_team_id": away_id,
            "format": "5_aside",
            "period_format": "halves",
            "period_length_minutes": 20,
            "status": "live",
        },
    )
    assert fixture.status_code == 201
    match_id = fixture.json()["id"]

    plan_payload = {
        "match_id": match_id,
        "team_id": home_id,
        "formation": "2-1-1",
        "players": [
            {
                "player_id": player_id,
                "is_available": True,
                "in_matchday_squad": True,
                "is_starting": False,
                "lineup_slot": None,
            }
        ],
        "substitution_segments": [],
    }
    assert client.put("/match-prep/plan", json=plan_payload).status_code == 200
    note = client.post(
        "/match-prep/notes",
        json={
            "match_id": match_id,
            "team_id": home_id,
            "player_id": player_id,
            "note_text": "Preserve this note",
        },
    )
    assert note.status_code == 201

    home_start = client.post(
        "/collection-sessions/start",
        json={"match_id": match_id, "team_id": home_id},
    )
    away_start = client.post(
        "/collection-sessions/start",
        json={"match_id": match_id, "team_id": away_id},
    )
    assert home_start.status_code == away_start.status_code == 201
    home_session_id = home_start.json()["id"]
    away_session_id = away_start.json()["id"]

    fixtures = client.get(f"/matches?team_id={home_id}")
    assert fixtures.status_code == 200
    started_fixture = next(row for row in fixtures.json() if row["id"] == match_id)
    assert started_fixture["collection_state"] == "live"
    prep_fixtures = client.get(f"/match-prep/fixtures?team_id={home_id}")
    assert all(row["id"] != match_id for row in prep_fixtures.json())

    assert client.put("/match-prep/plan", json=plan_payload).status_code == 409
    assert note.status_code == 201
    assert client.post(
        "/match-prep/notes",
        json={
            "match_id": match_id,
            "team_id": home_id,
            "player_id": player_id,
            "note_text": "Blocked update",
        },
    ).status_code == 409
    assert client.delete(f"/match-prep/notes/{note.json()['id']}").status_code == 409
    assert client.get(f"/match-prep/plan?match_id={match_id}&team_id={home_id}").status_code == 200
    assert client.get(f"/match-prep/notes?match_id={match_id}&team_id={home_id}").status_code == 200

    home_event = client.post(
        f"/collection-sessions/{home_session_id}/events",
        json={"team_id": home_id, "event_kind": "shot", "player_id": player_id},
    )
    away_event = client.post(
        f"/collection-sessions/{away_session_id}/events",
        json={"team_id": away_id, "event_kind": "shot_against"},
    )
    assert home_event.status_code == away_event.status_code == 201

    wrong_team = client.post(
        f"/collection-sessions/{home_session_id}/reset",
        json={"team_id": away_id},
    )
    assert wrong_team.status_code == 400
    missing = client.post(
        f"/collection-sessions/{uuid.uuid4()}/reset",
        json={"team_id": home_id},
    )
    assert missing.status_code == 404

    outsider_email, outsider_password = register("lifecycle-outsider")
    login(outsider_email, outsider_password)
    forbidden = client.post(
        f"/collection-sessions/{home_session_id}/reset",
        json={"team_id": home_id},
    )
    assert forbidden.status_code == 403
    login(manager_email, manager_password)

    reset = client.post(
        f"/collection-sessions/{home_session_id}/reset",
        json={"team_id": home_id},
    )
    assert reset.status_code == 204

    with SessionLocal() as db:
        home_session = db.scalar(
            select(CollectionSession).where(CollectionSession.id == home_session_id)
        )
        away_session = db.scalar(
            select(CollectionSession).where(CollectionSession.id == away_session_id)
        )
        assert home_session is None
        assert away_session is not None
        assert db.scalar(select(Event).where(Event.id == home_event.json()["id"])) is None
        assert db.scalar(select(Event).where(Event.id == away_event.json()["id"])) is not None

    fixtures = client.get(f"/matches?team_id={home_id}")
    reset_fixture = next(row for row in fixtures.json() if row["id"] == match_id)
    assert reset_fixture["status"] == "live"
    assert reset_fixture["collection_state"] is None
    away_fixtures = client.get(f"/matches?team_id={away_id}")
    away_fixture = next(row for row in away_fixtures.json() if row["id"] == match_id)
    assert away_fixture["status"] == "live"
    assert away_fixture["collection_state"] == "live"
    assert any(
        row["id"] == match_id
        for row in client.get(f"/match-prep/fixtures?team_id={home_id}").json()
    )
    notes = client.get(f"/match-prep/notes?match_id={match_id}&team_id={home_id}").json()
    assert notes[0]["note_text"] == "Preserve this note"

    away_reset = client.post(
        f"/collection-sessions/{away_session_id}/reset",
        json={"team_id": away_id},
    )
    assert away_reset.status_code == 204
    with SessionLocal() as db:
        assert db.scalar(select(Event).where(Event.id == away_event.json()["id"])) is None
    final_fixtures = client.get(f"/matches?team_id={away_id}")
    final_fixture = next(row for row in final_fixtures.json() if row["id"] == match_id)
    assert final_fixture["status"] == "scheduled"
    assert final_fixture["collection_state"] is None

    ended_start = client.post(
        "/collection-sessions/start",
        json={"match_id": match_id, "team_id": away_id},
    )
    assert ended_start.status_code == 201
    ended_session_id = ended_start.json()["id"]
    with SessionLocal() as db:
        ended_session = db.scalar(
            select(CollectionSession).where(CollectionSession.id == ended_session_id)
        )
        assert ended_session
        ended_session.state = "ended"
        db.commit()
    ended_reset = client.post(
        f"/collection-sessions/{ended_session_id}/reset",
        json={"team_id": away_id},
    )
    assert ended_reset.status_code == 409
