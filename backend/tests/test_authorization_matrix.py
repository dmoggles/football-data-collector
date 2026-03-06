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


def _create_club_as_super_admin(club_name: str) -> None:
    email, password = _register("auth-matrix-super")
    _grant_super_admin(email)
    _login(email, password)
    response = client.post("/admin/clubs", json={"name": club_name})
    assert response.status_code in [201, 409]


def _create_team_as_owner(club_name: str, team_name: str) -> tuple[str, str, str]:
    owner_email, owner_password = _register("auth-matrix-owner")
    _login(owner_email, owner_password)
    response = client.post("/teams", json={"club_name": club_name, "team_name": team_name})
    assert response.status_code == 201
    return response.json()["id"], owner_email, owner_password


def test_anonymous_cannot_access_protected_routes() -> None:
    teams_response = client.get("/teams")
    assert teams_response.status_code == 401

    admin_response = client.get("/admin/overview")
    assert admin_response.status_code == 401


def test_authenticated_non_super_admin_cannot_access_admin_routes() -> None:
    email, password = _register("auth-matrix-user")
    _login(email, password)

    overview_response = client.get("/admin/overview")
    assert overview_response.status_code == 403

    audit_response = client.get("/admin/audit-logs")
    assert audit_response.status_code == 403

    create_club_response = client.post("/admin/clubs", json={"name": f"C-{uuid.uuid4().hex[:6]}"})
    assert create_club_response.status_code == 403


def test_team_member_read_access_but_no_admin_access() -> None:
    club_name = f"MatrixClub-{uuid.uuid4().hex[:6]}"
    team_name = f"MatrixTeam-{uuid.uuid4().hex[:4]}"
    _create_club_as_super_admin(club_name)
    team_id, owner_email, owner_password = _create_team_as_owner(club_name, team_name)

    data_email, data_password = _register("auth-matrix-data")

    _login(owner_email, owner_password)
    add_member_response = client.post(
        f"/teams/{team_id}/members",
        json={"user_email": data_email, "role": "data_enterer"},
    )
    assert add_member_response.status_code == 201

    create_player_response = client.post(
        "/players",
        json={
            "team_id": team_id,
            "display_name": "Matrix Player",
            "shirt_number": 7,
            "position": "CM",
        },
    )
    assert create_player_response.status_code == 201

    _login(data_email, data_password)

    list_players_response = client.get(f"/players?team_id={team_id}")
    assert list_players_response.status_code == 200
    assert len(list_players_response.json()) == 1

    list_members_response = client.get(f"/teams/{team_id}/members")
    assert list_members_response.status_code == 403

    update_team_response = client.patch(
        f"/teams/{team_id}",
        json={"club_name": club_name, "team_name": f"Blocked-{uuid.uuid4().hex[:3]}"},
    )
    assert update_team_response.status_code == 403

    add_player_response = client.post(
        "/players",
        json={
            "team_id": team_id,
            "display_name": "Should Fail",
            "shirt_number": 8,
            "position": "ST",
        },
    )
    assert add_player_response.status_code == 403


def test_non_member_cannot_access_team_scoped_data() -> None:
    club_name = f"MatrixClubB-{uuid.uuid4().hex[:6]}"
    team_name = f"MatrixTeamB-{uuid.uuid4().hex[:4]}"
    _create_club_as_super_admin(club_name)
    team_id, owner_email, owner_password = _create_team_as_owner(club_name, team_name)

    _login(owner_email, owner_password)
    create_player_response = client.post(
        "/players",
        json={
            "team_id": team_id,
            "display_name": "Owner Player",
            "shirt_number": 11,
            "position": "RW",
        },
    )
    assert create_player_response.status_code == 201

    outsider_email, outsider_password = _register("auth-matrix-outsider")
    _login(outsider_email, outsider_password)
    response = client.get(f"/players?team_id={team_id}")
    assert response.status_code == 403
