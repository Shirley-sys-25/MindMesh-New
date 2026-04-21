import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import multer from 'multer';
import fs from 'fs';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 4020;

app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://build.lewisnote.com/v1',
});

// ROUTE 2 : La Transcription Audio (CORRIGEE AVEC .webm)
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier audio recu.' });
    }

    // CORRECTION VITALE : On renomme avec .webm pour l'API ASR
    const newFilePath = req.file.path + '.webm';
    fs.renameSync(req.file.path, newFilePath);

    const fileBuffer = fs.readFileSync(newFilePath);
    const audioBlob = new Blob([fileBuffer], { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('file', audioBlob, 'voice.webm');
    formData.append('model', 'afri-asr');

    const response = await fetch('https://build.lewisnote.com/v1/audio/afri-asr/transcribe', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.OPENAI_API_KEY,
      },
      body: formData,
    });

    const data = await response.json();

    fs.unlinkSync(newFilePath);
    res.json({ text: data.text });
  } catch (error) {
    console.error('Erreur de Transcription Audio:', error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    if (req.file && fs.existsSync(req.file.path + '.webm')) fs.unlinkSync(req.file.path + '.webm');
    res.status(500).json({ error: 'Erreur lors de la transcription.' });
  }
});

app.listen(PORT, () => {
  console.log('Cerveau MindMesh allume sur le port ' + PORT);
});

// ROUTE 1 : Le Chat Textuel (Streaming)
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Format invalide.' });

    const systemPrompt = {
      role: 'system',
      content: `Tu es l'Orchestrateur de MindMesh. RÈGLES : 1. Rédige TOUJOURS des phrases complètes et parfaitement terminées en français. 2. Présente tes 3 agents (**AfriConnect**, **Analyste Marché**, **Stratège SEO**) avec des descriptions claires de leurs rôles. 3. Demande à l'utilisateur son 'objectif' précis pour commencer. 4. Utilise le gras et les listes pour aérer le texte, mais ne dis JAMAIS le mot 'Markdown'. 5. Ne rédige pas le contenu final à la place des agents, limite-toi au plan d'action.`,
    };

    const completionMessages = [systemPrompt, ...messages];

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    const stream = await openai.chat.completions.create({
      model: 'gpt-5.4-pro',
      messages: completionMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) res.write(content);
    }
    res.end();
  } catch (error) {
    console.error('Erreur Chat:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Impossible de joindre le cerveau.' });
  }
});
