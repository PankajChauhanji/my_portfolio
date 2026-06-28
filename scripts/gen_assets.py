"""
Generate placeholder SVG art from the data files.

Run:  python scripts/gen_assets.py

It reads data/projects.json, data/explorer.json, data/blog.json and generates a
matching SVG for every cover / gallery image whose path ends in `.svg`. Real photos
(.webp/.jpg/.png) are left untouched, so you can mix generated placeholders and real
images freely. Adding a new project / trek / blog needs NO edits here - just add the
JSON entry (with an .svg cover path) and re-run.
"""
import json
import math
import os
import random

BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA = os.path.join(BASE, "data")
OUT = os.path.join(BASE, "static", "img")
os.makedirs(OUT, exist_ok=True)

PALETTES = [
    ("#0e1b3a", "#2a1b52", "#5eead4"),
    ("#101a36", "#3a2467", "#ff9e6d"),
    ("#0e2a3a", "#1f6f7a", "#7fe3d0"),
    ("#160f38", "#43306f", "#ff6b9d"),
    ("#1a2540", "#4a5e8a", "#d7e6ff"),
    ("#10243f", "#3f5a86", "#ffd49a"),
]


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def pal_for(key):
    return PALETTES[hash(key) % len(PALETTES)]


def _h2r(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _r2h(r):
    return "#%02x%02x%02x" % tuple(max(0, min(255, int(c))) for c in r)


def mix(a, b, t):
    ra, rb = _h2r(a), _h2r(b)
    return _r2h(tuple(ra[i] + (rb[i] - ra[i]) * t for i in range(3)))


def lighten(h, t):
    return mix(h, "#ffffff", t)


def darken(h, t):
    return mix(h, "#000000", t)


def want(path):
    """Only generate for .svg targets; skip real photos."""
    return bool(path) and path.lower().endswith(".svg")


def basename(path):
    return os.path.basename(path)


def write(name, svg):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(svg)


# ---------- contour field (site-wide) ----------
def ring(cx, cy, r, rng, jitter=0.16, n=64):
    pts = []
    base = rng.uniform(0, math.tau)
    amps = [rng.uniform(-jitter, jitter) for _ in range(5)]
    for i in range(n + 1):
        a = base + (i / n) * math.tau
        wob = 1 + sum(amps[k] * math.sin((k + 1) * a + k) for k in range(5)) / 3
        rr = r * wob
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a) * 0.78))
    return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + " Z"


def contour_field(w=1600, h=1200, seed=7):
    rng = random.Random(seed)
    peaks = [(w*0.22, h*0.30), (w*0.70, h*0.22), (w*0.82, h*0.74), (w*0.34, h*0.80), (w*0.52, h*0.50)]
    paths = []
    for (cx, cy) in peaks:
        for s in range(rng.randint(7, 11)):
            r = 26 + s * rng.uniform(34, 46)
            paths.append(ring(cx, cy, r, rng, jitter=0.10 + s * 0.012))
    body = "\n".join(
        f'<path d="{d}" fill="none" stroke="currentColor" stroke-width="1.1" vector-effect="non-scaling-stroke"/>'
        for d in paths
    )
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
            f'preserveAspectRatio="xMidYMid slice" aria-hidden="true">\n{body}\n</svg>')


# ---------- trek scene (palette-derived) ----------
ORBS = [(0.74, 0.30), (0.30, 0.26), (0.60, 0.22), (0.82, 0.34), (0.45, 0.30)]


