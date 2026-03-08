from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.auth_deps import require_super_admin
from app.api.deps import get_db
from app.api.entitlements import get_team_or_404
from app.core.club_logos import CLUB_LOGOS_DIR, build_club_logo_url
from app.models.admin_audit_log import AdminAuditLog
from app.models.club import Club
from app.models.global_role import GlobalRole, GlobalRoleType
from app.models.player import Player
from app.models.team import Team
from app.models.team_membership import (
    TeamMembership,
    TeamRole,
    is_team_admin_role,
    normalize_team_role,
)
from app.models.user import User
from app.schemas.admin import (
    AdminAuditLogEntry,
    AdminClubOverview,
    AdminOverviewResponse,
    AdminTeamCreateRequest,
    AdminTeamOverview,
    AdminTeamOwnerOverview,
    AdminTeamUpdateRequest,
    AdminUserOverview,
    AssignTeamAdminRequest,
    ClubCreateRequest,
    ClubUpdateRequest,
    GlobalRoleAssignRequest,
)
from app.schemas.team import TeamMemberResponse

router = APIRouter(prefix="/admin", tags=["admin"])


def build_team_member_response(db: Session, membership: TeamMembership) -> TeamMemberResponse:
    user_email = db.scalar(select(User.email).where(User.id == membership.user_id))
    if not user_email:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing",
        )

    return TeamMemberResponse(
        id=membership.id,
        team_id=membership.team_id,
        user_id=membership.user_id,
        user_email=user_email,
        role=normalize_team_role(membership.role),
    )


def write_audit_log(
    db: Session,
    actor_user_id: str,
    action: str,
    target_type: str,
    target_id: str,
    metadata_json: dict | None = None,
) -> None:
    db.add(
        AdminAuditLog(
            actor_user_id=actor_user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            metadata_json=metadata_json,
        )
    )


def build_audit_log_response(db: Session, row: AdminAuditLog) -> AdminAuditLogEntry:
    actor_email = (
        db.scalar(select(User.email).where(User.id == row.actor_user_id)) or row.actor_user_id
    )
    return AdminAuditLogEntry(
        id=row.id,
        actor_user_id=row.actor_user_id,
        actor_user_email=actor_email,
        action=row.action,
        target_type=row.target_type,
        target_id=row.target_id,
        metadata_json=row.metadata_json,
        created_at=row.created_at,
    )


def count_super_admins(db: Session) -> int:
    return int(
        db.scalar(
            select(func.count()).select_from(GlobalRole).where(
                GlobalRole.role == GlobalRoleType.SUPER_ADMIN.value
            )
        )
        or 0
    )


@router.get("/overview", response_model=AdminOverviewResponse)
def get_admin_overview(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
) -> AdminOverviewResponse:
    users = db.scalars(select(User).order_by(User.email.asc())).all()
    user_roles_rows = db.execute(select(GlobalRole.user_id, GlobalRole.role)).all()
    roles_by_user: dict[str, list[str]] = {}
    for user_id, role in user_roles_rows:
        roles_by_user.setdefault(user_id, []).append(role)

    user_overview = [
        AdminUserOverview(
            id=user.id,
            email=user.email,
            global_roles=sorted(roles_by_user.get(user.id, [])),
        )
        for user in users
    ]

    clubs = db.scalars(select(Club).order_by(Club.name.asc())).all()
    club_overview = [
        AdminClubOverview(
            id=club.id,
            name=club.name,
            logo_url=build_club_logo_url(club.logo_filename),
        )
        for club in clubs
    ]

    teams_rows = db.execute(
        select(Team.id, Team.club_id, Team.name, Club.name)
        .join(Club, Club.id == Team.club_id)
        .order_by(Club.name.asc(), Team.name.asc())
    ).all()
    owner_rows = db.execute(
        select(TeamMembership.team_id, TeamMembership.user_id, TeamMembership.role, User.email)
        .join(User, User.id == TeamMembership.user_id)
        .order_by(User.email.asc())
    ).all()
    owners_by_team: dict[str, list[AdminTeamOwnerOverview]] = {}
    for team_id, user_id, role, email in owner_rows:
        if not is_team_admin_role(role):
            continue
        owners_by_team.setdefault(team_id, []).append(
            AdminTeamOwnerOverview(
                user_id=user_id,
                user_email=email,
                role=normalize_team_role(role),
            )
        )

    team_overview = [
        AdminTeamOverview(
            id=team_id,
            club_id=club_id,
            club_name=club_name,
            team_name=team_name,
            owners=owners_by_team.get(team_id, []),
        )
        for team_id, club_id, team_name, club_name in teams_rows
    ]

    return AdminOverviewResponse(users=user_overview, clubs=club_overview, teams=team_overview)


