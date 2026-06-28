# Pankaj Chauhan - Portfolio (Flask)

A creative, responsive portfolio: light/dark themes, an "alpenglow" palette, an animated
topographic background, projects, a trek explorer with photo galleries, a Markdown blog,
a résumé download, and a built-in contact popup.

## Project structure

```
.
├── app/                 # application code (factory pattern)
│   ├── __init__.py      #   create_app(): config, context processors, error handlers
│   ├── routes.py        #   all view functions
│   └── content.py       #   data loading / markdown / date helpers
├── data/                # ALL editable content (you live here)
│   ├── site.json        #   nav, features, SEO, page copy, contact settings
│   ├── profile.json     #   identity, about, stats, skills, experience, certs, socials
│   ├── projects.json    #   your projects
│   ├── explorer.json    #   treks (each with a story, stats, and gallery)
│   ├── blog.json        #   blog post metadata
│   ├── blog/*.md        #   blog post bodies (Markdown)
│   └── resume.pdf       #   your résumé (replace the placeholder)
├── templates/           # Jinja templates
├── static/              # css, js, generated images
├── scripts/
│   └── gen_assets.py    # regenerates placeholder SVGs FROM the data files
├── build/input.css      # Tailwind source
├── wsgi.py              # production entry (gunicorn wsgi:application)
├── requirements.txt · package.json · tailwind.config.js · Procfile · .gitignore
```

Root holds only global/config files; all app code is in `app/`, all content in `data/`.

## Run locally

```bash
pip install -r requirements.txt
flask --app app run --debug      # http://127.0.0.1:5000
```

Python only - the CSS ships pre-compiled, so Node is optional.

## Editing content (no code changes needed)

Everything is data-driven. To add or change a project, trek, blog post, nav item, or any
page heading, edit the relevant file in `data/`:

| Want to change... | Edit |
|---|---|
| Nav items, feature on/off, SEO, **page headings & hero/CTA copy** | `data/site.json` |
| Name, about, stats, skills, experience, certs, social links | `data/profile.json` |
| Projects | `data/projects.json` |
| Treks (story + `stats` + `gallery`) | `data/explorer.json` |
| Blog (metadata) + post body | `data/blog.json` + `data/blog/<file>.md` |

Page titles use a `title_pre` / `title_accent` / `title_post` split so the accent word stays
gradient-highlighted - e.g. `"Things I've " + "built" + "."`.

### Résumé
Replace `data/resume.pdf` with your own (or set `profile.resume.file` to any filename in
`data/`). The "Résumé" button serves it.

### Images
Covers/galleries point at `.svg` placeholders in `static/img/`. Swap in real photos by
saving optimised **WebP** into `static/img/` and pointing the `cover` / `gallery[].src`
fields at them. To regenerate placeholders after adding items:

```bash
python scripts/gen_assets.py     # reads data/, regenerates only .svg targets, skips real photos
```

### Blog post
Add an entry to `data/blog.json` (slug, title, excerpt, date `YYYY-MM-DD`, tags, cover,
reading_time, `content_file`, `published`), then write the body in
`data/blog/<content_file>` as Markdown.

## Contact popup

The "Connect" button (top bar + footer) opens a popup that sends you a message without the
visitor leaving the site. Configure it in `site.json` under `"contact"`:

- **`provider: "formsubmit"`** (default) - posts to FormSubmit. No signup or key needed;
  set `to_email` to your address. **On the first real submission, FormSubmit emails you a
  one-time activation link - click it once and all future messages arrive in your inbox.**
- **`provider: "web3forms"`** - set `web3forms_access_key` (free key from web3forms.com).
- **`provider: "flask"`** - sends via your own SMTP from the `/contact` route. Set env vars
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `CONTACT_TO`. (Note: some free hosts
  block outbound SMTP - Render allows it, PythonAnywhere free does not.)

Email is required; phone is optional.

## Rebuilding CSS (only if you change Tailwind classes)

```bash
npm install
npm run build:css     # or: npm run watch:css
```

## Deploy as a static site (always-on, free, auto-deploy)

This runs fine as a live Flask app, but for a personal site the best setup is to **freeze**
it to static HTML and host that: never sleeps, no cold start, free, with a free custom
domain + HTTPS. The contact form still works (it posts to FormSubmit from the browser) and
the resume is served as a real file.

### Build locally

```bash
pip install -r requirements-build.txt
python scripts/gen_assets.py     # (re)generate placeholder art
python freeze.py                 # outputs ./dist
python -m http.server -d dist    # preview at http://localhost:8000
```

### Auto-deploy on every push

**Option 1 - GitHub Pages (workflow included).**
1. Push the repo to GitHub (`main` branch).
2. Repo **Settings -> Pages -> Source: GitHub Actions**.
3. `.github/workflows/deploy.yml` builds and deploys on every push.
   Use a **custom domain** (Settings -> Pages) or a `username.github.io` repo so the site is
   served at the root.

**Option 2 - Cloudflare Pages (easiest root-served + free domain).**
1. Push to GitHub.
2. Cloudflare **Pages -> Create -> connect your repo**.
3. Build command: `pip install -r requirements-build.txt && python scripts/gen_assets.py && python freeze.py`
   Output directory: `dist`
4. Every push auto-builds and deploys. (Netlify works the same way.)

**Updating content is then just:** edit a file in `data/`, commit, push - the site rebuilds
itself. The CI regenerates placeholder SVGs from your data automatically; real photos
(`.webp`/`.jpg`/`.png`) are left untouched.

### Static-hosting notes
- Serve at the **root** of a domain (Cloudflare `*.pages.dev`, Netlify, or GitHub Pages with
  a custom domain). Asset paths are absolute (`/static/...`).
- Keep contact `provider: "formsubmit"` or `"web3forms"`. The `flask` SMTP provider needs a
  live server and won't work on a static host.

### Prefer a live Flask server instead?
PythonAnywhere (free, no build step - edit JSON and reload) or Render (`gunicorn wsgi:application`).
Note Render's free tier sleeps after ~15 min idle (slow first load); the static route above avoids that.


## Notes
Sample blog/trek content is placeholder. Respects `prefers-reduced-motion`, works
keyboard-only, and content still shows with JavaScript disabled.
