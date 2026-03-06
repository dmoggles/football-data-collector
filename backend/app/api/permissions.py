from enum import StrEnum

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.global_role import GlobalRole, GlobalRoleType
from app.models.team_membership import TeamMembership, is_team_admin_role


class Permission(StrEnum):
    SUPER_ADMIN = "super_admin"
    TEAM_MEMBER = "team_member"
    TEAM_ADMIN = "team_admin"


def get_global_role(db: Session, user_id: str, role: str) -> GlobalRole | None:
    return db.scalar(
        select(GlobalRole).where(
            GlobalRole.user_id == user_id,
            GlobalRole.role == role,
        )
    )


def get_team_membership(db: Session, team_id: str, user_id: str) -> TeamMembership | None:
    return db.scalar(
        select(TeamMembership).where(
            TeamMembership.team_id == team_id,
            TeamMembership.user_id == user_id,
        )
    )


def has_permission(
    db: Session,
    user_id: str,
    permission: Permission,
    team_id: str | None = None,
) -> bool:
    if permission == Permission.SUPER_ADMIN:
        return (
            get_global_role(db, user_id, GlobalRoleType.SUPER_ADMIN.value) is not None
        )

    if not team_id:
        raise ValueError("team_id is required for team-scoped permissions")

    membership = get_team_membership(db, team_id, user_id)
    if permission == Permission.TEAM_MEMBER:
        return membership is not None
    if permission == Permission.TEAM_ADMIN:
        return membership is not None and is_team_admin_role(membership.role)

    return False


def require_permission(
    db: Session,
    user_id: str,
    permission: Permission,
    team_id: str | None = None,
) -> None:
    if has_permission(db=db, user_id=user_id, permission=permission, team_id=team_id):
        return

    if permission == Permission.SUPER_ADMIN:
        detail = "Super admin access required"
    elif permission == Permission.TEAM_ADMIN:
        detail = "Admin access required"
    else:
        detail = "Not a team member"

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
