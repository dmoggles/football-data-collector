from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, delete, exists, or_, select
from sqlalchemy.orm import Session, aliased

from app.api.auth_deps import get_current_user
from app.api.deps import get_db
from app.api.entitlements import ensure_team_admin, get_team_or_404
from app.models.club import Club
from app.models.coaching_note import CoachingNote
from app.models.event import Event
from app.models.match import Match
from app.models.match_plan import MatchPlan
from app.models.match_plan_player import MatchPlanPlayer
from app.models.match_plan_substitution import MatchPlanSubstitution
from app.models.match_plan_substitution_segment import MatchPlanSubstitutionSegment
from app.models.match_squad import MatchSquad
from app.models.team import Team
from app.models.team_membership import TeamMembership, is_team_admin_role
from app.models.user import User
from app.schemas.match import MatchCreateRequest, MatchResponse, MatchUpdateRequest

router = APIRouter(prefix="/matches", tags=["matches"])


def build_match_response(
    match: Match,
    home_team_name: str,
    home_club_name: str,
    away_team_name: str,
    away_club_name: str,
    can_manage: bool,
) -> MatchResponse:
    return MatchResponse(
        id=match.id,
        home_team_id=match.home_team_id,
        home_team_name=home_team_name,
        home_club_name=home_club_name,
        away_team_id=match.away_team_id,
        away_team_name=away_team_name,
        away_club_name=away_club_name,
        format=match.format,
        period_format=match.period_format,
        period_length_minutes=match.period_length_minutes,
        kickoff_at=match.kickoff_at,
        status=match.status,
        can_manage=can_manage,
    )


def get_match_or_404(db: Session, match_id: str) -> Match:
    match = db.scalar(select(Match).where(Match.id == match_id))
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fixture not found")
    return match


def ensure_fixture_view_access(db: Session, match: Match, user_id: str) -> None:
    has_access = db.scalar(
        select(exists().where(
            and_(
                TeamMembership.user_id == user_id,
                or_(
                    TeamMembership.team_id == match.home_team_id,
                    TeamMembership.team_id == match.away_team_id,
                ),
            )
        ))
    )
    if not bool(has_access):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


def list_user_admin_team_ids(db: Session, user_id: str) -> set[str]:
    rows = db.execute(
        select(TeamMembership.team_id, TeamMembership.role).where(TeamMembership.user_id == user_id)
    ).all()
    return {team_id for team_id, role in rows if is_team_admin_role(role)}


def ensure_fixture_manage_access(db: Session, match: Match, user_id: str) -> None:
    home_role = db.scalar(
        select(TeamMembership.role).where(
            TeamMembership.user_id == user_id,
            TeamMembership.team_id == match.home_team_id,
        )
    )
    away_role = db.scalar(
        select(TeamMembership.role).where(
            TeamMembership.user_id == user_id,
            TeamMembership.team_id == match.away_team_id,
        )
    )
    if not bool((home_role and is_team_admin_role(home_role)) or (away_role and is_team_admin_role(away_role))):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Team admin access required")


def ensure_fixture_create_access(db: Session, home_team_id: str, away_team_id: str, user_id: str) -> None:
    home_role = db.scalar(
        select(TeamMembership.role).where(
            TeamMembership.user_id == user_id,
            TeamMembership.team_id == home_team_id,
        )
    )
    away_role = db.scalar(
        select(TeamMembership.role).where(
            TeamMembership.user_id == user_id,
            TeamMembership.team_id == away_team_id,
        )
    )
    if not bool((home_role and is_team_admin_role(home_role)) or (away_role and is_team_admin_role(away_role))):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Team admin access required")


