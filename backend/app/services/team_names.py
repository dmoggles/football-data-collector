import re
import unicodedata

from rapidfuzz import fuzz
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.club import Club
from app.models.team import Team


def normalize_team_name(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", value.lower()).split())


def team_display_name(team: Team, club_name: str | None) -> str:
    return f"{club_name or ''} {team.name}".strip()


def fuzzy_team_name_score(source_name: str, candidate_name: str) -> float:
    source = re.sub(r"\bu\s*\d{1,2}\b", " ", normalize_team_name(source_name))
    candidate = re.sub(r"\bu\s*\d{1,2}\b", " ", normalize_team_name(candidate_name))
    source = " ".join(source.split())
    candidate = " ".join(candidate.split())
    compact_score = fuzz.ratio(source.replace(" ", ""), candidate.replace(" ", ""))
    return round(
        max(compact_score, fuzz.WRatio(source, candidate), fuzz.token_set_ratio(source, candidate)),
        1,
    )


def find_exact_teams(db: Session, typed_name: str) -> list[Team]:
    normalized = normalize_team_name(typed_name)
    rows = db.execute(select(Team, Club.name).outerjoin(Club, Club.id == Team.club_id)).all()
    return [
        team
        for team, club_name in rows
        if normalize_team_name(team_display_name(team, club_name)) == normalized
    ]
