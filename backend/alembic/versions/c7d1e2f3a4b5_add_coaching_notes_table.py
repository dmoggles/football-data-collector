"""add_coaching_notes_table

Revision ID: c7d1e2f3a4b5
Revises: b2f6c9d8e1a7
Create Date: 2026-03-08 14:10:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c7d1e2f3a4b5"
down_revision: Union[str, Sequence[str], None] = "b2f6c9d8e1a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "coaching_notes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("match_id", sa.String(length=36), nullable=False),
        sa.Column("team_id", sa.String(length=36), nullable=False),
        sa.Column("player_id", sa.String(length=36), nullable=True),
        sa.Column("author_user_id", sa.String(length=36), nullable=False),
        sa.Column("note_text", sa.String(length=2000), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["author_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["match_id"], ["matches.id"]),
        sa.ForeignKeyConstraint(["player_id"], ["players.id"]),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_coaching_notes_match_id"), "coaching_notes", ["match_id"], unique=False)
    op.create_index(op.f("ix_coaching_notes_team_id"), "coaching_notes", ["team_id"], unique=False)
    op.create_index(op.f("ix_coaching_notes_player_id"), "coaching_notes", ["player_id"], unique=False)
    op.create_index(
        op.f("ix_coaching_notes_author_user_id"),
        "coaching_notes",
        ["author_user_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_coaching_notes_author_user_id"), table_name="coaching_notes")
    op.drop_index(op.f("ix_coaching_notes_player_id"), table_name="coaching_notes")
    op.drop_index(op.f("ix_coaching_notes_team_id"), table_name="coaching_notes")
    op.drop_index(op.f("ix_coaching_notes_match_id"), table_name="coaching_notes")
    op.drop_table("coaching_notes")
