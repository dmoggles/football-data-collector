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
    email, password = _register("match-super")
    _grant_super_admin(email)
    _login(email, password)
    response = client.post("/admin/clubs", json={"name": club_name})
    assert response.status_code in [201, 409]


def test_team_admin_can_create_fixture_with_format() -> None:
    club_name = f"FixtureClub-{uuid.uuid4().hex[:6]}"
    _create_club(club_name)
    owner_email, owner_password = _register("fixture-owner")
    _login(owner_email, owner_password)

    home_team_response = client.post(
        "/teams",
        json={"club_name": club_name, "team_name": f"Home-{uuid.uuid4().hex[:4]}"},
    )
    assert home_team_response.status_code == 201
    home_team_id = home_team_response.json()["id"]

    away_team_response = client.post(
        "/teams",
        json={"club_name": club_name, "team_name": f"Away-{uuid.uuid4().hex[:4]}"},
    )
    assert away_team_response.status_code == 201
    away_team_id = away_team_response.json()["id"]

    fixture_response = client.post(
        "/matches",
        json={
            "home_team_id": home_team_id,
            "away_team_id": away_team_id,
            "format": "7_aside",
            "period_format": "halves",
            "period_length_minutes": 35,
            "kickoff_at": "2026-04-10T18:00:00Z",
            "status": "scheduled",
        },
    )
    assert fixture_response.status_code == 201
    payload = fixture_response.json()
    assert payload["format"] == "7_aside"
    assert payload["period_format"] == "halves"
    assert payload["period_length_minutes"] == 35
    assert payload["can_manage"] is True

    fixtures_response = client.get(f"/matches?team_id={home_team_id}")
    assert fixtures_response.status_code == 200
    saved_fixture = next(row for row in fixtures_response.json() if row["id"] == payload["id"])
    assert saved_fixture["kickoff_at"] == "2026-04-10T18:00:00Z"


def test_data_enterer_can_view_fixtures_but_cannot_create() -> None:
    club_name = f"FixtureClubDE-{uuid.uuid4().hex[:6]}"
    _create_club(club_name)

    owner_email, owner_password = _register("fixture-owner-de")
    _login(owner_email, owner_password)
    home_team_response = client.post(
        "/teams",
        json={"club_name": club_name, "team_name": f"Home-{uuid.uuid4().hex[:4]}"},
    )
    assert home_team_response.status_code == 201
    home_team_id = home_team_response.json()["id"]

    away_team_response = client.post(
        "/teams",
        json={"club_name": club_name, "team_name": f"Away-{uuid.uuid4().hex[:4]}"},
    )
    assert away_team_response.status_code == 201
    away_team_id = away_team_response.json()["id"]

    create_fixture_response = client.post(
        "/matches",
        json={
            "home_team_id": home_team_id,
            "away_team_id": away_team_id,
            "format": "11_aside",
            "period_format": "halves",
            "period_length_minutes": 35,
            "status": "scheduled",
        },
    )
    assert create_fixture_response.status_code == 201

    data_email, data_password = _register("fixture-data-enterer")
    _login(owner_email, owner_password)
    add_member_response = client.post(
        f"/teams/{home_team_id}/members",
        json={"user_email": data_email, "role": "data_enterer"},
    )
    assert add_member_response.status_code == 201

    _login(data_email, data_password)
    list_response = client.get("/matches")
    assert list_response.status_code == 200
    assert len(list_response.json()) >= 1

    create_as_data_response = client.post(
        "/matches",
        json={
            "home_team_id": home_team_id,
            "away_team_id": away_team_id,
            "format": "5_aside",
            "period_format": "quarters",
            "period_length_minutes": 20,
            "status": "scheduled",
        },
    )
    assert create_as_data_response.status_code == 403


