import uuid

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.session import SessionLocal
from app.main import app
from app.models.global_role import GlobalRole, GlobalRoleType
from app.models.match_plan import MatchPlan
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
    p3 = client.post(
        "/players",
        json={"team_id": team_id, "display_name": "Player Three", "shirt_number": 3, "position": "CM"},
    )
    assert p1.status_code == 201
    assert p2.status_code == 201
    assert p3.status_code == 201

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
                {
                    "player_id": p3.json()["id"],
                    "is_available": True,
                    "in_matchday_squad": False,
                    "is_starting": False,
                    "lineup_slot": None,
                },
            ],
            "substitution_segments": [
                {
                    "end_minute": 10,
                    "substitutions": [
                        {
                            "player_out_id": p2.json()["id"],
                            "player_in_id": p3.json()["id"],
                        }
                    ],
                }
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
    assert len(upsert.json()["substitution_segments"]) == 1
    assert upsert.json()["substitution_segments"][0]["end_minute"] == 10
    assert upsert.json()["substitution_segments"][0]["substitutions"][0]["player_out_id"] == p2.json()["id"]
    assert upsert.json()["substitution_segments"][0]["substitutions"][0]["player_in_id"] == p3.json()["id"]

    get_plan_again = client.get(f"/match-prep/plan?match_id={fixture_id}&team_id={team_id}")
    assert get_plan_again.status_code == 200
    assert get_plan_again.json()["formation"] == "2-1-1"
    assert len(get_plan_again.json()["substitution_segments"]) == 1


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


def test_match_prep_plan_validate_reports_errors_and_position_warnings() -> None:
    club_name = f"PrepClubValidate-{uuid.uuid4().hex[:6]}"
    _create_club(club_name)
    owner_email, owner_password = _register("prep-owner-validate")
    _login(owner_email, owner_password)

    team_response = client.post(
        "/teams",
        json={"club_name": club_name, "team_name": f"U10-{uuid.uuid4().hex[:4]}"},
    )
    assert team_response.status_code == 201
    team_id = team_response.json()["id"]

    opponent_response = client.post(
        "/teams",
        json={"club_name": club_name, "team_name": f"Opp-{uuid.uuid4().hex[:4]}"},
    )
    assert opponent_response.status_code == 201
    opponent_team_id = opponent_response.json()["id"]

    players = [
        client.post("/players", json={"team_id": team_id, "display_name": "P1", "shirt_number": 1, "position": "GK"}),
        client.post("/players", json={"team_id": team_id, "display_name": "P2", "shirt_number": 2, "position": "CM"}),
        client.post("/players", json={"team_id": team_id, "display_name": "P3", "shirt_number": 3, "position": "RB"}),
        client.post("/players", json={"team_id": team_id, "display_name": "P4", "shirt_number": 4, "position": "CM"}),
        client.post("/players", json={"team_id": team_id, "display_name": "P5", "shirt_number": 5, "position": "ST"}),
    ]
    assert all(response.status_code == 201 for response in players)

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

    player_ids = [row.json()["id"] for row in players]
    upsert_missing = client.put(
        "/match-prep/plan",
        json={
            "match_id": fixture_id,
            "team_id": team_id,
            "formation": "2-1-1",
            "players": [
                {"player_id": player_ids[0], "is_available": True, "in_matchday_squad": True, "is_starting": True, "lineup_slot": "GK"},
                {"player_id": player_ids[1], "is_available": True, "in_matchday_squad": True, "is_starting": True, "lineup_slot": "L1_1"},
                {"player_id": player_ids[2], "is_available": True, "in_matchday_squad": True, "is_starting": True, "lineup_slot": "L1_2"},
                {"player_id": player_ids[3], "is_available": True, "in_matchday_squad": False, "is_starting": False, "lineup_slot": None},
                {"player_id": player_ids[4], "is_available": True, "in_matchday_squad": True, "is_starting": True, "lineup_slot": "L3_1"},
            ],
            "substitution_segments": [],
        },
    )
    assert upsert_missing.status_code == 200

    invalid_validation = client.get(
        f"/match-prep/plan/validate?match_id={fixture_id}&team_id={team_id}"
    )
    assert invalid_validation.status_code == 200
    assert invalid_validation.json()["valid"] is False
    assert invalid_validation.json()["errors"]

    upsert_full = client.put(
        "/match-prep/plan",
        json={
            "match_id": fixture_id,
            "team_id": team_id,
            "formation": "2-1-1",
            "players": [
                {"player_id": player_ids[0], "is_available": True, "in_matchday_squad": True, "is_starting": True, "lineup_slot": "GK"},
                {"player_id": player_ids[1], "is_available": True, "in_matchday_squad": True, "is_starting": True, "lineup_slot": "L1_1"},
                {"player_id": player_ids[2], "is_available": True, "in_matchday_squad": True, "is_starting": True, "lineup_slot": "L1_2"},
                {"player_id": player_ids[3], "is_available": True, "in_matchday_squad": True, "is_starting": True, "lineup_slot": "L2_1"},
                {"player_id": player_ids[4], "is_available": True, "in_matchday_squad": True, "is_starting": True, "lineup_slot": "L3_1"},
            ],
            "substitution_segments": [],
        },
    )
    assert upsert_full.status_code == 200

    warning_validation = client.get(
        f"/match-prep/plan/validate?match_id={fixture_id}&team_id={team_id}"
    )
    assert warning_validation.status_code == 200
    assert warning_validation.json()["valid"] is True
    assert warning_validation.json()["warnings"]


def test_deleting_fixture_removes_match_prep_records() -> None:
    club_name = f"PrepClubDelete-{uuid.uuid4().hex[:6]}"
    _create_club(club_name)
    owner_email, owner_password = _register("prep-owner-delete")
    _login(owner_email, owner_password)

    team_response = client.post(
        "/teams",
        json={"club_name": club_name, "team_name": f"U15-{uuid.uuid4().hex[:4]}"},
    )
    assert team_response.status_code == 201
    team_id = team_response.json()["id"]

    opponent_response = client.post(
        "/teams",
        json={"club_name": club_name, "team_name": f"Opp-{uuid.uuid4().hex[:4]}"},
    )
    assert opponent_response.status_code == 201
    opponent_team_id = opponent_response.json()["id"]

    players = [
        client.post("/players", json={"team_id": team_id, "display_name": "A", "shirt_number": 1, "position": "GK"}),
        client.post("/players", json={"team_id": team_id, "display_name": "B", "shirt_number": 2, "position": "LB"}),
        client.post("/players", json={"team_id": team_id, "display_name": "C", "shirt_number": 3, "position": "RB"}),
        client.post("/players", json={"team_id": team_id, "display_name": "D", "shirt_number": 4, "position": "CM"}),
        client.post("/players", json={"team_id": team_id, "display_name": "E", "shirt_number": 5, "position": "ST"}),
    ]
    assert all(response.status_code == 201 for response in players)
    player_ids = [row.json()["id"] for row in players]

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

    plan_upsert = client.put(
        "/match-prep/plan",
        json={
            "match_id": fixture_id,
            "team_id": team_id,
            "formation": "2-1-1",
            "players": [
                {"player_id": player_ids[0], "is_available": True, "in_matchday_squad": True, "is_starting": True, "lineup_slot": "GK"},
                {"player_id": player_ids[1], "is_available": True, "in_matchday_squad": True, "is_starting": True, "lineup_slot": "L1_1"},
                {"player_id": player_ids[2], "is_available": True, "in_matchday_squad": True, "is_starting": True, "lineup_slot": "L1_2"},
                {"player_id": player_ids[3], "is_available": True, "in_matchday_squad": True, "is_starting": True, "lineup_slot": "L2_1"},
                {"player_id": player_ids[4], "is_available": True, "in_matchday_squad": True, "is_starting": True, "lineup_slot": "L3_1"},
            ],
            "substitution_segments": [],
        },
    )
    assert plan_upsert.status_code == 200

    delete_response = client.delete(f"/matches/{fixture_id}")
    assert delete_response.status_code == 204

    missing_fixture = client.get(f"/match-prep/plan?match_id={fixture_id}&team_id={team_id}")
    assert missing_fixture.status_code == 404

    with SessionLocal() as db:
        lingering_plan = db.scalar(select(MatchPlan).where(MatchPlan.match_id == fixture_id))
        assert lingering_plan is None


def test_create_and_list_coaching_notes() -> None:
    club_name = f"PrepClubNotes-{uuid.uuid4().hex[:6]}"
    _create_club(club_name)
    owner_email, owner_password = _register("prep-owner-notes")
    _login(owner_email, owner_password)

    team_response = client.post(
        "/teams",
        json={"club_name": club_name, "team_name": f"U16-{uuid.uuid4().hex[:4]}"},
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
        json={"team_id": team_id, "display_name": "Note Player", "shirt_number": 9, "position": "ST"},
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

    team_note = client.post(
        "/match-prep/notes",
        json={
            "match_id": fixture_id,
            "team_id": team_id,
            "player_id": None,
            "note_text": "Press high in first 10 minutes",
        },
    )
    assert team_note.status_code == 201
    assert team_note.json()["player_id"] is None

    player_note = client.post(
        "/match-prep/notes",
        json={
            "match_id": fixture_id,
            "team_id": team_id,
            "player_id": player.json()["id"],
            "note_text": "Attack near post on corners",
        },
    )
    assert player_note.status_code == 201
    assert player_note.json()["player_id"] == player.json()["id"]
    assert player_note.json()["player_name"] == "Note Player"

    notes = client.get(f"/match-prep/notes?match_id={fixture_id}&team_id={team_id}")
    assert notes.status_code == 200
    assert len(notes.json()) == 2

    team_note_update = client.post(
        "/match-prep/notes",
        json={
            "match_id": fixture_id,
            "team_id": team_id,
            "player_id": None,
            "note_text": "Drop into mid block after 10 minutes",
        },
    )
    assert team_note_update.status_code == 201

    notes_after_update = client.get(f"/match-prep/notes?match_id={fixture_id}&team_id={team_id}")
    assert notes_after_update.status_code == 200
    assert len(notes_after_update.json()) == 2
    updated_team_note = next(note for note in notes_after_update.json() if note["player_id"] is None)
    assert updated_team_note["note_text"] == "Drop into mid block after 10 minutes"
