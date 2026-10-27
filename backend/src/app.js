import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool } from "./db.js";
import { authRequired, adminRequired, errorHandler } from "./middleware.js";

export const app = express();

const proxyHops =process.env.TRUST_PROXY_HOPS === undefined? 1: Number(process.env.TRUST_PROXY_HOPS);

if (!Number.isSafeInteger(proxyHops) || proxyHops < 0){
    throw new Error("TRUST_PROXY_HOPS must be a non-negative integer.");
}
app.set("trust proxy", proxyHops);


app.use(helmet());
app.use(
    cors({
        origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
        credentials: true,
    }),
);
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

const authLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
        error: "Too many authentication attempts. Please try again later.",
    },
});
const cookieSecure = () =>
    process.env.COOKIE_SECURE === "true" ||
    (process.env.COOKIE_SECURE !== "false" &&
        (process.env.NODE_ENV === "production" ||
            process.env.COOKIE_SAME_SITE === "none"));
            
const cookieOptions = () => ({
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: process.env.COOKIE_SAME_SITE || "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
});
const email = z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase());
const password = z
    .string()
    .min(8)
    .max(72)
    .refine(
        (v) => Buffer.byteLength(v, "utf8") <= 72,
        "Password must be at most 72 UTF-8 bytes.",
    );
const registerSchema = z.object({
    name: z.string().trim().min(3).max(100),
    email,
    password,
});
const loginSchema = z.object({
    email,
    password: z
        .string()
        .min(1)
        .max(72)
        .refine(
            (v) => Buffer.byteLength(v, "utf8") <= 72,
            "Password must be at most 72 UTF-8 bytes.",
        ),
});
const issueSchema = z.object({
    title: z.string().trim().min(3).max(180),
    description: z.string().trim().min(5).max(10000),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
});
const patchSchema = z
    .object({
        title: z.string().trim().min(3).max(180).optional(),
        description: z.string().trim().min(5).max(10000).optional(),
        priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
        status: z
            .enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"])
            .optional(),
        assigneeId: z.number().int().positive().nullable().optional(),
    })
    .strict()
    .refine(
        (v) => Object.keys(v).length > 0,
        "Provide at least one field to update.",
    );
const commentSchema = z.object({ body: z.string().trim().min(1).max(5000) });
const issueListSchema = z.object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    search: z.string().max(180).optional(),
    status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
});
const run = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
const publicUser = (u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
});
const ensureVisible = run(async (req, res, next) => {
    const [rows] = await pool.execute("SELECT * FROM issues WHERE id = ?", [
        req.params.id,
    ]);
    if (!rows.length)
        return res.status(404).json({ error: "Issue not found." });
    const issue = rows[0];
    if (
        req.user.role !== "ADMIN" &&
        Number(issue.creator_id) !== req.user.id &&
        Number(issue.assignee_id) !== req.user.id
    )
        return res.status(404).json({ error: "Issue not found." });
    req.issue = issue;
    next();
});
const activity = async (conn, issueId, actorId, action, details = {}) =>
    conn.execute(
        "INSERT INTO issue_activity (issue_id, actor_id, action, details) VALUES (?, ?, ?, ?)",
        [issueId, actorId, action, JSON.stringify(details)],
    );

app.use((req, res, next) => {
    if (
        !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
        req.headers.origin &&
        req.headers.origin !==
            (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
    )
        return res
            .status(403)
            .json({ error: "Request origin is not allowed." });
    next();
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.post("/api/auth/register",
    authLimit,
    run(async (req, res) => {
        const data = registerSchema.parse(req.body);
        const [existing] = await pool.execute(
            "SELECT id FROM users WHERE email = ?",
            [data.email],
        );
        if (existing.length)
            return res
                .status(409)
                .json({ error: "An account with that email already exists." });
        const hash = await bcrypt.hash(data.password, 12);
        const [result] = await pool.execute(
            "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'USER')",
            [data.name, data.email, hash],
        );
        const user = {
            id: result.insertId,
            name: data.name,
            email: data.email,
            role: "USER",
        };
        res.cookie(
            "issueflow_token",
            jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "7d" }),
            cookieOptions(),
        );
        res.status(201).json({ user });
    }),
);
app.post("/api/auth/login",
    authLimit,
    run(async (req, res) => {
        const data = loginSchema.parse(req.body);
        const [rows] = await pool.execute(
            "SELECT id, name, email, password_hash, role FROM users WHERE email = ?",
            [data.email],
        );
        if (
            !rows.length ||
            !(await bcrypt.compare(data.password, rows[0].password_hash))
        )
            return res
                .status(401)
                .json({ error: "Email or password is incorrect." });
        const user = publicUser(rows[0]);
        res.cookie(
            "issueflow_token",
            jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "7d" }),
            cookieOptions(),
        );
        res.json({ user });
    }),
);
app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("issueflow_token", {
        httpOnly: true,
        secure: cookieSecure(),
        sameSite: process.env.COOKIE_SAME_SITE || "lax",
        path: "/",
    });
    res.json({ message: "Signed out." });
});
app.get("/api/auth/me",authRequired,run(async (req, res) => {
        const [rows] = await pool.execute(
            "SELECT id, name, email, role FROM users WHERE id = ?",
            [req.user.id],
        );
        if (!rows.length)
            return res.status(401).json({ error: "Account no longer exists." });
        res.json({ user: publicUser(rows[0]) });
    }),
);

