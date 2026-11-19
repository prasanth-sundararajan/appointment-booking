# INITIAL.md - Define Your Product

> Fill this out, then run `/generate-prp INITIAL.md`

---

## PRODUCT

**Name:** SlotEase

**Description:** A live, multi-business appointment booking app. Business owners (salons, clinics, tutors, consultants, etc.) sign up, create a business with its own public booking page, and set up services, staff and weekly availability. Customers find businesses in a directory, see open time slots in real time, pay a deposit to book, and can cancel or reschedule. Owners and staff see new bookings on a live calendar, and bookings sync both ways with Google Calendar.

**Type:** SaaS (multi-tenant: one platform, many businesses)

**Roles:**
- **Customer** - browses businesses, books, pays deposits, cancels/reschedules
- **Business Owner** - manages their business(es), services, staff, hours, deposit settings and bookings
- **Staff** - manages their own hours, time off, calendar and Google Calendar connection

---

## TECH STACK

| Layer | Choice |
|-------|--------|
| Backend | FastAPI + Python 3.11+ |
| Frontend | React + TypeScript + Vite |
| Database | PostgreSQL + SQLAlchemy + Alembic |
| Auth | JWT + Google OAuth |
| UI | Tailwind CSS + Framer Motion |
| Real-time | WebSockets (FastAPI) |
| Payments | Dodo Payments (deposits + refunds, webhooks) |
| Calendar | Google Calendar API (two-way sync) |
| Email | SMTP via env vars |
| Hosting | Hostinger VPS, docker-compose, Nginx + HTTPS (Let's Encrypt) on own domain |

---

## MODULES

### Module 1: Authentication (Built-in)

**Models:** User (role: customer | owner | staff), RefreshToken

**Endpoints:**
- POST /auth/register, /auth/login, /auth/refresh, /auth/logout
- GET /auth/me, /auth/google, /auth/google/callback

**Pages:** /login, /register, /profile

---

### Module 2: Businesses & Directory

**Description:** Owners create businesses. Each has a unique public slug (`/b/{slug}`), its own timezone, currency, deposit percentage and booking rules. Active businesses appear in a public, searchable directory.

**Models:**
```
Business:
  - id, owner_id (FK -> User)
  - name: str
  - slug: str (unique, URL-safe)
  - description: text | null
  - category: str (salon, clinic, fitness, consulting, education, other)
  - city: str | null
  - timezone: str (IANA, e.g. "Asia/Kolkata")
  - currency: str (ISO 4217, e.g. "INR", "USD")
  - deposit_percent: int (default 20, owner-editable, min 10, max 100)
  - cancellation_cutoff_hours: int (default 8, owner-editable) - full refund if customer cancels at least this many hours before start
  - booking_buffer_minutes: int (default 0)
  - min_notice_hours: int (default 1)
  - max_advance_days: int (default 60)
  - phone, email, address: str | null
  - logo_url: str | null
  - is_active: bool
  - created_at, updated_at
```

**Endpoints:**
```
GET    /api/businesses?q=&category=&city=&page=  - Public directory search
POST   /api/businesses                           - Create (owner)
GET    /api/businesses/{slug}                    - Public business page data
PUT    /api/businesses/{id}                      - Update (owner)
DELETE /api/businesses/{id}                      - Deactivate (owner)
GET    /api/me/businesses                        - Businesses I own
```

**Pages:**
```
/explore                     - Directory: search + filter by category/city
/b/{slug}                    - Public business page
/dashboard/businesses/new    - Create business
/dashboard/b/{id}/settings   - Business settings (incl. currency, deposit %, cutoff)
```

---

### Module 3: Services & Staff

**Models:**
```
Service:
  - id, business_id (FK)
  - name: str
  - description: text | null
  - duration_minutes: int
  - price_minor: int (price in smallest currency unit, business currency)
  - is_active: bool
  - created_at, updated_at

StaffMember:
  - id, business_id (FK), user_id (FK -> User, null until invite accepted)
  - display_name: str
  - email: str
  - invite_token: str | null
  - is_active: bool
  - created_at, updated_at

StaffService (M2M):
  - staff_id (FK), service_id (FK)
```

**Endpoints:**
```
GET    /api/businesses/{id}/services        - List (public)
POST   /api/businesses/{id}/services        - Create (owner)
PUT    /api/services/{id}                   - Update (owner)
DELETE /api/services/{id}                   - Delete (owner)
GET    /api/businesses/{id}/staff           - List (public)
POST   /api/businesses/{id}/staff           - Invite staff by email (owner)
POST   /api/staff/invites/{token}/accept    - Accept invite (logged-in user)
PUT    /api/staff/{id}                      - Update, assign services (owner)
DELETE /api/staff/{id}                      - Remove (owner)
```

**Pages:**
```
/dashboard/b/{id}/services   - Manage services
/dashboard/b/{id}/staff      - Manage staff + invites
/invite/{token}              - Accept staff invite
```

---

### Module 4: Availability & Slot Engine

**Description:** Open slots = weekly working hours - time off - existing bookings (incl. pending-payment holds) - Google Calendar busy times - buffer, limited by min notice and max advance, computed in the business timezone and stored/returned in UTC.

**Models:**
```
WorkingHours:
  - id, staff_id (FK)
  - weekday: int (0=Mon..6=Sun)
  - start_time, end_time: time
  - created_at, updated_at

TimeOff:
  - id, staff_id (FK)
  - start_at, end_at: datetime (UTC)
  - reason: str | null
  - created_at, updated_at
```

**Endpoints:**
```
GET    /api/staff/{id}/hours                 - Get weekly hours
PUT    /api/staff/{id}/hours                 - Replace weekly hours (owner/staff)
POST   /api/staff/{id}/time-off              - Add time off
DELETE /api/time-off/{id}                    - Remove time off
GET    /api/businesses/{id}/slots?service_id=&staff_id=&date=
                                             - Open slots (public; staff_id optional = any staff)
```

**Pages:**
```
/dashboard/b/{id}/availability - Weekly hours editor + time off
```

---

### Module 5: Bookings (Core)

**Description:** Customer picks service -> staff (or "any") -> date -> slot, then pays the deposit. Creating a booking places a `pending_payment` hold on the slot (expires after 10 minutes if unpaid). The Dodo webhook confirms it. Every booking requires a deposit, so there is no booking without payment. Double-booking is prevented by a PostgreSQL exclusion constraint on (staff_id, tstzrange(start_at, end_at)) for statuses pending_payment/confirmed, so concurrent requests get a 409.

**Models:**
```
Booking:
  - id, business_id (FK), service_id (FK), staff_id (FK), customer_id (FK -> User)
  - start_at, end_at: datetime (UTC)
  - status: enum (pending_payment, confirmed, cancelled, completed, no_show, expired)
  - hold_expires_at: datetime | null
  - customer_note: text | null
  - cancelled_by: enum (customer, business) | null
  - cancelled_at: datetime | null
  - google_event_id: str | null
  - created_at, updated_at
```

**Rules:**
- Customers can cancel or reschedule. Rescheduling keeps the existing deposit; the new slot must be open.
- A customer cancelling at least `cancellation_cutoff_hours` (default 8h) before the start gets a full deposit refund. Later than that, no refund.
- A business cancelling always refunds the deposit in full.
- Unpaid holds expire automatically (background job) and free the slot.

**Endpoints:**
```
POST   /api/bookings                         - Create hold -> returns Dodo checkout URL; 409 if slot taken
GET    /api/me/bookings?scope=upcoming|past  - My bookings (customer)
GET    /api/bookings/{id}                    - Get one (customer, owner, or assigned staff)
POST   /api/bookings/{id}/cancel             - Cancel (applies refund rule)
POST   /api/bookings/{id}/reschedule         - Move to a new open slot
GET    /api/businesses/{id}/bookings?from=&to=&staff_id=&status=
                                             - Business calendar (owner/staff)
PATCH  /api/bookings/{id}/status             - Mark completed / no_show (owner/staff)
```

**Pages:**
```
/b/{slug}/book               - Booking wizard -> Dodo checkout
/bookings/success            - Return page after payment
/bookings                    - My bookings (customer)
/bookings/{id}               - Booking detail, cancel/reschedule
/dashboard/b/{id}/calendar   - Day/week calendar (owner/staff), live updating
```

---

### Module 6: Payments (Dodo)

**Description:** Deposit = service price x business deposit_percent, in the business currency. Dodo handles checkout. A verified webhook confirms the booking and issues refunds.

**Models:**
```
Payment:
  - id, booking_id (FK), business_id (FK)
  - provider: str ("dodo")
  - provider_payment_id: str | null
  - amount_minor: int
  - currency: str
  - status: enum (pending, succeeded, failed, refunded, partially_refunded)
  - refund_id: str | null
  - refunded_amount_minor: int (default 0)
  - created_at, updated_at
```

**Endpoints:**
```
POST /api/payments/dodo/webhook              - Signature-verified, idempotent; confirms booking / records refunds
GET  /api/businesses/{id}/payments?from=&to= - Deposit history (owner)
```

**Pages:**
```
/dashboard/b/{id}/payments   - Deposits and refunds list
```

---

### Module 7: Real-time

**Description:** WebSocket channels broadcast changes so the UI updates without a refresh.

**Endpoints:**
```
WS /ws/businesses/{id}/slots      - Public: slot taken/freed events (booking page refetches slots)
WS /ws/businesses/{id}/dashboard  - Auth (owner/staff): booking created/confirmed/cancelled/rescheduled
```

**Behavior:**
- Booking pages remove a slot as soon as a hold is placed and add it back if the hold expires or the booking is cancelled.
- The owner/staff calendar and dashboard show new bookings instantly, with a toast.
- Clients reconnect automatically.

---

### Module 8: Google Calendar Sync (Two-way)

**Description:** Owners and staff connect their Google Calendar with OAuth (calendar scope, separate from login).
- **Push:** confirmed, rescheduled and cancelled bookings create, update or delete events on the staff member's calendar.
- **Pull:** busy times from the connected calendar block slots (freebusy query, cached about 5 minutes, refreshed through Google push notifications).

**Models:**
```
CalendarConnection:
  - id, user_id (FK), staff_id (FK, nullable)
  - google_calendar_id: str
  - access_token, refresh_token: str (encrypted at rest)
  - token_expires_at: datetime
  - watch_channel_id, watch_resource_id: str | null
  - watch_expires_at: datetime | null
  - created_at, updated_at

CalendarBusyBlock (cache):
  - id, connection_id (FK)
  - start_at, end_at: datetime (UTC)
  - synced_at: datetime
```

**Endpoints:**
```
GET    /api/calendar/google/connect          - Start OAuth
GET    /api/calendar/google/callback         - OAuth callback
DELETE /api/calendar/google                  - Disconnect
POST   /api/calendar/google/notifications    - Google push channel webhook
```

**Pages:**
```
/settings/calendar           - Connect/disconnect Google Calendar
```

---

### Module 9: Notifications

**Description:** Email the customer and the business when a booking is confirmed, cancelled (stating the refund outcome) or rescheduled, and when a staff invite is sent. Emails go out via FastAPI BackgroundTasks and never block the request. Failures are logged.

---

### Module 10: Dashboard

**Pages:**
- `/dashboard`: owner overview, live updating. Shows today's bookings, upcoming count, this week's bookings, deposits collected, and top services.
- `/settings`: account settings.

---

### Module 11: Deployment (Hostinger VPS)

- `docker-compose.prod.yml`: backend (uvicorn/gunicorn), frontend (static build served by Nginx), PostgreSQL with a persistent volume, Nginx reverse proxy with WebSocket upgrade support
- HTTPS on the owner's domain via Let's Encrypt (certbot)
- All secrets live in a server-side `.env` and are never committed
- Alembic migrations run on deploy
- Daily PostgreSQL backups
- GitHub Actions CI: lint, type-check, tests, docker build

---

## MVP SCOPE

Must Have:
- [x] User registration/login (email + Google)
- [ ] Customer, Owner, Staff roles with staff invites
- [ ] Businesses with public pages + searchable directory
- [ ] Services, staff, weekly hours, time off
- [ ] Slot engine (timezone, buffer, notice, advance window, Google busy times)
- [ ] Booking flow with slot holds and double-booking prevention
- [ ] Dodo deposits (default 20%, owner can change, min 10%; per-business currency) + full refund if cancelled 8h+ before
- [ ] Cancel / reschedule
- [ ] Real-time slot updates + live owner dashboard/calendar
- [ ] Two-way Google Calendar sync
- [ ] Email confirmations
- [ ] Public deployment on Hostinger VPS with HTTPS

Later:
- [ ] SMS / WhatsApp reminders
- [ ] Owner subscription plans
- [ ] Embeddable booking widget
- [ ] Reviews and ratings

---

## ACCEPTANCE CRITERIA

- [ ] Users can register and log in (email/password and Google)
- [ ] An owner can create a business, invite staff, and share `/b/{slug}`; the business appears in `/explore`
- [ ] Owners can CRUD services, staff, hours and time off
- [ ] Slots respect timezone, working hours, time off, buffer, min notice, max advance and Google busy times
- [ ] Two concurrent requests for the same slot: exactly one succeeds, the other gets 409
- [ ] Unpaid holds expire and free the slot
- [ ] Deposit = price x deposit_percent in the business currency. A paid webhook confirms the booking, and webhooks are signature-verified and idempotent
- [ ] New businesses default to a 20% deposit and an 8h cutoff, and owners can change both (deposit must stay at 10% or more)
- [ ] Customer cancels 8h+ before and gets a full refund. Customer cancels with less than 8h to go and gets no refund. Business cancels and the customer gets a full refund
- [ ] A booking made in one browser removes the slot in another open browser and appears on the owner dashboard without a refresh
- [ ] Confirmed bookings appear on the staff member's Google Calendar, and Google busy events block SlotEase slots
- [ ] Owners and staff cannot access another business's data (tenant isolation tests)
- [ ] 80%+ test coverage
- [ ] Docker builds successfully, and the app runs over HTTPS on the Hostinger VPS domain

---

## RUN

```bash
/generate-prp INITIAL.md
/execute-prp PRPs/slotease-prp.md
```
