"""merge notifications + privacy

Revision ID: f0840fe74b94
Revises: 5cf3c7a3d118, 6bb5dfb0da0f
Create Date: 2026-04-27 19:59:46.721829

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f0840fe74b94'
down_revision: Union[str, None] = ('5cf3c7a3d118', '6bb5dfb0da0f')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