@router.get("", response_model=list[MatchResponse])
def list_matches(
    team_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[MatchResponse]:
    home_team = aliased(Team)
    away_team = aliased(Team)
    home_club = aliased(Club)
    away_club = aliased(Club)
    match_visibility = aliased(TeamMembership)

    query = (
        select(
            Match,
            home_team.name,
            home_club.name,
            away_team.name,
            away_club.name,
        )
        .join(home_team, home_team.id == Match.home_team_id)
        .join(home_club, home_club.id == home_team.club_id)
        .join(away_team, away_team.id == Match.away_team_id)
        .join(away_club, away_club.id == away_team.club_id)
        # MySQL doesn't support "NULLS LAST"; emulate it by sorting null kickoff rows last.
        .order_by(Match.kickoff_at.is_(None), Match.kickoff_at.asc(), Match.created_at.desc())
    )
    if team_id:
        membership_role = db.scalar(
            select(TeamMembership.role).where(
                TeamMembership.user_id == user.id,
                TeamMembership.team_id == team_id,
            )
        )
        if not membership_role:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        query = query.where(or_(Match.home_team_id == team_id, Match.away_team_id == team_id))
    else:
        query = query.where(
            exists(
                select(1).where(
                    and_(
                        match_visibility.user_id == user.id,
                        or_(
                            match_visibility.team_id == Match.home_team_id,
                            match_visibility.team_id == Match.away_team_id,
                        ),
                    )
                )
            )
        )

    admin_team_ids = list_user_admin_team_ids(db, user.id)
    rows = db.execute(query).all()
    return [
        build_match_response(
            match=match,
            home_team_name=home_team_name,
            home_club_name=home_club_name,
            away_team_name=away_team_name,
            away_club_name=away_club_name,
            can_manage=match.home_team_id in admin_team_ids or match.away_team_id in admin_team_ids,
        )
        for match, home_team_name, home_club_name, away_team_name, away_club_name in rows
    ]


@router.post("", response_model=MatchResponse, status_code=status.HTTP_201_CREATED)
def create_match(
    payload: MatchCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MatchResponse:
    if payload.home_team_id == payload.away_team_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Home and away teams must differ",
        )

    ensure_fixture_create_access(db, payload.home_team_id, payload.away_team_id, user.id)
    home_team_record = get_team_or_404(db, payload.home_team_id)
    away_team_record = get_team_or_404(db, payload.away_team_id)

    home_club_name = db.scalar(select(Club.name).where(Club.id == home_team_record.club_id)) or ""
    away_club_name = db.scalar(select(Club.name).where(Club.id == away_team_record.club_id)) or ""

    fixture = Match(
        user_id=user.id,
        home_team_id=payload.home_team_id,
        away_team_id=payload.away_team_id,
        format=payload.format.value,
        period_format=payload.period_format.value,
        period_length_minutes=payload.period_length_minutes,
        kickoff_at=payload.kickoff_at,
        status=payload.status.strip(),
    )
    db.add(fixture)
    db.commit()
    db.refresh(fixture)
    return build_match_response(
        match=fixture,
        home_team_name=home_team_record.name,
        home_club_name=home_club_name,
        away_team_name=away_team_record.name,
        away_club_name=away_club_name,
        can_manage=True,
    )


@router.patch("/{match_id}", response_model=MatchResponse)
def update_match(
    match_id: str,
    payload: MatchUpdateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MatchResponse:
    if payload.home_team_id == payload.away_team_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Home and away teams must differ",
        )

    fixture = get_match_or_404(db, match_id)
    ensure_fixture_manage_access(db, fixture, user.id)
    ensure_team_admin(db, payload.home_team_id, user.id)

    home_team_record = get_team_or_404(db, payload.home_team_id)
    away_team_record = get_team_or_404(db, payload.away_team_id)
    home_club_name = db.scalar(select(Club.name).where(Club.id == home_team_record.club_id)) or ""
    away_club_name = db.scalar(select(Club.name).where(Club.id == away_team_record.club_id)) or ""

    fixture.home_team_id = payload.home_team_id
    fixture.away_team_id = payload.away_team_id
    fixture.format = payload.format.value
    fixture.period_format = payload.period_format.value
    fixture.period_length_minutes = payload.period_length_minutes
    fixture.kickoff_at = payload.kickoff_at
    fixture.status = payload.status.strip()
    db.commit()
    db.refresh(fixture)
    return build_match_response(
        match=fixture,
        home_team_name=home_team_record.name,
        home_club_name=home_club_name,
        away_team_name=away_team_record.name,
        away_club_name=away_club_name,
        can_manage=True,
    )


@router.delete("/{match_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_match(
    match_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    fixture = get_match_or_404(db, match_id)
    ensure_fixture_manage_access(db, fixture, user.id)

    plan_id_subquery = select(MatchPlan.id).where(MatchPlan.match_id == match_id)
    segment_id_subquery = select(MatchPlanSubstitutionSegment.id).where(
        MatchPlanSubstitutionSegment.match_plan_id.in_(plan_id_subquery)
    )

    db.execute(
        delete(MatchPlanSubstitution).where(
            MatchPlanSubstitution.segment_id.in_(segment_id_subquery)
        )
    )
    db.execute(
        delete(MatchPlanSubstitutionSegment).where(
            MatchPlanSubstitutionSegment.match_plan_id.in_(plan_id_subquery)
        )
    )
    db.execute(
        delete(MatchPlanPlayer).where(MatchPlanPlayer.match_plan_id.in_(plan_id_subquery))
    )
    db.execute(delete(MatchPlan).where(MatchPlan.match_id == match_id))

    db.execute(delete(MatchSquad).where(MatchSquad.match_id == match_id))
    db.execute(delete(Event).where(Event.match_id == match_id))
    db.execute(delete(CoachingNote).where(CoachingNote.match_id == match_id))
    db.delete(fixture)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
