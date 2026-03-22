// blog-api/src/routes/auth.ts
// Routes d'authentification complètes
//
// POST /api/auth/register  → créer un compte visiteur
// POST /api/auth/login     → connexion + JWT
// POST /api/auth/logout    → déconnexion (clear cookie)
// GET  /api/auth/me        → profil de l'utilisateur connecté
// PUT  /api/auth/me        → modifier son profil
// PUT  /api/auth/password  → changer son mot de passe
// POST /api/auth/refresh   → rafraîchir le JWT
// POST /api/auth/admin     → créer un compte admin (protégé par ADMIN_SECRET)

import { Router, type Request, type Response } from 'express';


import { User }                          from '../models/User';
import { authMiddleware, requireAuth,
         generateToken, type AuthRequest }    from '../middleware/auth';
import { authLimiter }                   from '../middleware/rateLimit';

const router = Router();

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Envoie le token dans un cookie httpOnly ET dans la réponse JSON */
function sendTokenResponse(
  res: Response,
  token: string,
  user: { _id: any; username: string; email: string; role: string; avatar?: string; bio?: string }
) {
  // Cookie httpOnly — inaccessible depuis JS (XSS safe)
  res.cookie('blog_token', token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 jours
  });

  res.json({
    success: true,
    token,   // aussi renvoyé pour les clients qui préfèrent localStorage
    user: {
      _id:      user._id,
      username: user.username,
      email:    user.email,
      role:     user.role,
      avatar:   user.avatar,
      bio:      user.bio,
    },
  });
}

/** Valider le format email */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Valider la force du mot de passe */
function isStrongPassword(pwd: string): { valid: boolean; message: string } {
  if (pwd.length < 8)
    return { valid: false, message: 'Minimum 8 caractères' };
  if (!/[A-Z]/.test(pwd))
    return { valid: false, message: 'Au moins une majuscule' };
  if (!/[0-9]/.test(pwd))
    return { valid: false, message: 'Au moins un chiffre' };
  return { valid: true, message: '' };
}

