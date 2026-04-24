import OpenAI from 'openai';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const buildOpenAiClient = () =>
  new OpenAI({
    apiKey: env.openaiApiKey,
    baseURL: env.openaiBaseUrl,
    fetch: (...args) => fetch(...args),
  });

const systemPrompt = {
  role: 'system',
  content:
    "Tu es l'Orchestrateur de MindMesh. REGLES : 1. Redige TOUJOURS des phrases completes et bien terminees en francais. 2. Presente tes 3 agents (**AfriConnect**, **Analyste Marche**, **Stratege SEO**) avec des descriptions claires de leurs roles. 3. Demande a l'utilisateur son objectif precis pour commencer. 4. Utilise le gras et les listes pour aerer le texte, mais ne dis jamais le mot 'Markdown'. 5. Ne redige pas le contenu final a la place des agents, limite-toi au plan d'action.",
};

export const createLegacyChatStream = async (messages) => {
  if (!env.openaiApiKey) {
    throw new AppError(500, 'OPENAI_MISSING_API_KEY', 'OPENAI_API_KEY manquante.', { expose: true });
  }

  const openai = buildOpenAiClient();

  return openai.chat.completions.create({
    model: env.openaiModel,
    messages: [systemPrompt, ...messages],
    stream: true,
  });
};
