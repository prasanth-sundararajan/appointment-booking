"""StaffService association (which staff member can perform which service).

Exposed as a mapped class; `StaffMember.services` / `Service.staff_members` use it as
the `secondary` table, so add links through those collections or insert rows directly.
"""

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin


class StaffService(TimestampMixin, Base):
    __tablename__ = "staff_services"

    staff_id: Mapped[int] = mapped_column(
        ForeignKey("staff_members.id", ondelete="CASCADE"), primary_key=True
    )
    service_id: Mapped[int] = mapped_column(
        ForeignKey("services.id", ondelete="CASCADE"), primary_key=True, index=True
    )
