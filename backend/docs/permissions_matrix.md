# Permissions Matrix

This document defines backend authorization expectations for current roles and scopes.

## Role Definitions

- `anonymous`: no authenticated session.
- `authenticated`: logged-in user with no required elevated role.
- `team_member`: user has any membership on a given team.
- `manager`: user has `manager` membership on a given team.
- `super_admin`: platform-level global role (`global_roles.role = super_admin`).

## Route Matrix

| Area | Route | anonymous | authenticated | team_member | manager | super_admin |
|---|---|---:|---:|---:|---:|---:|
| Auth | `POST /auth/register` | ✅ | ✅ | ✅ | ✅ | ✅ |
| Auth | `POST /auth/login` | ✅ | ✅ | ✅ | ✅ | ✅ |
| Auth | `POST /auth/logout` | ✅ | ✅ | ✅ | ✅ | ✅ |
| Auth | `GET /auth/me` | ❌ | ✅ | ✅ | ✅ | ✅ |
| Auth | `POST /auth/change-password` | ❌ | ✅ | ✅ | ✅ | ✅ |
| Health | `GET /health` | ✅ | ✅ | ✅ | ✅ | ✅ |
| Teams | `GET /teams` | ❌ | ✅ (own teams only) | ✅ | ✅ | ✅ |
| Teams | `GET /teams/directory` | ❌ | ✅ | ✅ | ✅ | ✅ |
| Teams | `POST /teams` | ❌ | ✅ | ✅ | ✅ | ✅ |
| Teams | `PATCH /teams/{team_id}` | ❌ | ❌ | ❌ | ✅ | ✅ |
| Teams | `DELETE /teams/{team_id}` | ❌ | ❌ | ❌ | ✅ | ✅ |
| Team Members | `GET /teams/{team_id}/members` | ❌ | ❌ | ❌ | ✅ | ✅ |
| Team Members | `POST /teams/{team_id}/members` | ❌ | ❌ | ❌ | ✅ | ✅ |
| Team Members | `PATCH /teams/{team_id}/members/{membership_id}` | ❌ | ❌ | ❌ | ✅ | ✅ |
| Team Members | `DELETE /teams/{team_id}/members/{membership_id}` | ❌ | ❌ | ❌ | ✅ | ✅ |
| Players | `GET /players` | ❌ | ✅ (teams user belongs to) | ✅ | ✅ | ✅ |
| Players | `GET /players?team_id={team_id}` | ❌ | ❌ | ✅ | ✅ | ✅ |
| Players | `POST /players` | ❌ | ❌ | ❌ | ✅ | ✅ |
| Players | `PATCH /players/{player_id}` | ❌ | ❌ | ❌ | ✅ | ✅ |
| Players | `DELETE /players/{player_id}` | ❌ | ❌ | ❌ | ✅ | ✅ |
| Fixtures | `GET /matches` | ❌ | ✅ (teams user belongs to) | ✅ | ✅ | ✅ |
| Fixtures | `GET /matches?team_id={team_id}` | ❌ | ❌ | ✅ | ✅ | ✅ |
| Fixtures | `POST /matches` | ❌ | ❌ | ❌ | ✅ (manager on home or away team) | ✅ |
| Fixtures | `PATCH /matches/{match_id}` | ❌ | ❌ | ❌ | ✅ (manager on fixture + target home team) | ✅ |
| Fixtures | `DELETE /matches/{match_id}` | ❌ | ❌ | ❌ | ✅ (manager on fixture team) | ✅ |
| Match Prep | `GET /match-prep/fixtures?team_id={team_id}` | ❌ | ❌ | ❌ | ✅ | ✅ |
| Match Prep | `GET /match-prep/plan?match_id={match_id}&team_id={team_id}` | ❌ | ❌ | ❌ | ✅ | ✅ |
| Match Prep | `GET /match-prep/plan/validate?match_id={match_id}&team_id={team_id}` | ❌ | ❌ | ❌ | ✅ | ✅ |
| Match Prep | `GET /match-prep/notes?match_id={match_id}&team_id={team_id}` | ❌ | ❌ | ❌ | ✅ | ✅ |
| Match Prep | `POST /match-prep/notes` | ❌ | ❌ | ❌ | ✅ | ✅ |
| Match Prep | `PUT /match-prep/plan` | ❌ | ❌ | ❌ | ✅ | ✅ |
| Collection Sessions | `GET /collection-sessions/active?team_id={team_id}` | ❌ | ❌ | ✅ | ✅ | ✅ |
| Collection Sessions | `POST /collection-sessions/start` | ❌ | ❌ | ❌ | ✅ | ✅ |
| Collection Sessions | `GET /collection-sessions/{session_id}?team_id={team_id}` | ❌ | ❌ | ✅ | ✅ | ✅ |
| Collection Sessions | `POST /collection-sessions/{session_id}/end-period` | ❌ | ❌ | ❌ | ✅ | ✅ |
| Collection Sessions | `POST /collection-sessions/{session_id}/start-period` | ❌ | ❌ | ❌ | ✅ | ✅ |
| Collection Sessions | `WS /collection-sessions/{session_id}/ws?team_id={team_id}` | ❌ | ❌ | ✅ | ✅ | ✅ |
| Clubs | `POST /clubs/{club_id}/logo` | ❌ | ❌ | ❌ | ❌ | ✅ |
| Admin | `GET /admin/overview` | ❌ | ❌ | ❌ | ❌ | ✅ |
| Admin | `GET /admin/audit-logs` | ❌ | ❌ | ❌ | ❌ | ✅ |
| Admin | `POST /admin/clubs` | ❌ | ❌ | ❌ | ❌ | ✅ |
| Admin | `PATCH /admin/clubs/{club_id}` | ❌ | ❌ | ❌ | ❌ | ✅ |
| Admin | `DELETE /admin/clubs/{club_id}` | ❌ | ❌ | ❌ | ❌ | ✅ |
| Admin | `POST /admin/teams` | ❌ | ❌ | ❌ | ❌ | ✅ |
| Admin | `PATCH /admin/teams/{team_id}` | ❌ | ❌ | ❌ | ❌ | ✅ |
| Admin | `DELETE /admin/teams/{team_id}` | ❌ | ❌ | ❌ | ❌ | ✅ |
| Admin | `POST /admin/teams/{team_id}/assign-team-admin` | ❌ | ❌ | ❌ | ❌ | ✅ |
| Admin | `DELETE /admin/teams/{team_id}/admins/{user_id}` | ❌ | ❌ | ❌ | ❌ | ✅ |
| Admin | `POST /admin/users/{user_id}/global-roles` | ❌ | ❌ | ❌ | ❌ | ✅ |
| Admin | `DELETE /admin/users/{user_id}/global-roles/{role}` | ❌ | ❌ | ❌ | ❌ | ✅ |

## Notes

- `super_admin` remains platform-scoped and is audited for privileged changes.
- Team-scoped checks are enforced through centralized permission helpers in `app/api/permissions.py`.
- Coach and parent capabilities are intentionally excluded for now and will be added when their feature set is defined.
