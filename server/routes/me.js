import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { prisma } from '../db.js';
import { encodeFocusThemeId } from '../lib/focusThemeIds.js';

const router = Router();

const ALLOWED_ROLE_IDS = new Set(['Student', 'Professional', 'Freelancer', 'Mixed']);
const AVATAR_MAX_LEN = 1_800_000;

const userMeSelect = {
  id: true,
  email: true,
  createdAt: true,
  displayName: true,
  avatarUrl: true,
  roleIds: true,
  fieldDomain: true,
  onboardingCompletedAt: true,
};

router.get('/', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: userMeSelect,
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (e) {
    console.error('me error:', e);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

/**
 * Completes onboarding: profile fields + optional quarterly focus themes (or empty if skipped).
 */
router.put('/onboarding-complete', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    const fieldDomain = typeof body.fieldDomain === 'string' ? body.fieldDomain.trim() : '';
    const skippedQuarterlyThemes = Boolean(body.skippedQuarterlyThemes);

    let avatarUpdate;
    if (Object.prototype.hasOwnProperty.call(body, 'avatarUrl')) {
      if (body.avatarUrl === null) {
        avatarUpdate = null;
      } else if (typeof body.avatarUrl === 'string') {
        if (body.avatarUrl.length > AVATAR_MAX_LEN) {
          return res.status(400).json({ error: 'avatarUrl is too large' });
        }
        avatarUpdate = body.avatarUrl;
      } else {
        return res.status(400).json({ error: 'avatarUrl must be a string or null' });
      }
    }

    if (!displayName) {
      return res.status(400).json({ error: 'displayName is required' });
    }
    if (!fieldDomain) {
      return res.status(400).json({ error: 'fieldDomain is required' });
    }

    const roleIds = Array.isArray(body.roleIds) ? body.roleIds.map((r) => String(r).trim()).filter(Boolean) : [];
    if (roleIds.length === 0) {
      return res.status(400).json({ error: 'At least one role is required' });
    }
    if (roleIds.length > 8) {
      return res.status(400).json({ error: 'Too many roles' });
    }
    for (const id of roleIds) {
      if (!ALLOWED_ROLE_IDS.has(id)) {
        return res.status(400).json({ error: `Invalid role: ${id}` });
      }
    }

    let themes = [];
    if (!skippedQuarterlyThemes) {
      const raw = body.themes;
      if (!Array.isArray(raw) || raw.length === 0) {
        return res.status(400).json({ error: 'themes required when not skipping quarterly setup' });
      }
      if (raw.length > 3) {
        return res.status(400).json({ error: 'At most 3 focus themes' });
      }
      for (const t of raw) {
        if (!t || typeof t.id !== 'string' || typeof t.intent !== 'string') {
          return res.status(400).json({ error: 'Each theme needs id and intent' });
        }
      }
      themes = raw;
    }

    const userId = req.userId;
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          displayName,
          ...(avatarUpdate !== undefined ? { avatarUrl: avatarUpdate } : {}),
          roleIds,
          fieldDomain,
          onboardingCompletedAt: now,
        },
      });

      await tx.focusTheme.deleteMany({ where: { userId } });
      if (themes.length > 0) {
        await tx.focusTheme.createMany({
          data: themes.map((t) => ({
            id: encodeFocusThemeId(userId, t.id),
            userId,
            intent: t.intent,
            tags: Array.isArray(t.tags) ? t.tags.map(String) : [],
            isPrimary: Boolean(t.isPrimary),
          })),
        });
      }
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: userMeSelect,
    });

    res.json({ ok: true, user });
  } catch (e) {
    console.error('onboarding-complete error:', e.message || e);
    res.status(500).json({ error: 'Failed to save onboarding' });
  }
});

export default router;
