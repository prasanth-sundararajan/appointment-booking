# PRP: SlotEase

> Implementation blueprint for parallel agent execution

---

## METADATA

| Field | Value |
|-------|-------|
| **Product** | SlotEase |
| **Type** | Multi-tenant SaaS (appointment booking) |
| **Version** | 1.0 |
| **Created** | 2026-11-19 |
| **Complexity** | High (payments, real-time, two-way calendar sync, concurrency) |
| **Source** | INITIAL.md |

---

## PRODUCT OVERVIEW

**Description:** A live, multi-business appointment booking app.
- Business owners create a business with a public booking page and set up services, staff and weekly availability.
- Customers find businesses in a directory, see open slots in real time, pay a deposit through Dodo Payments to book, and can cancel or reschedule.
- Owners and staff see bookings on a live calendar. Bookings sync both ways with Google Calendar.

**Value Proposition:**
- **For businesses:** fewer no-shows (every booking needs a deposit), no double-booking, a shareable booking link, and a calendar that stays in sync with Google.
- **For customers:** instant booking with live availability, and a clear refund rule.

**Roles:**
| Role | Can do |
|------|--------|
| Customer | Browse directory, book, pay deposit, cancel/reschedule own bookings |
| Owner | Manage own businesses, services, staff, hours, deposit/cutoff settings, all bookings and payments of their businesses |
| Staff | Manage own hours/time off, view and update own bookings, connect Google Calendar |

**Business Rules (must be enforced server-side):**
1. **Deposit:** `deposit_percent` defaults to **20**. The owner can change it (min **10**, max **100**). Deposit = `price_minor * deposit_percent / 100`, rounded half-up to the minor unit, in the business currency.
2. **Every booking requires a deposit.** A booking is `confirmed` only after a verified Dodo payment webhook.
3. **Slot hold:** creating a booking puts it in `pending_payment` with `hold_expires_at = now + 10 min`. The slot counts as taken while held. Expired holds become `expired` and free the slot.
4. **Refund rule:**
   - The customer cancels **at least `cancellation_cutoff_hours`** before start (default **8h**, owner can change): full deposit refund.
   - The customer cancels later than that: no refund.
   - The business cancels: always a full refund.
5. **Reschedule:** keeps the existing deposit. The new slot must be open. It must also be requested before the cutoff (same window as refunds).
6. **No double-booking:** a PostgreSQL exclusion constraint on `(staff_id, tstzrange(start_at, end_at))` where status is `pending_payment` or `confirmed`. A conflict returns 409.
7. **Tenant isolation:** every owner/staff query is scoped to businesses the user owns or works at.

**MVP Scope:**
- [ ] Email + Google login, roles: customer / owner / staff (staff via email invite)
- [ ] Businesses with public `/b/{slug}` pages + searchable `/explore` directory
- [ ] Services, staff, weekly hours, time off
- [ ] Slot engine (timezone, buffer, min notice, max advance, holds, Google busy times)
- [ ] Booking flow with holds + DB-level double-booking prevention
- [ ] Dodo deposits (default 20%, editable, min 10%; per-business currency) + refunds
- [ ] Cancel / reschedule with 8h (editable) refund cutoff
- [ ] Real-time slot updates + live owner dashboard/calendar (WebSockets)
- [ ] Two-way Google Calendar sync
- [ ] Email notifications
- [ ] Public deployment on Hostinger VPS (Docker + Nginx + HTTPS)

**Out of scope (later):** SMS/WhatsApp reminders, owner subscription plans, embeddable widget, reviews.

---

## TECH STACK

| Layer | Technology | Skill Reference |
|-------|------------|-----------------|
| Backend | FastAPI + Python 3.11+, SQLAlchemy 2.x, Pydantic v2 | skills/BACKEND.md |
| Frontend | React 18 + TypeScript + Vite, React Router, TanStack Query | skills/FRONTEND.md |
| Database | PostgreSQL 16 + SQLAlchemy + Alembic (`btree_gist` extension) | skills/DATABASE.md |
| Auth | JWT (access + refresh) + bcrypt + Google OAuth | skills/BACKEND.md |
| UI | Tailwind CSS + Framer Motion | skills/FRONTEND.md |
| Real-time | FastAPI WebSockets + in-process connection manager (Postgres LISTEN/NOTIFY to fan out across workers) | skills/BACKEND.md |
| Payments | Dodo Payments (checkout, refunds, webhooks) | skills/BACKEND.md |
| Calendar | Google Calendar API v3 (events, freebusy, push notifications) | skills/BACKEND.md |
| Background jobs | APScheduler in the backend (hold expiry, calendar watch renewal, busy-cache refresh) | skills/BACKEND.md |
| Email | SMTP via `aiosmtplib`, FastAPI BackgroundTasks | skills/BACKEND.md |
| Testing | pytest + pytest-asyncio + httpx, Vitest + React Testing Library | skills/TESTING.md |
| Deployment | Docker, docker-compose, Nginx, certbot, GitHub Actions, Hostinger VPS | skills/DEPLOYMENT.md |