@router.post("/clubs", status_code=status.HTTP_201_CREATED)
def create_club(
    payload: ClubCreateRequest,
    db: Session = Depends(get_db),
    super_admin: User = Depends(require_super_admin),
) -> dict[str, str | None]:
    club = Club(name=payload.name.strip())
    db.add(club)

    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Club already exists",
        ) from exc

    write_audit_log(
        db=db,
        actor_user_id=super_admin.id,
        action="create_club",
        target_type="club",
        target_id=club.id,
        metadata_json={"club_name": club.name},
    )
    db.commit()
    return {"id": club.id, "name": club.name, "logo_url": build_club_logo_url(club.logo_filename)}


@router.get("/audit-logs", response_model=list[AdminAuditLogEntry])
def get_audit_logs(
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
) -> list[AdminAuditLogEntry]:
    safe_limit = min(max(limit, 1), 500)
    rows = db.scalars(
        select(AdminAuditLog).order_by(AdminAuditLog.created_at.desc()).limit(safe_limit)
    ).all()
    return [build_audit_log_response(db, row) for row in rows]


@router.post("/users/{user_id}/global-roles")
def assign_global_role(
    user_id: str,
    payload: GlobalRoleAssignRequest,
    db: Session = Depends(get_db),
    super_admin: User = Depends(require_super_admin),
) -> dict[str, str]:
    target_user = db.scalar(select(User).where(User.id == user_id))
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    existing = db.scalar(
        select(GlobalRole).where(
            GlobalRole.user_id == user_id,
            GlobalRole.role == payload.role.value,
        )
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Role already assigned")

    role = GlobalRole(user_id=user_id, role=payload.role.value)
    db.add(role)
    db.flush()

    write_audit_log(
        db=db,
        actor_user_id=super_admin.id,
        action="assign_global_role",
        target_type="global_role",
        target_id=role.id,
        metadata_json={"target_user_id": user_id, "role": payload.role.value},
    )
    db.commit()
    return {"id": role.id, "user_id": user_id, "role": payload.role.value}


@router.delete("/users/{user_id}/global-roles/{role}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_global_role(
    user_id: str,
    role: str,
    db: Session = Depends(get_db),
    super_admin: User = Depends(require_super_admin),
) -> None:
    target_user = db.scalar(select(User).where(User.id == user_id))
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    global_role = db.scalar(
        select(GlobalRole).where(
            GlobalRole.user_id == user_id,
            GlobalRole.role == role,
        )
    )
    if not global_role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role assignment not found",
        )

    if role == GlobalRoleType.SUPER_ADMIN.value and count_super_admins(db) <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove the last super admin",
        )

    write_audit_log(
        db=db,
        actor_user_id=super_admin.id,
        action="revoke_global_role",
        target_type="global_role",
        target_id=global_role.id,
        metadata_json={"target_user_id": user_id, "role": role},
    )
    db.delete(global_role)
    db.commit()


@router.patch("/clubs/{club_id}")
def update_club(
    club_id: str,
    payload: ClubUpdateRequest,
    db: Session = Depends(get_db),
    super_admin: User = Depends(require_super_admin),
) -> dict[str, str | None]:
    club = db.scalar(select(Club).where(Club.id == club_id))
    if not club:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Club not found")

    club.name = payload.name.strip()
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Club already exists",
        ) from exc

    write_audit_log(
        db=db,
        actor_user_id=super_admin.id,
        action="update_club",
        target_type="club",
        target_id=club.id,
        metadata_json={"club_name": club.name},
    )
    db.commit()
    return {"id": club.id, "name": club.name, "logo_url": build_club_logo_url(club.logo_filename)}


@router.delete("/clubs/{club_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_club(
    club_id: str,
    db: Session = Depends(get_db),
    super_admin: User = Depends(require_super_admin),
) -> None:
    club = db.scalar(select(Club).where(Club.id == club_id))
    if not club:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Club not found")

    has_teams = db.scalar(select(Team.id).where(Team.club_id == club_id).limit(1))
    if has_teams:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Club has teams and cannot be deleted",
        )

    logo_filename = club.logo_filename
    write_audit_log(
        db=db,
        actor_user_id=super_admin.id,
        action="delete_club",
        target_type="club",
        target_id=club.id,
        metadata_json={"club_name": club.name},
    )
    db.delete(club)
    db.commit()
    if logo_filename:
        logo_path = CLUB_LOGOS_DIR / logo_filename
        if logo_path.exists():
            logo_path.unlink()


