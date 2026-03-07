# Frontend

React + Vite frontend for TapLine.

## Development
1. Install dependencies:
   - `npm install`
2. Start dev server:
   - `npm run dev`

By default, Vite proxies `/auth` and `/health` requests to `http://127.0.0.1:8000` for local development.

## Configuration
- Copy `.env.example` to `.env` to set API base URL explicitly.
- `VITE_API_BASE_URL` defaults to an empty string (same-origin requests).

## Build
- `npm run build`
- `npm run preview`
