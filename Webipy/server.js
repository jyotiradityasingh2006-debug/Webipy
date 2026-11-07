"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const VISITS_FILE = path.join(DATA_DIR, "visits.json");
const POSTS_FILE = path.join(DATA_DIR, "posts.json");
const AUTH_FILE = path.join(DATA_DIR, "auth.json");
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "webipy123";
const MONGODB_URI = process.env.MONGODB_URI || "";
const MONGODB_DB = process.env.MONGODB_DB || "webipy";
const SESSION_HOURS = 12;
const SESSION_COOKIE = "webipy_admin";
const MAX_BODY = 256 * 1024;

const CORS_ORIGINS = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map(item => item.trim())
  .filter(Boolean);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

const PRETTY_ROUTES = {
  "/admin": "admin.html",
  "/blog": "blog.html",
  "/post": "post.html"
};

fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------- helpers ---------- */

function readJsonFile(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return fallback;
  }
}

function writeJsonFile(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/* ---------- local JSON storage (fallback when MONGODB_URI is not set) ---------- */

function readVisitsFile() {
  const raw = readJsonFile(VISITS_FILE, null);
  if (!raw || typeof raw !== "object") {
    return { count: 0, startedAt: null, daily: {}, updatedAt: null };
  }
  return {
    count: Number.isFinite(raw.count) && raw.count >= 0 ? raw.count : 0,
    startedAt: typeof raw.startedAt === "string" ? raw.startedAt : null,
    daily: raw.daily && typeof raw.daily === "object" ? raw.daily : {},
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null
  };
}

function readPostsFile() {
  const raw = readJsonFile(POSTS_FILE, []);
  return Array.isArray(raw) ? raw : [];
}

function writePostsFile(posts) {
  writeJsonFile(POSTS_FILE, posts);
}

function readAuthFile() {
  const raw = readJsonFile(AUTH_FILE, null);
  return raw && typeof raw === "object" && raw.salt && raw.hash ? raw : null;
}

const jsonStore = {
  kind: "json",
  async getVisits() {
    return readVisitsFile();
  },
  async recordVisit() {
    const visits = readVisitsFile();
    const now = new Date();
    const key = dayKey(now);
    visits.count += 1;
    visits.daily[key] = (visits.daily[key] || 0) + 1;
    if (!visits.startedAt) visits.startedAt = now.toISOString();
    visits.updatedAt = now.toISOString();
    writeJsonFile(VISITS_FILE, visits);
    return visits;
  },
  async listPosts() {
    return readPostsFile().slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  },
  async getPost(key) {
    return readPostsFile().find(post => post.id === key || post.slug === key) || null;
  },
  async slugExists(slug, ignoreId) {
    return readPostsFile().some(post => post.slug === slug && post.id !== ignoreId);
  },
  async insertPost(post) {
    const posts = readPostsFile();
    posts.push(post);
    writePostsFile(posts);
    return post;
  },
  async replacePost(post) {
    const posts = readPostsFile();
    const index = posts.findIndex(item => item.id === post.id);
    if (index !== -1) posts[index] = post;
    writePostsFile(posts);
    return post;
  },
  async removePost(id) {
    const posts = readPostsFile();
    const next = posts.filter(post => post.id !== id);
    writePostsFile(next);
    return next.length !== posts.length;
  },
  async getAuth() {
    return readAuthFile();
  },
  async setAuth(doc) {
    writeJsonFile(AUTH_FILE, doc);
  },
  async close() {}
};

/* ---------- MongoDB storage ---------- */

async function makeMongoStore(uri) {
  const { MongoClient } = require("mongodb");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const db = client.db(MONGODB_DB);
  const postsColl = db.collection("posts");
  const visitsColl = db.collection("visits");
  const settingsColl = db.collection("settings");

  await Promise.all([
    postsColl.createIndex({ id: 1 }, { unique: true }),
    postsColl.createIndex({ slug: 1 }, { unique: true }),
    postsColl.createIndex({ createdAt: -1 })
  ]);

  return {
    kind: "mongodb",
    async getVisits() {
      const doc = await visitsColl.findOne({ _id: "counter" });
      if (!doc) return { count: 0, startedAt: null, daily: {}, updatedAt: null };
      return {
        count: Number(doc.count) || 0,
        startedAt: doc.startedAt || null,
        daily: doc.daily || {},
        updatedAt: doc.updatedAt || null
      };
    },
    async recordVisit() {
      const now = new Date();
      const iso = now.toISOString();
      const key = dayKey(now);
      const doc = await visitsColl.findOneAndUpdate(
        { _id: "counter" },
        {
          $inc: { count: 1, [`daily.${key}`]: 1 },
          $set: { updatedAt: iso },
          $setOnInsert: { startedAt: iso }
        },
        { upsert: true, returnDocument: "after", includeResultMetadata: false }
      );
      const value = doc || { count: 1 };
      return {
        count: Number(value.count) || 1,
        startedAt: value.startedAt || iso,
        daily: value.daily || {},
        updatedAt: value.updatedAt || iso
      };
    },
    async listPosts() {
      return postsColl.find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
    },
    async getPost(key) {
      return postsColl.findOne(
        { $or: [{ id: key }, { slug: key }] },
        { projection: { _id: 0 } }
      );
    },
    async slugExists(slug, ignoreId) {
      const filter = ignoreId ? { slug, id: { $ne: ignoreId } } : { slug };
      return Boolean(await postsColl.findOne(filter, { projection: { _id: 1 } }));
    },
    async insertPost(post) {
      await postsColl.insertOne({ ...post });
      return post;
    },
    async replacePost(post) {
      await postsColl.replaceOne({ id: post.id }, { ...post });
      return post;
    },
    async removePost(id) {
      const result = await postsColl.deleteOne({ id });
      return result.deletedCount > 0;
    },
    async getAuth() {
      const doc = await settingsColl.findOne({ _id: "auth" });
      return doc && doc.salt && doc.hash ? { salt: doc.salt, hash: doc.hash, updatedAt: doc.updatedAt || null } : null;
    },
    async setAuth(doc) {
      await settingsColl.updateOne({ _id: "auth" }, { $set: doc }, { upsert: true });
    },
    async close() {
      await client.close();
    }
  };
}

let store = jsonStore;

async function initStore() {
  if (!MONGODB_URI) {
    console.log("Storage: local JSON files (set MONGODB_URI to use MongoDB).");
    return;
  }
  try {
    store = await makeMongoStore(MONGODB_URI);
    console.log(`Storage: MongoDB database "${MONGODB_DB}".`);
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }
}

/* ---------- posts ---------- */

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "post";
}

