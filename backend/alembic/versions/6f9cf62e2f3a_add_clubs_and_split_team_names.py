"""add_clubs_and_split_team_names

Revision ID: 6f9cf62e2f3a
Revises: c4f1e9d2ab77
Create Date: 2026-03-06 11:10:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "6f9cf62e2f3a"
down_revision: Union[str, Sequence[str], None] = "c4f1e9d2ab77"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "clubs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_clubs_name"),
    )

    # Keep migration simple and deterministic by resetting existing team-linked data.
    op.execute("DELETE FROM events")
    op.execute("DELETE FROM match_squads")
    op.execute("DELETE FROM matches")
    op.execute("DELETE FROM players")
    op.execute("DELETE FROM team_memberships")
    op.execute("DELETE FROM teams")

    op.add_column("teams", sa.Column("club_id", sa.String(length=36), nullable=True))
    op.create_index("ix_teams_club_id", "teams", ["club_id"], unique=False)
    op.create_foreign_key("fk_teams_club_id_clubs", "teams", "clubs", ["club_id"], ["id"])
    op.create_unique_constraint("uq_teams_club_id_name", "teams", ["club_id", "name"])
    op.alter_column("teams", "club_id", existing_type=sa.String(length=36), nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DELETE FROM events")
    op.execute("DELETE FROM match_squads")
    op.execute("DELETE FROM matches")
    op.execute("DELETE FROM players")
    op.execute("DELETE FROM team_memberships")
    op.execute("DELETE FROM teams")

    op.drop_constraint("uq_teams_club_id_name", "teams", type_="unique")
    op.drop_constraint("fk_teams_club_id_clubs", "teams", type_="foreignkey")
    op.drop_index("ix_teams_club_id", table_name="teams")
    op.drop_column("teams", "club_id")
    op.drop_table("clubs")
