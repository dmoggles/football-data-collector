# Permissions Matrix

This document defines backend authorization expectations for current roles and scopes.

## Role Definitions

- `anonymous`: no authenticated session.
- `authenticated`: logged-in user with no required elevated role.
- `team_member`: user has any membership on a given team.
- `team_admin`: user has `team_admin` membership on a given team.
- `super_admin`: platform-level global role (`global_roles.role = super_admin`).

## Route Matrix

| Area | Route | anonymous | authenticated | team_member | team_admin | super_admin |
|---|---|---:|---:|---:|---:|---:|
| Auth | `POST /auth/register` | ✅ | ✅ | ✅ | ✅ | ✅ |
| Auth | `POST /auth/login` | ✅ | ✅ | ✅ | ✅ | ✅ |
| Auth | `POST /auth/logout` | ✅ | ✅ | ✅ | ✅ | ✅ |
| Auth | `GET /auth/me` | ❌ | ✅ | ✅ | ✅ | ✅ |
| Health | `GET /health` | ✅ | ✅ | ✅ | ✅ | ✅ |
| Teams | `GET /teams` | ❌ | ✅ (own teams only) | ✅ | ✅ | ✅ |
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
