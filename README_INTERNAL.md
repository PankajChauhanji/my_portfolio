# Portfolio — Internal Docs

Private repo reference. Everything you need to add content, run the build, manage images, and deploy.

---

## Project structure

```
.
├── app/
│   ├── __init__.py          # create_app(): config, context processors, error handlers
│   ├── routes.py            # all view functions
│   └── content.py           # data loading, markdown, date helpers
├── data/                    # ← all editable content lives here
│   ├── site.json            # nav, features, SEO, page copy, contact settings
│   ├── profile.json         # identity, about, stats, skills, experience, certs, socials
│   ├── projects.json        # projects
│   ├── explorer.json        # treks (story, stats, gallery paths)
│   ├── blog.json            # blog post metadata
│   ├── blog/*.md            # blog post bodies (Markdown)
│   └── resume.pdf
├── scripts/
│   ├── gen_assets.py        # regenerates placeholder SVGs from data files
│   └── compress_images.py   # compresses 4K photos → WebP (100–500 KB target range)
├── static/
│   ├── css/
│   ├── js/
│   └── img/
│       ├── valley_of_flowers/   # real webp photos (gitignored from public)
│       ├── kedarkantha/         # real webp photos (gitignored from public)
│       ├── badrinath/           # real webp photos (gitignored from public)
│       ├── tungnath/            # real webp photos (gitignored from public)
│       └── *.svg                # placeholder assets (public)
├── templates/               # Jinja2 templates
├── .github/
│   └── workflows/
│       └── sync-to-public.yml   # strips private content, pushes to public repo
├── build/input.css          # Tailwind source
├── freeze.py                # Frozen-Flask static build → dist/
├── wsgi.py                  # gunicorn entry point
├── requirements.txt
├── requirements-build.txt
├── tailwind.config.js
└── .gitignore               # excludes *.jpg, dist/, explorer.json, trek photo folders
```

---

## Run locally

```bash
pip install -r requirements.txt
flask --app app run --debug      # http://localhost:5000
```

CSS ships pre-compiled — Node is only needed if you change Tailwind classes:

```bash
npm install
npm run watch:css
```

---

## Editing content

All content is data-driven. No template changes needed for routine updates.

| Want to change | Edit |
|---|---|
| Nav, SEO, page headings, hero copy | `data/site.json` |
| About, skills, experience, certs, socials | `data/profile.json` |
| Projects | `data/projects.json` |
| Treks — story, stats, gallery | `data/explorer.json` |
| Blog metadata | `data/blog.json` |
| Blog post body | `data/blog/<slug>.md` |
| Résumé | Replace `data/resume.pdf` |

Page titles use `title_pre` / `title_accent` / `title_post` — the accent word stays gradient-highlighted.

---

## Adding a new trek

1. Add a new entry to `data/explorer.json` with `slug`, `title`, `type`, `region`, `altitude_m`, `summary`, `story`, `stats`, `cover`, and `gallery`.
2. Add the raw photos to `static/img/<slug>/` (JPG or any format).
3. Run `compress_images.py` to generate WebPs:

```python
compress_gallery(
    directory="static/img/<slug>",
    min_size_kb=100,
    max_size_kb=500,
)
```

4. Point `cover` and `gallery[].src` at the `.webp` paths in `explorer.json`.
5. Run `gen_assets.py` if you need a placeholder SVG for the public repo.

---

## Image compression

`scripts/compress_images.py` — binary-search quality tuning to hit a target size range.

```python
compress_gallery(
    directory="/path/to/folder",
    max_width=2000,       # px
    max_height=2000,      # px
    min_size_kb=100,      # lower bound
    max_size_kb=500,      # upper bound
    quality_floor=40,
    quality_ceiling=95,
    keep_originals=True,  # set False to delete source JPGs after conversion
)
```

- Skips files where a `.webp` counterpart already exists
- Handles EXIF orientation automatically via `piexif`
- Prints per-file result with quality used, output size, and bytes saved

Dependencies: `pip install Pillow piexif`

---

## Static build

```bash
pip install -r requirements-build.txt
python scripts/gen_assets.py     # regenerate placeholder SVGs
python freeze.py                 # outputs → dist/
python -m http.server -d dist    # preview at http://localhost:8000
```

---

## Deployment — Cloudflare Pages

Auto-deploys from the **public repo** (`my_portfolio`) on every push.

| Setting | Value |
|---|---|
| Build command | `pip install -r requirements-build.txt && python scripts/gen_assets.py && python freeze.py` |
| Output directory | `dist` |
| Branch | `main` |

The public repo has no real photos or `explorer.json` — these are stripped by the sync workflow before pushing.

---

## Private → Public sync workflow

`.github/workflows/sync-to-public.yml` runs on every push to `main` in this private repo.

**What it strips before pushing to public:**

| Removed | Reason |
|---|---|
| `data/explorer.json` | Contains real trek content |
| `static/img/valley_of_flowers/` | Real trip photos |
| `static/img/kedarkantha/` | Real trip photos |
| `static/img/badrinath/` | Real trip photos |
| `static/img/tungnath/` | Real trip photos |
| `dist/` | Pre-rendered HTML contains baked-in private content |
| `__pycache__/` | Compiled bytecode |
| `.env*` | Secrets |
| `.github/` | Prevents workflow running in public repo |

**Required secret:** `PUBLIC_REPO_TOKEN_PORTFOLIO` — a GitHub PAT with `contents: write` on the public repo. Set it under this repo's Settings → Secrets and variables → Actions.

---

## Contact form

Configured in `data/site.json` under `"contact"`. Three provider options:

- **`formsubmit`** (default) — set `to_email`. First real submission triggers a one-time activation email from FormSubmit; click it once.
- **`web3forms`** — set `web3forms_access_key` (free at web3forms.com).
- **`flask`** — set env vars `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `CONTACT_TO`. Not compatible with static hosting.

---

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `SECRET_KEY` | Flask session secret | `dev placeholder` |
| `CORS_ORIGINS` | Allowed origins | `*` |
| `PORT` | Bind port | `5000` |
| `FLASK_DEBUG` | Hot reload | `0` |

---

## .gitignore highlights

```
*.jpg               # raw photos never committed
*.jpeg
static/img/valley_of_flowers/
static/img/kedarkantha/
static/img/badrinath/
static/img/tungnath/
data/explorer.json  # private content
dist/               # build output
.env*
__pycache__/
```