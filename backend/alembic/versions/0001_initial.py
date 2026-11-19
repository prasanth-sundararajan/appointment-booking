"""Initial SlotEase schema (13 tables, enums, btree_gist exclusion constraint).

Revision ID: 0001_initial
Revises:
Create Date: 2026-11-19 00:00:00

Hand-written. Constraint/index names match app.database.NAMING_CONVENTION so that
`alembic revision --autogenerate` produces no diff against the models.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

user_role = postgresql.ENUM("customer", "owner", "staff", name="user_role", create_type=False)
business_category = postgresql.ENUM(
    "salon", "clinic", "fitness", "consulting", "education", "other",
    name="business_category", create_type=False,
)
booking_status = postgresql.ENUM(
    "pending_payment", "confirmed", "cancelled", "completed", "no_show", "expired",
    name="booking_status", create_type=False,
)
cancelled_by = postgresql.ENUM("customer", "business", name="cancelled_by", create_type=False)
payment_status = postgresql.ENUM(
    "pending", "succeeded", "failed", "refunded", name="payment_status", create_type=False
)
ALL_ENUMS = (user_role, business_category, booking_status, cancelled_by, payment_status)


def _ts() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    bind = op.get_bind()
    for enum_type in ALL_ENUMS:
        enum_type.create(bind, checkfirst=True)

    # --- users -------------------------------------------------------------
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=True),
        sa.Column("full_name", sa.String(150), nullable=False),
        sa.Column("role", user_role, server_default="customer", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("is_verified", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("oauth_provider", sa.String(50), nullable=True),
        sa.Column("google_sub", sa.String(255), nullable=True),
        *_ts(),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("google_sub", name="uq_users_google_sub"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # --- refresh_tokens ----------------------------------------------------
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        *_ts(),
        sa.PrimaryKeyConstraint("id", name="pk_refresh_tokens"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_refresh_tokens_user_id_users", ondelete="CASCADE"
        ),
        sa.UniqueConstraint("token_hash", name="uq_refresh_tokens_token_hash"),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])

    # --- webhook_events ----------------------------------------------------
    op.create_table(
        "webhook_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("event_id", sa.String(255), nullable=False),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        *_ts(),
        sa.PrimaryKeyConstraint("id", name="pk_webhook_events"),
        sa.UniqueConstraint("event_id", name="uq_webhook_events_event_id"),
    )

    # --- businesses --------------------------------------------------------
    op.create_table(
        "businesses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(220), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", business_category, server_default="other", nullable=False),
        sa.Column("city", sa.String(120), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("deposit_percent", sa.Integer(), server_default="20", nullable=False),
        sa.Column("cancellation_cutoff_hours", sa.Integer(), server_default="8", nullable=False),
        sa.Column("booking_buffer_minutes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("min_notice_hours", sa.Integer(), server_default="1", nullable=False),
        sa.Column("max_advance_days", sa.Integer(), server_default="60", nullable=False),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("address", sa.String(500), nullable=True),
        sa.Column("logo_url", sa.String(500), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        *_ts(),
        sa.PrimaryKeyConstraint("id", name="pk_businesses"),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name="fk_businesses_owner_id_users", ondelete="CASCADE"
        ),
        sa.CheckConstraint(
            "deposit_percent BETWEEN 10 AND 100", name="ck_businesses_deposit_percent_range"
        ),
        sa.CheckConstraint(
            "cancellation_cutoff_hours >= 0", name="ck_businesses_cancellation_cutoff_nonneg"
        ),
        sa.CheckConstraint("booking_buffer_minutes >= 0", name="ck_businesses_buffer_nonneg"),
        sa.CheckConstraint("min_notice_hours >= 0", name="ck_businesses_min_notice_nonneg"),
        sa.CheckConstraint("max_advance_days > 0", name="ck_businesses_max_advance_positive"),
    )
    op.create_index("ix_businesses_owner_id", "businesses", ["owner_id"])
    op.create_index("ix_businesses_slug", "businesses", ["slug"], unique=True)
    op.create_index("ix_businesses_category_city", "businesses", ["category", "city"])
    op.create_index(
        "ix_businesses_name_trgm",
        "businesses",
        ["name"],
        postgresql_using="gin",
        postgresql_ops={"name": "gin_trgm_ops"},
    )

    # --- services ----------------------------------------------------------
    op.create_table(
        "services",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("business_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("price_minor", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        *_ts(),
        sa.PrimaryKeyConstraint("id", name="pk_services"),
        sa.ForeignKeyConstraint(
            ["business_id"], ["businesses.id"],
            name="fk_services_business_id_businesses", ondelete="CASCADE",
        ),
        sa.CheckConstraint("duration_minutes > 0", name="ck_services_duration_positive"),
        sa.CheckConstraint("price_minor >= 0", name="ck_services_price_nonneg"),
    )
    op.create_index("ix_services_business_id", "services", ["business_id"])

    # --- staff_members -----------------------------------------------------
    op.create_table(
        "staff_members",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("business_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("display_name", sa.String(150), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("invite_token", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        *_ts(),
        sa.PrimaryKeyConstraint("id", name="pk_staff_members"),
        sa.ForeignKeyConstraint(
            ["business_id"], ["businesses.id"],
            name="fk_staff_members_business_id_businesses", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_staff_members_user_id_users", ondelete="SET NULL"
        ),
        sa.UniqueConstraint("business_id", "email", name="uq_staff_members_business_email"),
        sa.UniqueConstraint("invite_token", name="uq_staff_members_invite_token"),
    )
    op.create_index("ix_staff_members_business_id", "staff_members", ["business_id"])
    op.create_index("ix_staff_members_user_id", "staff_members", ["user_id"])

    # --- staff_services ----------------------------------------------------
    op.create_table(
        "staff_services",
        sa.Column("staff_id", sa.Integer(), nullable=False),
        sa.Column("service_id", sa.Integer(), nullable=False),
        *_ts(),
        sa.PrimaryKeyConstraint("staff_id", "service_id", name="pk_staff_services"),
        sa.ForeignKeyConstraint(
            ["staff_id"], ["staff_members.id"],
            name="fk_staff_services_staff_id_staff_members", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["service_id"], ["services.id"],
            name="fk_staff_services_service_id_services", ondelete="CASCADE",
        ),
    )
    op.create_index("ix_staff_services_service_id", "staff_services", ["service_id"])

    # --- working_hours -----------------------------------------------------
    op.create_table(
        "working_hours",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("staff_id", sa.Integer(), nullable=False),
        sa.Column("weekday", sa.SmallInteger(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        *_ts(),
        sa.PrimaryKeyConstraint("id", name="pk_working_hours"),
        sa.ForeignKeyConstraint(
            ["staff_id"], ["staff_members.id"],
            name="fk_working_hours_staff_id_staff_members", ondelete="CASCADE",
        ),
        sa.CheckConstraint("weekday BETWEEN 0 AND 6", name="ck_working_hours_weekday_range"),
        sa.CheckConstraint("end_time > start_time", name="ck_working_hours_end_after_start"),
    )
    op.create_index("ix_working_hours_staff_weekday", "working_hours", ["staff_id", "weekday"])

    # --- time_off ----------------------------------------------------------
    op.create_table(
        "time_off",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("staff_id", sa.Integer(), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reason", sa.String(500), nullable=True),
        *_ts(),
        sa.PrimaryKeyConstraint("id", name="pk_time_off"),
        sa.ForeignKeyConstraint(
            ["staff_id"], ["staff_members.id"],
            name="fk_time_off_staff_id_staff_members", ondelete="CASCADE",
        ),
        sa.CheckConstraint("end_at > start_at", name="ck_time_off_end_after_start"),
    )
    op.create_index("ix_time_off_staff_start", "time_off", ["staff_id", "start_at"])

    # --- bookings ----------------------------------------------------------
    op.create_table(
        "bookings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("business_id", sa.Integer(), nullable=False),
        sa.Column("service_id", sa.Integer(), nullable=False),
        sa.Column("staff_id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", booking_status, server_default="pending_payment", nullable=False),
        sa.Column("hold_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("customer_note", sa.Text(), nullable=True),
        sa.Column("cancelled_by", cancelled_by, nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("google_event_id", sa.String(255), nullable=True),
        *_ts(),
        sa.PrimaryKeyConstraint("id", name="pk_bookings"),
        sa.ForeignKeyConstraint(
            ["business_id"], ["businesses.id"],
            name="fk_bookings_business_id_businesses", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["service_id"], ["services.id"],
            name="fk_bookings_service_id_services", ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["staff_id"], ["staff_members.id"],
            name="fk_bookings_staff_id_staff_members", ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["customer_id"], ["users.id"], name="fk_bookings_customer_id_users", ondelete="RESTRICT"
        ),
        sa.CheckConstraint("end_at > start_at", name="ck_bookings_end_after_start"),
    )
    # Rule 6: no double-booking for slots that are held or confirmed.
    op.execute(
        "ALTER TABLE bookings ADD CONSTRAINT ex_bookings_staff_no_overlap "
        "EXCLUDE USING gist (staff_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&) "
        "WHERE (status IN ('pending_payment', 'confirmed'))"
    )
    op.create_index("ix_bookings_business_start", "bookings", ["business_id", "start_at"])
    op.create_index("ix_bookings_customer_start", "bookings", ["customer_id", "start_at"])
    op.create_index("ix_bookings_status_hold", "bookings", ["status", "hold_expires_at"])
    op.create_index("ix_bookings_staff_start", "bookings", ["staff_id", "start_at"])
    op.create_index("ix_bookings_google_event_id", "bookings", ["google_event_id"])

    # --- payments ----------------------------------------------------------
    op.create_table(
        "payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("booking_id", sa.Integer(), nullable=False),
        sa.Column("business_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(32), server_default="dodo", nullable=False),
        sa.Column("provider_payment_id", sa.String(255), nullable=True),
        sa.Column("checkout_session_id", sa.String(255), nullable=True),
        sa.Column("amount_minor", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("status", payment_status, server_default="pending", nullable=False),
        sa.Column("refund_id", sa.String(255), nullable=True),
        sa.Column("refunded_amount_minor", sa.Integer(), server_default="0", nullable=False),
        *_ts(),
        sa.PrimaryKeyConstraint("id", name="pk_payments"),
        sa.ForeignKeyConstraint(
            ["booking_id"], ["bookings.id"],
            name="fk_payments_booking_id_bookings", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["business_id"], ["businesses.id"],
            name="fk_payments_business_id_businesses", ondelete="CASCADE",
        ),
        sa.UniqueConstraint("booking_id", name="uq_payments_booking_id"),
        sa.UniqueConstraint("provider_payment_id", name="uq_payments_provider_payment_id"),
        sa.CheckConstraint("amount_minor >= 0", name="ck_payments_amount_nonneg"),
        sa.CheckConstraint("refunded_amount_minor >= 0", name="ck_payments_refunded_nonneg"),
    )
    op.create_index("ix_payments_business_id", "payments", ["business_id"])
    op.create_index("ix_payments_checkout_session_id", "payments", ["checkout_session_id"])

    # --- calendar_connections ----------------------------------------------
    op.create_table(
        "calendar_connections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("staff_id", sa.Integer(), nullable=True),
        sa.Column("google_calendar_id", sa.String(255), nullable=False),
        sa.Column("access_token_enc", sa.Text(), nullable=False),
        sa.Column("refresh_token_enc", sa.Text(), nullable=True),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("watch_channel_id", sa.String(255), nullable=True),
        sa.Column("watch_resource_id", sa.String(255), nullable=True),
        sa.Column("watch_expires_at", sa.DateTime(timezone=True), nullable=True),
        *_ts(),
        sa.PrimaryKeyConstraint("id", name="pk_calendar_connections"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            name="fk_calendar_connections_user_id_users", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["staff_id"], ["staff_members.id"],
            name="fk_calendar_connections_staff_id_staff_members", ondelete="SET NULL",
        ),
        sa.UniqueConstraint("watch_channel_id", name="uq_calendar_connections_watch_channel_id"),
    )
    op.create_index("ix_calendar_connections_user_id", "calendar_connections", ["user_id"])
    op.create_index("ix_calendar_connections_staff_id", "calendar_connections", ["staff_id"])

    # --- calendar_busy_blocks ----------------------------------------------
    op.create_table(
        "calendar_busy_blocks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("connection_id", sa.Integer(), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        *_ts(),
        sa.PrimaryKeyConstraint("id", name="pk_calendar_busy_blocks"),
        sa.ForeignKeyConstraint(
            ["connection_id"], ["calendar_connections.id"],
            name="fk_calendar_busy_blocks_connection_id_calendar_connections", ondelete="CASCADE",
        ),
        sa.CheckConstraint("end_at > start_at", name="ck_calendar_busy_blocks_end_after_start"),
    )
    op.create_index(
        "ix_calendar_busy_blocks_conn_start", "calendar_busy_blocks", ["connection_id", "start_at"]
    )


def downgrade() -> None:
    for table in (
        "calendar_busy_blocks",
        "calendar_connections",
        "payments",
        "bookings",
        "time_off",
        "working_hours",
        "staff_services",
        "staff_members",
        "services",
        "businesses",
        "webhook_events",
        "refresh_tokens",
        "users",
    ):
        op.drop_table(table)

    bind = op.get_bind()
    for enum_type in reversed(ALL_ENUMS):
        enum_type.drop(bind, checkfirst=True)
    # Extensions are left installed; they may be shared with other schemas.