async function uniqueSlug(base, ignoreId) {
  let slug = base;
  let n = 2;
  while (await store.slugExists(slug, ignoreId)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

function makeExcerpt(content) {
  return String(content || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function cleanPostInput(body) {
  const title = String(body.title || "").trim().slice(0, 160);
  const content = String(body.content || "").trim().slice(0, 50000);
  const excerpt = String(body.excerpt || "").trim().slice(0, 300);
  let tags = body.tags;
  if (typeof tags === "string") tags = tags.split(",");
  if (!Array.isArray(tags)) tags = [];
  tags = tags.map(tag => String(tag).trim()).filter(Boolean).slice(0, 8);
  return { title, content, excerpt, tags };
}

function publicPost(post) {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    tags: post.tags || [],
    createdAt: post.createdAt,
    updatedAt: post.updatedAt
  };
}

/* ---------- sessions ---------- */

const sessions = new Map();

function createSession() {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, Date.now() + SESSION_HOURS * 3600 * 1000);
  return token;
}

function getCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

function authToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    if (token) return token;
  }
  return getCookie(req, SESSION_COOKIE);
}

function isAuthed(req) {
  const token = authToken(req);
  if (!token) return false;
  const expires = sessions.get(token);
  if (!expires) return false;
  if (Date.now() > expires) {
    sessions.delete(token);
    return false;
  }
  return true;
}

