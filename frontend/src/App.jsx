import { createContext, useContext, useEffect, useState } from "react";
import {
    Link,
    NavLink,
    Navigate,
    Outlet,
    Route,
    Routes,
    useNavigate,
    useParams,
} from "react-router-dom";
import {
    Activity,
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    CheckCircle2,
    CircleHelp,
    ClipboardList,
    LayoutDashboard,
    LogOut,
    Plus,
    Search,
    ShieldCheck,
    SlidersHorizontal,
    UserRound,
    X,
} from "lucide-react";
import { api, messageOf } from "./api.js";

const Auth = createContext(null),
    useAuth = () => useContext(Auth);
const pretty = (s) =>
    (s || "")
        .replace("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, (x) => x.toUpperCase());
const date = (d) =>
    d
        ? new Date(d).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
          })
        : "—";
function Protected() {
    const { user, loading } = useAuth();
    if (loading)
        return (
            <div className="screen">
                <div className="spinner" />
                <p>Loading your workspace…</p>
            </div>
        );
    return user ? <Outlet /> : <Navigate to="/login" replace />;
}
function App() {
    const [user, setUser] = useState(null),
        [loading, setLoading] = useState(true);
    useEffect(() => {
        api.get("/auth/me")
            .then((r) => setUser(r.data.user))
            .catch(() => setUser(null))
            .finally(() => setLoading(false));
    }, []);
    return (
        <Auth.Provider value={{ user, setUser, loading }}>
            <Routes>
                <Route path="/login" element={<AuthPage mode="login" />} />
                <Route
                    path="/register"
                    element={<AuthPage mode="register" />}
                />
                <Route element={<Protected />}>
                    <Route element={<Shell />}>
                        <Route index element={<Dashboard />} />
                        <Route path="issues" element={<IssueList />} />
                        <Route path="issues/new" element={<IssueForm />} />
                        <Route path="issues/:id" element={<IssueDetail />} />
                        <Route
                            path="issues/:id/edit"
                            element={<IssueForm edit />}
                        />
                    </Route>
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Auth.Provider>
    );
}
function AuthPage({ mode }) {
    const { user, setUser, loading } = useAuth(),
        nav = useNavigate(),
        [error, setError] = useState(""),
        [busy, setBusy] = useState(false);
    const register = mode === "register";
    useEffect(() => {
        if (!loading && user) nav("/");
    }, [loading, user]);
    async function submit(e) {
        e.preventDefault();
        setError("");
        setBusy(true);
        const f = new FormData(e.currentTarget),
            data = Object.fromEntries(f.entries());
        try {
            const r = await api.post(`/auth/${mode}`, data);
            setUser(r.data.user);
            nav("/");
        } catch (e) {
            setError(messageOf(e));
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="auth-wrap">
            <div className="auth-card">
                <Brand />
                <div className="auth-title">
                    <p className="eyebrow">YOUR TEAM'S WORKSPACE</p>
                    <h1>{register ? "Create your account" : "Welcome back"}</h1>
                    <p>
                        {register
                            ? "Set up your IssueFlow account to get started."
                            : "Sign in to continue to your team’s issues."}
                    </p>
                </div>
                {error && <div className="alert">{error}</div>}
                <form className="form" onSubmit={submit}>
                    {register && (
                        <Field
                            label="Full name"
                            name="name"
                            placeholder="Jordan Lee"
                            minLength="2"
                            required
                        />
                    )}
                    <Field
                        label="Email address"
                        name="email"
                        type="email"
                        placeholder="you@company.com"
                        required
                    />
                    <Field
                        label="Password"
                        name="password"
                        type="password"
                        placeholder={
                            register ? "At least 8 characters" : "Your password"
                        }
                        minLength={register ? "8" : undefined}
                        required
                    />
                    <button className="btn primary full" disabled={busy}>
                        {busy
                            ? "Please wait…"
                            : register
                              ? "Create account"
                              : "Sign in"}{" "}
                        <ArrowRight size={16} />
                    </button>
                </form>
                <p className="auth-switch">
                    {register
                        ? "Already have an account?"
                        : "New to IssueFlow?"}{" "}
                    <Link to={register ? "/login" : "/register"}>
                        {register ? "Sign in" : "Create an account"}
                    </Link>
                </p>
                <p className="auth-foot">
                    Secure, private issue tracking for your team.
                </p>
            </div>
        </div>
    );
}
function Brand() {
    return (
        <Link className="brand" to="/">
            <span className="brand-mark">
                <Activity size={19} />
            </span>
            <span>
                issue<span className="brand-light">flow</span>
            </span>
        </Link>
    );
}
function Shell() {
    const { user, setUser } = useAuth(),
        nav = useNavigate(),
        [mobile, setMobile] = useState(false);
    async function logout() {
        await api.post("/auth/logout").catch(() => {});
        setUser(null);
        nav("/login");
    }
    return (
        <div className="app-shell">
            <aside className={`sidebar ${mobile ? "show" : ""}`}>
                <Brand />
                <div className="workspace-chip">
                    <div className="workspace-icon">IF</div>
                    <div>
                        <b>Engineering</b>
                        <small>Team workspace</small>
                    </div>
                    <ArrowDown size={14} />
                </div>
                <p className="nav-label">WORKSPACE</p>
                <nav className="main-nav">
                    <NavLink end to="/">
                        <LayoutDashboard size={17} />
                        Overview
                    </NavLink>
                    <NavLink to="/issues">
                        <ClipboardList size={17} />
                        All issues
                    </NavLink>
                </nav>
                <div className="side-bottom">
                    <div className="team-card">
                        <span className="team-icon">
                            <CircleHelp size={16} />
                        </span>
                        <div>
                            <b>Need a hand?</b>
                            <small>Explore the issue guide</small>
                        </div>
                        <ArrowRight size={14} />
                    </div>
                    <button className="profile" onClick={logout}>
                        <span className="avatar">
                            {user?.name?.[0]?.toUpperCase()}
                        </span>
                        <span className="profile-name">
                            <b>{user?.name}</b>
                            <small>
                                {user?.role === "ADMIN"
                                    ? "Administrator"
                                    : "Team member"}
                            </small>
                        </span>
                        <LogOut size={16} />
                    </button>
                </div>
            </aside>
            <main className="main">
                <header className="topbar">
                    <button
                        className="mobile-menu"
                        aria-label="Toggle navigation"
                        onClick={() => setMobile(!mobile)}
                    >
                        ☰
                    </button>
                    <span>
                        Engineering / <b>IssueFlow</b>
                    </span>
                    <div className="top-user">
                        <span className="online-dot" />
                        All systems operational{" "}
                        <span className="avatar small">
                            {user?.name?.[0]?.toUpperCase()}
                        </span>
                    </div>
                </header>
                <div className="content">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
function PageHeader({ eyebrow, title, desc, action }) {
    return (
        <div className="page-header">
            <div>
                <p className="eyebrow">{eyebrow}</p>
                <h1>{title}</h1>
                <p className="page-desc">{desc}</p>
            </div>
            {action}
        </div>
    );
}
function Dashboard() {
    const { user } = useAuth(),
        [stats, setStats] = useState(null),
        [recent, setRecent] = useState([]),
        [error, setError] = useState("");
    useEffect(() => {
        Promise.all([api.get("/dashboard/stats"), api.get("/issues?limit=5")])
            .then(([a, b]) => {
                setStats(a.data.stats);
                setRecent(b.data.issues);
            })
            .catch((e) => setError(messageOf(e)));
    }, []);
    return (
        <>
            <PageHeader
                eyebrow={`TUESDAY, ${new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }).toUpperCase()}`}
                title={`Good to see you, ${user?.name?.split(" ")[0]}.`}
                desc="Here’s what’s happening across your team today."
                action={
                    <Link className="btn primary" to="/issues/new">
                        <Plus size={17} /> New issue
                    </Link>
                }
            />
            {error && <div className="alert">{error}</div>}
            <div className="section-heading">
                <div>
                    <h2>Issue overview</h2>
                    <p>A snapshot of your team's current workload</p>
                </div>
                <Link className="text-link" to="/issues">
                    View all issues <ArrowRight size={15} />
                </Link>
            </div>
            <div className="stats-grid">
                <Stat
                    title="Total issues"
                    value={stats?.total}
                    icon={<ClipboardList />}
                    color="blue"
                    note="Across your workspace"
                />
                <Stat
                    title="Open"
                    value={stats?.open}
                    icon={<CircleHelp />}
                    color="amber"
                    note="Waiting to be picked up"
                />
                <Stat
                    title="In progress"
                    value={stats?.inProgress}
                    icon={<Activity />}
                    color="violet"
                    note="Being actively worked on"
                />
                <Stat
                    title="Resolved"
                    value={stats?.resolved}
                    icon={<CheckCircle2 />}
                    color="green"
                    note="Successfully completed"
                />
            </div>
            <div className="section-heading list-heading">
                <div>
                    <h2>Recently updated</h2>
                    <p>Latest changes to issues you can access</p>
                </div>
                <Link className="text-link" to="/issues">
                    Browse issues <ArrowRight size={15} />
                </Link>
            </div>
            <IssueTable issues={recent} loading={!stats && !error} />
        </>
    );
}
function Stat({ title, value, icon, color, note }) {
    return (
        <div className="stat-card">
            <div className={`stat-icon ${color}`}>{icon}</div>
            <div className="stat-label">{title}</div>
            <div className="stat-value">{value ?? "—"}</div>
            <div className="stat-note">{note}</div>
        </div>
    );
}
function IssueList() {
    const [query, setQuery] = useState(""),
        [status, setStatus] = useState(""),
        [priority, setPriority] = useState(""),
        [data, setData] = useState({ issues: [], pagination: {} }),
        [loading, setLoading] = useState(true),
        [error, setError] = useState(""),
        [page, setPage] = useState(1);
    useEffect(() => {
        setLoading(true);
        const params = { page, limit: 10 };
        if (query) params.search = query;
        if (status) params.status = status;
        if (priority) params.priority = priority;
        api.get("/issues", { params })
            .then((r) => setData(r.data))
            .catch((e) => setError(messageOf(e)))
            .finally(() => setLoading(false));
    }, [query, status, priority, page]);
    return (
        <>
            <PageHeader
                eyebrow="ISSUE TRACKER"
                title="All issues"
                desc="Search, triage, and keep work moving."
                action={
                    <Link className="btn primary" to="/issues/new">
                        <Plus size={17} /> Create issue
                    </Link>
                }
            />
            <div className="filters">
                <label className="search-box">
                    <Search size={17} />
                    <input
                        aria-label="Search issue titles"
                        placeholder="Search by issue title…"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setPage(1);
                        }}
                    />
                </label>
                <label className="filter-select">
                    <SlidersHorizontal size={15} />
                    <select
                        aria-label="Filter by status"
                        value={status}
                        onChange={(e) => {
                            setStatus(e.target.value);
                            setPage(1);
                        }}
                    >
                        <option value="">All statuses</option>
                        {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map(
                            (x) => (
                                <option key={x} value={x}>
                                    {pretty(x)}
                                </option>
                            ),
                        )}
                    </select>
                </label>
                <label className="filter-select">
                    <select
                        aria-label="Filter by priority"
                        value={priority}
                        onChange={(e) => {
                            setPriority(e.target.value);
                            setPage(1);
                        }}
                    >
                        <option value="">All priorities</option>
                        {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((x) => (
                            <option key={x} value={x}>
                                {pretty(x)}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            {error && <div className="alert">{error}</div>}
            <IssueTable issues={data.issues} loading={loading} />
            <div className="pagination">
                <span>
                    {data.pagination.total || 0} issues · Page{" "}
                    {data.pagination.page || 1} of{" "}
                    {Math.max(1, data.pagination.pages || 1)}
                </span>
                <div>
                    <button
                        className="btn secondary small-btn"
                        disabled={page <= 1}
                        onClick={() => setPage(page - 1)}
                    >
                        Previous
                    </button>
                    <button
                        className="btn secondary small-btn"
                        disabled={page >= (data.pagination.pages || 1)}
                        onClick={() => setPage(page + 1)}
                    >
                        Next
                    </button>
                </div>
            </div>
        </>
    );
}
function IssueTable({ issues, loading }) {
    if (loading)
        return (
            <div className="table-card loading-card">
                <div className="spinner" /> Loading issues…
            </div>
        );
    if (!issues?.length)
        return (
            <div className="empty-card">
                <span className="empty-icon">
                    <ClipboardList size={22} />
                </span>
                <h3>Nothing to see here yet</h3>
                <p>Issues you create or are assigned will show up here.</p>
                <Link className="btn secondary" to="/issues/new">
                    <Plus size={16} /> Create an issue
                </Link>
            </div>
        );
    return (
        <div className="table-card">
            <div className="table-scroll">
                <table>
                    <thead>
                        <tr>
                            <th>ISSUE</th>
                            <th>STATUS</th>
                            <th>PRIORITY</th>
                            <th>ASSIGNEE</th>
                            <th>UPDATED</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {issues.map((i) => (
                            <tr key={i.id}>
                                <td>
                                    <Link
                                        to={`/issues/${i.id}`}
                                        className="issue-cell"
                                    >
                                        <span className="issue-id">
                                            IF-{String(i.id).padStart(4, "0")}
                                        </span>
                                        <b>{i.title}</b>
                                    </Link>
                                </td>
                                <td>
                                    <Badge value={i.status} />
                                </td>
                                <td>
                                    <Priority value={i.priority} />
                                </td>
                                <td>
                                    {i.assigneeName || (
                                        <span className="muted">
                                            Unassigned
                                        </span>
                                    )}
                                </td>
                                <td className="muted">{date(i.updatedAt)}</td>
                                <td>
                                    <Link
                                        className="row-link"
                                        aria-label={`View ${i.title}`}
                                        to={`/issues/${i.id}`}
                                    >
                                        <ArrowRight size={16} />
                                    </Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
function Badge({ value }) {
    return (
        <span className={`badge ${value?.toLowerCase()}`}>
            <i />
            {pretty(value)}
        </span>
    );
}
function Priority({ value }) {
    return (
        <span className={`priority ${value?.toLowerCase()}`}>
            <i />
            {pretty(value)}
        </span>
    );
}
function Field({ label, name, type = "text", ...props }) {
    return (
        <label className="field">
            <span>{label}</span>
            <input name={name} type={type} {...props} />
        </label>
    );
}
function IssueForm({ edit = false }) {
    const { id } = useParams(),
        { user } = useAuth(),
        nav = useNavigate(),
        [issue, setIssue] = useState(null),
        [error, setError] = useState(""),
        [busy, setBusy] = useState(false);
    useEffect(() => {
        if (edit)
            api.get(`/issues/${id}`)
                .then((r) => setIssue(r.data.issue))
                .catch((e) => setError(messageOf(e)));
    }, [edit, id]);
    async function submit(e) {
        e.preventDefault();
        setError("");
        setBusy(true);
        const f = new FormData(e.currentTarget),
            data = {
                title: f.get("title"),
                description: f.get("description"),
                priority: f.get("priority"),
            };
        try {
            if (edit) {
                await api.patch(`/issues/${id}`, data);
                nav(`/issues/${id}`);
            } else {
                const r = await api.post("/issues", data);
                nav(`/issues/${r.data.issue.id}`);
            }
        } catch (e) {
            setError(messageOf(e));
        } finally {
            setBusy(false);
        }
    }
    if (edit && user?.role !== "ADMIN" && issue && issue.creatorId !== user.id)
        return (
            <div className="alert">
                You don't have permission to edit this issue.
            </div>
        );
    return (
        <>
            <Link className="back-link" to={edit ? `/issues/${id}` : "/issues"}>
                <ArrowLeft size={16} /> Back to {edit ? "issue" : "all issues"}
            </Link>
            <PageHeader
                eyebrow={edit ? "ISSUE DETAILS" : "ISSUE TRACKER"}
                title={edit ? "Edit issue" : "Create an issue"}
                desc={
                    edit
                        ? "Update the issue details below."
                        : "Share the context your teammates need to get started."
                }
            />
            {error && <div className="alert">{error}</div>}
            <form
                className="panel form issue-form"
                onSubmit={submit}
                key={issue?.id || "new"}
            >
                <Field
                    label="Issue title"
                    name="title"
                    placeholder="e.g. Checkout page returns a 500 error"
                    defaultValue={issue?.title}
                    minLength="3"
                    maxLength="180"
                    required
                />
                <label className="field">
                    <span>Description</span>
                    <textarea
                        name="description"
                        placeholder="Describe the issue, what you expected, and any relevant context…"
                        defaultValue={issue?.description}
                        minLength="5"
                        maxLength="10000"
                        rows="7"
                        required
                    />
                </label>
                <label className="field">
                    <span>Priority</span>
                    <select
                        name="priority"
                        defaultValue={issue?.priority || "MEDIUM"}
                    >
                        {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => (
                            <option key={p} value={p}>
                                {pretty(p)}
                            </option>
                        ))}
                    </select>
                </label>
                <div className="form-actions">
                    <Link
                        className="btn secondary"
                        to={edit ? `/issues/${id}` : "/issues"}
                    >
                        Cancel
                    </Link>
                    <button className="btn primary" disabled={busy}>
                        {busy
                            ? "Saving…"
                            : edit
                              ? "Save changes"
                              : "Create issue"}{" "}
                        <ArrowRight size={16} />
                    </button>
                </div>
            </form>
        </>
    );
}
function IssueDetail() {
    const { id } = useParams(),
        { user } = useAuth(),
        nav = useNavigate(),
        [issue, setIssue] = useState(null),
        [history, setHistory] = useState([]),
        [comments, setComments] = useState([]),
        [users, setUsers] = useState([]),
        [error, setError] = useState(""),
        [busy, setBusy] = useState(false);
    const load = () =>
        Promise.all([
            api.get(`/issues/${id}`),
            api.get(`/issues/${id}/comments`),
        ])
            .then(([a, b]) => {
                setIssue(a.data.issue);
                setHistory(a.data.activity);
                setComments(b.data.comments);
            })
            .catch((e) => setError(messageOf(e)));
    useEffect(() => {
        load();
        if (user?.role === "ADMIN")
            api.get("/users")
                .then((r) => setUsers(r.data.users))
                .catch(() => {});
    }, [id]);
    async function update(fields) {
        try {
            const r = await api.patch(`/issues/${id}`, fields);
            setIssue({ ...issue, ...r.data.issue });
            load();
        } catch (e) {
            setError(messageOf(e));
        }
    }
    async function addComment(e) {
        e.preventDefault();
        setBusy(true);
        try {
            await api.post(`/issues/${id}/comments`, {
                body: new FormData(e.currentTarget).get("body"),
            });
            e.currentTarget.reset();
            load();
        } catch (e) {
            setError(messageOf(e));
        } finally {
            setBusy(false);
        }
    }
    async function remove() {
        if (
            !window.confirm(
                "Delete this issue permanently? This also removes its comments and activity history.",
            )
        )
            return;
        try {
            await api.delete(`/issues/${id}`);
            nav("/issues");
        } catch (e) {
            setError(messageOf(e));
        }
    }
    if (!issue)
        return (
            <>
                <Link className="back-link" to="/issues">
                    <ArrowLeft size={16} /> All issues
                </Link>
                {error ? (
                    <div className="alert">{error}</div>
                ) : (
                    <div className="screen">
                        <div className="spinner" />
                    </div>
                )}
            </>
        );
    const canEdit = user.role === "ADMIN" || issue.creatorId === user.id;
    return (
        <>
            <Link className="back-link" to="/issues">
                <ArrowLeft size={16} /> All issues
            </Link>
            {error && <div className="alert">{error}</div>}
            <div className="detail-heading">
                <div>
                    <p className="eyebrow">
                        ISSUE IF-{String(issue.id).padStart(4, "0")}
                    </p>
                    <h1>{issue.title}</h1>
                    <p className="page-desc">
                        Created by {issue.creatorName} · {date(issue.createdAt)}
                    </p>
                </div>
                <div className="detail-actions">
                    {canEdit && (
                        <Link
                            className="btn secondary"
                            to={`/issues/${id}/edit`}
                        >
                            Edit issue
                        </Link>
                    )}
                    {canEdit && (
                        <button className="btn danger" onClick={remove}>
                            Delete
                        </button>
                    )}
                </div>
            </div>
            <div className="detail-grid">
                <div className="detail-main">
                    <section className="panel description-panel">
                        <div className="panel-title">
                            <h2>Description</h2>
                            <span className="muted">
                                Updated {date(issue.updatedAt)}
                            </span>
                        </div>
                        <p className="description-text">{issue.description}</p>
                    </section>
                    <section className="panel">
                        <div className="panel-title">
                            <h2>
                                Comments{" "}
                                <span className="count-pill">
                                    {comments.length}
                                </span>
                            </h2>
                        </div>
                        <div className="comment-list">
                            {comments.length ? (
                                comments.map((c) => (
                                    <div className="comment" key={c.id}>
                                        <span className="avatar">
                                            {c.authorName[0].toUpperCase()}
                                        </span>
                                        <div>
                                            <div className="comment-meta">
                                                <b>{c.authorName}</b>
                                                <span>{date(c.createdAt)}</span>
                                            </div>
                                            <p>{c.body}</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="quiet-empty">
                                    No comments yet. Start the conversation.
                                </div>
                            )}
                        </div>
                        <form className="comment-form" onSubmit={addComment}>
                            <label className="sr-only" htmlFor="comment">
                                Add a comment
                            </label>
                            <textarea
                                id="comment"
                                name="body"
                                rows="3"
                                placeholder="Write a comment…"
                                maxLength="5000"
                                required
                            />
                            <div className="comment-foot">
                                <span>Be kind and keep it constructive.</span>
                                <button className="btn primary" disabled={busy}>
                                    {busy ? "Posting…" : "Post comment"}
                                </button>
                            </div>
                        </form>
                    </section>
                </div>
                <div className="detail-side">
                    <section className="panel properties">
                        <h2>Properties</h2>
                        <label className="property">
                            <span>Status</span>
                            {user.role === "ADMIN" ? (
                                <select
                                    value={issue.status}
                                    onChange={(e) =>
                                        update({ status: e.target.value })
                                    }
                                >
                                    {[
                                        "OPEN",
                                        "IN_PROGRESS",
                                        "RESOLVED",
                                        "CLOSED",
                                    ].map((x) => (
                                        <option key={x}>{x}</option>
                                    ))}
                                </select>
                            ) : (
                                <Badge value={issue.status} />
                            )}
                        </label>
                        <label className="property">
                            <span>Priority</span>
                            {user.role === "ADMIN" ? (
                                <select
                                    value={issue.priority}
                                    onChange={(e) =>
                                        update({ priority: e.target.value })
                                    }
                                >
                                    {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(
                                        (x) => (
                                            <option key={x}>{x}</option>
                                        ),
                                    )}
                                </select>
                            ) : (
                                <Priority value={issue.priority} />
                            )}
                        </label>
                        <div className="property">
                            <span>Assignee</span>
                            {user.role === "ADMIN" ? (
                                <select
                                    value={issue.assigneeId || ""}
                                    onChange={(e) =>
                                        update({
                                            assigneeId: e.target.value
                                                ? Number(e.target.value)
                                                : null,
                                        })
                                    }
                                >
                                    <option value="">Unassigned</option>
                                    {users.map((u) => (
                                        <option key={u.id} value={u.id}>
                                            {u.name}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <b>{issue.assigneeName || "Unassigned"}</b>
                            )}
                        </div>
                        <div className="property">
                            <span>Creator</span>
                            <b>{issue.creatorName}</b>
                        </div>
                        <div className="property">
                            <span>Created</span>
                            <b>{date(issue.createdAt)}</b>
                        </div>
                    </section>
                    <section className="panel history-panel">
                        <h2>
                            <Activity size={16} /> Activity
                        </h2>
                        {history.length ? (
                            history.map((h) => (
                                <div className="history-item" key={h.id}>
                                    <span className="history-dot" />
                                    <div>
                                        <b>{h.actorName}</b>{" "}
                                        {pretty(h.action).toLowerCase()}
                                        {h.details?.from && (
                                            <>
                                                {" "}
                                                from{" "}
                                                <strong>
                                                    {pretty(h.details.from)}
                                                </strong>{" "}
                                                to{" "}
                                                <strong>
                                                    {pretty(h.details.to)}
                                                </strong>
                                            </>
                                        )}
                                        <small>{date(h.createdAt)}</small>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="muted">No activity recorded.</p>
                        )}
                    </section>
                </div>
            </div>
        </>
    );
}
export default App;
