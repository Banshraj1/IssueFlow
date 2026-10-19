# IssueFlow

IssueFlow is a full stack issue and incident tracker for a small software team. The React app talks to an Express REST API, which validates requests, checks the signed HttpOnly session cookie, enforces access rules, and stores records in MySQL.

## Features

- Registration and login with bcrypt password hashes and JWTs in HttpOnly cookies.
- Public sign-up always creates a `USER`; the environment-driven seed command creates an `ADMIN`.
- Issue creation, editing, deletion, title search, status/priority filtering, pagination, and update ordering.
- Admin controls to assign users and change status or priority.
- Comments and activity history for issue creation, updates, status, priority, and assignments.
- Dashboard counts, responsive pages, error/empty/loading states, and API health check.

## Architecture and request flow

The Vite React client uses Axios with `withCredentials: true`. The browser stores the API's HttpOnly cookie and sends it on subsequent requests. Express CORS allows only `FRONTEND_ORIGIN` and credentials. Authentication middleware verifies the JWT, and route handlers apply role and issue visibility rules before running parameterized MySQL queries. Password hashes are never returned to the client.

## Database

`backend/schema.sql` creates the `issueflow` database and normalized tables:

- `users`: unique normalized email, role, bcrypt hash, timestamps.
- `issues`: title, description, status, priority, creator and optional assignee; indexed for filters and updated-time ordering.
- `comments`: issue and author foreign keys.
- `issue_activity`: actor, action, JSON details, and event timestamp.

Issue deletion cascades its comments and activity. User references are restricted or nulled so historical records do not point at deleted people.

## Prerequisites

- Node.js 20 or newer and npm.
- MySQL 8.0 or compatible MySQL server.

Local MySQL is the default; no paid service is required.

## Setup and run

From the repository root (`issueflow/`):

```sh
npm install
```

Create a database and a least-privilege app user in MySQL, then initialize the schema:

```sh
mysql -u root -p < backend/schema.sql
```

Copy `.env.example` to `backend/.env` and change the credentials and secrets. PowerShell:

```powershell
Copy-Item .env.example backend/.env
```

macOS/Linux:

```sh
cp .env.example backend/.env
```

For example, edit `backend/.env` to contain:

```env
NODE_ENV=development
PORT=4000
FRONTEND_ORIGIN=http://localhost:5173
DATABASE_URL=mysql://issueflow:your-db-password@localhost:3306/issueflow
JWT_SECRET=use-a-random-secret-at-least-32-characters-long
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
ADMIN_NAME=IssueFlow Admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=use-a-unique-password-at-least-12-chars
```

Do not commit `backend/.env`. You can generate a JWT secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

Seed or update the administrator using the values in `backend/.env`:

```sh
npm run seed:admin
```

Start both services:

```sh
npm run dev
```

Open <http://localhost:5173>. API is at <http://localhost:4000/api>; health check is `GET /api/health`. To make a production frontend bundle run `npm run build` (output: `frontend/dist`).

## Environment variables

| Name | Purpose |
| --- | --- |
| `NODE_ENV` | `development` or `production`. |
| `PORT` | Express listen port (default 4000). |
| `TRUST_PROXY_HOPS` | Number of trusted reverse-proxy hops for client IP/rate limiting (default 1; set to match the hosting topology). |
| `FRONTEND_ORIGIN` | Exact browser origin allowed by credentialed CORS. |
| `DATABASE_URL` | MySQL connection URL, server side only. |
| `JWT_SECRET` | Signing secret; server requires at least 32 characters. |
| `COOKIE_SECURE` | `false` for local HTTP; `true` when served over HTTPS. |
| `COOKIE_SAME_SITE` | Normally `lax` on one site; use `none` for cross-site HTTPS deployments. |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Seed script inputs; password must be at least 12 characters. |
| `VITE_API_URL` | Optional public API base URL for the frontend build, such as `https://api.example.com/api`. Never put secrets here. |