> Dodo Payments and Google API request and response shapes must be checked against their current official docs during implementation. Do not guess field names.

---

## DATABASE MODELS

All timestamps are `timestamptz` in UTC. Every table has `id`, `created_at` and `updated_at`. Money is stored as integer minor units.

### User
- id, email (unique), hashed_password (nullable for OAuth-only), full_name, role (enum: customer | owner | staff), is_active, is_verified, oauth_provider (nullable), google_sub (nullable, unique), created_at, updated_at
- A user can be an owner and also a customer elsewhere. `role` is the primary role. Permissions are resolved from ownership/staff membership, not only from `role`.

### RefreshToken
- id, user_id (FK User), token_hash (unique), expires_at, revoked_at (nullable), created_at

### Business
- id, owner_id (FK User), name, slug (unique), description, category (enum: salon, clinic, fitness, consulting, education, other), city, timezone (IANA), currency (ISO 4217)
- deposit_percent (int, default 20, CHECK 10–100)
- cancellation_cutoff_hours (int, default 8, CHECK ≥ 0)
- booking_buffer_minutes (default 0), min_notice_hours (default 1), max_advance_days (default 60)
- phone, email, address, logo_url (nullable), is_active, created_at, updated_at
- Index: (category, city), trigram/ILIKE index on name for search

### Service
- id, business_id (FK), name, description, duration_minutes (CHECK > 0), price_minor (CHECK ≥ 0), is_active, created_at, updated_at

### StaffMember
- id, business_id (FK), user_id (FK User, nullable until invite accepted), display_name, email, invite_token (unique, nullable), is_active, created_at, updated_at
- Unique: (business_id, email)

### StaffService (association)
- staff_id (FK), service_id (FK). PK: (staff_id, service_id)

### WorkingHours
- id, staff_id (FK), weekday (0–6), start_time, end_time (CHECK end > start), created_at, updated_at

### TimeOff
- id, staff_id (FK), start_at, end_at, reason, created_at, updated_at

### Booking
- id, business_id, service_id, staff_id, customer_id (FKs)
- start_at, end_at
- status (enum: pending_payment, confirmed, cancelled, completed, no_show, expired)
- hold_expires_at (nullable), customer_note, cancelled_by (enum: customer | business, nullable), cancelled_at, google_event_id, created_at, updated_at
- **Exclusion constraint:** `EXCLUDE USING gist (staff_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&) WHERE (status IN ('pending_payment','confirmed'))`
- Indexes: (business_id, start_at), (customer_id, start_at), (status, hold_expires_at)

### Payment
- id, booking_id (FK, unique), business_id (FK), provider ("dodo"), provider_payment_id (unique, nullable), checkout_session_id (nullable), amount_minor, currency
- status (enum: pending, succeeded, failed, refunded)
- refund_id (nullable), refunded_amount_minor (default 0), created_at, updated_at

### WebhookEvent (idempotency)
- id, provider, event_id (unique), event_type, received_at, processed_at

### CalendarConnection
- id, user_id (FK), staff_id (FK, nullable), google_calendar_id, access_token_enc, refresh_token_enc (Fernet-encrypted), token_expires_at, watch_channel_id, watch_resource_id, watch_expires_at, created_at, updated_at

### CalendarBusyBlock
- id, connection_id (FK), start_at, end_at, synced_at
- Events that SlotEase itself created (matched by google_event_id) are ignored when blocking slots.

**Total: 13 models**

---

## MODULES

