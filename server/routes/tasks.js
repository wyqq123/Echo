import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { prisma } from '../db.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const rows = await prisma.task.findMany({
      where: { userId: req.userId },
      orderBy: { updatedAt: 'asc' },
    });
    const tasks = rows.map((r) => {
      const p = r.payload;
      if (p && typeof p === 'object' && !Array.isArray(p)) {
        return { ...p, id: r.id };
      }
      return { id: r.id };
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

    const userId = req.userId;
    await prisma.$transaction(async (tx) => {
      await tx.task.deleteMany({ where: { userId } });
      if (tasks.length === 0) return;
      await tx.task.createMany({
        data: tasks.map((t) => ({
          id: t.id,
          userId,
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
