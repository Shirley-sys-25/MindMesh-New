import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { importFresh } from './helpers/load-module.js';

const databaseServicePath = path.resolve(process.cwd(), 'backend/public-api/src/services/database.service.js');

test('chat history rows map to UI messages', async () => {
  const module = await importFresh(databaseServicePath);
  const messages = module.mapChatHistoryRows([
    {
      user_message: 'Bonjour MindMesh',
      assistant_message: 'Bonjour, comment puis-je aider ?',
      status: 'ok',
    },
    {
      user_message: 'Explique PostgreSQL',
      assistant_message: 'Voici une explication claire.',
      status: 'fallback_legacy',
    },
    {
      user_message: 'Message en erreur',
      assistant_message: 'Erreur de génération.',
      status: 'error',
    },
  ]);

  assert.equal(messages.length, 6);
  assert.deepEqual(messages[0], { role: 'user', content: 'Bonjour MindMesh' });
  assert.deepEqual(messages[1], { role: 'assistant', content: 'Bonjour, comment puis-je aider ?' });
  assert.deepEqual(messages[5], { role: 'system', content: 'Erreur de génération.', tone: 'error' });
});