/* ---------- password ---------- */

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 32).toString("hex");
}

async function passwordMatches(input) {
  const auth = await store.getAuth();
  if (auth) {
    const attempted = Buffer.from(hashPassword(input, auth.salt), "hex");
    const stored = Buffer.from(auth.hash, "hex");
    return attempted.length === stored.length && crypto.timingSafeEqual(attempted, stored);
  }
  const actual = Buffer.from(String(input || ""));
  const expected = Buffer.from(ADMIN_PASSWORD);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function setPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  await store.setAuth({
    salt,
    hash: hashPassword(password, salt),
    updatedAt: new Date().toISOString()
  });
}

/* ---------- http helpers ---------- */

function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("Request body is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return;
  const allowed = CORS_ORIGINS.length === 0 || CORS_ORIGINS.includes("*") || CORS_ORIGINS.includes(origin);
  if (!allowed) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

const BLOCKED_FILES = new Set([
  "server.js",
  "package.json",
  "package-lock.json",
  "render.yaml",
  "netlify.toml",
  "README.md"
]);

function isBlockedPath(relative) {
  const parts = relative.split(/[\\/]+/);
  if (parts.some(part => part.startsWith(".") || part === "data" || part === "node_modules")) return true;
  return BLOCKED_FILES.has(relative);
}

function serveStatic(req, res, pathname) {
  const relative = pathname === "/" ? "index.html" : (PRETTY_ROUTES[pathname] || pathname.replace(/^\/+/, ""));
  if (isBlockedPath(relative)) return sendJson(res, 404, { error: "Not found" });
  const filePath = path.join(ROOT, relative);
  const rel = path.relative(ROOT, filePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return sendJson(res, 403, { error: "Forbidden" });
  }

  fs.stat(filePath, (err, stats) => {
    if (err) return sendJson(res, 404, { error: "Not found" });
    const target = stats.isDirectory() ? path.join(filePath, "index.html") : filePath;
    fs.readFile(target, (readErr, content) => {
      if (readErr) return sendJson(res, 404, { error: "Not found" });
      const type = MIME[path.extname(target).toLowerCase()] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": type,
        "Content-Length": content.length,
        "Cache-Control": target.endsWith(".html") ? "no-cache" : "public, max-age=3600"
      });
      if (req.method === "HEAD") return res.end();
      res.end(content);
    });
  });
}

/* ---------- api ---------- */

