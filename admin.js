(function () {
  "use strict";

  document.documentElement.setAttribute("data-theme", localStorage.getItem("theme") || "dark");

  const API_BASE = (window.WEBIPY_API_BASE || "").replace(/\/$/, "");
  const TOKEN_KEY = "webipy_admin_token";
  const getToken = () => localStorage.getItem(TOKEN_KEY) || "";
  function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }
  function withAuth(headers = {}) {
    const token = getToken();
    return token ? { ...headers, Authorization: `Bearer ${token}` } : headers;
  }

  const $ = sel => document.querySelector(sel);
  const loginView = $("#login-view");
  const dashView = $("#dash-view");
  const logoutBtn = $("#logout-btn");
  const loginForm = $("#login-form");
  const passwordInput = $("#password");
  const loginError = $("#login-error");
  const postForm = $("#post-form");
  const formTitle = $("#form-title");
  const titleInput = $("#post-title-input");
  const tagsInput = $("#post-tags-input");
  const excerptInput = $("#post-excerpt-input");
  const contentInput = $("#post-content-input");
  const postError = $("#post-error");
  const cancelEdit = $("#cancel-edit");
  const postSuccess = $("#post-success");
  const postsBox = $("#admin-posts");
  const passwordForm = $("#password-form");
  const currentPassword = $("#current-password");
  const newPassword = $("#new-password");
  const confirmPassword = $("#confirm-password");
  const passwordError = $("#password-error");
  const passwordSuccess = $("#password-success");
  const refreshBtn = $("#refresh-btn");

  let editingId = null;
  let posts = [];

  const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));

  function formatDate(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  function formatDay(key) {
    const date = new Date(`${key}T00:00:00`);
    if (Number.isNaN(date.getTime())) return key;
    return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  }

  async function api(path, { method = "GET", body } = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: "same-origin",
      headers: withAuth(body ? { "Content-Type": "application/json" } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
    let data = {};
    try {
      data = await res.json();
    } catch (err) {
      data = {};
    }
    if (res.status === 401) {
      setToken(null);
      showLogin();
      throw new Error("Please log in");
    }
    if (!res.ok) throw new Error(data.error || "Something went wrong");
    return data;
  }

  function showLogin() {
    loginView.hidden = false;
    dashView.hidden = true;
    logoutBtn.hidden = true;
  }

  function showDash() {
    loginView.hidden = true;
    dashView.hidden = false;
    logoutBtn.hidden = false;
    loadStats();
    loadPosts();
  }

  async function loadStats() {
    try {
      const stats = await api("/api/admin/stats");
      $("#stat-total").textContent = Number(stats.totalVisits || 0).toLocaleString("en-IN");
      $("#stat-today").textContent = Number(stats.today || 0).toLocaleString("en-IN");
      $("#stat-week").textContent = Number(stats.weekTotal || 0).toLocaleString("en-IN");
      $("#stat-posts").textContent = Number(stats.posts || 0).toLocaleString("en-IN");
      $("#stat-since").textContent = stats.startedAt ? `since ${formatDate(stats.startedAt)}` : "not counting yet";
      $("#stat-week-list").innerHTML = (stats.last7 || []).map(day =>
        `<li><span>${escapeHtml(formatDay(day.date))}</span><strong>${Number(day.count || 0).toLocaleString("en-IN")}</strong></li>`
      ).join("");
    } catch (err) {
      /* handled by api() on 401 */
    }
  }

  async function loadPosts() {
    try {
      const data = await api("/api/posts");
      posts = Array.isArray(data.posts) ? data.posts : [];
      if (!posts.length) {
        postsBox.innerHTML = '<p class="blog-status">No posts yet. Write your first one.</p>';
        return;
      }
      postsBox.innerHTML = posts.map(post => `
        <div class="admin-post">
          <div>
            <strong>${escapeHtml(post.title)}</strong>
            <span>${escapeHtml(formatDate(post.createdAt))}${post.tags && post.tags.length ? " · " + post.tags.map(escapeHtml).join(", ") : ""}</span>
          </div>
          <div class="admin-post-actions">
            <a href="post.html?slug=${encodeURIComponent(post.slug)}" target="_blank" rel="noopener">View</a>
            <button type="button" data-action="edit" data-id="${escapeHtml(post.id)}">Edit</button>
            <button type="button" data-action="delete" data-id="${escapeHtml(post.id)}">Delete</button>
          </div>
        </div>
      `).join("");
    } catch (err) {
      postsBox.innerHTML = '<p class="blog-status">Could not load posts.</p>';
    }
  }

  function resetForm() {
    editingId = null;
    postForm.reset();
    formTitle.textContent = "New post";
    cancelEdit.hidden = true;
    postError.hidden = true;
    postSuccess.hidden = true;
  }

  function startEdit(post) {
    editingId = post.id;
    formTitle.textContent = "Edit post";
    titleInput.value = post.title || "";
    tagsInput.value = (post.tags || []).join(", ");
    excerptInput.value = post.excerpt || "";
    contentInput.value = post.content || "";
    cancelEdit.hidden = false;
    postError.hidden = true;
    postForm.scrollIntoView({ behavior: "smooth", block: "start" });
    titleInput.focus();
  }

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    loginError.hidden = true;
    try {
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput.value })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Login failed");
      setToken(data.token);
      passwordInput.value = "";
      showDash();
    } catch (err) {
      loginError.textContent = err.message;
      loginError.hidden = false;
    }
  });

  logoutBtn.addEventListener("click", async () => {
    await fetch(`${API_BASE}/api/admin/logout`, {
      method: "POST",
      credentials: "same-origin",
      headers: withAuth()
    }).catch(() => {});
    setToken(null);
    showLogin();
  });

  postForm.addEventListener("submit", async event => {
    event.preventDefault();
    postError.hidden = true;
    postSuccess.hidden = true;
    const body = {
      title: titleInput.value,
      tags: tagsInput.value,
      excerpt: excerptInput.value,
      content: contentInput.value
    };
    try {
      if (editingId) {
        await api(`/api/posts/${encodeURIComponent(editingId)}`, { method: "PUT", body });
      } else {
        await api("/api/posts", { method: "POST", body });
      }
      resetForm();
      postSuccess.hidden = false;
      setTimeout(() => { postSuccess.hidden = true; }, 2500);
      loadStats();
      loadPosts();
    } catch (err) {
      postError.textContent = err.message;
      postError.hidden = false;
    }
  });

  cancelEdit.addEventListener("click", resetForm);

  refreshBtn.addEventListener("click", () => {
    loadStats();
    loadPosts();
  });

  document.addEventListener("click", event => {
    const toggle = event.target.closest("[data-toggle-password]");
    if (!toggle) return;
    const input = document.getElementById(toggle.dataset.togglePassword);
    if (!input) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    toggle.textContent = show ? "Hide" : "Show";
    toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });

  passwordForm.addEventListener("submit", async event => {
    event.preventDefault();
    passwordError.hidden = true;
    passwordSuccess.hidden = true;

    if (newPassword.value !== confirmPassword.value) {
      passwordError.textContent = "New passwords don't match";
      passwordError.hidden = false;
      return;
    }
    if (newPassword.value.length < 8) {
      passwordError.textContent = "New password must be at least 8 characters";
      passwordError.hidden = false;
      return;
    }

    try {
      await api("/api/admin/password", {
        method: "POST",
        body: { currentPassword: currentPassword.value, newPassword: newPassword.value }
      });
      passwordForm.reset();
      passwordSuccess.hidden = false;
      setTimeout(() => { passwordSuccess.hidden = true; }, 4000);
    } catch (err) {
      passwordError.textContent = err.message;
      passwordError.hidden = false;
    }
  });

  postsBox.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.dataset.id;
    const post = posts.find(p => p.id === id);
    if (!post) return;

    if (button.dataset.action === "delete") {
      if (!confirm(`Delete "${post.title}"?`)) return;
      try {
        await api(`/api/posts/${encodeURIComponent(id)}`, { method: "DELETE" });
        resetForm();
        loadStats();
        loadPosts();
      } catch (err) {
        alert(err.message);
      }
      return;
    }

    try {
      const data = await api(`/api/posts/${encodeURIComponent(post.slug)}`);
      if (data.post) startEdit(data.post);
    } catch (err) {
      alert(err.message);
    }
  });

  (async function init() {
    try {
      const data = await api("/api/admin/session");
      if (data.authenticated) showDash();
      else showLogin();
    } catch (err) {
      showLogin();
    }
  })();
})();
