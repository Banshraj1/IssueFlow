import 'dotenv/config';
import { app } from './app.js';
import { pool } from './db.js';

const port = Number(process.env.PORT) || 4000;
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be set and at least 32 characters long.');
app.listen(port, async () => {
  try { await pool.query('SELECT 1'); console.log(`IssueFlow API listening on http://localhost:${port}`); }
  catch (err) { console.error('Could not connect to MySQL:', err.message); process.exit(1); }
});
