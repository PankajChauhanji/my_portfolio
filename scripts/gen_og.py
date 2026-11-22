"""Generate 1200x630 social-share (Open Graph) images with local headless Chrome.

    python scripts/gen_og.py            # site card + one card per published blog post

Writes static/img/og/site.png and static/img/og/<post-slug>.png. These PNGs are
committed (see the .gitignore exception), so the Cloudflare build does not need
Chrome. Re-run after adding a post or changing a title.
"""
import html
import json
import os
import shutil
import subprocess
import tempfile

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "static", "img", "og")
PHOTO = os.path.join(BASE, "static", "img", "site", "profile.webp")


def load(name):
    with open(os.path.join(BASE, "data", name), encoding="utf-8") as f:
        return json.load(f)


def chrome():
    for c in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        if shutil.which(c):
            return c
    raise SystemExit("Chrome/Chromium not found on PATH")


TEMPLATE = """<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800&family=JetBrains+Mono:wght@500&display=block">
<style>
*{{margin:0;box-sizing:border-box}}
body{{width:1200px;height:630px;overflow:hidden;background:#07090f;color:#eef1f7;font-family:Inter,system-ui,sans-serif;position:relative}}
.orb{{position:absolute;border-radius:50%;filter:blur(110px)}}
.o1{{width:620px;height:620px;left:-180px;top:-260px;background:#5b8cff;opacity:.45}}
.o2{{width:560px;height:560px;right:-160px;top:-120px;background:#a17bff;opacity:.38}}
.o3{{width:420px;height:420px;right:120px;bottom:-300px;background:#3dd6f5;opacity:.22}}
.grid{{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.07) 1.2px,transparent 1.2px);background-size:30px 30px;
  -webkit-mask-image:radial-gradient(ellipse 85% 75% at 40% 30%,#000 35%,transparent 80%)}}
.wrap{{position:absolute;inset:64px 72px;display:flex;flex-direction:column}}
.brand{{display:flex;align-items:center;gap:18px}}
.brand img{{width:64px;height:64px;border-radius:16px;object-fit:cover;box-shadow:0 0 0 2px rgba(255,255,255,.12)}}
.brand b{{display:block;font-size:26px;font-weight:700;letter-spacing:-.02em}}
.brand span{{display:block;font-family:'JetBrains Mono',monospace;font-size:18px;color:#9aa4b8;margin-top:2px}}
.kicker{{margin-top:auto;font-family:'JetBrains Mono',monospace;font-size:20px;letter-spacing:.14em;text-transform:uppercase;color:#7ea2ff}}
h1{{margin-top:18px;font-size:{size}px;line-height:1.08;letter-spacing:-.035em;font-weight:800;max-width:1000px}}
h1 em{{font-style:normal;background:linear-gradient(120deg,#5b8cff,#a17bff 55%,#3dd6f5);-webkit-background-clip:text;color:transparent}}
.foot{{margin-top:34px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}}
.chip{{padding:8px 16px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);font-size:19px;color:#c9d1e0}}
.url{{margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:19px;color:#9aa4b8}}
.bar{{position:absolute;left:0;right:0;bottom:0;height:8px;background:linear-gradient(90deg,#5b8cff,#a17bff,#3dd6f5)}}
</style></head><body>
<div class="orb o1"></div><div class="orb o2"></div><div class="orb o3"></div><div class="grid"></div>
<div class="wrap">
  <div class="brand"><img src="file://{photo}" alt=""><div><b>{name}</b><span>{role}</span></div></div>
  <div class="kicker">{kicker}</div>
  <h1>{title}</h1>
  <div class="foot">{chips}<span class="url">{domain}</span></div>
</div><div class="bar"></div>
</body></html>"""


def render(path_png, **kw):
    title = kw["title"]
    size = 76 if len(title) < 60 else 64 if len(title) < 90 else 56
    page = TEMPLATE.format(size=size, photo=PHOTO, **kw)
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "og.html")
        with open(src, "w", encoding="utf-8") as f:
            f.write(page)
        subprocess.run([chrome(), "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
                        "--virtual-time-budget=4000", "--window-size=1200,630", f"--screenshot={path_png}", "file://" + src],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("wrote", os.path.relpath(path_png, BASE))


def main():
    os.makedirs(OUT, exist_ok=True)
    profile, site = load("profile.json"), load("site.json")
    domain = site.get("domain", "").replace("https://", "").rstrip("/")
    common = dict(name=html.escape(profile["name"]), role=html.escape(profile["role"].lower()), domain=html.escape(domain))
    chips = lambda items: "".join(f'<span class="chip">{html.escape(i)}</span>' for i in items)

    render(os.path.join(OUT, "site.png"), kicker="Agentic AI · Document AI · LLM pipelines",
           title="I turn messy documents &amp; the open web into <em>decision-ready data.</em>",
           chips=chips(["Python", "LLMs & RAG", "OCR", "Tech Lead"]), **common)

    for post in load("blog.json"):
        if not post.get("published", True):
            continue
        render(os.path.join(OUT, post["slug"] + ".png"), kicker="Blog · " + html.escape(post.get("reading_time", "")),
               title=html.escape(post["title"]), chips=chips(post.get("tags", [])[:3]), **common)


if __name__ == "__main__":
    main()