### Module 1: Authentication
**Agents:** DATABASE-AGENT + BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /auth/register | Create account (email, password, full_name, role: customer/owner) |
| POST | /auth/login | Returns access token. Refresh token goes in an httpOnly cookie |
| POST | /auth/refresh | Rotate refresh token, new access token |
| POST | /auth/logout | Revoke refresh token |
| GET | /auth/me | Current user + owned businesses + staff memberships |
| GET | /auth/google | Redirect to Google consent (openid email profile) |
| GET | /auth/google/callback | Exchange code, create/link user, redirect to frontend with tokens |

**Frontend Pages:**
| Route | Page | Components |
|-------|------|------------|
| /login | LoginPage | LoginForm, GoogleButton |
| /register | RegisterPage | RegisterForm (role picker: "I want to book" / "I run a business") |
| /profile | ProfilePage | ProfileForm |

---

### Module 2: Businesses & Directory
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/businesses?q=&category=&city=&page= | Public directory search (active only, paginated) |
| POST | /api/businesses | Create (owner). Slug is generated from the name and made unique |
| GET | /api/businesses/{slug} | Public business page (services + staff included) |
| PUT | /api/businesses/{id} | Update (owner). Validates deposit_percent 10–100 and cutoff ≥ 0 |
| DELETE | /api/businesses/{id} | Deactivate (owner) |
| GET | /api/me/businesses | Businesses I own |

**Frontend Pages:**
| Route | Page | Components |
|-------|------|------------|
| / | LandingPage | Hero, HowItWorks, CTA |
| /explore | ExplorePage | SearchBar, CategoryFilter, CityFilter, BusinessCard, Pagination |
| /b/{slug} | BusinessPage | BusinessHeader, ServiceList, StaffList, BookButton |
| /dashboard/businesses/new | CreateBusinessPage | BusinessForm |
| /dashboard/b/{id}/settings | BusinessSettingsPage | BusinessForm, DepositSettings (default 20%, min 10%), CancellationSettings (default 8h) |

---

### Module 3: Services & Staff
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/businesses/{id}/services | List active services (public) |
| POST | /api/businesses/{id}/services | Create (owner) |
| PUT | /api/services/{id} | Update (owner) |
| DELETE | /api/services/{id} | Soft delete (owner) |
| GET | /api/businesses/{id}/staff | List active staff (public) |
| POST | /api/businesses/{id}/staff | Invite staff by email (owner), sends invite email |
| POST | /api/staff/invites/{token}/accept | Link logged-in user to StaffMember |
| PUT | /api/staff/{id} | Update name / active / assigned service_ids (owner) |
| DELETE | /api/staff/{id} | Remove (owner). Rejected if the staff member has future confirmed bookings |

**Frontend Pages:**
| Route | Page | Components |
|-------|------|------------|
| /dashboard/b/{id}/services | ServicesPage | ServiceTable, ServiceFormModal |
| /dashboard/b/{id}/staff | StaffPage | StaffTable, InviteStaffModal, ServiceAssignment |
| /invite/{token} | AcceptInvitePage | InviteCard |

---

### Module 4: Availability & Slot Engine
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Slot algorithm (`services/slot_engine.py`, pure function plus a DB loader):**
1. Build working intervals for the date from WorkingHours, in the business timezone, and convert them to UTC. Handle DST correctly with `zoneinfo`.
2. Subtract TimeOff, active bookings (`pending_payment` with an unexpired hold, and `confirmed`) each padded by `booking_buffer_minutes`, and CalendarBusyBlocks.
3. Step through the remaining time in 15-minute increments. Keep each start where `[start, start + duration)` fits.
4. Drop slots before `now + min_notice_hours` and after `now + max_advance_days`.
5. With `staff_id` omitted, merge slots across all staff who offer the service, and record which staff are free for each slot.

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/staff/{id}/hours | Weekly hours |
| PUT | /api/staff/{id}/hours | Replace weekly hours (owner or that staff) |
| POST | /api/staff/{id}/time-off | Add time off |
| DELETE | /api/time-off/{id} | Remove time off |
| GET | /api/businesses/{id}/slots?service_id=&staff_id=&date= | Open slots (public) |

**Frontend Pages:**
| Route | Page | Components |
|-------|------|------------|
| /dashboard/b/{id}/availability | AvailabilityPage | StaffSelector, WeeklyHoursEditor, TimeOffList, TimeOffFormModal |

---

### Module 5: Bookings (Core)
**Agents:** DATABASE-AGENT + BACKEND-AGENT + FRONTEND-AGENT

