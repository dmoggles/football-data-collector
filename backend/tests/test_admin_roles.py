import uuid

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.session import SessionLocal
from app.main import app
from app.models.club import Club
from app.models.global_role import GlobalRole, GlobalRoleType
from app.models.team import Team
from app.models.user import User

client = TestClient(app)


def _register(email_prefix: str, password: str = "Password123!") -> tuple[str, str]:
    email = f"{email_prefix}-{uuid.uuid4().hex[:10]}@test.local"
    register_response = client.post("/auth/register", json={"email": email, "password": password})
    assert register_response.status_code == 201
    return email, password


def _login(email: str, password: str) -> None:
    login_response = client.post("/auth/login", json={"email": email, "password": password})
    assert login_response.status_code == 200


def _grant_super_admin(email: str) -> None:
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        assert user is not None
        db.add(GlobalRole(user_id=user.id, role=GlobalRoleType.SUPER_ADMIN.value))
        db.commit()


def test_super_admin_can_create_club() -> None:
    super_email, super_password = _register("super-club")
    _grant_super_admin(super_email)
    _login(super_email, super_password)

    club_name = f"HMH-{uuid.uuid4().hex[:6]}"
    response = client.post("/admin/clubs", json={"name": club_name})
    assert response.status_code == 201
    assert response.json()["name"] == club_name


def test_super_admin_can_update_club() -> None:
    super_email, super_password = _register("super-club-update")
    _grant_super_admin(super_email)
    _login(super_email, super_password)

    create_response = client.post("/admin/clubs", json={"name": f"Club-{uuid.uuid4().hex[:6]}"})
    assert create_response.status_code == 201
    club_id = create_response.json()["id"]

    updated_name = f"Updated-{uuid.uuid4().hex[:6]}"
    update_response = client.patch(f"/admin/clubs/{club_id}", json={"name": updated_name})
    assert update_response.status_code == 200
    assert update_response.json()["name"] == updated_name


def test_super_admin_can_delete_empty_club() -> None:
    super_email, super_password = _register("super-club-delete")
    _grant_super_admin(super_email)
    _login(super_email, super_password)

    create_response = client.post("/admin/clubs", json={"name": f"DeleteMe-{uuid.uuid4().hex[:6]}"})
    assert create_response.status_code == 201
    club_id = create_response.json()["id"]

    delete_response = client.delete(f"/admin/clubs/{club_id}")
    assert delete_response.status_code == 204


def test_super_admin_cannot_delete_club_with_teams() -> None:
    super_email, super_password = _register("super-club-delete-guard")
    _grant_super_admin(super_email)
    _login(super_email, super_password)

    club_name = f"Guard-{uuid.uuid4().hex[:6]}"
    create_club_response = client.post("/admin/clubs", json={"name": club_name})
    assert create_club_response.status_code == 201
    club_id = create_club_response.json()["id"]

    owner_email, owner_password = _register("club-owner")
    _login(owner_email, owner_password)
    create_team_response = client.post(
        "/teams",
        json={"club_name": club_name, "team_name": f"T-{uuid.uuid4().hex[:4]}"},
    )
    assert create_team_response.status_code == 201

    _login(super_email, super_password)
    delete_response = client.delete(f"/admin/clubs/{club_id}")
    assert delete_response.status_code == 409


def test_super_admin_can_assign_team_admin_for_existing_team() -> None:
    super_email, super_password = _register("super-assign")
    _grant_super_admin(super_email)
    target_email, _ = _register("target-admin")

    with SessionLocal() as db:
        club = Club(name=f"Claimable-{uuid.uuid4().hex[:6]}")
        db.add(club)
        db.flush()
        team = Team(club_id=club.id, name="U14")
        db.add(team)
        db.commit()
        db.refresh(team)
        team_id = team.id

    _login(super_email, super_password)
    response = client.post(
        f"/admin/teams/{team_id}/assign-team-admin",
        json={"user_email": target_email},
    )
    assert response.status_code == 200
    assert response.json()["role"] == "team_admin"
    assert response.json()["user_email"] == target_email


def test_super_admin_can_create_team() -> None:
    super_email, super_password = _register("super-team-create")
    _grant_super_admin(super_email)

    with SessionLocal() as db:
        club = Club(name=f"CreateTeam-{uuid.uuid4().hex[:6]}")
        db.add(club)
        db.commit()
        db.refresh(club)
        club_id = club.id

    _login(super_email, super_password)
    response = client.post(
        "/admin/teams",
        json={"club_id": club_id, "team_name": "U11 Bobtails"},
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["club_id"] == club_id
    assert payload["team_name"] == "U11 Bobtails"


def test_super_admin_can_update_team() -> None:
    super_email, super_password = _register("super-team-update")
    _grant_super_admin(super_email)

    with SessionLocal() as db:
        club_from = Club(name=f"From-{uuid.uuid4().hex[:6]}")
        club_to = Club(name=f"To-{uuid.uuid4().hex[:6]}")
        db.add(club_from)
        db.add(club_to)
        db.flush()
        team = Team(club_id=club_from.id, name="U12")
        db.add(team)
        db.commit()
        db.refresh(team)
        team_id = team.id
        club_to_id = club_to.id

    _login(super_email, super_password)
    response = client.patch(
        f"/admin/teams/{team_id}",
        json={"club_id": club_to_id, "team_name": "U13"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == team_id
    assert payload["club_id"] == club_to_id
    assert payload["team_name"] == "U13"


def test_super_admin_can_delete_team_without_match_data() -> None:
    super_email, super_password = _register("super-team-delete")
    _grant_super_admin(super_email)

    with SessionLocal() as db:
        club = Club(name=f"DeleteTeam-{uuid.uuid4().hex[:6]}")
        db.add(club)
        db.flush()
        team = Team(club_id=club.id, name="U15")
        db.add(team)
        db.commit()
        db.refresh(team)
        team_id = team.id

    _login(super_email, super_password)
    delete_response = client.delete(f"/admin/teams/{team_id}")
    assert delete_response.status_code == 204


def test_super_admin_can_view_admin_overview() -> None:
    super_email, super_password = _register("super-overview")
    _grant_super_admin(super_email)
    _login(super_email, super_password)

    response = client.get("/admin/overview")
    assert response.status_code == 200
    payload = response.json()
    assert "users" in payload
    assert "clubs" in payload
    assert "teams" in payload
    assert any(user["email"] == super_email for user in payload["users"])


def test_non_super_admin_cannot_view_admin_overview() -> None:
    email, password = _register("nonsuper-overview")
    _login(email, password)

    response = client.get("/admin/overview")
    assert response.status_code == 403
