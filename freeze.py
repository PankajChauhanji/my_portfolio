"""
Freeze the Flask app into a static site in ./dist

The source stays a normal Flask app (edit data/*.json as usual). Running this
renders every page to plain HTML + copies static assets, producing a folder any
static host can serve with zero cold starts.

Usage:
    pip install -r requirements-build.txt
    python freeze.py
"""
import os

from flask_frozen import Freezer

from app import create_app
from app.content import load

BASE = os.path.dirname(os.path.abspath(__file__))

app = create_app()
app.config.update(
    FREEZER_DESTINATION=os.path.join(BASE, "dist"),
    FREEZER_REMOVE_EXTRA_FILES=True,
    FREEZER_DEFAULT_MIMETYPE="text/html",
)

freezer = Freezer(app)


@freezer.register_generator
def explorer_detail():
    for entry in load("explorer.json"):
        yield {"slug": entry["slug"]}


@freezer.register_generator
def blog_detail():
    for post in load("blog.json"):
        if post.get("published", True):
            yield {"slug": post["slug"]}


if __name__ == "__main__":
    urls = freezer.freeze()
    # Write a 404.html that static hosts (GitHub Pages, Cloudflare Pages, Netlify)
    # automatically serve for unknown paths.
    with app.test_client() as client:
        resp = client.get("/__not_found__")
    with open(os.path.join(app.config["FREEZER_DESTINATION"], "404.html"), "wb") as f:
        f.write(resp.data)
    print(f"Froze {len(urls)} URLs -> {app.config['FREEZER_DESTINATION']}")