app.get("/api/issues",authRequired,run(async (req, res) => {
        const { page, limit, search, status, priority } = issueListSchema.parse(
            req.query,
        );
        const where = [],
            params = [];
        if (req.user.role !== "ADMIN") {
            where.push("(i.creator_id = ? OR i.assignee_id = ?)");
            params.push(req.user.id, req.user.id);
        }
        if (status) {
            where.push("i.status = ?");
            params.push(status);
        }
        if (priority) {
            where.push("i.priority = ?");
            params.push(priority);
        }
        if (search) {
            where.push("i.title LIKE ?");
            params.push(`%${search}%`);
        }
        const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
        const [countRows] = await pool.execute(
            `SELECT COUNT(*) AS total FROM issues i ${clause}`,
            params,
        );
        const [rows] = await pool.execute(
            `SELECT i.id, i.title, i.description, i.status, i.priority, i.creator_id AS creatorId, i.assignee_id AS assigneeId, i.created_at AS createdAt, i.updated_at AS updatedAt, c.name AS creatorName, a.name AS assigneeName FROM issues i JOIN users c ON c.id=i.creator_id LEFT JOIN users a ON a.id=i.assignee_id ${clause} ORDER BY i.updated_at DESC, i.id DESC LIMIT ? OFFSET ?`,
            [...params, limit, (page - 1) * limit],
        );
        const total = Number(countRows[0].total);
        res.json({
            issues: rows,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
    }),
);
app.post("/api/issues",authRequired,run(async (req, res) => {
        const data = issueSchema.parse(req.body);
        const conn = await pool.getConnection();
        let result;
        try {
            await conn.beginTransaction();
            [result] = await conn.execute(
                "INSERT INTO issues (title, description, priority, creator_id) VALUES (?, ?, ?, ?)",
                [data.title, data.description, data.priority, req.user.id],
            );
            await activity(conn, result.insertId, req.user.id, "CREATED", {
                title: data.title,
            });
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
        res.status(201).json({
            issue: {
                id: result.insertId,
                ...data,
                status: "OPEN",
                creatorId: req.user.id,
            },
        });
    }),
);
app.get("/api/issues/:id",authRequired,ensureVisible,run(async (req, res) => {
        const [rows] = await pool.execute(
            "SELECT i.id, i.title, i.description, i.status, i.priority, i.creator_id AS creatorId, i.assignee_id AS assigneeId, i.created_at AS createdAt, i.updated_at AS updatedAt, c.name AS creatorName, a.name AS assigneeName FROM issues i JOIN users c ON c.id=i.creator_id LEFT JOIN users a ON a.id=i.assignee_id WHERE i.id = ?",
            [req.params.id],
        );
        const [history] = await pool.execute(
            "SELECT h.id, h.action, h.details, h.created_at AS createdAt, u.name AS actorName FROM issue_activity h JOIN users u ON u.id=h.actor_id WHERE h.issue_id = ? ORDER BY h.created_at DESC",
            [req.params.id],
        );
        res.json({
            issue: rows[0],
            activity: history.map((h) => ({
                ...h,
                details:
                    typeof h.details === "string"
                        ? JSON.parse(h.details)
                        : h.details,
            })),
        });
    }),
);
app.patch("/api/issues/:id",authRequired,ensureVisible,run(async (req, res) => {
        const data = patchSchema.parse(req.body),
            isAdmin = req.user.role === "ADMIN",
            isOwner = req.issue.creator_id === req.user.id;
        if (!isAdmin && !isOwner)
            return res.status(403).json({
                error: "Only the issue creator or an administrator can edit this issue.",
            });
        if (!isAdmin && ("status" in data || "assigneeId" in data))
            return res.status(403).json({
                error: "Only administrators can change status or assignments.",
            });
        if ("assigneeId" in data && data.assigneeId !== null) {
            const [u] = await pool.execute(
                "SELECT id FROM users WHERE id = ?",
                [data.assigneeId],
            );
            if (!u.length)
                return res
                    .status(400)
                    .json({ error: "The selected user does not exist." });
        }
        const changes = [],
            values = [],
            events = [];
        for (const key of [
            "title",
            "description",
            "priority",
            "status",
            "assigneeId",
        ])
            if (key in data) {
                const col = key === "assigneeId" ? "assignee_id" : key;
                const old =
                    key === "assigneeId"
                        ? req.issue.assignee_id
                        : req.issue[key];
                if (old !== data[key]) {
                    changes.push(`${col} = ?`);
                    values.push(data[key]);
                    if (key === "status")
                        events.push([
                            "STATUS_CHANGED",
                            { from: old, to: data[key] },
                        ]);
                    if (key === "priority")
                        events.push([
                            "PRIORITY_CHANGED",
                            { from: old, to: data[key] },
                        ]);
                    if (key === "assigneeId")
                        events.push([
                            data[key] ? "ASSIGNED" : "UNASSIGNED",
                            { from: old, to: data[key] },
                        ]);
                }
            }
        if (changes.length) {
            const conn = await pool.getConnection();
            try {
                await conn.beginTransaction();
                values.push(req.issue.id);
                await conn.execute(
                    `UPDATE issues SET ${changes.join(", ")} WHERE id = ?`,
                    values,
                );
                for (const [action, details] of events)
                    await activity(
                        conn,
                        req.issue.id,
                        req.user.id,
                        action,
                        details,
                    );
                if (!events.length)
                    await activity(conn, req.issue.id, req.user.id, "UPDATED");
                await conn.commit();
            } catch (err) {
                await conn.rollback();
                throw err;
            } finally {
                conn.release();
            }
        }
        const [rows] = await pool.execute(
            "SELECT id, title, description, status, priority, creator_id AS creatorId, assignee_id AS assigneeId, created_at AS createdAt, updated_at AS updatedAt FROM issues WHERE id = ?",
            [req.issue.id],
        );
        res.json({ issue: rows[0] });
    }),
);
app.delete("/api/issues/:id",authRequired,ensureVisible,run(async (req, res) => {
        if (req.user.role !== "ADMIN" && req.issue.creator_id !== req.user.id)
            return res.status(403).json({
                error: "Only the issue creator or an administrator can delete this issue.",
            });
        await pool.execute("DELETE FROM issues WHERE id = ?", [req.issue.id]);
        res.status(204).end();
    }),
);
app.get("/api/issues/:id/comments",authRequired,ensureVisible,run(async (req, res) => {
        const [rows] = await pool.execute(
            "SELECT c.id, c.body, c.created_at AS createdAt, u.id AS authorId, u.name AS authorName FROM comments c JOIN users u ON u.id=c.author_id WHERE c.issue_id = ? ORDER BY c.created_at ASC",
            [req.issue.id],
        );
        res.json({ comments: rows });
    }),
);
app.post("/api/issues/:id/comments",authRequired,ensureVisible,run(async (req, res) => {
        const { body } = commentSchema.parse(req.body);
        const [r] = await pool.execute(
            "INSERT INTO comments (issue_id, author_id, body) VALUES (?, ?, ?)",
            [req.issue.id, req.user.id, body],
        );
        res.status(201).json({
            comment: {
                id: r.insertId,
                issueId: req.issue.id,
                authorId: req.user.id,
                authorName: req.user.name,
                body,
            },
        });
    }),
);
app.get("/api/dashboard/stats",authRequired,run(async (req, res) => {
        const scope =
            req.user.role === "ADMIN"
                ? ""
                : "WHERE creator_id = ? OR assignee_id = ?";
        const args =
            req.user.role === "ADMIN" ? [] : [req.user.id, req.user.id];
        const [rows] = await pool.execute(
            `SELECT COUNT(*) AS total, COALESCE(SUM(status='OPEN'),0) AS open, COALESCE(SUM(status='IN_PROGRESS'),0) AS inProgress, COALESCE(SUM(status='RESOLVED'),0) AS resolved, COALESCE(SUM(status='CLOSED'),0) AS closed FROM issues ${scope}`,
            args,
        );
        res.json({ stats: rows[0] });
    }),
);
app.get("/api/users",authRequired,adminRequired,run(async (req, res) => {
        const [users] = await pool.execute(
            "SELECT id, name, email FROM users WHERE role = 'USER' ORDER BY name",
        );
        res.json({ users });
    }),
);
app.use((req, res) => res.status(404).json({ error: "Route not found." }));
app.use(errorHandler);
