"""add_match_plan_substitution_tables

Revision ID: e6f7a8b9c0d1
Revises: d4e5f6a7b8c9
Create Date: 2026-03-08 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e6f7a8b9c0d1"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "match_plan_substitution_segments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("match_plan_id", sa.String(length=36), nullable=False),
        sa.Column("segment_order", sa.Integer(), nullable=False),
        sa.Column("end_minute", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["match_plan_id"], ["match_plans.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("match_plan_id", "segment_order", name="uq_match_plan_sub_segments_plan_order"),
    )
    op.create_index(
        op.f("ix_match_plan_substitution_segments_match_plan_id"),
        "match_plan_substitution_segments",
        ["match_plan_id"],
        unique=False,
    )

    op.create_table(
        "match_plan_substitutions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("segment_id", sa.String(length=36), nullable=False),
        sa.Column("player_out_id", sa.String(length=36), nullable=False),
        sa.Column("player_in_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["segment_id"], ["match_plan_substitution_segments.id"]),
        sa.ForeignKeyConstraint(["player_out_id"], ["players.id"]),
        sa.ForeignKeyConstraint(["player_in_id"], ["players.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("segment_id", "player_in_id", name="uq_match_plan_subs_segment_player_in"),
        sa.UniqueConstraint("segment_id", "player_out_id", name="uq_match_plan_subs_segment_player_out"),
    )
    op.create_index(
        op.f("ix_match_plan_substitutions_segment_id"),
        "match_plan_substitutions",
        ["segment_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_match_plan_substitutions_player_out_id"),
        "match_plan_substitutions",
        ["player_out_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_match_plan_substitutions_player_in_id"),
        "match_plan_substitutions",
        ["player_in_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_match_plan_substitutions_player_in_id"), table_name="match_plan_substitutions")
    op.drop_index(op.f("ix_match_plan_substitutions_player_out_id"), table_name="match_plan_substitutions")
    op.drop_index(op.f("ix_match_plan_substitutions_segment_id"), table_name="match_plan_substitutions")
    op.drop_table("match_plan_substitutions")

    op.drop_index(
        op.f("ix_match_plan_substitution_segments_match_plan_id"),
        table_name="match_plan_substitution_segments",
    )
    op.drop_table("match_plan_substitution_segments")
