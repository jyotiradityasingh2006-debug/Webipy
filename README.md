# Webipy
This is for our website, our original website

## Deploying (Render + MongoDB)

1. Push this repository to GitHub.
2. Create a free MongoDB Atlas cluster and copy its connection string.
3. On Render, create a Web Service (or use the included `render.yaml` blueprint):
   - Build command: `npm install`
   - Start command: `npm start`
   - Health check path: `/healthz`
4. Add environment variables in Render:
   - `MONGODB_URI` — Atlas connection string (enables MongoDB storage)
   - `MONGODB_DB` — optional, defaults to `webipy`
   - `ADMIN_PASSWORD` — initial admin password
   - `CORS_ORIGIN` — optional, e.g. `https://your-site.netlify.app`
5. Open `https://<your-service>.onrender.com/admin` and change the password.

Without `MONGODB_URI`, the server falls back to local JSON files in `data/`.

## Vercel (full stack + MongoDB)

Vercel runs `server.js` directly as a Node.js server (auto-detected from `package.json#main`). No build command is needed.

1. Import the repository at vercel.com/new.
2. Add environment variables in Vercel -> Settings -> Environment Variables:
   - `MONGODB_URI` - Atlas connection string (required for persistent data on Vercel)
   - `MONGODB_DB` - optional, defaults to `webipy`
   - `ADMIN_PASSWORD` - initial admin password
3. In MongoDB Atlas -> Network Access, allow `0.0.0.0/0` (Vercel uses dynamic IPs).
4. Deploy. Leave `WEBIPY_API_BASE` empty in `config.js` so the pages call the API on the same domain.

`vercel.json` bundles the root HTML/CSS/JS/images into the function so `server.js` can serve them, and enables clean URLs for `/blog`, `/post`, and `/admin`.

## Netlify (static frontend only)

Netlify can't run `server.js`, so it hosts the pages while the API stays on Render:

1. In `config.js`, set `window.WEBIPY_API_BASE = "https://<your-service>.onrender.com";`.
2. Set `CORS_ORIGIN` on Render to your Netlify URL, or leave it empty to allow any origin.
3. Deploy the repository on Netlify. `netlify.toml` enables clean URLs for `/blog`, `/post`, and `/admin`.
