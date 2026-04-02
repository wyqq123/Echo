// server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from './server/db.js';
import authRouter from './server/routes/auth.js';
import meRouter from './server/routes/me.js';
import focusThemesRouter from './server/routes/focusThemes.js';
import tasksRouter from './server/routes/tasks.js';
import funnelRunsRouter from './server/routes/funnelRuns.js';

// Load .env from this file's directory (so it works regardless of cwd).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const port = Number(process.env.PORT || 3001); // 后端运行在 3001 端口，避开 Vite 的 3000

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use('/api/auth', authRouter);
app.use('/api/me', meRouter);
app.use('/api/focus-themes', focusThemesRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/funnel-runs', funnelRunsRouter);

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const DASH_SCOPE_BASE_URL = process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const QWEN_CHAT_MODEL = process.env.QWEN_CHAT_MODEL || 'qwen-plus';
const QWEN_EMBED_MODEL = process.env.QWEN_EMBED_MODEL || 'text-embedding-v2';

const keyPreview = DASHSCOPE_API_KEY ? `${DASHSCOPE_API_KEY.slice(0, 6)}...${DASHSCOPE_API_KEY.slice(-4)}` : '(missing)';
console.log('[qwen-proxy] DASHSCOPE_API_KEY:', keyPreview);

const qwen = DASHSCOPE_API_KEY
  ? new OpenAI({
      apiKey: DASHSCOPE_API_KEY,
      baseURL: DASH_SCOPE_BASE_URL,
    })
  : null;

const toPrompt = (contents) => {
  if (typeof contents === 'string') return contents;
  if (Array.isArray(contents)) return contents.map((c) => String(c)).join('\n');
  return String(contents ?? '');
};

app.get('/api/health', async (_req, res) => {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (e) {
    console.warn('[health] database check failed:', e.message);
  }
  res.json({
    ok: true,
    provider: 'qwen',
    hasDashscopeKey: Boolean(DASHSCOPE_API_KEY),
    baseURL: DASH_SCOPE_BASE_URL,
    chatModel: QWEN_CHAT_MODEL,
    embedModel: QWEN_EMBED_MODEL,
    database: dbOk,
  });
});

// Generic proxy for generateContent
app.post('/api/qwen/generate-content', async (req, res) => {
  try {
    if (!qwen) {
      return res.status(500).json({ error: 'Missing DASHSCOPE_API_KEY on server' });
    }

    const { contents } = req.body || {};
    if (!contents) {
      return res.status(400).json({ error: 'Missing required field: contents' });
    }

    const prompt = toPrompt(contents);
    const response = await qwen.chat.completions.create({
      model: QWEN_CHAT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    });

    const text = response.choices?.[0]?.message?.content ?? '';
    res.json({ text });
  } catch (error) {
    console.error('Qwen generate-content proxy error:', error);
    res.status(500).json({ error: String(error) });
  }
});

// Generic proxy for embedContent
app.post('/api/qwen/embed-content', async (req, res) => {
  try {
    if (!qwen) {
      return res.status(500).json({ error: 'Missing DASHSCOPE_API_KEY on server' });
    }

    const { contents } = req.body || {};
    if (!contents) {
      return res.status(400).json({ error: 'Missing required field: contents' });
    }

    const inputs = Array.isArray(contents) ? contents.map((c) => String(c)) : [String(contents)];
    const response = await qwen.embeddings.create({
      model: QWEN_EMBED_MODEL,
      input: inputs,
    });

    const embeddings = (response.data || []).map((item) => ({ values: item.embedding || [] }));
    res.json({ embeddings });
  } catch (error) {
    console.error('Qwen embed-content proxy error:', error);
    res.status(500).json({ error: String(error) });
  }
});

app.listen(port, () => {
  console.log(`安全代理服务器已启动，监听端口: http://localhost:${port}`);
});