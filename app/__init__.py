"""Application factory."""
import hashlib
import os
from datetime import datetime

from flask import Flask, render_template, request

from .content import load, fmt_date, BASE_DIR
from .routes import register_routes


def create_app():
    app = Flask(
        __name__,
        template_folder=os.path.join(BASE_DIR, "templates"),
        static_folder=os.path.join(BASE_DIR, "static"),
    )

    @app.template_filter("commit_hash")
    def commit_hash(seed):
        return hashlib.sha1(seed.encode()).hexdigest()[:7]

    @app.context_processor
    def inject_globals():
        profile = load("profile.json")
        site = load("site.json")
        domain = site.get("domain", "").rstrip("/")
        return {
            "profile": profile,
            "site": site,
            "year": datetime.now().year,
            "fmt_date": fmt_date,
            "canonical_url": domain + request.path,
            "accent_colors": ["var(--alpenglow-1)", "var(--alpenglow-2)", "var(--alpenglow-3)", "var(--glacier)"],
            "structured_data": {
                "@context": "https://schema.org",
                "@graph": [
                    {
                        "@type": "Person",
                        "name": profile.get("name"),
                        "jobTitle": profile.get("role"),
                        "worksFor": {"@type": "Organization", "name": profile.get("company")},
                        "url": domain,
                        "email": "mailto:" + profile.get("email", ""),
                        "sameAs": [s["href"] for s in profile.get("social", []) if s.get("type") == "link"],
                    },
                    {
                        "@type": "WebSite",
                        "name": profile.get("name"),
                        "url": domain,
                        "description": site.get("seo", {}).get("description"),
                    },
                ],
            },
        }

    @app.errorhandler(404)
    def not_found(_e):
        return render_template("404.html", active=""), 404

    register_routes(app)
    return app