def trek_scene(seed_key, pal, orb_xy=(0.74, 0.30), salt=0):
    deep, midc, accent = pal
    sky = (darken(deep, 0.1), mix(deep, midc, 0.6), accent)
    back, front = mix(midc, deep, 0.45), darken(deep, 0.45)
    midband = mix(midc, deep, 0.62)
    orb = lighten(accent, 0.12)
    ox, oy = orb_xy
    w, h = 800, 600
    rng = random.Random((hash(seed_key) & 0xFFFF) + salt)

    def ridge(base_y, amp, color, op):
        pts = [(0, h)]
        x = 0
        while x <= w:
            y = base_y + math.sin(x*0.012 + rng.random()*6)*amp - abs(math.sin(x*0.004))*amp*1.4
            pts.append((x, y)); x += 24
        pts.append((w, h))
        d = "M" + " L".join(f"{px:.0f},{py:.0f}" for px, py in pts) + " Z"
        return f'<path d="{d}" fill="{color}" opacity="{op}"/>'

    layers = [ridge(h*0.52, 36, back, 0.55), ridge(h*0.62, 54, midband, 0.85), ridge(h*0.74, 70, front, 1.0)]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{sky[0]}"/><stop offset="0.55" stop-color="{sky[1]}"/><stop offset="1" stop-color="{sky[2]}"/>
    </linearGradient>
    <radialGradient id="orb" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="{orb}" stop-opacity="0.95"/><stop offset="1" stop-color="{orb}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="{w}" height="{h}" fill="url(#sky)"/>
  <circle cx="{w*ox:.0f}" cy="{h*oy:.0f}" r="120" fill="url(#orb)"/>
  <circle cx="{w*ox:.0f}" cy="{h*oy:.0f}" r="38" fill="{orb}" opacity="0.9"/>
  {layers[0]}
  {layers[1]}
  {layers[2]}
</svg>'''


# ---------- abstract project cover (node graph) ----------
def project_cover(key, label, pal):
    deep, midc, accent = pal
    w, h = 800, 500
    rng = random.Random(hash(key) & 0xFFFFFF)
    nodes = [(rng.uniform(60, w-60), rng.uniform(60, h-90)) for _ in range(13)]
    edges = [(a, b) for i, a in enumerate(nodes) for j, b in enumerate(nodes) if j > i and math.dist(a, b) < 190]
    lines = "\n".join(f'<line x1="{a[0]:.0f}" y1="{a[1]:.0f}" x2="{b[0]:.0f}" y2="{b[1]:.0f}" stroke="{accent}" stroke-width="1" opacity="0.30"/>' for a, b in edges)
    dots = "\n".join(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{rng.uniform(3,7):.0f}" fill="{accent}" opacity="0.9"/>' for x, y in nodes)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid slice">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{deep}"/><stop offset="1" stop-color="{midc}"/></linearGradient></defs>
  <rect width="{w}" height="{h}" fill="url(#bg)"/>
  {lines}
  {dots}
  <text x="34" y="{h-30}" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="22" fill="#ffffff" opacity="0.85">&lt;/&gt; {label}</text>
</svg>'''


# ---------- abstract blog cover (rings) ----------
def blog_cover(key, label, pal):
    deep, midc, accent = pal
    w, h = 800, 420
    cx, cy = w*0.78, h*0.42
    rings = "\n".join(f'<circle cx="{cx:.0f}" cy="{cy:.0f}" r="{40+i*34}" fill="none" stroke="{accent}" stroke-width="1.2" opacity="{0.5-i*0.05:.2f}"/>' for i in range(7))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid slice">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{deep}"/><stop offset="1" stop-color="{midc}"/></linearGradient></defs>
  <rect width="{w}" height="{h}" fill="url(#bg)"/>
  {rings}
  <text x="34" y="{h-28}" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="20" fill="#ffffff" opacity="0.85"># {label}</text>
</svg>'''


# ===================== generate =====================
made = 0
write("contours.svg", contour_field()); made += 1

favicon = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ff6b9d"/><stop offset="0.5" stop-color="#ff9e6d"/><stop offset="1" stop-color="#9d7bff"/>
  </linearGradient></defs>
  <rect width="64" height="64" rx="14" fill="#0B1026"/>
  <path d="M12 46 L26 22 L34 34 L40 26 L52 46 Z" fill="url(#g)"/>
  <path d="M26 22 L31 30 L21 30 Z" fill="#ffffff" opacity="0.85"/>
</svg>'''
write("favicon.svg", favicon); made += 1

for p in load("projects.json"):
    if want(p.get("cover")):
        label = p.get("language") or (p.get("tags") or ["project"])[0]
        write(basename(p["cover"]), project_cover(p["slug"], label, pal_for(p["slug"]))); made += 1

for e in load("explorer.json"):
    pal = pal_for(e["slug"])
    if want(e.get("cover")):
        write(basename(e["cover"]), trek_scene(e["slug"], pal)); made += 1
    for i, ph in enumerate(e.get("gallery", []), 1):
        if want(ph.get("src")):
            write(basename(ph["src"]), trek_scene(e["slug"], pal, ORBS[i % len(ORBS)], salt=i*7)); made += 1

for b in load("blog.json"):
    if want(b.get("cover")):
        label = (b.get("tags") or ["blog"])[0].lower()
        write(basename(b["cover"]), blog_cover(b["slug"], label, pal_for(b["slug"]))); made += 1

# keep the inlined contour partial in sync
import shutil
shutil.copy(os.path.join(OUT, "contours.svg"), os.path.join(BASE, "templates", "partials", "contours.svg"))
print(f"generated {made} svg assets from data files")
