import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { prisma } from '../db.js';
import { encodeFocusThemeId, decodeFocusThemeId } from '../lib/focusThemeIds.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const rows = await prisma.focusTheme.findMany({
      where: { userId },
      orderBy: { updatedAt: 'asc' },
    });
    const themes = rows.map((r) => ({
      id: decodeFocusThemeId(userId, r.id),
      intent: r.intent,
      tags: r.tags,
      isPrimary: r.isPrimary,
    }));
    res.json({ themes });
  } catch (e) {
    console.error('get focus-themes error:', e);
    res.status(500).json({ error: 'Failed to load themes' });
  }
});

router.put('/', requireAuth, async (req, res) => {
  try {
    const { themes } = req.body || {};
    if (!Array.isArray(themes)) {
      return res.status(400).json({ error: 'themes array required' });
    }

    for (const t of themes) {
      if (!t || typeof t.id !== 'string' || typeof t.intent !== 'string') {
        return res.status(400).json({ error: 'Each theme needs id and intent' });
      }
    }

    const userId = req.userId;
    await prisma.$transaction(async (tx) => {
      await tx.focusTheme.deleteMany({ where: { userId } });
      if (themes.length === 0) return;
      await tx.focusTheme.createMany({
        data: themes.map((t) => ({
          id: encodeFocusThemeId(userId, t.id),
          userId,
          intent: t.intent,
          tags: Array.isArray(t.tags) ? t.tags.map(String) : [],
          isPrimary: Boolean(t.isPrimary),
        })),
      });
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('put focus-themes error:', e.message || e);
    res.status(500).json({ error: 'Failed to save themes' });
  }
});

export default router;
