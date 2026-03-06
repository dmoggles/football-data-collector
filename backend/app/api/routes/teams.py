from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.auth_deps import get_current_user
from app.api.deps import get_db
from app.api.entitlements import (
    count_team_admins,
    ensure_team_admin,
    get_team_or_404,
    require_team_admin,
)
from app.models.club import Club
from app.models.player import Player
from app.models.team import Team
from app.models.team_membership import TeamMembership, TeamRole
from app.models.user import User
from app.schemas.team import (
    TeamCreateRequest,
    TeamMemberCreateRequest,
    TeamMemberResponse,
    TeamMemberUpdateRequest,
    TeamResponse,
    TeamUpdateRequest,
)

router = APIRouter(prefix="/teams", tags=["teams"])


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
        role=membership.role,
    )


def build_team_response(team: Team, club_name: str) -> TeamResponse:
    return TeamResponse(
        id=team.id,
        club_id=team.club_id,
        club_name=club_name,
        team_name=team.name,
    )


def get_or_create_club(db: Session, club_name: str) -> Club:
    normalized_name = club_name.strip()
    club = db.scalar(select(Club).where(Club.name == normalized_name))
    if club:
        return club

    club = Club(name=normalized_name)
    db.add(club)
    db.flush()
    return club


@router.get("", response_model=list[TeamResponse])
def list_teams(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TeamResponse]:
    query = (
        select(Team, Club.name)
        .join(Club, Club.id == Team.club_id)
        .join(TeamMembership, TeamMembership.team_id == Team.id)
        .where(TeamMembership.user_id == user.id)
        .order_by(Club.name.asc(), Team.name.asc())
    )
    rows = db.execute(query).all()
    return [build_team_response(team, club_name) for team, club_name in rows]


@router.post("", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
def create_team(
    payload: TeamCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TeamResponse:
    club = get_or_create_club(db, payload.club_name)
    team = Team(name=payload.team_name.strip(), club_id=club.id)
    db.add(team)
    db.flush()

    membership = TeamMembership(team_id=team.id, user_id=user.id, role=TeamRole.ADMIN.value)
    db.add(membership)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Team already exists for this club",
        ) from exc

    db.refresh(team)
    return build_team_response(team, club.name)


@router.patch("/{team_id}", response_model=TeamResponse)
def update_team(
    team_id: str,
    payload: TeamUpdateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TeamResponse:
    ensure_team_admin(db, team_id, user.id)
    team = get_team_or_404(db, team_id)
    club = get_or_create_club(db, payload.club_name)

    team.club_id = club.id
    team.name = payload.team_name.strip()

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Team already exists for this club",
        ) from exc

    db.refresh(team)
    return build_team_response(team, club.name)


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_team(
    team_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    ensure_team_admin(db, team_id, user.id)

    db.execute(delete(Player).where(Player.team_id == team_id))
    db.execute(delete(TeamMembership).where(TeamMembership.team_id == team_id))
    db.execute(delete(Team).where(Team.id == team_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{team_id}/members", response_model=list[TeamMemberResponse])
def list_team_members(
    team_id: str,
    _: TeamMembership = Depends(require_team_admin),
    db: Session = Depends(get_db),
) -> list[TeamMemberResponse]:
    query = (
        select(TeamMembership)
        .where(TeamMembership.team_id == team_id)
        .order_by(TeamMembership.created_at.asc())
    )
    memberships = db.scalars(query).all()
    return [build_team_member_response(db, membership) for membership in memberships]


@router.post(
    "/{team_id}/members",
    response_model=TeamMemberResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_team_member(
    team_id: str,
    payload: TeamMemberCreateRequest,
    _: TeamMembership = Depends(require_team_admin),
    db: Session = Depends(get_db),
) -> TeamMemberResponse:
    target_email = payload.user_email.strip().lower()
    target_user = db.scalar(select(User).where(User.email == target_email))
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    membership = TeamMembership(team_id=team_id, user_id=target_user.id, role=payload.role.value)
    db.add(membership)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User already assigned to team",
        ) from exc

    db.refresh(membership)
    return build_team_member_response(db, membership)


@router.patch("/{team_id}/members/{membership_id}", response_model=TeamMemberResponse)
def update_team_member(
    team_id: str,
    membership_id: str,
    payload: TeamMemberUpdateRequest,
    acting_membership: TeamMembership = Depends(require_team_admin),
    db: Session = Depends(get_db),
) -> TeamMemberResponse:
    query = select(TeamMembership).where(
        TeamMembership.id == membership_id,
        TeamMembership.team_id == team_id,
    )
    membership = db.scalar(query)
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership not found")

    if (
        membership.role == TeamRole.ADMIN.value
        and payload.role.value != TeamRole.ADMIN.value
        and count_team_admins(db, team_id) <= 1
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Team must have at least one admin",
        )

    if (
        membership.user_id == acting_membership.user_id
        and payload.role.value != TeamRole.ADMIN.value
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot demote yourself",
        )

    membership.role = payload.role.value
    db.commit()
    db.refresh(membership)
    return build_team_member_response(db, membership)


@router.delete("/{team_id}/members/{membership_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_team_member(
    team_id: str,
    membership_id: str,
    acting_membership: TeamMembership = Depends(require_team_admin),
    db: Session = Depends(get_db),
) -> Response:
    query = select(TeamMembership).where(
        TeamMembership.id == membership_id,
        TeamMembership.team_id == team_id,
    )
    membership = db.scalar(query)
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership not found")

    if membership.role == TeamRole.ADMIN.value and count_team_admins(db, team_id) <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Team must have at least one admin",
        )

    if membership.user_id == acting_membership.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot remove yourself",
        )

    db.delete(membership)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
