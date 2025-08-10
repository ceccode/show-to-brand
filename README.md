# Brand Analyzer

Monorepo with frontend (React + Vite + Tailwind) and backend (Express + TypeScript).

## Quickstart (local dev)

Prerequisites:
- Node.js 20+
- pnpm 9+ (`npm i -g pnpm`)

Environment:
- Copy `.env.example` to `.env` and adjust as needed.
- `OPENAI_API_KEY` is optional. Users can supply their own key in the UI; the frontend sends it as `X-OpenAI-Key` and the backend uses it per request.
- Set `ALLOWED_ORIGINS` to include your frontend origin in dev (e.g., `http://localhost:5173`).

Install:
- `pnpm -w install`

Run:
- `pnpm dev`

URLs:
- Frontend (Vite): http://localhost:5173 (port may vary)
- Backend health: http://localhost:8080/api/health

---

## Single deploy (backend serves frontend) – production

In production, the backend serves the built SPA from `app/frontend/dist` and exposes the API under `/api/*`.

### Environment variables (production)

- `NODE_ENV=production`
- `OPENAI_API_KEY=sk-...` (optional; only needed if you want a server-side default when the client doesn't send `X-OpenAI-Key`)
- `PORT=8080` (or the platform-provided port)
- `ALLOWED_ORIGINS=https://your-domain` (use your public URL; for local prod use `http://localhost:8080`)

### Build locally (production)

```
pnpm -w install
pnpm --filter ./app/frontend build
pnpm --filter ./app/backend build

export NODE_ENV=production
# Optional: server-side default key if the client does not pass X-OpenAI-Key
# export OPENAI_API_KEY=sk-...
export ALLOWED_ORIGINS=http://localhost:8080
export PORT=8080
node app/backend/dist/server.js
```

Open: http://localhost:8080

Health: http://localhost:8080/api/health

OpenAI check: http://localhost:8080/api/openai/check


### Deploy to Render (single service)

1. Push repo to GitHub.
2. Create a “Web Service” on Render and connect the repo.
3. Build command:
   ```
   pnpm -w install && pnpm --filter ./app/frontend build && pnpm --filter ./app/backend build
   ```
4. Start command:
   ```
   node app/backend/dist/server.js
   ```
5. Environment in Render:
   - `NODE_ENV=production`
   - `ALLOWED_ORIGINS=https://<your-render-url>`
   - (Optional) `OPENAI_API_KEY=sk-...` if you want a server default
   - Leave `PORT` unset (Render injects it; the server reads `process.env.PORT`).
6. (Optional) Health check path: `/api/health`.

---

## Docker (single image)

Create a `Dockerfile` at the repo root (example):

```
# syntax=docker/dockerfile:1
FROM node:20-slim AS base
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

# Copy workspace files
COPY pnpm-workspace.yaml package.json .npmrc* .env.example* ./
COPY app ./app

# Install and build
RUN pnpm -w install --frozen-lockfile
RUN pnpm --filter ./app/frontend build && pnpm --filter ./app/backend build

# --- Runtime image ---
FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app

COPY --from=base /app/app/backend/dist ./app/backend/dist
COPY --from=base /app/app/frontend/dist ./app/frontend/dist
COPY package.json pnpm-workspace.yaml ./

# Expose port
ENV PORT=8080
EXPOSE 8080

# Start server
CMD ["node", "app/backend/dist/server.js"]
```

Build and run:

```
docker build -t brand-analyzer:prod .
docker run --rm -p 8080:8080 \
  -e NODE_ENV=production \
  -e ALLOWED_ORIGINS=http://localhost:8080 \
  brand-analyzer:prod
```

Open: http://localhost:8080

---

## Using the app

1) Paste your OpenAI API key in the header field (or skip if the server has a default `OPENAI_API_KEY`).
2) Click "Check key" to verify connectivity.
3) Provide input via Upload (.txt/.srt), URL, or Text.
4) Toggle “Use LLM” for OpenAI-based extraction (requires a valid key via header or env).
5) Click Analyze and view results.

---

## Scripts (root)

- `pnpm dev` – run frontend + backend in watch mode
- `pnpm build` – build all workspaces
- `pnpm lint` – lint all workspaces
- `pnpm test` – run tests (placeholder)

LLM extractor:
- Backend file: `app/backend/src/services/extractor/llm.ts`
- Model: `gpt-4o-mini` (changeable in code)
- Toggle via UI (Use LLM) or send `useLLM: true` in request
- Uses `X-OpenAI-Key` per request; falls back to `OPENAI_API_KEY` env if header is missing

Troubleshooting:
- Workspaces warning: ensure `pnpm-workspace.yaml` exists with `packages:\n  - app/*`
- CORS issues: include frontend origin in `ALLOWED_ORIGINS`. The backend allows `X-OpenAI-Key` header.
- LLM errors: ensure the browser sends `X-OpenAI-Key` or set `OPENAI_API_KEY` server-side; verify OpenAI network access
- Port conflicts: adjust `PORT` (backend) or Vite port (`app/frontend/vite.config.ts`)


## TODO

- Rule-based extractor refinements and tests
- Full UI polish (shadcn/ui) and accessibility
- Unit/integration tests (Vitest + Supertest)
- CI with lint/test/build
