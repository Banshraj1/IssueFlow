import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';

try {
  const name = process.env.ADMIN_NAME, email = process.env.ADMIN_EMAIL?.trim().toLowerCase(), password = process.env.ADMIN_PASSWORD;
  if (!name || !email || !password || password.length < 12) throw new Error('Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD (at least 12 characters) in backend/.env.');
  const [existing] = await pool.execute('SELECT role FROM users WHERE email = ?', [email]);
  if (existing.length && existing[0].role !== 'ADMIN') throw new Error('That email already belongs to a USER account. Choose a separate ADMIN_EMAIL; the seed will not promote an existing user.');
  const hash = await bcrypt.hash(password, 12);
  if (existing.length) await pool.execute("UPDATE users SET name = ?, password_hash = ? WHERE email = ?", [name,hash,email]);
  else await pool.execute("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'ADMIN')", [name,email,hash]);
  console.log(`Admin account ready: ${email}`);
} catch (e) { console.error(e.message); process.exitCode = 1; } finally { await pool.end(); }
