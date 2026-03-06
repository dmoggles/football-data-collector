# Football Data Collector - Project Plan

## Goal
Build a web app for fast football event collection during live matches, with user-specific data, secure authentication, and minimal friction match-day workflows.

## Confirmed Technical Decisions
- Backend language: Python
- Python package/env manager: `uv`
- Database: MySQL (existing server)
- API style: REST (initially)

## Product Scope
### MVP Features
- User registration, login, logout
- Session management with secure cookies
- User-owned teams and players
- User-owned matches and squad setup
- Live event entry (goal, shot, foul, yellow card, red card, substitution)
- Match clock controls (start/pause/resume/end)
- Event timeline with edit/delete
- CSV/JSON export per match

### Post-MVP Ideas
- Team templates and duplicated lineups
- Touch-optimized match-day mode
- Advanced event taxonomy (xG tags, zones, assists, build-up chains)
- Multi-user collaboration on same match
- Basic analytics dashboards

## Architecture (Initial)
- `backend/`: FastAPI app
- `frontend/`: UI app (React/Next.js or thin server-rendered UI)
- `infra/`: local/dev config and deployment assets
- `docs/`: architecture notes and API contract

## Data Model (v1)
- `users`
  - id, email (unique), password_hash, created_at, updated_at
- `sessions`
  - id, user_id, token_hash, expires_at, created_at
- `teams`
  - id, user_id, name, created_at, updated_at
- `players`
  - id, user_id, team_id, display_name, shirt_number, position, created_at, updated_at
- `matches`
  - id, user_id, home_team_id, away_team_id, kickoff_at, status, created_at, updated_at
- `match_squads`
  - id, match_id, player_id, team_id, is_starting, created_at
- `events`
  - id, match_id, user_id, team_id, player_id, event_type, match_second, metadata_json, created_at

## Security and Access Rules
- Every business object is owned by a `user_id`.
- All reads/writes enforce ownership.
- Passwords stored with a modern password hash (Argon2 or bcrypt).
- Sessions rotate on login and can be revoked on logout.
- CSRF protections enabled for cookie-auth endpoints.

## Delivery Phases
## Phase 0: Foundation (1-2 days)
- Initialize repo structure
- Initialize Python project with `uv`
- Add linting/formatting/testing baseline
- Add `.env.example` with MySQL connection settings

## Phase 1: Auth + Sessions (2-3 days)
- User model and auth endpoints
- Secure session cookies and session table
- Auth middleware/dependency
- Basic auth tests

## Phase 2: Teams + Players (2-3 days)
- Team and player CRUD
- Ownership checks across all endpoints
- Seed data helper for local dev

## Phase 3: Matches + Squads (2-3 days)
- Match CRUD
- Squad assignment endpoints
- Validation (player belongs to selected team/user)

## Phase 4: Live Event Entry (3-4 days)
- Match clock controls
- Event create/edit/delete
- Timeline endpoint and UI
- Match lock/finalize flow

## Phase 5: Export + Hardening (2-3 days)
- CSV/JSON export
- Error handling and API consistency pass
- Permission test coverage pass
- Initial deploy checklist

## Immediate Next Tasks
1. Create `pyproject.toml` and lock core dependencies with `uv`
2. Add MySQL connection config and SQLAlchemy base setup
3. Create initial Alembic migration for `users` and `sessions`
4. Implement auth endpoints (`/auth/register`, `/auth/login`, `/auth/logout`, `/auth/me`)
5. Add ownership guard utility for all protected queries

## Risks and Mitigations
- Risk: Session/auth complexity slows early UI progress
  - Mitigation: complete auth first and reuse dependency guards everywhere
- Risk: Inconsistent event semantics
  - Mitigation: centralize event enum and metadata schema early
- Risk: MySQL environment differences between local and server
  - Mitigation: define one canonical connection/config pattern in docs + env template