def test_team_admin_can_update_and_delete_fixture() -> None:
    club_name = f"FixtureClubEdit-{uuid.uuid4().hex[:6]}"
    _create_club(club_name)
    owner_email, owner_password = _register("fixture-owner-edit")
    _login(owner_email, owner_password)

    home_team_response = client.post(
        "/teams",
        json={"club_name": club_name, "team_name": f"Home-{uuid.uuid4().hex[:4]}"},
    )
    assert home_team_response.status_code == 201
    home_team_id = home_team_response.json()["id"]

    away_team_response = client.post(
        "/teams",
        json={"club_name": club_name, "team_name": f"Away-{uuid.uuid4().hex[:4]}"},
    )
    assert away_team_response.status_code == 201
    away_team_id = away_team_response.json()["id"]

    create_fixture_response = client.post(
        "/matches",
        json={
            "home_team_id": home_team_id,
            "away_team_id": away_team_id,
            "format": "9_aside",
            "period_format": "halves",
            "period_length_minutes": 30,
            "status": "scheduled",
        },
    )
    assert create_fixture_response.status_code == 201
    fixture_id = create_fixture_response.json()["id"]

    update_response = client.patch(
        f"/matches/{fixture_id}",
        json={
            "home_team_id": home_team_id,
            "away_team_id": away_team_id,
            "format": "11_aside",
            "period_format": "quarters",
            "period_length_minutes": 15,
            "status": "final",
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["format"] == "11_aside"
    assert update_response.json()["period_format"] == "quarters"
    assert update_response.json()["period_length_minutes"] == 15
    assert update_response.json()["status"] == "final"

    delete_response = client.delete(f"/matches/{fixture_id}")
    assert delete_response.status_code == 204


def test_unclaimed_fixture_can_be_ranked_and_merged_into_canonical_team() -> None:
    suffix = uuid.uuid4().hex[:6]
    club_name = f"New Club {suffix}"
    _create_club(club_name)
    owner_email, owner_password = _register("unclaimed-merge-owner")
    _grant_super_admin(owner_email)
    _login(owner_email, owner_password)

    managed_response = client.post(
        "/teams",
        json={"club_name": club_name, "team_name": f"Managed {suffix}"},
    )
    canonical_response = client.post(
        "/teams",
        json={"club_name": club_name, "team_name": "Bengals"},
    )
    assert managed_response.status_code == 201
    assert canonical_response.status_code == 201
    managed_id = managed_response.json()["id"]
    canonical_id = canonical_response.json()["id"]

    source_name = f"NewClub {suffix} U12 Bengals"
    fixture_response = client.post(
        "/matches",
        json={
            "home_team_id": managed_id,
            "away_team_name": source_name,
            "format": "11_aside",
            "period_format": "halves",
            "period_length_minutes": 35,
            "status": "scheduled",
        },
    )
    assert fixture_response.status_code == 201
    fixture = fixture_response.json()
    source_id = fixture["away_team_id"]
    assert fixture["away_club_name"] == ""

    list_response = client.get(f"/matches?team_id={managed_id}")
    assert list_response.status_code == 200
    assert any(row["id"] == fixture["id"] for row in list_response.json())

    directory_response = client.get("/teams/directory")
    assert directory_response.status_code == 200
    source_directory_row = next(row for row in directory_response.json() if row["id"] == source_id)
    assert source_directory_row["is_unclaimed"] is True
    assert source_directory_row["club_id"] is None

    candidates_response = client.get(f"/admin/teams/{source_id}/merge-candidates")
    assert candidates_response.status_code == 200
    candidates = candidates_response.json()
    canonical_candidate = next(row for row in candidates if row["team_id"] == canonical_id)
    assert canonical_candidate["score"] == 100.0
    assert candidates[0]["team_id"] == canonical_id

    merge_response = client.post(
        f"/admin/teams/{source_id}/merge",
        json={"target_team_id": canonical_id},
    )
    assert merge_response.status_code == 200
    assert merge_response.json()["moved_fixture_count"] == 1

    merged_list_response = client.get(f"/matches?team_id={managed_id}")
    assert merged_list_response.status_code == 200
    merged_fixture = next(row for row in merged_list_response.json() if row["id"] == fixture["id"])
    assert merged_fixture["away_team_id"] == canonical_id
    assert merged_fixture["away_club_name"] == club_name


def test_typed_exact_composite_name_reuses_canonical_team() -> None:
    suffix = uuid.uuid4().hex[:6]
    club_name = f"Exact Club {suffix}"
    _create_club(club_name)
    owner_email, owner_password = _register("exact-team-owner")
    _login(owner_email, owner_password)
    managed_response = client.post(
        "/teams",
        json={"club_name": club_name, "team_name": "Managed"},
    )
    canonical_response = client.post(
        "/teams",
        json={"club_name": club_name, "team_name": "Bengals"},
    )
    assert managed_response.status_code == 201
    assert canonical_response.status_code == 201

    fixture_response = client.post(
        "/matches",
        json={
            "home_team_id": managed_response.json()["id"],
            "away_team_name": f"  exact   club {suffix} -- BENGALS ",
            "format": "7_aside",
            "period_format": "halves",
            "period_length_minutes": 30,
            "status": "scheduled",
        },
    )
    assert fixture_response.status_code == 201
    assert fixture_response.json()["away_team_id"] == canonical_response.json()["id"]
