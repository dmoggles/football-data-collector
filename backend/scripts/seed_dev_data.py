"""Seed an idempotent local development dataset."""

import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import select

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.db.session import SessionLocal  # noqa: E402
from app.models.club import Club  # noqa: E402
from app.models.global_role import GlobalRole, GlobalRoleType  # noqa: E402
from app.models.match import Match, MatchFormat, MatchPeriodFormat  # noqa: E402
from app.models.player import Player  # noqa: E402
from app.models.team import Team  # noqa: E402
from app.models.team_membership import TeamMembership, TeamRole  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.security import hash_password  # noqa: E402

DEV_EMAIL = "coach@tapline.local"
DEV_PASSWORD = "TapLineDev123!"


def get_or_create(db, model, defaults=None, **filters):
    row = db.scalar(select(model).filter_by(**filters))
    if row is None:
        row = model(**filters, **(defaults or {}))
        db.add(row)
        db.flush()
    return row


def main() -> None:
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == DEV_EMAIL))
        if user is None:
            user = User(email=DEV_EMAIL, password_hash=hash_password(DEV_PASSWORD))
            db.add(user)
            db.flush()

        get_or_create(
            db,
            GlobalRole,
            user_id=user.id,
            role=GlobalRoleType.SUPER_ADMIN.value,
        )

        tapline = get_or_create(db, Club, name="TapLine Athletic")
        riverside = get_or_create(db, Club, name="Riverside Juniors")
        home = get_or_create(db, Team, club_id=tapline.id, name="Under 14 Reds")
        away = get_or_create(db, Team, club_id=riverside.id, name="Under 14 Blues")

        get_or_create(
            db,
            TeamMembership,
            team_id=home.id,
            user_id=user.id,
            defaults={"role": TeamRole.MANAGER.value},
        )
        get_or_create(
            db,
            TeamMembership,
            team_id=away.id,
            user_id=user.id,
            defaults={"role": TeamRole.MANAGER.value},
        )

        home_players = [
            (1, "Alex Morgan", "GK"),
            (2, "Jamie Taylor", "DF"),
            (4, "Sam Williams", "DF"),
            (6, "Jordan Brown", "MF"),
            (8, "Casey Jones", "MF"),
            (9, "Riley Wilson", "ST"),
            (10, "Charlie Davies", "ST"),
        ]
        away_players = [
            (1, "Avery Smith", "GK"),
            (3, "Robin Evans", "DF"),
            (5, "Cameron Thomas", "DF"),
            (7, "Drew Roberts", "MF"),
            (8, "Quinn Lewis", "MF"),
            (9, "Hayden Walker", "ST"),
            (11, "Reese Hall", "ST"),
        ]
        for team, roster in ((home, home_players), (away, away_players)):
            for shirt_number, display_name, position in roster:
                get_or_create(
                    db,
                    Player,
                    team_id=team.id,
                    shirt_number=shirt_number,
                    defaults={"display_name": display_name, "position": position},
                )

        fixture = db.scalar(
            select(Match).where(
                Match.home_team_id == home.id,
                Match.away_team_id == away.id,
                Match.status == "scheduled",
            )
        )
        if fixture is None:
            fixture = Match(
                user_id=user.id,
                home_team_id=home.id,
                away_team_id=away.id,
                format=MatchFormat.SEVEN_ASIDE.value,
                period_format=MatchPeriodFormat.HALVES.value,
                period_length_minutes=25,
                kickoff_at=datetime.now(UTC) + timedelta(days=7),
                status="scheduled",
            )
            db.add(fixture)

        db.commit()
        print("Development data ready")
        print(f"Login: {DEV_EMAIL}")
        print(f"Password: {DEV_PASSWORD}")


if __name__ == "__main__":
    main()
