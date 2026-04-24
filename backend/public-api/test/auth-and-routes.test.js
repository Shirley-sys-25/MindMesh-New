import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import request from 'supertest';
import { importFresh } from './helpers/load-module.js';

const appPath = path.resolve(process.cwd(), 'backend/public-api/src/app.js');
const authMiddlewarePath = path.resolve(process.cwd(), 'backend/public-api/src/middleware/auth-jwt.js');
const authorizeScopePath = path.resolve(process.cwd(), 'backend/public-api/src/middleware/authorize-scope.js');
const chatSchemaPath = path.resolve(process.cwd(), 'backend/public-api/src/schemas/chat.schema.js');
const transcribeSchemaPath = path.resolve(process.cwd(), 'backend/public-api/src/schemas/transcribe.schema.js');
const rolloutPath = path.resolve(process.cwd(), 'backend/public-api/src/services/orchestration-rollout.js');
const envPath = path.resolve(process.cwd(), 'backend/public-api/src/config/env.js');

const buildOpenAiSseResponse = (chunks) => {
  const payload = [
    ...chunks.map((content) =>
      `data: ${JSON.stringify({
        id: 'chatcmpl-test',
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: 'gpt-5.4-mini',
        choices: [{ index: 0, delta: { content }, finish_reason: null }],
      })}\n\n`,
    ),
    `data: ${JSON.stringify({
      id: 'chatcmpl-test',
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: 'gpt-5.4-mini',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    })}\n\n`,
    'data: [DONE]\n\n',
  ].join('');

  return new Response(payload, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
    },
  });
};

process.env.AUTH_REQUIRED = 'false';
process.env.AUTH_BYPASS = 'true';
process.env.ORCHESTRATION_MODE = process.env.ORCHESTRATION_MODE || 'crewai';
process.env.ORCHESTRATION_CREWAI_PERCENT = process.env.ORCHESTRATION_CREWAI_PERCENT || '100';
process.env.INTERNAL_AUTH_SHARED_SECRETS = process.env.INTERNAL_AUTH_SHARED_SECRETS || 'test-secret-1,test-secret-2';
process.env.DATABASE_ENABLED = 'false';

const makeApp = async () => {
  const module = await importFresh(appPath);
  return module.createApp();
};

const withEnvPatch = async (patch, callback) => {
  const envModule = await import(pathToFileURL(envPath).href);
  const previous = {};

  for (const [key, value] of Object.entries(patch)) {
    previous[key] = envModule.env[key];
    envModule.env[key] = value;
  }

  try {
    await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      envModule.env[key] = value;
    }
  }
};

const withMockedFetch = async (mockImpl, callback) => {
  const previousFetch = global.fetch;
  global.fetch = mockImpl;

  try {
    await callback();
  } finally {
    global.fetch = previousFetch;
  }
};

test('auth middleware bypass: injecte req.auth', { concurrency: false }, async () => {
  const module = await importFresh(authMiddlewarePath);
  const req = { headers: {} };
  let called = false;

  await module.authJwtMiddleware(req, {}, (error) => {
    assert.equal(error, undefined);
    called = true;
  });

  assert.equal(called, true);
  assert.equal(req.auth.sub, 'dev-user');
  assert.ok(Array.isArray(req.auth.scopes));
});

test('auth middleware strict: token manquant => 401', { concurrency: false }, async () => {
  const module = await importFresh(authMiddlewarePath);

  await withEnvPatch({ authRequired: true, authBypass: false }, async () => {
    const req = { headers: {} };
    let capturedError;

    await module.authJwtMiddleware(req, {}, (error) => {
      capturedError = error;
    });

    assert.equal(capturedError.status, 401);
    assert.equal(capturedError.code, 'AUTH_MISSING_TOKEN');
  });
});

