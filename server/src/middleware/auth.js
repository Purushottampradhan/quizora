import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is missing in .env');
  return secret;
}

export function signToken(user) {
  return jwt.sign(
    { id: String(user._id), email: user.email },
    jwtSecret(),
    { expiresIn: '7d' }
  );
}

export async function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'Sign in required' });
  }

  try {
    const payload = jwt.verify(token, jwtSecret());
    const user = await User.findById(payload.id);
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    req.user = { id: String(user._id), email: user.email };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}
