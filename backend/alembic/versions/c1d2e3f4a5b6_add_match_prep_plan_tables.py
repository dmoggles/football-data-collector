"""add_match_prep_plan_tables

Revision ID: c1d2e3f4a5b6
Revises: a7e8f9d0c1b2
Create Date: 2026-03-07 21:10:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, Sequence[str], None] = "b8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "match_plans",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("match_id", sa.String(length=36), nullable=False),
        sa.Column("team_id", sa.String(length=36), nullable=False),
        sa.Column("created_by_user_id", sa.String(length=36), nullable=False),
        sa.Column("formation", sa.String(length=30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["match_id"], ["matches.id"]),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("match_id", "team_id", name="uq_match_plans_match_team"),
    )
    op.create_index("ix_match_plans_match_id", "match_plans", ["match_id"])
    op.create_index("ix_match_plans_team_id", "match_plans", ["team_id"])
    op.create_index("ix_match_plans_created_by_user_id", "match_plans", ["created_by_user_id"])

    op.create_table(
        "match_plan_players",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("match_plan_id", sa.String(length=36), nullable=False),
        sa.Column("player_id", sa.String(length=36), nullable=False),
        sa.Column("is_available", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("in_matchday_squad", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("is_starting", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["match_plan_id"], ["match_plans.id"]),
        sa.ForeignKeyConstraint(["player_id"], ["players.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("match_plan_id", "player_id", name="uq_match_plan_players_plan_player"),
    )
    op.create_index("ix_match_plan_players_match_plan_id", "match_plan_players", ["match_plan_id"])
    op.create_index("ix_match_plan_players_player_id", "match_plan_players", ["player_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_match_plan_players_player_id", table_name="match_plan_players")
    op.drop_index("ix_match_plan_players_match_plan_id", table_name="match_plan_players")
    op.drop_table("match_plan_players")

    op.drop_index("ix_match_plans_created_by_user_id", table_name="match_plans")
    op.drop_index("ix_match_plans_team_id", table_name="match_plans")
    op.drop_index("ix_match_plans_match_id", table_name="match_plans")
    op.drop_table("match_plans")