// ─────────────────────────────────────────────────────────────
// POST /api/auth/register
// Créer un compte visiteur
// ─────────────────────────────────────────────────────────────
router.post('/register', authLimiter, async (req: Request, res: Response) => {
  try {
    const { username, email, password, bio } = req.body;

    // ── Validation ──
    if (!username?.trim() || !email?.trim() || !password) {
      return res.status(400).json({
        error: 'Username, email et mot de passe requis',
        code:  'MISSING_FIELDS',
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Email invalide', code: 'INVALID_EMAIL' });
    }

    const pwdCheck = isStrongPassword(password);
    if (!pwdCheck.valid) {
      return res.status(400).json({ error: pwdCheck.message, code: 'WEAK_PASSWORD' });
    }

    if (username.trim().length < 3 || username.trim().length > 30) {
      return res.status(400).json({
        error: 'Username entre 3 et 30 caractères',
        code:  'INVALID_USERNAME',
      });
    }

    // ── Vérifier unicité ──
    const [existingEmail, existingUsername] = await Promise.all([
      User.findOne({ email: email.toLowerCase() }),
      User.findOne({ username: username.trim() }),
    ]);

    if (existingEmail) {
      return res.status(409).json({ error: 'Email déjà utilisé', code: 'EMAIL_TAKEN' });
    }
    if (existingUsername) {
      return res.status(409).json({ error: 'Username déjà pris', code: 'USERNAME_TAKEN' });
    }

    // ── Créer l'utilisateur ──
    const user = new User({
      username: username.trim(),
      email:    email.toLowerCase(),
      password,              // hashé automatiquement via UserSchema.pre('save')
      bio:      bio?.trim(),
      role:     'visitor',
    });

    await user.save();

    const token = generateToken({ _id: user._id.toString(), role: user.role });

    sendTokenResponse(res, token, user);
  } catch (err: any) {
    // Erreur de duplicate key MongoDB (index unique)
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(409).json({
        error: `${field === 'email' ? 'Email' : 'Username'} déjà utilisé`,
        code:  'DUPLICATE_KEY',
      });
    }
    console.error('[AUTH] register error:', err);
    res.status(500).json({ error: 'Erreur serveur', code: 'SERVER_ERROR' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/auth/login
// Connexion avec email + mot de passe
// ─────────────────────────────────────────────────────────────
router.post('/login', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email?.trim() || !password) {
      return res.status(400).json({
        error: 'Email et mot de passe requis',
        code:  'MISSING_FIELDS',
      });
    }

    // Trouver l'utilisateur (select password explicitement car il est exclu par défaut)
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      // Même message pour email ou password incorrect (sécurité)
      return res.status(401).json({
        error: 'Identifiants incorrects',
        code:  'INVALID_CREDENTIALS',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        error: 'Identifiants incorrects',
        code:  'INVALID_CREDENTIALS',
      });
    }

    const token = generateToken({ _id: user._id.toString(), role: user.role });

    console.log(`[AUTH] Login: ${user.username} (${user.role}) — ${new Date().toISOString()}`);

    sendTokenResponse(res, token, user);
  } catch (err) {
    console.error('[AUTH] login error:', err);
    res.status(500).json({ error: 'Erreur serveur', code: 'SERVER_ERROR' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/auth/logout
// Déconnexion — efface le cookie
// ─────────────────────────────────────────────────────────────
router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('blog_token', {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  res.json({ success: true, message: 'Déconnecté avec succès' });
});

// ─────────────────────────────────────────────────────────────
// GET /api/auth/me
// Profil de l'utilisateur connecté
// ─────────────────────────────────────────────────────────────
router.get('/me', authMiddleware, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.user!._id)
      .select('-password')
      .lean();

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable', code: 'USER_NOT_FOUND' });
    }

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur', code: 'SERVER_ERROR' });
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/auth/me
// Modifier son profil (username, bio, avatar)
// ─────────────────────────────────────────────────────────────
router.put('/me', authMiddleware, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { username, bio, avatar } = req.body;
    const updates: Record<string, string> = {};

    if (username !== undefined) {
      const trimmed = username.trim();
      if (trimmed.length < 3 || trimmed.length > 30) {
        return res.status(400).json({ error: 'Username entre 3 et 30 caractères', code: 'INVALID_USERNAME' });
      }
      // Vérifier unicité (sauf si c'est le même user)
      const existing = await User.findOne({ username: trimmed, _id: { $ne: req.user!._id } });
      if (existing) {
        return res.status(409).json({ error: 'Username déjà pris', code: 'USERNAME_TAKEN' });
      }
      updates.username = trimmed;
    }

    if (bio !== undefined) {
      if (bio.length > 300) {
        return res.status(400).json({ error: 'Bio max 300 caractères', code: 'BIO_TOO_LONG' });
      }
      updates.bio = bio.trim();
    }

    if (avatar !== undefined) {
      // Vérifier que c'est une URL valide (URL Cloudinary typiquement)
      try {
        new URL(avatar);
        updates.avatar = avatar;
      } catch {
        return res.status(400).json({ error: 'URL avatar invalide', code: 'INVALID_AVATAR_URL' });
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user!._id,
      { $set: updates },
      { returnDocument: 'after', runValidators: true }
    ).select('-password');

    res.json({ success: true, user });
  } catch (err: any) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Username déjà pris', code: 'DUPLICATE_KEY' });
    }
    res.status(500).json({ error: 'Erreur serveur', code: 'SERVER_ERROR' });
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/auth/password
// Changer son mot de passe
// ─────────────────────────────────────────────────────────────
router.put('/password', authMiddleware, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Mot de passe actuel et nouveau requis',
        code:  'MISSING_FIELDS',
      });
    }

    const pwdCheck = isStrongPassword(newPassword);
    if (!pwdCheck.valid) {
      return res.status(400).json({ error: pwdCheck.message, code: 'WEAK_PASSWORD' });
    }

    const user = await User.findById(req.user!._id).select('+password');
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable', code: 'USER_NOT_FOUND' });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        error: 'Mot de passe actuel incorrect',
        code:  'WRONG_PASSWORD',
      });
    }

    user.password = newPassword; // hashé automatiquement via pre('save')
    await user.save();

    // Révoquer le token actuel en renvoyant un nouveau
    const token = generateToken({ _id: user._id.toString(), role: user.role });
    sendTokenResponse(res, token, user);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur', code: 'SERVER_ERROR' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/auth/refresh
// Rafraîchir le JWT (à appeler avant expiration)
// ─────────────────────────────────────────────────────────────
router.post('/refresh', authMiddleware, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.user!._id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable', code: 'USER_NOT_FOUND' });
    }
    const token = generateToken({ _id: user._id.toString(), role: user.role });
    sendTokenResponse(res, token, user);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur', code: 'SERVER_ERROR' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/auth/admin
// Créer le compte admin initial
// Protégé par ADMIN_SECRET dans le body (à utiliser une seule fois)
// ─────────────────────────────────────────────────────────────
router.post('/admin', async (req: Request, res: Response) => {
  try {
    const { username, email, password, adminSecret } = req.body;

    // Vérifier le secret admin (défini dans .env)
    if (adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({
        error: 'Secret admin incorrect',
        code:  'INVALID_ADMIN_SECRET',
      });
    }

    // Vérifier qu'aucun admin n'existe déjà
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      return res.status(409).json({
        error: 'Un compte admin existe déjà',
        code:  'ADMIN_ALREADY_EXISTS',
      });
    }

    // Validations
    if (!username?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: 'Tous les champs sont requis', code: 'MISSING_FIELDS' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Email invalide', code: 'INVALID_EMAIL' });
    }
    const pwdCheck = isStrongPassword(password);
    if (!pwdCheck.valid) {
      return res.status(400).json({ error: pwdCheck.message, code: 'WEAK_PASSWORD' });
    }

    const admin = new User({
      username: username.trim(),
      email:    email.toLowerCase(),
      password,
      role:     'admin',
      bio:      'Auteur du blog · Vibe Coder · Data Analyst',
    });

    await admin.save();

    const token = generateToken({ _id: admin._id.toString(), role: admin.role });

    console.log(`[AUTH] Admin account created: ${admin.username} — ${new Date().toISOString()}`);

    sendTokenResponse(res, token, admin);
  } catch (err: any) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(409).json({ error: `${field} déjà utilisé`, code: 'DUPLICATE_KEY' });
    }
    console.error('[AUTH] admin creation error:', err);
    res.status(500).json({ error: 'Erreur serveur', code: 'SERVER_ERROR' });
  }
});

export default router;