import asyncio
import hashlib
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth_deps import get_current_user
from app.api.deps import get_db
from app.api.entitlements import ensure_team_admin, ensure_team_member
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.collection_session import CollectionSession
from app.models.event import Event
from app.models.match import Match
from app.models.player import Player
from app.models.session import Session as UserSession
from app.models.team import Team
from app.models.user import User
from app.schemas.collection_session import (
    CollectionSessionActionRequest,
    CollectionEventCreateRequest,
    CollectionEventResponse,
    CollectionSessionResponse,
    CollectionSessionStartRequest,
)

router = APIRouter(prefix="/collection-sessions", tags=["collection-sessions"])


def now_utc() -> datetime:
    return datetime.now(UTC)


def get_match_or_404(db: Session, match_id: str) -> Match:
    match = db.scalar(select(Match).where(Match.id == match_id))
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fixture not found")
    return match


def get_collection_session_or_404(db: Session, session_id: str) -> CollectionSession:
    row = db.scalar(select(CollectionSession).where(CollectionSession.id == session_id))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection session not found")
    return row


def ensure_match_contains_team(match: Match, team_id: str) -> None:
    if team_id not in [match.home_team_id, match.away_team_id]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Team is not part of this fixture")


def get_total_periods(match: Match) -> int:
    period_format = (match.period_format or "").lower()
    if period_format == "quarters":
        return 4
    if period_format == "halves":
        return 2
    return 1


def get_fixture_label(db: Session, match: Match, team_id: str) -> str:
    home_team = db.scalar(select(Team).where(Team.id == match.home_team_id))
    away_team = db.scalar(select(Team).where(Team.id == match.away_team_id))
    if not home_team or not away_team:
        return "Fixture"
    opponent = away_team if match.home_team_id == team_id else home_team
    venue = "vs" if match.home_team_id == team_id else "@"
    return f"{venue} {opponent.name}"


def elapsed_seconds_for_session(session_row: CollectionSession, at_time: datetime | None = None) -> int:
    now = at_time or now_utc()
    elapsed = session_row.elapsed_seconds_before_period
    if session_row.period_started_at and session_row.state == "live":
        started = session_row.period_started_at
        if started.tzinfo is None or started.utcoffset() is None:
            started = started.replace(tzinfo=UTC)
        elapsed += max(0, int((now - started).total_seconds()))
    return elapsed


def current_period_elapsed_seconds(session_row: CollectionSession, at_time: datetime | None = None) -> int:
    if not session_row.period_started_at or session_row.state != "live":
        return 0
    now = at_time or now_utc()
    started = session_row.period_started_at
    if started.tzinfo is None or started.utcoffset() is None:
        started = started.replace(tzinfo=UTC)
    return max(0, int((now - started).total_seconds()))


def build_collection_session_response(
    db: Session,
    session_row: CollectionSession,
    match: Match,
    team_id: str,
    *,
    off_schedule_warning: str | None = None,
) -> CollectionSessionResponse:
    total_periods = get_total_periods(match)
    period_length_seconds = int(match.period_length_minutes) * 60
    current_elapsed = current_period_elapsed_seconds(session_row)
    is_running = session_row.period_started_at is not None and session_row.state == "live"
    next_period_available = session_row.period_number < total_periods
    can_end_period = is_running and current_elapsed >= period_length_seconds
    can_start_next_period = session_row.state == "live" and (not is_running) and next_period_available
    return CollectionSessionResponse(
        id=session_row.id,
        match_id=session_row.match_id,
        team_id=session_row.team_id,
        fixture_label=get_fixture_label(db, match, team_id),
        kickoff_at=match.kickoff_at,
        format=match.format,
        state=session_row.state,
        period_number=session_row.period_number,
        total_periods=total_periods,
        period_length_minutes=int(match.period_length_minutes),
        elapsed_seconds=elapsed_seconds_for_session(session_row),
        current_period_elapsed_seconds=current_elapsed,
        is_period_running=is_running,
        can_end_period=can_end_period,
        can_start_next_period=can_start_next_period,
        next_period_available=next_period_available,
        off_schedule_warning=off_schedule_warning,
    )


def get_websocket_user_id(db: Session, websocket: WebSocket) -> str | None:
    cookie_header = websocket.headers.get("cookie", "")
    if not cookie_header:
        return None
    cookie_items = [segment.strip() for segment in cookie_header.split(";") if "=" in segment]
    parsed: dict[str, str] = {}
    for item in cookie_items:
        key, value = item.split("=", 1)
        parsed[key.strip()] = value.strip()
    raw_token = parsed.get(settings.session_cookie_name)
    if not raw_token:
        return None

    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    session_record = db.scalar(select(UserSession).where(UserSession.token_hash == token_hash))
    if not session_record:
        return None
    expires_at = session_record.expires_at
    if expires_at.tzinfo is None or expires_at.utcoffset() is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at <= now_utc():
        return None
    return session_record.user_id