**Create flow:**
1. `POST /api/bookings` checks the slot against the slot engine and calculates the deposit.
2. Inside one transaction, it inserts a Booking (`pending_payment`, hold 10 min) and a Payment (`pending`). If the exclusion constraint is violated, it returns **409 SLOT_TAKEN**.
3. It creates a Dodo checkout and returns `{booking_id, checkout_url}`.
4. It broadcasts `slot.taken` over WebSocket.
5. The Dodo webhook marks the payment succeeded and the booking confirmed. Then it sends emails, pushes the event to Google Calendar, and broadcasts `booking.confirmed`.
6. The APScheduler job runs every minute. It marks overdue holds `expired`, sets the payment to `failed`, and broadcasts `slot.freed`.

**Cancel flow:**
- **Customer:** if `start_at - now >= cancellation_cutoff_hours`, issue a full Dodo refund. Otherwise, no refund.
- **Business** (owner/staff): always issue a full refund.
- In both cases, set status `cancelled`, delete the Google event, send emails and broadcast `slot.freed`.

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/bookings | Create hold + checkout URL. 409 if slot taken |
| GET | /api/me/bookings?scope=upcoming\|past | My bookings (customer) |
| GET | /api/bookings/{id} | Detail (customer, owner or assigned staff) |
| POST | /api/bookings/{id}/cancel | Cancel. Response includes `refund: {eligible, amount_minor}` |
| GET | /api/bookings/{id}/cancel-preview | Shows whether a cancel now would be refunded (for the UI) |
| POST | /api/bookings/{id}/reschedule | Move to a new open slot (before cutoff). Updates the Google event |
| GET | /api/businesses/{id}/bookings?from=&to=&staff_id=&status= | Calendar data (owner/staff) |
| PATCH | /api/bookings/{id}/status | completed / no_show (owner/staff) |

**Frontend Pages:**
| Route | Page | Components |
|-------|------|------------|
| /b/{slug}/book | BookingWizardPage | ServiceStep, StaffStep ("Any available"), DateStep, SlotGrid (live), ConfirmStep (shows deposit amount + refund rule), HoldCountdown |
| /bookings/success | BookingSuccessPage | Polls booking until confirmed |
| /bookings | MyBookingsPage | Tabs (Upcoming/Past), BookingCard |
| /bookings/{id} | BookingDetailPage | BookingSummary, CancelDialog (shows refund outcome), RescheduleDialog |
| /dashboard/b/{id}/calendar | CalendarPage | DayView, WeekView, StaffFilter, BookingDrawer, live toast |

---

### Module 6: Payments (Dodo)
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

- `services/payments/dodo.py` wraps create-checkout, refund and webhook verification behind a `PaymentProvider` interface, so tests use a fake.
- The webhook checks the signature with `DODO_WEBHOOK_SECRET`. Dodo follows the Standard Webhooks spec; confirm this in Dodo's docs.
- It deduplicates through `WebhookEvent.event_id` and handles payment succeeded, payment failed and refund succeeded.
- If a payment-succeeded webhook arrives after the hold expired and the slot was taken by someone else, refund automatically and mark the booking `expired`.

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/payments/dodo/webhook | Signature-verified, idempotent |
| GET | /api/businesses/{id}/payments?from=&to= | Deposits and refunds (owner) |

**Frontend Pages:**
| Route | Page | Components |
|-------|------|------------|
| /dashboard/b/{id}/payments | PaymentsPage | PaymentsTable, TotalsCard |

---

### Module 7: Real-time
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

| Method | Endpoint | Description |
|--------|----------|-------------|
| WS | /ws/businesses/{id}/slots | Public. Events: `slot.taken`, `slot.freed` `{staff_id, start_at, end_at}` |
| WS | /ws/businesses/{id}/dashboard?token= | Owner/staff JWT. Events: `booking.created`, `booking.confirmed`, `booking.cancelled`, `booking.rescheduled` |

- `realtime/manager.py` keeps connections per business. Events are published through Postgres NOTIFY so every uvicorn worker receives them.
- Frontend `useBusinessSocket` hook: auto-reconnect with backoff. On each event it invalidates TanStack Query caches (slots, bookings, dashboard stats).
- Nginx must pass `Upgrade`/`Connection` headers for `/ws/`.

---

### Module 8: Google Calendar Sync (Two-way)
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

