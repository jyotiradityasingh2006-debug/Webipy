(function () {
  "use strict";

  const listEl = document.getElementById("post-list");
  const viewEl = document.getElementById("post-view");
  if (!listEl && !viewEl) return;

  const API_BASE = (window.WEBIPY_API_BASE || "").replace(/\/$/, "");

  const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));

  function formatDate(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  function inline(text) {
    let out = escapeHtml(text);
    out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return out;
  }

  function renderMarkdown(source) {
    const lines = String(source || "").replace(/\r\n/g, "\n").split("\n");
    let html = "";
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (/^```/.test(line)) {
        const lang = line.replace(/^```/, "").trim();
        i += 1;
        const code = [];
        while (i < lines.length && !/^```/.test(lines[i])) {
          code.push(lines[i]);
          i += 1;
        }
        i += 1;
        const cls = lang ? ` class="lang-${escapeHtml(lang)}"` : "";
        html += `<pre><code${cls}>${escapeHtml(code.join("\n"))}</code></pre>`;
        continue;
      }

      if (/^###\s+/.test(line)) {
        html += `<h3>${inline(line.replace(/^###\s+/, ""))}</h3>`;
        i += 1;
        continue;
      }

      if (/^#{1,2}\s+/.test(line)) {
        html += `<h2>${inline(line.replace(/^#{1,2}\s+/, ""))}</h2>`;
        i += 1;
        continue;
      }

      if (/^\s*[-*]\s+/.test(line)) {
        html += "<ul>";
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
          html += `<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`;
          i += 1;
        }
        html += "</ul>";
        continue;
      }

      if (/^\s*\d+\.\s+/.test(line)) {
        html += "<ol>";
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          html += `<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`;
          i += 1;
        }
        html += "</ol>";
        continue;
      }

      if (!line.trim()) {
        i += 1;
        continue;
      }

      const paragraph = [];
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        !/^```/.test(lines[i]) &&
        !/^#{1,3}\s+/.test(lines[i]) &&
        !/^\s*[-*]\s+/.test(lines[i]) &&
        !/^\s*\d+\.\s+/.test(lines[i])
      ) {
        paragraph.push(lines[i]);
        i += 1;
      }
      html += `<p>${inline(paragraph.join(" "))}</p>`;
    }

    return html;
  }

  async function loadList() {
    try {
      const res = await fetch(`${API_BASE}/api/posts`, { cache: "no-store" });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      const posts = Array.isArray(data.posts) ? data.posts : [];

      if (!posts.length) {
        listEl.innerHTML = '<p class="blog-status">No posts yet — check back soon.</p>';
        return;
      }

      listEl.innerHTML = posts.map(post => `
        <a class="blog-card" href="post.html?slug=${encodeURIComponent(post.slug)}">
          <div class="blog-card-top">
            <span class="blog-date">${escapeHtml(formatDate(post.createdAt))}</span>
            <span class="blog-tags">${(post.tags || []).map(escapeHtml).join(" · ")}</span>
          </div>
          <h3>${escapeHtml(post.title)}</h3>
          <p>${escapeHtml(post.excerpt || "")}</p>
          <span class="blog-read">Read post →</span>
        </a>
      `).join("");
    } catch (err) {
      listEl.innerHTML = '<p class="blog-status">Posts can\'t load right now.</p>';
    }
  }

  async function loadPost() {
    const params = new URLSearchParams(location.search);
    const slug = params.get("slug");
    const titleEl = document.getElementById("post-title");
    const metaEl = document.getElementById("post-meta");

    if (!slug) {
      if (titleEl) titleEl.textContent = "Post not found";
      viewEl.innerHTML = '<p>This post doesn\'t exist. <a href="blog.html">Back to the blog</a>.</p>';
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/posts/${encodeURIComponent(slug)}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      const post = data.post;
      if (!post) throw new Error("Not found");

      document.title = `${post.title} - Webipy`;
      if (titleEl) titleEl.textContent = post.title;
      if (metaEl) {
        const tags = (post.tags || []).join(", ");
        metaEl.textContent = [formatDate(post.createdAt), tags].filter(Boolean).join(" · ");
      }
      viewEl.innerHTML = renderMarkdown(post.content);
    } catch (err) {
      if (titleEl) titleEl.textContent = "Post not found";
      viewEl.innerHTML = '<p>We couldn\'t find that post. <a href="blog.html">Back to the blog</a>.</p>';
    }
  }

  if (listEl) loadList();
  if (viewEl) loadPost();
})();
