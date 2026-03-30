import { Router } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../db.js';
import {
  hashRefreshToken,
  randomRefreshToken,
  signAccessToken,
  refreshExpiresAt,
} from '../lib/tokens.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function tokensResponse(user) {
  const accessToken = signAccessToken(user.id, user.email);
  const rawRefresh = randomRefreshToken();
  const tokenHash = hashRefreshToken(rawRefresh);
  const expiresAt = refreshExpiresAt();
  return { user, accessToken, refreshToken: rawRefresh, tokenHash, expiresAt };
}

router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!normalized || !EMAIL_RE.test(normalized)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await prisma.user.findUnique({ where: { email: normalized } });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email: normalized, passwordHash },
      select: { id: true, email: true, createdAt: true },
    });

    const { accessToken, refreshToken, tokenHash, expiresAt } = tokensResponse(user);
    await prisma.refreshToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    res.status(201).json({
      user,
      accessToken,
      refreshToken,
    });
  } catch (e) {
    console.error('register error:', e);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!normalized || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const userRow = await prisma.user.findUnique({ where: { email: normalized } });
    if (!userRow) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const ok = await bcrypt.compare(password, userRow.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = {
      id: userRow.id,
      email: userRow.email,
      createdAt: userRow.createdAt,
    };
    const { accessToken, refreshToken, tokenHash, expiresAt } = tokensResponse(user);
    await prisma.refreshToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    res.json({ user, accessToken, refreshToken });
  } catch (e) {
    console.error('login error:', e);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    if (typeof refreshToken !== 'string' || !refreshToken) {
      return res.status(400).json({ error: 'refreshToken required' });
    }
    const tokenHash = hashRefreshToken(refreshToken);
    const row = await prisma.refreshToken.findFirst({
      where: { tokenHash },
      include: { user: true },
    });
    if (!row || row.expiresAt < new Date()) {
      if (row) await prisma.refreshToken.delete({ where: { id: row.id } });
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const user = {
      id: row.user.id,
      email: row.user.email,
      createdAt: row.user.createdAt,
    };
    const accessToken = signAccessToken(user.id, user.email);
    res.json({ user, accessToken });
  } catch (e) {
    console.error('refresh error:', e);
    res.status(500).json({ error: 'Refresh failed' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    if (typeof refreshToken === 'string' && refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken);
      await prisma.refreshToken.deleteMany({ where: { tokenHash } });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('logout error:', e);
    res.status(500).json({ error: 'Logout failed' });
  }
});

export default router;