- This OAuth flow is separate from login. Scopes: `calendar.events` and `calendar.readonly` (for freebusy). Access is offline, so a refresh token is stored. Tokens are encrypted with `TOKEN_ENCRYPTION_KEY` (Fernet).
- **Push:** on confirm, reschedule or cancel, create, patch or delete the event on the staff member's calendar, and store `google_event_id`. Failures are logged and retried by the scheduler; they never block the booking.
- **Pull:** freebusy for the next `max_advance_days`, stored in CalendarBusyBlock. Refreshed on a Google push notification (`events.watch`) and by a 5-minute scheduler fallback. Watch channels are renewed before they expire.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/calendar/google/connect | Start OAuth (owner/staff) |
| GET | /api/calendar/google/callback | Store tokens, create watch, first sync |
| DELETE | /api/calendar/google | Disconnect, stop watch, delete busy blocks |
| POST | /api/calendar/google/notifications | Google push webhook (validates channel token) |

| Route | Page | Components |
|-------|------|------------|
| /settings/calendar | CalendarSettingsPage | ConnectGoogleCard, SyncStatus |

---

### Module 9: Notifications
**Agents:** BACKEND-AGENT

- `services/email.py` with Jinja2 templates for: booking confirmed (customer + business), booking cancelled (with the refund outcome), booking rescheduled, staff invite.
- Emails are sent through BackgroundTasks. Failures are logged with `logging` and never raised to the request.
- With SMTP unset in dev, emails are only logged.

---

### Module 10: Dashboard
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/businesses/{id}/stats | Today's bookings, upcoming count, this week's count, deposits collected (minor units), top services |
| GET | /health | Health check (DB ping) |

| Route | Page | Components |
|-------|------|------------|
| /dashboard | DashboardPage | BusinessSwitcher, StatCards, TodayList (live), TopServicesChart |
| /settings | SettingsPage | AccountSettings, link to calendar settings |

---

### Module 11: Deployment (Hostinger VPS)
**Agents:** DEVOPS-AGENT

- `backend/Dockerfile` runs gunicorn with uvicorn workers. `frontend/Dockerfile` is a multi-stage Vite build served by Nginx.
- `docker-compose.yml` (dev): db, backend, frontend.
- `docker-compose.prod.yml`:
  - Services: db (volume), backend, frontend, nginx (reverse proxy, `/api` + `/auth` + `/ws` to backend, rest to frontend), certbot.
  - On start: `alembic upgrade head`.
- `deploy/nginx.conf` with WebSocket upgrade, gzip and security headers. `deploy/backup.sh` runs a daily `pg_dump` from cron and keeps 7 days.
- `.github/workflows/ci.yml` runs ruff, pytest with coverage, npm lint, type-check, test and docker build.
- `.github/workflows/deploy.yml` SSHes into the VPS on push to `main`, then runs `git pull`, `docker compose -f docker-compose.prod.yml up -d --build`. VPS host, user and key come from GitHub secrets.
- `deploy/README.md`: one-time VPS setup (Docker, firewall 80/443/22, DNS A record to the VPS IP, certbot issue, server `.env`).
- Register the Dodo webhook URL and the Google OAuth redirect URIs on the production domain.

---

## PHASE EXECUTION PLAN

**Phase 1: Foundation (4 agents in parallel)**
- DATABASE-AGENT:
  - `database.py`, all 13 models, enums
  - Initial Alembic migration with `btree_gist` and the booking exclusion constraint
  - Seed script (demo business, services, staff, hours)
- BACKEND-AGENT: `main.py`, `config.py` (pydantic-settings), structure for routers/services/schemas/auth/realtime/payments, logging setup, `/health`, error handlers, CORS
- FRONTEND-AGENT: Vite + TS + Tailwind + Framer Motion, router, API client (typed, auth refresh interceptor), AuthContext, layout, base UI components (Button, Input, Modal, Card, Toast)
- DEVOPS-AGENT: Dockerfiles, docker-compose (dev + prod), nginx.conf, `.env.example`, CI workflow

**Validation Gate 1:** `pip install -r requirements.txt`, `alembic upgrade head`, `npm install`, `docker-compose config`

**Phase 2: Modules (backend + frontend in parallel per module)**
1. Auth: JWT + Google login + Login/Register/Profile pages
2. Businesses & Directory: CRUD + search + Explore/Business/Settings pages
3. Services & Staff: CRUD + invites + management pages
4. Availability & Slot Engine: hours/time-off + slot algorithm + availability page
5. Bookings + Payments (together, tightly coupled): hold/checkout/webhook/cancel/reschedule + booking wizard, My Bookings, Payments page
6. Real-time: WS manager + NOTIFY fan-out + `useBusinessSocket` + live SlotGrid/Calendar/Dashboard
7. Google Calendar: OAuth + push/pull sync + scheduler jobs + settings page
8. Notifications + Dashboard: email templates + stats endpoint + dashboard page

