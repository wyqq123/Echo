# Local development

## Commands

Common local commands:

```bash
npm run dev
npm run server
npm run dev:full
npm run build
npm run prisma:generate
npm run prisma:migrate
npm run prisma:dev
```

## Environment variables

Common variables include:

- `DATABASE_URL`
- `DASHSCOPE_API_KEY`
- `DASHSCOPE_BASE_URL`
- `QWEN_CHAT_MODEL`
- `QWEN_EMBED_MODEL`
- auth-related token secrets used by backend auth routes

Never hardcode secrets into client code.
