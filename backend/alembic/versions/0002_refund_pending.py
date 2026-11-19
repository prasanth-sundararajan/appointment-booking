"""Refund pending status, refund failure flag, refresh-token families.

Revision ID: 0002_refund_pending
Revises: 0001_initial
Create Date: 2026-11-19 00:00:00

- payment_status gains 'refund_pending' (refund requested, provider not yet confirmed).
- payments.refund_failed flags refunds the provider rejected (shown to the owner).
- refresh_tokens.family_id / rotated_at support the 30s rotation grace window.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_refund_pending"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ADD VALUE cannot be used inside the same transaction that adds it; run it outside.
    with op.get_context().autocommit_block():
        op.execute(
            "ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'refund_pending' "
            "BEFORE 'refunded'"
        )

    op.add_column(
        "payments",
        sa.Column("refund_failed", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column("refresh_tokens", sa.Column("family_id", sa.String(64), nullable=True))
    op.add_column(
        "refresh_tokens", sa.Column("rotated_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index("ix_refresh_tokens_family_id", "refresh_tokens", ["family_id"])


def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_family_id", table_name="refresh_tokens")
    op.drop_column("refresh_tokens", "rotated_at")
    op.drop_column("refresh_tokens", "family_id")
    op.drop_column("payments", "refund_failed")

    # Postgres cannot drop an enum value: map pending refunds back, then recreate the type.
    op.execute("UPDATE payments SET status = 'succeeded' WHERE status = 'refund_pending'")
    op.execute("ALTER TYPE payment_status RENAME TO payment_status_old")
    op.execute(
        "CREATE TYPE payment_status AS ENUM ('pending', 'succeeded', 'failed', 'refunded')"
    )
    op.execute("ALTER TABLE payments ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "ALTER TABLE payments ALTER COLUMN status TYPE payment_status "
        "USING status::text::payment_status"
    )
    op.execute("ALTER TABLE payments ALTER COLUMN status SET DEFAULT 'pending'")
    op.execute("DROP TYPE payment_status_old")
