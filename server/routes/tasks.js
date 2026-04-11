import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { prisma } from '../db.js';

const router = Router();
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function normalizeTaskForStorage(t) {
  const normalized = { ...t };
  normalized.title = typeof t.title === 'string' ? t.title.trim() : '';
  normalized.status = typeof t.status === 'string' ? t.status : 'PENDING';
  normalized.isAnchor = Boolean(t.isAnchor);
  normalized.isFrozen = Boolean(t.isFrozen);
  normalized.isArchived = Boolean(t.isArchived);
  normalized.completed = Boolean(t.completed);
  normalized.duration = Number.isFinite(Number(t.duration)) ? Math.max(1, Math.round(Number(t.duration))) : 30;
  normalized.startTime =
    typeof t.startTime === 'string' && TIME_RE.test(t.startTime) ? t.startTime : undefined;
  normalized.dateStr =
    typeof t.dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.dateStr) ? t.dateStr : undefined;
  return normalized;
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const rows = await prisma.task.findMany({
      where: { userId: req.userId },
      orderBy: { updatedAt: 'asc' },
    });
    const tasks = rows.map((r) => {
      const p = r.payload;
      const base =
        p && typeof p === 'object' && !Array.isArray(p) ? { ...p, id: r.id } : { id: r.id };
      const fromPayload = Number(base.duration);
      const fromColumn = Number(r.duration);
      const duration =
        Number.isFinite(fromPayload) && fromPayload > 0
          ? Math.max(1, Math.round(fromPayload))
          : Number.isFinite(fromColumn) && fromColumn > 0
            ? Math.max(1, Math.round(fromColumn))
            : 30;
      return { ...base, duration };
    });
    res.json({ tasks });
  } catch (e) {
    console.error('get tasks error:', e);
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

router.put('/', requireAuth, async (req, res) => {
  try {
    const { tasks } = req.body || {};
    if (!Array.isArray(tasks)) {
      return res.status(400).json({ error: 'tasks array required' });
    }

    for (const t of tasks) {
      if (!t || typeof t.id !== 'string') {
        return res.status(400).json({ error: 'Each task needs a string id' });
      }
    }

    const sanitized = tasks.map(normalizeTaskForStorage);
    const userId = req.userId;
    await prisma.$transaction(async (tx) => {
      await tx.task.deleteMany({ where: { userId } });
      if (sanitized.length === 0) return;
      await tx.task.createMany({
        data: sanitized.map((t) => ({
          id: t.id,
          userId,
          title: t.title || null,
          status: t.status || null,
          isAnchor: Boolean(t.isAnchor),
          isFrozen: Boolean(t.isFrozen),
          isArchived: Boolean(t.isArchived),
          completed: Boolean(t.completed),
          dateStr: t.dateStr || null,
          startTime: t.startTime || null,
          duration: Number.isFinite(Number(t.duration)) ? Number(t.duration) : null,
          payload: t,
        })),
      });
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('put tasks error:', e);
    res.status(500).json({ error: 'Failed to save tasks' });
  }
});

export default router;
