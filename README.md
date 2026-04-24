# MindMesh

Application d'orchestration IA avec frontend React et backend securise (Express + orchestrateur FastAPI/CrewAI).

## Architecture

- Frontend React/Vite: `src/`
- API publique Node/Express: `backend/public-api/src/`
- Orchestrateur prive FastAPI/CrewAI: `backend/orchestrator/app/`
- Point d'entree backend: `server.js` (redirige vers `backend/public-api/src/server.js`)

Endpoints front preserves:

- `POST /api/chat` (SSE)
- `POST /api/transcribe` (multipart)

## Prerequis

- Node.js 20+
- npm 10+
- Python 3.11+ (pour orchestrateur)

## Configuration

1. Copier `.env.example` vers `.env`
2. Renseigner au minimum:
   - `OPENAI_API_KEY` (LLM)
   - `ASR_API_KEY` (recommande pour afri-asr)
   - `VITE_CLERK_PUBLISHABLE_KEY`
3. En production, activer auth stricte:
   - `AUTH_REQUIRED=true`
   - `AUTH_BYPASS=false`
   - `AUTH_JWKS_URI`, `AUTH_ISSUER`, `AUTH_AUDIENCE`
4. Configurer PostgreSQL:
   - `DATABASE_ENABLED=true`
   - `DATABASE_URL=postgresql://mindmesh:mindmesh@localhost:5432/mindmesh`
   - `DATABASE_SSL=false` (mettre `true` selon ton environnement)
   - `DATABASE_INIT_MAX_RETRIES=3`
   - `DATABASE_INIT_RETRY_MS=1500`
   - `DB_LOG_RETENTION_DAYS=90`
   - `DB_RETENTION_CLEANUP_INTERVAL_MIN=360`

## Installation

```bash
npm install
```

Pour l'orchestrateur:

```bash
python -m pip install -r backend/orchestrator/requirements.txt
```

## Demarrage

PostgreSQL local rapide (Docker):

```bash
docker run --name mindmesh-postgres \
  -e POSTGRES_USER=mindmesh \
  -e POSTGRES_PASSWORD=mindmesh \
  -e POSTGRES_DB=mindmesh \
  -p 5432:5432 -d postgres:16
```

- Front + API:

```bash
npm run dev
```

- Front + API + orchestrateur:

```bash
npm run dev:full
```

- API seule:

```bash
npm run dev:api
```

- Orchestrateur seul:

```bash
npm run dev:orchestrator
```

- Stack backend complete via Docker Compose (API + orchestrateur + PostgreSQL):

```bash
docker compose up -d
```

Arret:

```bash
docker compose down
```

## Modes d'orchestration

Variable `ORCHESTRATION_MODE`:

- `legacy`: `/api/chat` appelle directement le provider LLM
- `hybrid`: essaye orchestrateur puis fallback legacy
- `crewai`: orchestrateur obligatoire

Variable `ORCHESTRATION_CREWAI_PERCENT` (0..100):

- applique un rollout progressif vers l'orchestrateur
- fonctionne en mode `hybrid` (ex: 10 puis 50 puis 100)
- routage deterministe par utilisateur/request

Variable `ORCHESTRATOR_ENGINE` (orchestrateur FastAPI):

- `auto`: essaye CrewAI si la config LLM est presente, sinon fallback skeleton
- `crewai`: force le chemin CrewAI (avec fallback skeleton en cas d'erreur runtime)
- `skeleton`: force le moteur de reponse statique

## Qualite et tests

```bash
npm run lint
npm run test:api
npm run test:ops
npm run test:orchestrator
```

CI GitHub Actions:

- Workflow: `.github/workflows/ci.yml`
- Gate: lint + tests Node + tests orchestrateur Python

## Observabilite

- Sante: `GET /healthz`
- Readiness: `GET /readyz`
- Metriques Prometheus: `GET /metrics`

`/readyz` valide aussi la connexion PostgreSQL (`SELECT 1`) et retourne `503` si la base n'est pas disponible.

Retention PostgreSQL:

- Les tables `chat_requests` et `transcribe_requests` sont purgees automatiquement selon `DB_LOG_RETENTION_DAYS`.
- Frequence de purge configuree via `DB_RETENTION_CLEANUP_INTERVAL_MIN`.

Migrations PostgreSQL:

- Dossier des migrations SQL: `backend/public-api/src/db/migrations`
- Les migrations appliquees sont tracees dans `schema_migrations`.

Toutes les reponses exposent `X-Request-Id` pour la correlation logs.

## Transcription Afri-ASR

- Endpoint par defaut: `https://build.lewisnote.com/v1/audio/afri-asr/transcribe`
- Cle API utilisee en priorite: `ASR_API_KEY`
- Fallback si absent: `OPENAI_API_KEY`

## Exploitation

- Runbook incident/rollback/rollout: `RUNBOOK.md`
