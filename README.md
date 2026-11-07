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

## Vercel / Netlify (static frontend only)

Vercel (and Netlify) can't run `server.js`, so they host the pages while the API stays on Render:

1. In `config.js`, set `window.WEBIPY_API_BASE = "https://<your-service>.onrender.com";`.
2. Set `CORS_ORIGIN` on Render to your Vercel URL (e.g. `https://your-site.vercel.app`), or leave it empty to allow any origin.
3. Deploy the repository on Vercel. `vercel.json` enables clean URLs for `/blog`, `/post`, and `/admin`. `netlify.toml` does the same if you use Netlify instead.
