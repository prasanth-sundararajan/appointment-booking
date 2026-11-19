"""Seed demo data: one owner, one business (Asia/Kolkata, INR), 2 services, 2 staff, Mon-Sat hours.

Usage (from backend/):  python -m app.seed

Env vars:
    SEED_OWNER_EMAIL     default: owner@slotease.demo
    SEED_OWNER_PASSWORD  if unset, a random password is generated and logged once
Idempotent: does nothing if the demo business slug already exists.
"""

import logging
import os
import secrets
from datetime import time

from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import (
    Business,
    BusinessCategory,
    Service,
    StaffMember,
    User,
    UserRole,
    WorkingHours,
)

logger = logging.getLogger("app.seed")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

DEMO_SLUG = "glow-studio-demo"
WORKDAYS: range = range(0, 6)  # Monday (0) .. Saturday (5)
OPEN_AT = time(9, 0)
CLOSE_AT = time(18, 0)


def _get_or_create_owner(db: Session, email: str) -> User:
    owner = db.scalar(select(User).where(User.email == email))
    if owner is not None:
        return owner

    password = os.environ.get("SEED_OWNER_PASSWORD")
    if not password:
        password = secrets.token_urlsafe(12)
        logger.warning("SEED_OWNER_PASSWORD not set; generated demo password: %s", password)

    owner = User(
        email=email,
        hashed_password=pwd_context.hash(password),
        full_name="Demo Owner",
        role=UserRole.owner,
        is_active=True,
        is_verified=True,
    )
    db.add(owner)
    db.flush()
    return owner


def seed(db: Session) -> None:
    if db.scalar(select(Business).where(Business.slug == DEMO_SLUG)) is not None:
        logger.info("Demo business '%s' already exists; skipping seed.", DEMO_SLUG)
        return

    owner_email = os.environ.get("SEED_OWNER_EMAIL", "owner@slotease.demo")
    owner = _get_or_create_owner(db, owner_email)

    business = Business(
        owner_id=owner.id,
        name="Glow Studio",
        slug=DEMO_SLUG,
        description="Hair and beauty salon in the heart of the city.",
        category=BusinessCategory.salon,
        city="Bengaluru",
        timezone="Asia/Kolkata",
        currency="INR",
        deposit_percent=20,
        cancellation_cutoff_hours=8,
        booking_buffer_minutes=10,
        min_notice_hours=1,
        max_advance_days=60,
        phone="+91 80 0000 0000",
        email=owner_email,
        address="12 MG Road, Bengaluru",
        is_active=True,
    )
    db.add(business)
    db.flush()

    haircut = Service(
        business_id=business.id,
        name="Haircut & Styling",
        description="Wash, cut and blow-dry.",
        duration_minutes=45,
        price_minor=80000,  # INR 800.00
    )
    facial = Service(
        business_id=business.id,
        name="Signature Facial",
        description="Deep-cleansing 60 minute facial.",
        duration_minutes=60,
        price_minor=150000,  # INR 1500.00
    )
    db.add_all([haircut, facial])
    db.flush()

    staff_a = StaffMember(
        business_id=business.id, display_name="Priya Sharma", email="priya@slotease.demo"
    )
    staff_b = StaffMember(
        business_id=business.id, display_name="Arjun Mehta", email="arjun@slotease.demo"
    )
    staff_a.services = [haircut, facial]
    staff_b.services = [haircut]
    db.add_all([staff_a, staff_b])
    db.flush()

    for staff in (staff_a, staff_b):
        for weekday in WORKDAYS:
            db.add(
                WorkingHours(
                    staff_id=staff.id, weekday=weekday, start_time=OPEN_AT, end_time=CLOSE_AT
                )
            )

    db.commit()
    logger.info(
        "Seeded business '%s' (/b/%s) owned by %s with 2 services and 2 staff.",
        business.name,
        business.slug,
        owner_email,
    )


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s"
    )
    db = SessionLocal()
    try:
        seed(db)
    except Exception:
        db.rollback()
        logger.exception("Seeding failed")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