test('authorize scope strict: scope absent => 403', { concurrency: false }, async () => {
  const module = await importFresh(authorizeScopePath);

  await withEnvPatch({ authBypass: false, authStrictScopes: true }, async () => {
    let capturedError;
    const middleware = module.authorizeScope('chat:write');

    middleware(
      {
        auth: {
          scopes: ['transcribe:write'],
        },
      },
      {},
      (error) => {
        capturedError = error;
      },
    );

    assert.equal(capturedError.status, 403);
    assert.equal(capturedError.code, 'AUTH_FORBIDDEN');
  });
});

test('schema chat: payload valide normalise', { concurrency: false }, async () => {
  const module = await importFresh(chatSchemaPath);
  const parsed = module.parseChatRequest({
    messages: [
      { role: 'user', content: ' Salut ' },
      { role: 'unknown', content: ' Test role ' },
    ],
  });

  assert.equal(parsed.messages.length, 2);
  assert.equal(parsed.messages[0].role, 'user');
  assert.equal(parsed.messages[0].content, 'Salut');
  assert.equal(parsed.messages[1].role, 'user');
});

test('schema transcribe: whitelist stricte + normalisation', { concurrency: false }, async () => {
  const module = await importFresh(transcribeSchemaPath);
  assert.equal(module.isAllowedAudioMime('audio/webm'), true);
  assert.equal(module.isAllowedAudioMime('audio/ogg; codecs=opus'), true);
  assert.equal(module.isAllowedAudioMime('audio/flac'), false);
  assert.equal(module.isAllowedAudioMime('text/plain'), false);
});

test('rollout: decide target selon mode et pourcentage', { concurrency: false }, async () => {
  const module = await importFresh(rolloutPath);

  const legacy = module.decideOrchestrationPath({
    mode: 'legacy',
    requestId: 'r1',
    userSub: 'u1',
    crewaiPercent: 50,
  });
  assert.equal(legacy.target, 'legacy');

  const noCrewai = module.decideOrchestrationPath({
    mode: 'hybrid',
    requestId: 'r2',
    userSub: 'u2',
    crewaiPercent: 0,
  });
  assert.equal(noCrewai.target, 'legacy');

  const fullCrewai = module.decideOrchestrationPath({
    mode: 'hybrid',
    requestId: 'r3',
    userSub: 'u3',
    crewaiPercent: 100,
  });
  assert.equal(fullCrewai.target, 'orchestrator');

  const strictCrewai = module.decideOrchestrationPath({
    mode: 'crewai',
    requestId: 'r4',
    userSub: 'u4',
    crewaiPercent: 0,
  });
  assert.equal(strictCrewai.target, 'orchestrator');

  const stableA = module.decideOrchestrationPath({
    mode: 'hybrid',
    requestId: 'same-request',
    userSub: 'same-user',
    crewaiPercent: 50,
  });
  const stableB = module.decideOrchestrationPath({
    mode: 'hybrid',
    requestId: 'same-request',
    userSub: 'same-user',
    crewaiPercent: 50,
  });
  assert.equal(stableA.target, stableB.target);
});

test('GET /healthz retourne status ok', { concurrency: false }, async () => {
  const app = await makeApp();
  const response = await request(app).get('/healthz');
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
  assert.ok(response.headers['x-request-id']);
});

test('POST /api/chat payload invalide => 400', { concurrency: false }, async () => {
  const app = await makeApp();
  const response = await request(app).post('/api/chat').send({});
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'CHAT_INVALID_PAYLOAD');
  assert.ok(response.body.error.request_id);
  assert.ok(response.headers['ratelimit-limit']);
});