def build_collection_event_response(row: Event, session_id: str) -> CollectionEventResponse:
    metadata = row.metadata_json or {}
    return CollectionEventResponse(
        id=row.id,
        session_id=session_id,
        match_id=row.match_id,
        team_id=row.team_id,
        player_id=row.player_id,
        event_kind=row.event_kind,
        period_number=row.period_number,
        period_second=row.period_second,
        x_pct=float(row.x_pct or 0),
        y_pct=float(row.y_pct or 0),
        end_x_pct=float(row.end_x_pct) if row.end_x_pct is not None else None,
        end_y_pct=float(row.end_y_pct) if row.end_y_pct is not None else None,
        goal_mouth_y=float(row.goal_mouth_y) if row.goal_mouth_y is not None else None,
        goal_mouth_z=float(row.goal_mouth_z) if row.goal_mouth_z is not None else None,
        shot_outcome=metadata.get("shot_outcome"),
        receiving_player_id=metadata.get("receiving_player_id"),
        pass_completed=metadata.get("pass_completed"),
        created_at=row.created_at,
    )


@router.get("/active", response_model=list[CollectionSessionResponse])
def list_active_collection_sessions(
    team_id: str = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[CollectionSessionResponse]:
    ensure_team_member(db, team_id, user.id)
    rows = db.scalars(
        select(CollectionSession)
        .where(CollectionSession.team_id == team_id, CollectionSession.state == "live")
        .order_by(CollectionSession.created_at.desc())
    ).all()
    results: list[CollectionSessionResponse] = []
    for row in rows:
        match = get_match_or_404(db, row.match_id)
        ensure_match_contains_team(match, team_id)
        results.append(build_collection_session_response(db, row, match, team_id))
    return results


@router.post("/start", response_model=CollectionSessionResponse, status_code=status.HTTP_201_CREATED)
def start_collection_session(
    payload: CollectionSessionStartRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CollectionSessionResponse:
    ensure_team_admin(db, payload.team_id, user.id)
    match = get_match_or_404(db, payload.match_id)
    ensure_match_contains_team(match, payload.team_id)

    existing = db.scalar(
        select(CollectionSession).where(
            CollectionSession.match_id == payload.match_id,
            CollectionSession.team_id == payload.team_id,
        )
    )
    if existing:
        if existing.state == "live":
            return build_collection_session_response(db, existing, match, payload.team_id)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Collection session already completed")

    warning: str | None = None
    if match.kickoff_at:
        kickoff = match.kickoff_at
        if kickoff.tzinfo is None or kickoff.utcoffset() is None:
            kickoff = kickoff.replace(tzinfo=UTC)
        offset_minutes = abs((now_utc() - kickoff).total_seconds()) / 60
        if offset_minutes > 10:
            warning = f"Session starts {int(offset_minutes)} minutes away from scheduled kickoff."
            if not payload.confirm_off_schedule:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"{warning} Confirm to continue.",
                )

    session_row = CollectionSession(
        match_id=payload.match_id,
        team_id=payload.team_id,
        started_by_user_id=user.id,
        state="live",
        period_number=1,
        period_started_at=now_utc(),
        elapsed_seconds_before_period=0,
    )
    db.add(session_row)
    db.commit()
    db.refresh(session_row)
    return build_collection_session_response(db, session_row, match, payload.team_id, off_schedule_warning=warning)


@router.get("/{session_id}/events", response_model=list[CollectionEventResponse])
def list_collection_events(
    session_id: str,
    team_id: str = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[CollectionEventResponse]:
    ensure_team_member(db, team_id, user.id)
    session_row = get_collection_session_or_404(db, session_id)
    if session_row.team_id != team_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Session does not belong to team")
    rows = db.scalars(
        select(Event)
        .where(
            Event.match_id == session_row.match_id,
            Event.team_id == team_id,
            Event.event_kind.in_(["shot", "tackle", "interception", "shot_against"]),
        )
        .order_by(Event.created_at.asc())
    ).all()
    return [build_collection_event_response(row, session_id) for row in rows]


@router.post("/{session_id}/events", response_model=CollectionEventResponse, status_code=status.HTTP_201_CREATED)
def create_collection_event(
    session_id: str,
    payload: CollectionEventCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CollectionEventResponse:
    ensure_team_member(db, payload.team_id, user.id)
    session_row = get_collection_session_or_404(db, session_id)
    if session_row.team_id != payload.team_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Session does not belong to team")
    if session_row.state != "live" or not session_row.period_started_at:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot collect events while period is stopped")
    if payload.player_id:
        player = db.scalar(select(Player).where(Player.id == payload.player_id))
        if not player or player.team_id != payload.team_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected player is invalid for team")
    is_shot = payload.event_kind in ("shot", "shot_against")
    period_second = current_period_elapsed_seconds(session_row)
    metadata_json: dict | None = {"shot_outcome": payload.shot_outcome} if is_shot and payload.shot_outcome else None
    event = Event(
        match_id=session_row.match_id,
        user_id=user.id,
        team_id=payload.team_id,
        player_id=payload.player_id,
        event_kind=payload.event_kind,
        period_number=session_row.period_number,
        period_second=period_second,
        x_pct=round(payload.x_pct, 2),
        y_pct=round(payload.y_pct, 2),
        goal_mouth_y=round(payload.goal_mouth_y, 2) if is_shot and payload.goal_mouth_y is not None else None,
        goal_mouth_z=round(payload.goal_mouth_z, 2) if is_shot and payload.goal_mouth_z is not None else None,
        metadata_json=metadata_json,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return build_collection_event_response(event, session_id)


@router.get("/{session_id}", response_model=CollectionSessionResponse)
def get_collection_session(
    session_id: str,
    team_id: str = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CollectionSessionResponse:
    ensure_team_member(db, team_id, user.id)
    session_row = get_collection_session_or_404(db, session_id)
    if session_row.team_id != team_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Session does not belong to team")
    match = get_match_or_404(db, session_row.match_id)
    ensure_match_contains_team(match, team_id)
    return build_collection_session_response(db, session_row, match, team_id)


@router.post("/{session_id}/end-period", response_model=CollectionSessionResponse)
def end_collection_session_period(
    session_id: str,
    payload: CollectionSessionActionRequest,
    confirm_early: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CollectionSessionResponse:
    ensure_team_admin(db, payload.team_id, user.id)
    session_row = get_collection_session_or_404(db, session_id)
    if session_row.team_id != payload.team_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Session does not belong to team")

    match = get_match_or_404(db, session_row.match_id)
    ensure_match_contains_team(match, payload.team_id)
    if session_row.state != "live":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session is not live")
    if not session_row.period_started_at:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Period is not running")

    current_elapsed = current_period_elapsed_seconds(session_row)
    required_period_seconds = int(match.period_length_minutes) * 60
    if current_elapsed < required_period_seconds and not confirm_early:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Period has not reached scheduled duration. Confirm to end early.",
        )

    session_row.elapsed_seconds_before_period = elapsed_seconds_for_session(session_row)
    session_row.period_started_at = None
    total_periods = get_total_periods(match)
    if session_row.period_number >= total_periods:
        session_row.state = "ended"

    db.commit()
    db.refresh(session_row)
    return build_collection_session_response(db, session_row, match, payload.team_id)


@router.post("/{session_id}/start-period", response_model=CollectionSessionResponse)
def start_next_collection_session_period(
    session_id: str,
    payload: CollectionSessionActionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CollectionSessionResponse:
    ensure_team_admin(db, payload.team_id, user.id)
    session_row = get_collection_session_or_404(db, session_id)
    if session_row.team_id != payload.team_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Session does not belong to team")

    match = get_match_or_404(db, session_row.match_id)
    ensure_match_contains_team(match, payload.team_id)
    if session_row.state != "live":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session is not live")
    if session_row.period_started_at:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Current period is still running")

    total_periods = get_total_periods(match)
    if session_row.period_number >= total_periods:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No next period available")

    session_row.period_number += 1
    session_row.period_started_at = now_utc()
    db.commit()
    db.refresh(session_row)
    return build_collection_session_response(db, session_row, match, payload.team_id)


@router.websocket("/{session_id}/ws")
async def collection_session_ws(websocket: WebSocket, session_id: str, team_id: str) -> None:
    await websocket.accept()
    db = SessionLocal()
    try:
        user_id = get_websocket_user_id(db, websocket)
        if not user_id:
            await websocket.close(code=4401, reason="Not authenticated")
            return

        ensure_team_member(db, team_id, user_id)
        while True:
            # Ensure each loop reads a fresh DB snapshot (MySQL REPEATABLE READ would
            # otherwise keep returning stale period state in a long-lived session).
            db.rollback()
            session_row = db.scalar(select(CollectionSession).where(CollectionSession.id == session_id))
            if not session_row:
                await websocket.close(code=4404, reason="Session not found")
                return
            if session_row.team_id != team_id:
                await websocket.close(code=4403, reason="Forbidden")
                return
            match = db.scalar(select(Match).where(Match.id == session_row.match_id))
            if not match:
                await websocket.close(code=4404, reason="Fixture not found")
                return
            payload = build_collection_session_response(db, session_row, match, team_id).model_dump(mode="json")
            await websocket.send_json(payload)
            await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        return
    finally:
        db.close()