@router.post("/teams/{team_id}/assign-team-admin", response_model=TeamMemberResponse)
def assign_team_admin(
    team_id: str,
    payload: AssignTeamAdminRequest,
    db: Session = Depends(get_db),
    super_admin: User = Depends(require_super_admin),
) -> TeamMemberResponse:
    get_team_or_404(db, team_id)
    target_email = payload.user_email.strip().lower()
    target_user = db.scalar(select(User).where(User.email == target_email))
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    membership = db.scalar(
        select(TeamMembership).where(
            TeamMembership.team_id == team_id,
            TeamMembership.user_id == target_user.id,
        )
    )
    if membership:
        membership.role = TeamRole.MANAGER.value
    else:
        membership = TeamMembership(
            team_id=team_id,
            user_id=target_user.id,
            role=normalize_team_role(TeamRole.MANAGER.value),
        )
        db.add(membership)
    db.flush()

    write_audit_log(
        db=db,
        actor_user_id=super_admin.id,
        action="assign_team_admin",
        target_type="team_membership",
        target_id=membership.id,
        metadata_json={
            "team_id": team_id,
            "target_user_id": target_user.id,
            "target_user_email": target_user.email,
            "assigned_role": TeamRole.MANAGER.value,
        },
    )

    db.commit()
    db.refresh(membership)
    return build_team_member_response(db, membership)


@router.delete("/teams/{team_id}/admins/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_team_admin(
    team_id: str,
    user_id: str,
    db: Session = Depends(get_db),
    super_admin: User = Depends(require_super_admin),
) -> None:
    get_team_or_404(db, team_id)

    membership = db.scalar(
        select(TeamMembership).where(
            TeamMembership.team_id == team_id,
            TeamMembership.user_id == user_id,
        )
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership not found")
    if not is_team_admin_role(membership.role):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is not a manager")

    write_audit_log(
        db=db,
        actor_user_id=super_admin.id,
        action="remove_team_admin",
        target_type="team_membership",
        target_id=membership.id,
        metadata_json={"team_id": team_id, "target_user_id": user_id},
    )
    db.delete(membership)
    db.commit()


@router.post("/teams", status_code=status.HTTP_201_CREATED)
def create_team(
    payload: AdminTeamCreateRequest,
    db: Session = Depends(get_db),
    super_admin: User = Depends(require_super_admin),
) -> dict[str, str]:
    club = db.scalar(select(Club).where(Club.id == payload.club_id))
    if not club:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Club not found")

    team = Team(club_id=club.id, name=payload.team_name.strip())
    db.add(team)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Team already exists for this club",
        ) from exc

    write_audit_log(
        db=db,
        actor_user_id=super_admin.id,
        action="create_team",
        target_type="team",
        target_id=team.id,
        metadata_json={"club_id": team.club_id, "team_name": team.name},
    )
    db.commit()
    return {"id": team.id, "club_id": team.club_id, "team_name": team.name}


@router.patch("/teams/{team_id}")
def update_team(
    team_id: str,
    payload: AdminTeamUpdateRequest,
    db: Session = Depends(get_db),
    super_admin: User = Depends(require_super_admin),
) -> dict[str, str]:
    team = db.scalar(select(Team).where(Team.id == team_id))
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    club = db.scalar(select(Club).where(Club.id == payload.club_id))
    if not club:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Club not found")

    team.club_id = club.id
    team.name = payload.team_name.strip()
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Team already exists for this club",
        ) from exc

    write_audit_log(
        db=db,
        actor_user_id=super_admin.id,
        action="update_team",
        target_type="team",
        target_id=team.id,
        metadata_json={"club_id": team.club_id, "team_name": team.name},
    )
    db.commit()
    return {"id": team.id, "club_id": team.club_id, "team_name": team.name}


@router.delete("/teams/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_team(
    team_id: str,
    db: Session = Depends(get_db),
    super_admin: User = Depends(require_super_admin),
) -> None:
    team = db.scalar(select(Team).where(Team.id == team_id))
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    write_audit_log(
        db=db,
        actor_user_id=super_admin.id,
        action="delete_team",
        target_type="team",
        target_id=team.id,
        metadata_json={"club_id": team.club_id, "team_name": team.name},
    )
    db.execute(delete(Player).where(Player.team_id == team_id))
    db.execute(delete(TeamMembership).where(TeamMembership.team_id == team_id))
    db.delete(team)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Team has linked match data and cannot be deleted",
        ) from exc