For a deployment where the UI and API have different sites, set `COOKIE_SECURE=true` and `COOKIE_SAME_SITE=none`; browsers require Secure for SameSite=None. Ensure the frontend and API use HTTPS and configure the exact frontend origin. A same-site subdomain deployment can generally use `lax` with Secure enabled.

## REST API

All successful responses use JSON except the `204` delete response. Errors return `{ "error": "..." }` with an appropriate 4xx/5xx status. Auth routes have a 30-request-per-15-minute limiter.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | Health check. |
| `POST` | `/api/auth/register` | Public | `{name,email,password}`; creates USER, signs in. |
| `POST` | `/api/auth/login` | Public | `{email,password}`; signs in. |
| `POST` | `/api/auth/logout` | Public | Clears session cookie. |
| `GET` | `/api/auth/me` | Signed in | Current user. |
| `GET` | `/api/issues` | Signed in | List; optional `search`, `status`, `priority`, `page`, `limit`. Users see created/assigned issues; admins see all. |
| `POST` | `/api/issues` | Signed in | `{title,description,priority?}`. |
| `GET` | `/api/issues/:id` | Visible user | Issue and activity history. |
| `PATCH` | `/api/issues/:id` | Creator or admin | Creator edits title/description/priority. Admin also changes status and `assigneeId` (number or null). |
| `DELETE` | `/api/issues/:id` | Creator or admin | Permanently deletes issue and dependent records. |
| `GET` | `/api/issues/:id/comments` | Visible user | List comments. |
| `POST` | `/api/issues/:id/comments` | Visible user | `{body}` adds a comment. |
| `GET` | `/api/dashboard/stats` | Signed in | Counts scoped to visible issues, or all issues for admins. |
| `GET` | `/api/users` | Admin | Registered USER accounts available for assignment. |

Status values: `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`. Priority values: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.

## Tests

```sh
npm test
```

The tests cover health and authentication gates, registration/login validation, duplicate registration, role-escalation attempts, issue creation/list/read/update/delete, ownership and admin-only status/assignment checks, comments and activity persistence, and cascading issue cleanup. The suite uses the configured `backend/.env` database and expects `backend/schema.sql` to have been applied. It creates uniquely named test accounts and removes those accounts and their test issues when the run completes.

## Deployment notes

- **GitHub:** Commit source and lockfile, but never `.env`; `.gitignore` excludes secrets and build outputs.
- **Vercel:** Deploy `frontend` as a Vite static project with `VITE_API_URL` set to the deployed API's `/api` base. Vercel does not host this Express/MySQL backend as a persistent server in the same way; deploy the API separately.
- **Render:** Deploy the backend as a Node web service with root directory `backend`, build command `npm install`, start command `npm start`, and server environment values configured in the dashboard. Deploy the frontend as a static site with build command `npm install && npm run build` from root and publish directory `frontend/dist` (or set project root to `frontend`).
- **Managed MySQL:** Use any MySQL-compatible managed database that permits your API host to connect. Apply `backend/schema.sql`, use a dedicated database user with only required permissions, and set `DATABASE_URL` in the API host. Free tiers and database sleeping/storage limits vary by provider and can change; check current provider limits before choosing one. Local MySQL remains suitable for development.
- Set `FRONTEND_ORIGIN` to the exact deployed UI origin (scheme and hostname, no wildcard). Set `COOKIE_SECURE=true`; use `COOKIE_SAME_SITE=none` only if frontend and API are cross-site, and then both must use HTTPS. Set secrets only on the backend host. Configure the frontend `VITE_API_URL` to the public API URL; it is not secret.

## Manual feature walkthrough

1. Register a normal account and confirm it lands on the dashboard.
2. Create an issue, then search for its title and filter by status/priority.
3. Open the issue, post a comment, and inspect activity history.
4. Seed the admin account, sign in as admin, then assign the issue and change its status/priority.
5. Sign in as the original user and confirm the updated state is visible; test that a user cannot change admin-only fields.
6. Edit or delete an issue as its creator, confirm the delete prompt, and verify dashboard counts update.
