from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.auth_deps import get_current_user
from app.api.deps import get_db
from app.api.entitlements import ensure_team_admin, ensure_team_member
from app.models.player import Player
from app.models.team_membership import TeamMembership
from app.models.user import User
from app.schemas.player import PlayerCreateRequest, PlayerResponse, PlayerUpdateRequest

router = APIRouter(prefix="/players", tags=["players"])


@router.get("", response_model=list[PlayerResponse])
def list_players(
    team_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[PlayerResponse]:
    if team_id:
        ensure_team_member(db, team_id, user.id)
        query = select(Player).where(Player.team_id == team_id)
    else:
        query = (
            select(Player)
            .join(TeamMembership, TeamMembership.team_id == Player.team_id)
            .where(TeamMembership.user_id == user.id)
        )

    players = db.scalars(query.order_by(Player.display_name.asc())).all()
    return [PlayerResponse.model_validate(player) for player in players]


@router.post("", response_model=PlayerResponse, status_code=status.HTTP_201_CREATED)
def create_player(
    payload: PlayerCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PlayerResponse:
    ensure_team_admin(db, payload.team_id, user.id)

    player = Player(
        team_id=payload.team_id,
        display_name=payload.display_name.strip(),
        shirt_number=payload.shirt_number,
        position=payload.position.strip() if payload.position else None,
    )
    db.add(player)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Shirt number already exists for this team",
        ) from exc

    db.refresh(player)
    return PlayerResponse.model_validate(player)


@router.patch("/{player_id}", response_model=PlayerResponse)
def update_player(
    player_id: str,
    payload: PlayerUpdateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PlayerResponse:
    player = db.scalar(select(Player).where(Player.id == player_id))
    if not player:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")

    ensure_team_admin(db, player.team_id, user.id)

    player.display_name = payload.display_name.strip()
    player.shirt_number = payload.shirt_number
    player.position = payload.position.strip() if payload.position else None

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Shirt number already exists for this team",
        ) from exc

    db.refresh(player)
    return PlayerResponse.model_validate(player)


@router.delete("/{player_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_player(
    player_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    player = db.scalar(select(Player).where(Player.id == player_id))
    if not player:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")

    ensure_team_admin(db, player.team_id, user.id)

    db.delete(player)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