async function handleApi(req, res, pathname) {
  const method = req.method;

  if (pathname === "/api/visits") {
    if (method === "GET") {
      const visits = await store.getVisits();
      return sendJson(res, 200, { count: visits.count });
    }
    if (method === "POST") {
      const visits = await store.recordVisit();
      return sendJson(res, 200, { count: visits.count });
    }
    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  if (pathname === "/api/posts") {
    if (method === "GET") {
      const posts = await store.listPosts();
      return sendJson(res, 200, { posts: posts.map(publicPost) });
    }
    if (method === "POST") {
      if (!isAuthed(req)) return sendJson(res, 401, { error: "Please log in" });
      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
      const { title, content, excerpt, tags } = cleanPostInput(body);
      if (!title || !content) {
        return sendJson(res, 400, { error: "Title and content are required" });
      }
      const now = new Date().toISOString();
      const post = {
        id: crypto.randomUUID(),
        slug: await uniqueSlug(slugify(title)),
        title,
        excerpt: excerpt || makeExcerpt(content),
        content,
        tags,
        createdAt: now,
        updatedAt: now
      };
      await store.insertPost(post);
      return sendJson(res, 201, { post });
    }
    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const postMatch = pathname.match(/^\/api\/posts\/([^/]+)$/);
  if (postMatch) {
    const key = decodeURIComponent(postMatch[1]);
    const existing = await store.getPost(key);

    if (method === "GET") {
      if (!existing) return sendJson(res, 404, { error: "Post not found" });
      return sendJson(res, 200, { post: existing });
    }

    if (!isAuthed(req)) return sendJson(res, 401, { error: "Please log in" });
    if (!existing) return sendJson(res, 404, { error: "Post not found" });

    if (method === "PUT") {
      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
      const { title, content, excerpt, tags } = cleanPostInput({ ...existing, ...body });
      if (!title || !content) {
        return sendJson(res, 400, { error: "Title and content are required" });
      }
      const post = {
        ...existing,
        title,
        slug: title !== existing.title ? await uniqueSlug(slugify(title), existing.id) : existing.slug,
        excerpt: excerpt || makeExcerpt(content),
        content,
        tags,
        updatedAt: new Date().toISOString()
      };
      await store.replacePost(post);
      return sendJson(res, 200, { post });
    }

    if (method === "DELETE") {
      await store.removePost(existing.id);
      return sendJson(res, 200, { ok: true });
    }

    res.setHeader("Allow", "GET, PUT, DELETE");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  if (pathname === "/api/admin/login" && method === "POST") {
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    if (!(await passwordMatches(body.password))) {
      return sendJson(res, 401, { error: "Wrong password" });
    }
    const token = createSession();
    return sendJson(res, 200, { ok: true, token }, {
      "Set-Cookie": `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}`
    });
  }

  if (pathname === "/api/admin/password" && method === "POST") {
    if (!isAuthed(req)) return sendJson(res, 401, { error: "Please log in" });
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    const current = String(body.currentPassword || "");
    const next = String(body.newPassword || "");
    if (!(await passwordMatches(current))) {
      return sendJson(res, 400, { error: "Current password is wrong" });
    }
    if (next.length < 8) {
      return sendJson(res, 400, { error: "New password must be at least 8 characters" });
    }
    if (next === current) {
      return sendJson(res, 400, { error: "New password must be different" });
    }
    await setPassword(next);
    const token = authToken(req);
    sessions.clear();
    if (token) sessions.set(token, Date.now() + SESSION_HOURS * 3600 * 1000);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/admin/logout" && method === "POST") {
    const token = authToken(req);
    if (token) sessions.delete(token);
    return sendJson(res, 200, { ok: true }, {
      "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`
    });
  }

  if (pathname === "/api/admin/session" && method === "GET") {
    return sendJson(res, 200, { authenticated: isAuthed(req) });
  }

  if (pathname === "/api/admin/stats" && method === "GET") {
    if (!isAuthed(req)) return sendJson(res, 401, { error: "Please log in" });
    const visits = await store.getVisits();
    const posts = await store.listPosts();
    const last7 = [];
    let weekTotal = 0;
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = dayKey(date);
      const count = Number(visits.daily[key] || 0);
      weekTotal += count;
      last7.push({ date: key, count });
    }
    return sendJson(res, 200, {
      totalVisits: visits.count,
      startedAt: visits.startedAt,
      today: Number(visits.daily[dayKey()] || 0),
      last7,
      weekTotal,
      posts: posts.length
    });
  }

  return sendJson(res, 404, { error: "Not found" });
}

/* ---------- server ---------- */

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch (err) {
    return sendJson(res, 400, { error: "Bad request" });
  }

  if (pathname === "/healthz") {
    return sendJson(res, 200, { ok: true, storage: store.kind, uptime: Math.round(process.uptime()) });
  }

  if (pathname.startsWith("/api/")) {
    applyCors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }
    handleApi(req, res, pathname).catch(err => {
      console.error("API error:", err.message);
      if (!res.headersSent) sendJson(res, 500, { error: "Server error" });
    });
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  serveStatic(req, res, pathname);
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(async () => {
    await store.close().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 8000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

(async function start() {
  await initStore();
  server.listen(PORT, HOST, async () => {
    try {
      const visits = await store.getVisits();
      const posts = await store.listPosts();
      console.log(`Webipy running at http://localhost:${PORT} (${visits.count} visits, ${posts.length} posts, ${store.kind} storage)`);
      console.log(`Admin: http://localhost:${PORT}/admin`);
    } catch (err) {
      console.log(`Webipy running at http://localhost:${PORT}`);
    }
  });
})();
