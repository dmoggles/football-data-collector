from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from app.api.auth_deps import get_current_user
from app.api.deps import get_db
from app.api.entitlements import ensure_team_admin, get_team_or_404
from app.models.club import Club
from app.models.match import Match
from app.models.match_plan import MatchPlan
from app.models.match_plan_player import MatchPlanPlayer
from app.models.match_plan_substitution import MatchPlanSubstitution
from app.models.match_plan_substitution_segment import MatchPlanSubstitutionSegment
from app.models.player import Player
from app.models.user import User
from app.schemas.match_prep import (
    MatchPrepFixtureResponse,
    MatchPrepPlanResponse,
    MatchPrepPlanUpsertRequest,
    MatchPrepPlayerSelectionResponse,
    MatchPrepSubstitutionSegmentResponse,
    MatchPrepSubstitutionSwapResponse,
)
from app.services.formations import (
    get_formation_options,
    get_required_starting_count,
    get_slot_ids,
    is_allowed_formation,
)

router = APIRouter(prefix="/match-prep", tags=["match-prep"])

def now_utc() -> datetime:
    return datetime.now(UTC)


def get_match_or_404(db: Session, match_id: str) -> Match:
    match = db.scalar(select(Match).where(Match.id == match_id))
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fixture not found")
    return match


def ensure_match_contains_team(match: Match, team_id: str) -> None:
    if team_id not in [match.home_team_id, match.away_team_id]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Team is not part of this fixture")


def ensure_formation_valid(match_format: str, formation: str) -> None:
    if not is_allowed_formation(match_format, formation):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid formation for fixture format")


def get_total_match_minutes(match: Match) -> int:
    period_length = max(1, int(match.period_length_minutes))
    period_format = (match.period_format or "").lower()
    if period_format == "quarters":
        return period_length * 4
    if period_format == "halves":
        return period_length * 2
    return period_length


def build_plan_response(db: Session, match: Match, team_id: str, plan: MatchPlan | None) -> MatchPrepPlanResponse:
    players = db.scalars(select(Player).where(Player.team_id == team_id).order_by(Player.display_name.asc())).all()
    selection_by_player_id: dict[str, MatchPlanPlayer] = {}
    if plan:
        rows = db.scalars(
            select(MatchPlanPlayer).where(MatchPlanPlayer.match_plan_id == plan.id)
        ).all()
        selection_by_player_id = {row.player_id: row for row in rows}

    player_responses = [
        MatchPrepPlayerSelectionResponse(
            player_id=player.id,
            player_name=player.display_name,
            shirt_number=player.shirt_number,
            position=player.position,
            is_available=selection_by_player_id.get(player.id).is_available if player.id in selection_by_player_id else True,
            in_matchday_squad=selection_by_player_id.get(player.id).is_available if player.id in selection_by_player_id else True,
            is_starting=selection_by_player_id.get(player.id).is_starting if player.id in selection_by_player_id else False,
            lineup_slot=selection_by_player_id.get(player.id).lineup_slot if player.id in selection_by_player_id else None,
        )
        for player in players
    ]
    players_by_id = {player.id: player for player in players}

    substitution_segment_responses: list[MatchPrepSubstitutionSegmentResponse] = []
    if plan:
        segments = db.scalars(
            select(MatchPlanSubstitutionSegment)
            .where(MatchPlanSubstitutionSegment.match_plan_id == plan.id)
            .order_by(MatchPlanSubstitutionSegment.segment_order.asc())
        ).all()
        segment_ids = [segment.id for segment in segments]
        substitutions_by_segment_id: dict[str, list[MatchPlanSubstitution]] = {}
        if segment_ids:
            substitutions = db.scalars(
                select(MatchPlanSubstitution)
                .where(MatchPlanSubstitution.segment_id.in_(segment_ids))
                .order_by(MatchPlanSubstitution.created_at.asc())
            ).all()
            for row in substitutions:
                substitutions_by_segment_id.setdefault(row.segment_id, []).append(row)

        for segment in segments:
            swaps: list[MatchPrepSubstitutionSwapResponse] = []
            for swap in substitutions_by_segment_id.get(segment.id, []):
                player_out = players_by_id.get(swap.player_out_id)
                player_in = players_by_id.get(swap.player_in_id)
                if not player_out or not player_in:
                    continue
                swaps.append(
                    MatchPrepSubstitutionSwapResponse(
                        player_out_id=player_out.id,
                        player_out_name=player_out.display_name,
                        player_out_shirt_number=player_out.shirt_number,
                        player_in_id=player_in.id,
                        player_in_name=player_in.display_name,
                        player_in_shirt_number=player_in.shirt_number,
                    )
                )
            substitution_segment_responses.append(
                MatchPrepSubstitutionSegmentResponse(
                    segment_index=segment.segment_order,
                    end_minute=segment.end_minute,
                    substitutions=swaps,
                )
            )

    formation_options = get_formation_options(match.format)
    default_formation = formation_options[0] if formation_options else ""
    return MatchPrepPlanResponse(
        match_id=match.id,
        team_id=team_id,
        formation=plan.formation if plan else default_formation,
        format=match.format,
        total_match_minutes=get_total_match_minutes(match),
        required_starting_count=get_required_starting_count(match.format),
        formation_options=formation_options,
        players=player_responses,
        substitution_segments=substitution_segment_responses,
    )


