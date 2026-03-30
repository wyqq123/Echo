import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { prisma } from '../db.js';

const router = Router();

/** Stores funnel script for analytics / debugging; do not send raw brain dump. */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { isSubsequent, script, inputSummary } = req.body || {};
    if (typeof isSubsequent !== 'boolean' || script === undefined) {
      return res.status(400).json({ error: 'isSubsequent (boolean) and script required' });
    }

    const row = await prisma.funnelRun.create({
      data: {
        userId: req.userId,
        isSubsequent,
        script,
        inputSummary:
          typeof inputSummary === 'string' && inputSummary.length > 0
            ? inputSummary.slice(0, 500)
            : null,
      },
      select: { id: true, createdAt: true },
    });

    res.status(201).json(row);
  } catch (e) {
    console.error('funnel-runs error:', e);
    res.status(500).json({ error: 'Failed to record funnel run' });
  }
});

export default router;
