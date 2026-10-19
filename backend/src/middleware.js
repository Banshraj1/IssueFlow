import jwt from 'jsonwebtoken';
import { pool } from './db.js';

export async function authRequired(req, res, next) {
  const token = req.cookies?.issueflow_token;
  if (!token) return res.status(401).json({ error: 'Please sign in to continue.' });
  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!Number.isSafeInteger(Number(claims.id))) return res.status(401).json({ error: 'Your session is invalid or has expired.' });
    const [rows] = await pool.execute('SELECT id, name, email, role FROM users WHERE id = ?', [claims.id]);
    if (!rows.length) return res.status(401).json({ error: 'Your account is no longer available.' });
    req.user = { id: Number(rows[0].id), name: rows[0].name, email: rows[0].email, role: rows[0].role };
    return next();
  } catch (err) { return next(err); }
}
export function adminRequired(req, res, next) {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Administrator access required.' });
  return next();
}
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err?.name === 'ZodError') return res.status(400).json({ error: err.issues[0]?.message || 'Invalid input.' });
  if (err?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'An account with that email already exists.' });
  if (err?.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'The selected user does not exist.' });
  console.error(err);
  return res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong. Please try again.' });
}