Order: 1 → 2 → 3 → 4 → 5. Modules 6, 7 and 8 can run in parallel after 5.

**Validation Gate 2:** `ruff check backend/`, `mypy backend/app`, `npm run lint`, `npm run type-check`

**Phase 3: Quality (3 agents in parallel)**
- TEST-AGENT: pytest + RTL. Required tests:
  - Slot engine: timezone/DST, buffer, notice, advance, time off, busy blocks
  - **Concurrent booking** of the same slot: exactly one 201, the other 409
  - Hold expiry frees the slot
  - Deposit math: default 20%, custom %, min 10% validation, rounding, per currency
  - Refund rule: customer ≥ 8h refunded, customer < 8h not refunded, business always refunded, custom cutoff honoured
  - Webhook signature rejection + idempotency, plus a late payment on an expired hold triggering an auto refund
  - Tenant isolation: an owner of A gets 403/404 on B's resources
  - WebSocket events emitted on create/confirm/cancel/expire
  - Google sync with a mocked client: push on confirm/cancel, busy blocks remove slots
  - Frontend: booking wizard, cancel dialog refund message, SlotGrid live update
- REVIEW-AGENT: security (JWT, OAuth state/PKCE, webhook verification, token encryption, IDOR, rate limiting on auth/booking), performance (slot query indexes, N+1), CLAUDE.md compliance (no print, no `any`, no console.log, no inline styles, no hardcoded secrets)
- RESEARCH-AGENT: check the Dodo Payments and Google Calendar API integrations against their current docs

**Final Validation:** full test suite, docker build, health check. Then a manual end-to-end run in two browsers: book, the slot disappears live, pay in Dodo test mode, booking confirmed, event in Google Calendar, cancel, refund.

---

## VALIDATION GATES

| Gate | Commands |
|------|----------|
| 1 | `alembic upgrade head`, `npm install`, `docker-compose config` |
| 2 | `ruff check backend/`, `mypy backend/app`, `npm run lint`, `npm run type-check` |
| 3 | `pytest --cov=app --cov-fail-under=80`, `npm test` |
| Final | `docker-compose build`, `docker-compose up -d`, `curl localhost:8000/health` |
| Prod | `docker compose -f docker-compose.prod.yml config`, `curl https://<domain>/health` |

---

## ENVIRONMENT VARIABLES

```env
# Core
DATABASE_URL=postgresql://user:password@localhost:5432/slotease
SECRET_KEY=change-me
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=14
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:8000
CORS_ORIGINS=http://localhost:5173

# Google (login + calendar)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_LOGIN_REDIRECT_URI=http://localhost:8000/auth/google/callback
GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:8000/api/calendar/google/callback
TOKEN_ENCRYPTION_KEY=fernet-key-base64

# Dodo Payments
DODO_API_KEY=your-dodo-key
DODO_WEBHOOK_SECRET=your-webhook-secret
DODO_ENVIRONMENT=test_mode

# Booking defaults
DEFAULT_DEPOSIT_PERCENT=20
MIN_DEPOSIT_PERCENT=10
DEFAULT_CANCELLATION_CUTOFF_HOURS=8
HOLD_MINUTES=10

# Email
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
EMAIL_FROM=no-reply@yourdomain.com

# Frontend
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000

# Production (server .env only)
DOMAIN=yourdomain.com
CERTBOT_EMAIL=admin@yourdomain.com
```

---

## RISKS & NOTES

- **Concurrency:** rely on the DB exclusion constraint, not on application checks alone.
- **Multiple workers:** WebSocket broadcasts must go through Postgres NOTIFY, or live updates will only reach clients on the same worker.
- **Scheduler:** run APScheduler in a single process (a dedicated `scheduler` container or a lock via `pg_try_advisory_lock`) so jobs don't run twice.
- **Google push notifications** need a public HTTPS URL, so they only work in production or through a tunnel in dev. The 5-minute polling fallback covers dev.
- **Dodo test mode** must be used until launch.

---

## NEXT STEP

Execute with parallel agents:
/execute-prp PRPs/slotease-prp.md
