# Runbook MindMesh (J10-J14)

Ce document couvre l'exploitation de la phase finale: tests, rollout progressif, incident et rollback.

## 1. Verification pre-deploiement

Executer dans l'ordre:

```bash
npm run lint
npm run test:api
npm run test:ops
npm run test:orchestrator
```

Puis verifier localement:

```bash
npm run dev:api
```

Checks minimaux:

- `GET /healthz` -> `200 {"status":"ok"}`
- `GET /readyz` -> `200` si variables critiques presentes
- `POST /api/chat` -> flux SSE avec event `done`
- `POST /api/transcribe` -> JSON `{ "text": "..." }` ou erreur structuree

Verification automatique pre-prod:

```bash
npm run ops:preflight
```

Le script valide les flags auth prod et les variables critiques de rollout.

Pipeline CI recommande:

- Workflow GitHub Actions: `.github/workflows/ci.yml`
- Gates: lint TypeScript, tests API Node, tests ops preflight, tests orchestrateur Python

## 2. Configuration production

Parametres obligatoires en production:

- `AUTH_REQUIRED=true`
- `AUTH_BYPASS=false`
- `AUTH_STRICT_SCOPES=true`
- `AUTH_JWKS_URI`, `AUTH_ISSUER`, `AUTH_AUDIENCE`
- `CORS_ALLOWED_ORIGINS=<origines front autorisees>`
- `INTERNAL_AUTH_SHARED_SECRETS=<secret-current,secret-next>`
- `DATABASE_ENABLED=true`
- `DATABASE_URL=<postgres-url>`
- `DB_LOG_RETENTION_DAYS` (par defaut 90)
- `DB_RETENTION_CLEANUP_INTERVAL_MIN` (par defaut 360)

Mode de migration recommande:

- `ORCHESTRATION_MODE=hybrid`
- `ORCHESTRATION_CREWAI_PERCENT=10`

## 3. Rollout progressif (10% -> 50% -> 100%)

Le routage est determine par `ORCHESTRATION_CREWAI_PERCENT`.

1. **Etape 1 - 10%**
   - `ORCHESTRATION_MODE=hybrid`
   - `ORCHESTRATION_CREWAI_PERCENT=10`
   - surveillance 30-60 min

2. **Etape 2 - 50%**
   - `ORCHESTRATION_CREWAI_PERCENT=50`
   - surveillance 30-60 min

3. **Etape 3 - 100% hybride**
   - `ORCHESTRATION_CREWAI_PERCENT=100`
   - fallback legacy reste actif si orchestrateur indisponible

4. **Etape 4 - crewai strict**
   - `ORCHESTRATION_MODE=crewai`
   - garder rollback immediat disponible

Automatisation recommandee (capture baseline + gate):

```bash
# baseline a 0% (fenetre 5 min dans scripts npm)
npm run ops:baseline

# apres chaque palier (10, 50, 100), evaluation gate
npm run ops:evaluate
```

Fichiers generes:

- baseline: `ops/rollout-baseline.json`
- evaluation: `ops/rollout-report.json`

`ops:evaluate` retourne un code non-zero si gate en NO-GO.

## 3.b Gate Go/No-Go avant `crewai`

Passer en `ORCHESTRATION_MODE=crewai` uniquement si tous les points sont verts:

- `GET /readyz` retourne `200` sans mode degrade
- `5xx` API publique <= 2% sur 30 min
- p95 `POST /api/chat` <= +50% de la baseline
- erreurs auth (`401/403`) stables (pas de pic anormal)
- metriques orchestrateur stables:
  - `mindmesh_orchestrator_calls_total{status="failed"}` sans derive
  - `mindmesh_provider_errors_total` sans derive

Commande de verification minimale:

```bash
curl -i http://localhost:4020/readyz
curl -s http://localhost:4020/metrics
```

Conditions No-Go (ne pas basculer):

- `readyz` en `503` ou degrade anormal
- depassement seuil 5xx/p95
- hausse continue des erreurs provider/orchestrateur
- rollback non teste dans les 7 derniers jours

Equivalent outille via `ops:evaluate`:

- `readyz_stable`
- `max_5xx_rate`
- `chat_p95_vs_baseline`
- `orchestrator_failed_per_min`
- `provider_errors_per_min`
- `auth_failures_per_min`

## 4. Monitoring et seuils

Observer en continu:

- p95 latence `POST /api/chat`
- taux `5xx` API publique
- ratio erreurs auth `401/403`
- `429` (pression rate limit)
- erreurs provider via `/metrics`:
  - `mindmesh_provider_errors_total`
  - `mindmesh_orchestrator_calls_total`

Seuils de vigilance initiaux:

- `5xx > 2%` sur 5 min
- p95 chat degrade de +50% vs baseline
- hausse brutale `AUTH_INVALID_TOKEN` ou `ORCHESTRATOR_UNREACHABLE`

## 5. Procedure incident

1. Capturer `X-Request-Id` de requetes en echec.
2. Correlier logs API et orchestrateur avec ce `request_id`.
3. Qualifier l'incident:
   - auth,
   - orchestrateur,
   - provider LLM/ASR,
   - surcharge/rate-limit.
4. Appliquer mitigation rapide (section rollback).
5. Ouvrir un post-mortem court (cause, impact, action corrective).

## 6. Rollback (moins de 1 minute)

Rollback prioritaire:

1. Basculer en mode legacy:
   - `ORCHESTRATION_MODE=legacy`
2. Redeployer l'API publique.
3. Verifier immediatement:
   - `GET /healthz`
   - `POST /api/chat` (SSE + done)
4. Continuer la surveillance 30 min.

Rollback partiel si besoin:

- garder `ORCHESTRATION_MODE=hybrid`
- descendre `ORCHESTRATION_CREWAI_PERCENT` a `10` puis `0`

## 7. Nettoyage post-stabilisation

Quand le mode `crewai` est stable:

- supprimer references legacy inutilisees,
- conserver fallback uniquement si requirement d'exploitation,
- mettre a jour ce runbook et les seuils de monitoring.

## 8. Stack locale standard

Pour aligner dev/ops avec la meme stack backend:

```bash
docker compose up -d
```

Arret:

```bash
docker compose down
```
