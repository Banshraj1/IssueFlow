import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { app } from '../src/app.js';
import { pool } from '../src/db.js';

const runId = randomUUID().replaceAll('-', '');
const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const suffix = runId.slice(0, 16);
const account = (tag, role='USER') => ({
  name: `IssueFlow ${tag}`,
  email: `if-${tag}-${suffix}@example.test`,
  password: 'Integration-Test-Pass-42',
  role
});
let server, base;
const users = [];
let issueId;

test.before(async () => {
  process.env.JWT_SECRET ||= 'integration-tests-secret-32-chars-minimum';
  await pool.query('SELECT 1');
  const [tables] = await pool.execute("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('users','issues','comments','issue_activity')");
  assert.equal(Number(tables[0].n), 4, 'Initialize MySQL with backend/schema.sql before integration tests.');
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (users.length) {
    const ids = users.map(u => u.id);
    const marks = ids.map(() => '?').join(',');
    await pool.execute(`DELETE FROM issues WHERE creator_id IN (${marks}) OR assignee_id IN (${marks})`, [...ids, ...ids]);
    await pool.execute(`DELETE FROM users WHERE id IN (${marks})`, ids);
  }
  await pool.end();
});

async function request(path, { method='GET', body, cookie }={}) {
  const headers = { origin };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${base}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const raw = await response.text();
  return { response, data: raw ? JSON.parse(raw) : null, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}

async function register(user) {
  const result = await request('/api/auth/register', { method:'POST', body:user });
  assert.equal(result.response.status, 201, JSON.stringify(result.data));
  const [rows] = await pool.execute('SELECT id, role FROM users WHERE email = ?', [user.email]);
  assert.equal(rows.length, 1);
  const created = { ...user, id:Number(rows[0].id), role:rows[0].role, cookie:result.cookie };
  users.push(created);
  return created;
}

test('registration, login, validation, authorization, CRUD, comments, and activity persist through the API', async () => {
  const ownerInput = account('owner', 'ADMIN'); // A submitted role must never elevate public registration.
  const owner = await register(ownerInput);
  assert.equal(owner.role, 'USER');
  assert.equal((await request('/api/auth/me', { cookie:owner.cookie })).data.user.role, 'USER');
  const [storedOwner] = await pool.execute('SELECT role FROM users WHERE id = ?', [owner.id]);
  assert.equal(storedOwner[0].role, 'USER');

  const invalidRegistration = await request('/api/auth/register', { method:'POST', body:{ name:'x', email:'not-an-email', password:'short' } });
  assert.equal(invalidRegistration.response.status, 400);
  const duplicate = await request('/api/auth/register', { method:'POST', body:{ name:owner.name, email:owner.email.toUpperCase(), password:owner.password } });
  assert.equal(duplicate.response.status, 409);
  const invalidLogin = await request('/api/auth/login', { method:'POST', body:{ email:'bad-email', password:owner.password } });
  assert.equal(invalidLogin.response.status, 400);
  const wrongPassword = await request('/api/auth/login', { method:'POST', body:{ email:owner.email, password:'Wrong-Password-42' } });
  assert.equal(wrongPassword.response.status, 401);
  const login = await request('/api/auth/login', { method:'POST', body:{ email:owner.email.toUpperCase(), password:owner.password } });
  assert.equal(login.response.status, 200);
  assert.equal(login.data.user.role, 'USER');
  owner.cookie = login.cookie;

  const second = await register(account('assignee'));
  const adminInput = account('admin');
  const hash = await bcrypt.hash(adminInput.password, 4);
  const [adminInsert] = await pool.execute("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,'ADMIN')", [adminInput.name,adminInput.email,hash]);
  const admin = { ...adminInput, id:Number(adminInsert.insertId) };
  users.push(admin);
  const adminLogin = await request('/api/auth/login', { method:'POST', body:{ email:admin.email, password:admin.password } });
  assert.equal(adminLogin.response.status, 200);
  admin.cookie = adminLogin.cookie;

  const deniedUsers = await request('/api/users', { cookie:owner.cookie });
  assert.equal(deniedUsers.response.status, 403);
  const adminUsers = await request('/api/users', { cookie:admin.cookie });
  assert.equal(adminUsers.response.status, 200);
  assert.ok(adminUsers.data.users.some(u => Number(u.id) === second.id));

  const invalidIssue = await request('/api/issues', { method:'POST', cookie:owner.cookie, body:{ title:'x', description:'', role:'ADMIN' } });
  assert.equal(invalidIssue.response.status, 400);
  const create = await request('/api/issues', { method:'POST', cookie:owner.cookie, body:{ title:'Integration issue', description:'Created by backend integration test', priority:'HIGH', role:'ADMIN' } });
  assert.equal(create.response.status, 201, JSON.stringify(create.data));
  issueId = Number(create.data.issue.id);
  assert.equal(create.data.issue.status, 'OPEN');
  assert.equal(create.data.issue.creatorId, owner.id);
  const [storedIssue] = await pool.execute('SELECT creator_id, status FROM issues WHERE id = ?', [issueId]);
  assert.equal(Number(storedIssue[0].creator_id), owner.id);
  assert.equal(storedIssue[0].status, 'OPEN');

  const ownerList = await request('/api/issues?page=1&limit=5&status=OPEN&priority=HIGH&search=Integration', { cookie:owner.cookie });
  assert.equal(ownerList.response.status, 200);
  assert.equal(ownerList.data.pagination.total, 1);
  const allFiltersCleared = await request('/api/issues?page=1&limit=5', { cookie:owner.cookie });
  assert.equal(allFiltersCleared.response.status, 200);
  assert.equal(allFiltersCleared.data.pagination.total, 1);
  const emptyStatus = await request('/api/issues?status=', { cookie:owner.cookie });
  assert.equal(emptyStatus.response.status, 400);
  const emptyPriority = await request('/api/issues?priority=', { cookie:owner.cookie });
  assert.equal(emptyPriority.response.status, 400);
  const hidden = await request(`/api/issues/${issueId}`, { cookie:second.cookie });
  assert.equal(hidden.response.status, 404);
  const hiddenPatch = await request(`/api/issues/${issueId}`, { method:'PATCH', cookie:second.cookie, body:{ title:'Unauthorized edit' } });
  assert.equal(hiddenPatch.response.status, 404);

  const invalidPatch = await request(`/api/issues/${issueId}`, { method:'PATCH', cookie:owner.cookie, body:{ status:'NOT_A_STATUS' } });
  assert.equal(invalidPatch.response.status, 400);
  const roleAttempt = await request(`/api/issues/${issueId}`, { method:'PATCH', cookie:owner.cookie, body:{ status:'CLOSED', assigneeId:second.id } });
  assert.equal(roleAttempt.response.status, 403);
  const [unchangedIssue] = await pool.execute('SELECT status, assignee_id FROM issues WHERE id = ?', [issueId]);
  assert.equal(unchangedIssue[0].status, 'OPEN');
  assert.equal(unchangedIssue[0].assignee_id, null);
  const ownerEdit = await request(`/api/issues/${issueId}`, { method:'PATCH', cookie:owner.cookie, body:{ title:'Owner updated issue', priority:'MEDIUM' } });
  assert.equal(ownerEdit.response.status, 200);
  assert.equal(ownerEdit.data.issue.title, 'Owner updated issue');

  const assignToMissing = await request(`/api/issues/${issueId}`, { method:'PATCH', cookie:admin.cookie, body:{ assigneeId:999999999 } });
  assert.equal(assignToMissing.response.status, 400);
  const assignment = await request(`/api/issues/${issueId}`, { method:'PATCH', cookie:admin.cookie, body:{ assigneeId:second.id, status:'IN_PROGRESS' } });
  assert.equal(assignment.response.status, 200);
  assert.equal(Number(assignment.data.issue.assigneeId), second.id);
  assert.equal(assignment.data.issue.status, 'IN_PROGRESS');
  const secondIssue = await request(`/api/issues/${issueId}`, { cookie:second.cookie });
  assert.equal(secondIssue.response.status, 200);
  const assignedUserEdit = await request(`/api/issues/${issueId}`, { method:'PATCH', cookie:second.cookie, body:{ title:'Assignee cannot edit' } });
  assert.equal(assignedUserEdit.response.status, 403);
  const assignedUserDelete = await request(`/api/issues/${issueId}`, { method:'DELETE', cookie:second.cookie });
  assert.equal(assignedUserDelete.response.status, 403);

  const invalidComment = await request(`/api/issues/${issueId}/comments`, { method:'POST', cookie:second.cookie, body:{ body:'  ' } });
  assert.equal(invalidComment.response.status, 400);
  const comment = await request(`/api/issues/${issueId}/comments`, { method:'POST', cookie:second.cookie, body:{ body:'Comment persisted by integration test' } });
  assert.equal(comment.response.status, 201);
  const comments = await request(`/api/issues/${issueId}/comments`, { cookie:owner.cookie });
  assert.equal(comments.response.status, 200);
  assert.ok(comments.data.comments.some(c => c.body === 'Comment persisted by integration test' && c.authorName === second.name));

  const detail = await request(`/api/issues/${issueId}`, { cookie:admin.cookie });
  assert.equal(detail.response.status, 200);
  const actions = detail.data.activity.map(a => a.action);
  assert.ok(actions.includes('CREATED'));
  assert.ok(actions.includes('STATUS_CHANGED'));
  assert.ok(actions.includes('ASSIGNED'));
  const [persistedActivity] = await pool.execute('SELECT COUNT(*) AS n FROM issue_activity WHERE issue_id = ?', [issueId]);
  assert.ok(Number(persistedActivity[0].n) >= 4);

  const dashboard = await request('/api/dashboard/stats', { cookie:admin.cookie });
  assert.equal(dashboard.response.status, 200);
  assert.ok(Number(dashboard.data.stats.total) >= 1);
  const deleteResult = await request(`/api/issues/${issueId}`, { method:'DELETE', cookie:owner.cookie });
  assert.equal(deleteResult.response.status, 204);
  const [gone] = await pool.execute('SELECT id FROM issues WHERE id = ?', [issueId]);
  assert.equal(gone.length, 0);
  const [cascade] = await pool.execute('SELECT (SELECT COUNT(*) FROM comments WHERE issue_id = ?) + (SELECT COUNT(*) FROM issue_activity WHERE issue_id = ?) AS n', [issueId,issueId]);
  assert.equal(Number(cascade[0].n), 0);
  issueId = undefined;
});
