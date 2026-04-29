"""Add reports, feed_likes, feed_replies tables

Revision ID: a3c4d2e9b1f7
Revises: f0840fe74b94
Create Date: 2026-04-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a3c4d2e9b1f7"
down_revision: Union[str, None] = "f0840fe74b94"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reports",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("reporter_id", sa.String(), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column("target_type", sa.String(), nullable=False),
        sa.Column("target_id", sa.String(), nullable=False),
        sa.Column("target_label", sa.String(), nullable=True),
        sa.Column("reason_key", sa.String(), nullable=False),
        sa.Column("reason_label", sa.String(), nullable=True),
        sa.Column("created_at", sa.Float(), nullable=False),
    )
    op.create_index("ix_reports_reporter", "reports", ["reporter_id"])
    op.create_index("ix_reports_target_type", "reports", ["target_type", "target_id"])

    op.create_table(
        "feed_likes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column("item_id", sa.String(), nullable=False),
        sa.Column("created_at", sa.Float(), nullable=False),
        sa.UniqueConstraint("user_id", "item_id", name="uq_feed_likes_user_item"),
    )
    op.create_index("ix_feed_likes_item", "feed_likes", ["item_id"])

    op.create_table(
        "feed_replies",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column("item_id", sa.String(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.Float(), nullable=False),
    )
    op.create_index("ix_feed_replies_item", "feed_replies", ["item_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_feed_replies_item", table_name="feed_replies")
    op.drop_table("feed_replies")
    op.drop_index("ix_feed_likes_item", table_name="feed_likes")
    op.drop_table("feed_likes")
    op.drop_index("ix_reports_target_type", table_name="reports")
    op.drop_index("ix_reports_reporter", table_name="reports")
    op.drop_table("reports")