@router.get("/fixtures", response_model=list[MatchPrepFixtureResponse])
def list_upcoming_match_prep_fixtures(
    team_id: str = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[MatchPrepFixtureResponse]:
    ensure_team_admin(db, team_id, user.id)
    team = get_team_or_404(db, team_id)
    team_display = f"{db.scalar(select(Club.name).where(Club.id == team.club_id)) or ''} {team.name}".strip()

    rows = db.scalars(
        select(Match).where(
            or_(Match.home_team_id == team_id, Match.away_team_id == team_id)
        ).order_by(Match.kickoff_at.is_(None), Match.kickoff_at.asc(), Match.created_at.desc())
    ).all()

    now = now_utc()
    results: list[MatchPrepFixtureResponse] = []
    for match in rows:
        kickoff = match.kickoff_at
        if kickoff and kickoff.tzinfo is None:
            kickoff = kickoff.replace(tzinfo=UTC)
        if kickoff and kickoff < now and match.status.lower() in ["final", "cancelled"]:
            continue

        opponent_team_id = match.away_team_id if match.home_team_id == team_id else match.home_team_id
        opponent_team = get_team_or_404(db, opponent_team_id)
        opponent_club_name = db.scalar(select(Club.name).where(Club.id == opponent_team.club_id)) or ""
        opponent_display = f"{opponent_club_name} {opponent_team.name}".strip()
        results.append(
            MatchPrepFixtureResponse(
                id=match.id,
                team_id=team_id,
                team_name=team_display,
                opponent_team_id=opponent_team_id,
                opponent_team_name=opponent_display,
                kickoff_at=kickoff,
                status=match.status,
                format=match.format,
            )
        )
    return results


@router.get("/plan", response_model=MatchPrepPlanResponse)
def get_match_prep_plan(
    match_id: str = Query(...),
    team_id: str = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MatchPrepPlanResponse:
    ensure_team_admin(db, team_id, user.id)
    match = get_match_or_404(db, match_id)
    ensure_match_contains_team(match, team_id)
    plan = db.scalar(
        select(MatchPlan).where(MatchPlan.match_id == match_id, MatchPlan.team_id == team_id)
    )
    return build_plan_response(db, match, team_id, plan)


@router.put("/plan", response_model=MatchPrepPlanResponse)
def upsert_match_prep_plan(
    payload: MatchPrepPlanUpsertRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MatchPrepPlanResponse:
    ensure_team_admin(db, payload.team_id, user.id)
    match = get_match_or_404(db, payload.match_id)
    ensure_match_contains_team(match, payload.team_id)
    ensure_formation_valid(match.format, payload.formation.strip())

    players = db.scalars(select(Player).where(Player.team_id == payload.team_id)).all()
    valid_player_ids = {player.id for player in players}
    allowed_slot_ids = set(get_slot_ids(match.format, payload.formation.strip()))

    selections_by_player_id: dict[str, tuple[bool, bool, bool, str | None]] = {}
    used_slots: set[str] = set()
    for row in payload.players:
        if row.player_id not in valid_player_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Player does not belong to team")
        lineup_slot = row.lineup_slot.strip() if row.lineup_slot else None
        if lineup_slot:
            if lineup_slot not in allowed_slot_ids:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid lineup slot")
            if lineup_slot in used_slots:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lineup slot already assigned")
            used_slots.add(lineup_slot)

        effective_available = row.is_available or bool(lineup_slot)
        effective_starting = bool(lineup_slot)
        effective_in_squad = effective_available
        if row.is_starting and not effective_available:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Starting player must be available",
            )
        selections_by_player_id[row.player_id] = (
            effective_available,
            effective_in_squad,
            effective_starting,
            lineup_slot,
        )

    total_match_minutes = get_total_match_minutes(match)
    previous_segment_end_minute = 0
    normalized_segments: list[tuple[int, list[tuple[str, str]]]] = []
    for index, segment in enumerate(payload.substitution_segments):
        if segment.end_minute <= previous_segment_end_minute:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Substitution segments must be in ascending end-minute order",
            )
        if segment.end_minute > total_match_minutes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Substitution segment cannot end after minute {total_match_minutes}",
            )
        previous_segment_end_minute = segment.end_minute

        used_out_ids: set[str] = set()
        used_in_ids: set[str] = set()
        normalized_swaps: list[tuple[str, str]] = []
        for swap in segment.substitutions:
            player_out_id = swap.player_out_id
            player_in_id = swap.player_in_id
            if player_out_id not in valid_player_ids or player_in_id not in valid_player_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Substitution player does not belong to team",
                )
            if player_out_id == player_in_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Substitution in/out players must be different",
                )
            if player_out_id in used_out_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Same player cannot be subbed out twice in one segment",
                )
            if player_in_id in used_in_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Same player cannot be subbed in twice in one segment",
                )

            player_out_available = selections_by_player_id.get(player_out_id, (True, True, False, None))[0]
            player_in_available = selections_by_player_id.get(player_in_id, (True, True, False, None))[0]
            if not player_out_available or not player_in_available:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Substitution players must be available",
                )

            used_out_ids.add(player_out_id)
            used_in_ids.add(player_in_id)
            normalized_swaps.append((player_out_id, player_in_id))
        normalized_segments.append((segment.end_minute, normalized_swaps))

    starting_count = sum(1 for _, _, is_starting, _ in selections_by_player_id.values() if is_starting)
    required_starting_count = get_required_starting_count(match.format)
    if starting_count > required_starting_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Starting lineup cannot exceed {required_starting_count} players for this format",
        )

    plan = db.scalar(
        select(MatchPlan).where(
            MatchPlan.match_id == payload.match_id,
            MatchPlan.team_id == payload.team_id,
        )
    )
    if not plan:
        plan = MatchPlan(
            match_id=payload.match_id,
            team_id=payload.team_id,
            created_by_user_id=user.id,
            formation=payload.formation.strip(),
        )
        db.add(plan)
        db.flush()
    else:
        plan.formation = payload.formation.strip()

    db.execute(delete(MatchPlanPlayer).where(MatchPlanPlayer.match_plan_id == plan.id))
    segment_rows = db.scalars(
        select(MatchPlanSubstitutionSegment.id).where(MatchPlanSubstitutionSegment.match_plan_id == plan.id)
    ).all()
    if segment_rows:
        db.execute(delete(MatchPlanSubstitution).where(MatchPlanSubstitution.segment_id.in_(segment_rows)))
    db.execute(delete(MatchPlanSubstitutionSegment).where(MatchPlanSubstitutionSegment.match_plan_id == plan.id))
    db.flush()

    for player_id, (is_available, in_squad, is_starting, lineup_slot) in selections_by_player_id.items():
        db.add(
            MatchPlanPlayer(
                match_plan_id=plan.id,
                player_id=player_id,
                is_available=is_available,
                in_matchday_squad=in_squad,
                is_starting=is_starting,
                lineup_slot=lineup_slot,
            )
        )

    for segment_order, (end_minute, swaps) in enumerate(normalized_segments):
        segment_row = MatchPlanSubstitutionSegment(
            match_plan_id=plan.id,
            segment_order=segment_order,
            end_minute=end_minute,
        )
        db.add(segment_row)
        db.flush()
        for player_out_id, player_in_id in swaps:
            db.add(
                MatchPlanSubstitution(
                    segment_id=segment_row.id,
                    player_out_id=player_out_id,
                    player_in_id=player_in_id,
                )
            )
    db.commit()
    db.refresh(plan)
    return build_plan_response(db, match, payload.team_id, plan)
