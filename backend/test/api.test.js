import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { app } from '../src/app.js';
import { pool } from '../src/db.js';
import { adminRequired, authRequired } from '../src/middleware.js';

let server, base;
test.before(async () => {
  process.env.JWT_SECRET ||= 'test-only-secret-at-least-32-characters-long';
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await pool.end(); });

test('health check reports the API is available', async () => {
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('private issue and dashboard routes reject unauthenticated requests', async () => {
  for (const path of ['/api/issues', '/api/dashboard/stats', '/api/auth/me']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 401, path);
    assert.ok((await response.json()).error);
  }
});

test('registration validates input before any database write', async () => {
  const response = await fetch(`${base}/api/auth/register`, { method:'POST', headers:{'content-type':'application/json', origin:'http://localhost:5173'}, body:JSON.stringify({ name:'x', email:'not-an-email', password:'x' }) });
  assert.equal(response.status, 400);
  assert.ok((await response.json()).error);
});

test('login rejects malformed email before database access', async () => {
  const response = await fetch(`${base}/api/auth/login`, { method:'POST', headers:{'content-type':'application/json', origin:'http://localhost:5173'}, body:JSON.stringify({ email:'invalid', password:'some-password' }) });
  assert.equal(response.status, 400);
  assert.ok((await response.json()).error);
});

test('unsafe browser requests reject an untrusted origin', async () => {
  const response = await fetch(`${base}/api/auth/logout`, { method:'POST', headers:{ origin:'https://attacker.example' } });
  assert.equal(response.status, 403);
});

test('admin middleware denies USER claims and allows ADMIN claims', () => {
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  let nextCalled = false;
  adminRequired({ user: { role: 'USER' } }, response, () => { nextCalled = true; });
  assert.equal(response.code, 403);
  assert.equal(nextCalled, false);
  adminRequired({ user: { role: 'ADMIN' } }, response, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('authentication reloads the current role from MySQL instead of trusting stale JWT claims', async () => {
  const originalExecute = pool.execute;
  pool.execute = async () => [[{ id: 7, name: 'Former admin', email: 'user@example.com', role: 'USER' }]];
  const req = { cookies: { issueflow_token: jwt.sign({ id: 7, role: 'ADMIN' }, process.env.JWT_SECRET) } };
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  let nextCalled = false;
  try {
    await authRequired(req, response, () => { nextCalled = true; });
    assert.equal(req.user.role, 'USER');
    assert.equal(nextCalled, true);
  } finally { pool.execute = originalExecute; }
});