test('POST /api/chat SSE crewai: success + done', { concurrency: false }, async () => {
  const app = await makeApp();

  await withEnvPatch({ orchestrationMode: 'crewai', orchestrationCrewaiPercent: 100 }, async () => {
    await withMockedFetch(
      async () =>
        new Response(JSON.stringify({ content: 'Bonjour depuis orchestrateur', metadata: { source: 'test' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      async () => {
        const response = await request(app)
          .post('/api/chat')
          .set('Content-Type', 'application/json')
          .send({ messages: [{ role: 'user', content: 'hello' }] });

        assert.equal(response.status, 200);
        assert.equal(response.headers['x-orchestration-path'], 'orchestrator');
        assert.match(response.text, /data: Bonjour depuis orchestrateur/);
        assert.match(response.text, /event: done/);
      },
    );
  });
});

test('POST /api/chat SSE crewai: orchestrator down => event error', { concurrency: false }, async () => {
  const app = await makeApp();

  await withEnvPatch({ orchestrationMode: 'crewai', orchestrationCrewaiPercent: 100 }, async () => {
    await withMockedFetch(
      async () => {
        throw new Error('network down');
      },
      async () => {
        const response = await request(app)
          .post('/api/chat')
          .set('Content-Type', 'application/json')
          .send({ messages: [{ role: 'user', content: 'hello' }] });

        assert.equal(response.status, 200);
        assert.equal(response.headers['x-orchestration-path'], 'orchestrator');
        assert.match(response.text, /event: error/);
      },
    );
  });
});

test('POST /api/chat hybrid: orchestrator down => fallback legacy + done', { concurrency: false }, async () => {
  const app = await makeApp();

  await withEnvPatch(
    {
      orchestrationMode: 'hybrid',
      orchestrationCrewaiPercent: 100,
      openaiApiKey: 'test-openai-key',
    },
    async () => {
      await withMockedFetch(
        async (url) => {
          const target = String(url);

          if (target.includes('/internal/orchestrate')) {
            throw new Error('orchestrator down');
          }

          if (target.includes('/chat/completions')) {
            return buildOpenAiSseResponse(['Fallback ', 'legacy']);
          }

          throw new Error(`unexpected fetch target: ${target}`);
        },
        async () => {
          const response = await request(app)
            .post('/api/chat')
            .set('Content-Type', 'application/json')
            .send({ messages: [{ role: 'user', content: 'hello' }] });

          assert.equal(response.status, 200);
          assert.equal(response.headers['x-orchestration-path'], 'orchestrator');
          assert.match(response.text, /event: done/);

          const metrics = await request(app).get('/metrics');
          assert.equal(metrics.status, 200);
          assert.match(metrics.text, /mindmesh_orchestrator_calls_total/);
          assert.match(metrics.text, /status="fallback_legacy"/);
        },
      );
    },
  );
});

test('POST /api/transcribe sans fichier => 400', { concurrency: false }, async () => {
  const app = await makeApp();
  const response = await request(app).post('/api/transcribe').field('dummy', '1');
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'TRANSCRIBE_MISSING_FILE');
});

test('POST /api/transcribe mime invalide => 400', { concurrency: false }, async () => {
  const app = await makeApp();
  const response = await request(app)
    .post('/api/transcribe')
    .attach('audio', Buffer.from('not-audio'), {
      filename: 'not-audio.txt',
      contentType: 'text/plain',
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'TRANSCRIBE_INVALID_MIME');
});

test('POST /api/transcribe happy path => 200 text', { concurrency: false }, async () => {
  const app = await makeApp();

  await withEnvPatch({ openaiApiKey: 'test-openai-key' }, async () => {
    await withMockedFetch(
      async () =>
        new Response(JSON.stringify({ text: 'Bonjour monde' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      async () => {
        const response = await request(app)
          .post('/api/transcribe')
          .attach('audio', Buffer.from('fake-webm-audio'), {
            filename: 'voice.webm',
            contentType: 'audio/webm',
          });

        assert.equal(response.status, 200);
        assert.equal(response.body.text, 'Bonjour monde');
      },
    );
  });
});

test('POST /api/transcribe timeout provider => 504', { concurrency: false }, async () => {
  const app = await makeApp();

  await withEnvPatch({ openaiApiKey: 'test-openai-key', asrTimeoutMs: 5 }, async () => {
    await withMockedFetch(
      async (_url, options) =>
        new Promise((_resolve, reject) => {
          const signal = options?.signal;
          if (!signal) {
            reject(new Error('missing signal'));
            return;
          }

          signal.addEventListener(
            'abort',
            () => {
              const abortError = new Error('aborted');
              abortError.name = 'AbortError';
              reject(abortError);
            },
            { once: true },
          );
        }),
      async () => {
        const response = await request(app)
          .post('/api/transcribe')
          .attach('audio', Buffer.from('fake-webm-audio'), {
            filename: 'voice.webm',
            contentType: 'audio/webm',
          });

        assert.equal(response.status, 504);
        assert.equal(response.body.error.code, 'ASR_TIMEOUT');
      },
    );
  });
});

test('POST /api/transcribe provider down => 502', { concurrency: false }, async () => {
  const app = await makeApp();

  await withEnvPatch({ openaiApiKey: 'test-openai-key' }, async () => {
    await withMockedFetch(
      async () => {
        throw new Error('provider down');
      },
      async () => {
        const response = await request(app)
          .post('/api/transcribe')
          .attach('audio', Buffer.from('fake-webm-audio'), {
            filename: 'voice.webm',
            contentType: 'audio/webm',
          });

        assert.equal(response.status, 502);
        assert.equal(response.body.error.code, 'ASR_UNREACHABLE');
      },
    );
  });
});

test('POST /api/transcribe fichier trop gros => 413', { concurrency: false }, async () => {
  await withEnvPatch({ transcribeMaxBytes: 4, openaiApiKey: 'test-openai-key' }, async () => {
    const app = await makeApp();

    const response = await request(app)
      .post('/api/transcribe')
      .attach('audio', Buffer.from('0123456789'), {
        filename: 'voice.webm',
        contentType: 'audio/webm',
      });

    assert.equal(response.status, 413);
    assert.equal(response.body.error.code, 'TRANSCRIBE_FILE_TOO_LARGE');
  });
});

test('GET /readyz crewai: orchestrator down => 503 degraded', { concurrency: false }, async () => {
  const app = await makeApp();

  await withEnvPatch({ orchestrationMode: 'crewai', openaiApiKey: 'test-openai-key' }, async () => {
    await withMockedFetch(
      async () => {
        throw new Error('orchestrator down');
      },
      async () => {
        const response = await request(app).get('/readyz');
        assert.equal(response.status, 503);
        assert.equal(response.body.status, 'degraded');
        assert.equal(response.body.mode, 'crewai');
        assert.equal(response.body.reason, 'ORCHESTRATOR_UNHEALTHY');
      },
    );
  });
});

test('GET /readyz hybrid: orchestrator down => ready degraded fallback', { concurrency: false }, async () => {
  const app = await makeApp();

  await withEnvPatch({ orchestrationMode: 'hybrid', openaiApiKey: 'test-openai-key' }, async () => {
    await withMockedFetch(
      async () => {
        throw new Error('orchestrator down');
      },
      async () => {
        const response = await request(app).get('/readyz');
        assert.equal(response.status, 200);
        assert.equal(response.body.status, 'ready');
        assert.equal(response.body.mode, 'hybrid');
        assert.equal(response.body.degraded, true);
        assert.equal(response.body.reason, 'ORCHESTRATOR_UNHEALTHY_FALLBACK_ACTIVE');
      },
    );
  });
});

test('GET /metrics expose compteurs critiques', { concurrency: false }, async () => {
  const app = await makeApp();

  await withEnvPatch({ orchestrationMode: 'hybrid', orchestrationCrewaiPercent: 0 }, async () => {
    await request(app).post('/api/chat').send({});
    await request(app)
      .post('/api/chat')
      .set('Content-Type', 'application/json')
      .send({ messages: [{ role: 'user', content: 'hello metrics' }] });
  });

  const metrics = await request(app).get('/metrics');
  assert.equal(metrics.status, 200);
  assert.match(metrics.text, /mindmesh_orchestrator_calls_total/);
  assert.match(metrics.text, /status="rollout_legacy"/);
  assert.match(metrics.text, /mindmesh_provider_errors_total/);
  assert.match(metrics.text, /mindmesh_http_request_duration_ms/);
});

test('Route inconnue => 404', { concurrency: false }, async () => {
  const app = await makeApp();
  const response = await request(app).get('/api/unknown-route');
  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, 'NOT_FOUND');
});
