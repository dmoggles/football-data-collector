from fastapi import Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.auth_deps import get_current_user
from app.api.deps import get_db
from app.api.permissions import Permission, get_team_membership, require_permission
from app.models.team import Team
from app.models.team_membership import (
    TeamMembership,
    TeamRole,
    normalize_team_role,
)
from app.models.user import User


def get_team_or_404(db: Session, team_id: str) -> Team:
    team = db.scalar(select(Team).where(Team.id == team_id))
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    return team


def get_membership(db: Session, team_id: str, user_id: str) -> TeamMembership | None:
    return get_team_membership(db, team_id, user_id)


def ensure_team_member(db: Session, team_id: str, user_id: str) -> TeamMembership:
    get_team_or_404(db, team_id)
    require_permission(db=db, user_id=user_id, permission=Permission.TEAM_MEMBER, team_id=team_id)
    membership = get_membership(db, team_id, user_id)
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Membership not found",
        )
    return membership


def ensure_team_admin(db: Session, team_id: str, user_id: str) -> TeamMembership:
    get_team_or_404(db, team_id)
    require_permission(db=db, user_id=user_id, permission=Permission.TEAM_ADMIN, team_id=team_id)
    membership = get_membership(db, team_id, user_id)
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Membership not found",
        )
    return membership


def require_team_member(
    team_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TeamMembership:
    return ensure_team_member(db, team_id, user.id)


def require_team_admin(
    team_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TeamMembership:
    return ensure_team_admin(db, team_id, user.id)


def count_team_admins(db: Session, team_id: str) -> int:
    roles = [TeamRole.TEAM_ADMIN.value, TeamRole.ADMIN.value]
    query = select(func.count()).select_from(TeamMembership).where(
        TeamMembership.team_id == team_id,
        TeamMembership.role.in_(roles),
    )
    return int(db.scalar(query) or 0)


def set_membership_role(membership: TeamMembership, role: TeamRole) -> None:
    membership.role = normalize_team_role(role.value)
