import bcrypt from 'bcryptjs';
import { User } from './models/User.js';

export async function seedAdmin() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!email || !password) {
    const count = await User.countDocuments();
    if (!count) {
      console.warn('No admin users yet. Set ADMIN_EMAIL and ADMIN_PASSWORD, then restart the API.');
    }
    return;
  }

  const existing = await User.findOne({ email });
  if (existing) return;

  const passwordHash = await bcrypt.hash(password, 12);
  await User.create({ email, passwordHash });
  console.log(`Seeded admin account: ${email}`);
}
