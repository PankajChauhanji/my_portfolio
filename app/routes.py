"""All view functions, registered onto the app (bare endpoint names)."""
import os
import re
import ssl
import smtplib
from email.message import EmailMessage

from flask import render_template, abort, send_from_directory, request, jsonify, Response

from .content import load, by_slug, render_markdown, DATA_DIR

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def register_routes(app):
    @app.route("/")
    def home():
        return render_template("index.html", active="home")

    @app.route("/robots.txt")
    def robots_txt():
        domain = load("site.json").get("domain", "").rstrip("/")
        lines = ["User-agent: *", "Allow: /"]
        if domain:
            lines += ["", f"Sitemap: {domain}/sitemap.xml"]
        return Response("\n".join(lines) + "\n", mimetype="text/plain")

    @app.route("/sitemap.xml")
    def sitemap_xml():
        site = load("site.json")
        domain = site.get("domain", "").rstrip("/")
        features = site.get("features", {})

        pages = [("/", None)]
        if features.get("projects"):
            pages.append(("/projects/", None))
        if features.get("explorer"):
            pages.append(("/explorer/", None))
            for e in load("explorer.json"):
                pages.append((f"/explorer/{e['slug']}/", None))
        if features.get("blog"):
            pages.append(("/blog/", None))
            for p in load("blog.json"):
                if p.get("published", True):
                    pages.append((f"/blog/{p['slug']}/", p.get("date")))

        entries = []
        for path, lastmod in pages:
            loc = f"{domain}{path}" if domain else path
            entry = f"  <url>\n    <loc>{loc}</loc>"
            if lastmod:
                entry += f"\n    <lastmod>{lastmod}</lastmod>"
            entry += "\n  </url>"
            entries.append(entry)

        xml = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            + "\n".join(entries) + "\n</urlset>\n"
        )
        return Response(xml, mimetype="application/xml")

    @app.route("/projects/")
    def projects():
        return render_template("projects.html", active="projects", projects=load("projects.json"))

    @app.route("/explorer/")
    def explorer():
        entries = sorted(load("explorer.json"), key=lambda e: e.get("altitude_m", 0), reverse=True)
        return render_template("explorer.html", active="explorer", entries=entries)

    @app.route("/explorer/<slug>/")
    def explorer_detail(slug):
        entries = sorted(load("explorer.json"), key=lambda e: e.get("altitude_m", 0), reverse=True)
        entry = by_slug(entries, slug)
        if not entry:
            abort(404)
        idx = entries.index(entry)
        prev_entry = entries[idx - 1] if idx > 0 else None
        next_entry = entries[idx + 1] if idx < len(entries) - 1 else None
        return render_template(
            "explorer_detail.html", active="explorer", entry=entry,
            prev_entry=prev_entry, next_entry=next_entry,
        )

    @app.route("/blog/")
    def blog():
        posts = [p for p in load("blog.json") if p.get("published", True)]
        posts.sort(key=lambda p: p.get("date", ""), reverse=True)
        return render_template("blog.html", active="blog", posts=posts)

    @app.route("/blog/<slug>/")
    def blog_detail(slug):
        post = by_slug(load("blog.json"), slug)
        if not post or not post.get("published", True):
            abort(404)
        content_html = render_markdown(post.get("content_file", ""))
        return render_template("blog_detail.html", active="blog", post=post, content_html=content_html)

    @app.route("/resume.pdf")
    def resume():
        fname = load("profile.json").get("resume", {}).get("file", "")
        if not fname or not os.path.exists(os.path.join(DATA_DIR, fname)):
            abort(404)
        return send_from_directory(DATA_DIR, fname, as_attachment=True)

    @app.route("/contact", methods=["POST"])
    def contact():
        """Optional server-side sender. Active only when site.contact.provider == 'flask'.
        Configure via env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, CONTACT_TO."""
        cc = load("site.json").get("contact", {})
        if cc.get("provider") != "flask":
            return jsonify(ok=False, error="Server-side contact is not enabled."), 400
        data = request.get_json(silent=True) or request.form
        email = (data.get("email") or "").strip()
        message = (data.get("message") or "").strip()
        if not email or not message:
            return jsonify(ok=False, error="Email and message are required."), 400
        if not EMAIL_REGEX.match(email):
            return jsonify(ok=False, error="Please provide a valid email address."), 400

        host = os.environ.get("SMTP_HOST")
        port = int(os.environ.get("SMTP_PORT", "587"))
        user = os.environ.get("SMTP_USER")
        pw = os.environ.get("SMTP_PASS")
        to = os.environ.get("CONTACT_TO") or cc.get("to_email")
        if not (host and user and pw and to):
            return jsonify(ok=False, error="Email service is not configured."), 500

        msg = EmailMessage()
        msg["Subject"] = "[Portfolio] " + (data.get("subject") or ("Message from " + email))
        msg["From"] = user
        msg["To"] = to
        msg["Reply-To"] = email
        msg.set_content(
            "From: %s\nPhone: %s\n\n%s" % (email, (data.get("phone") or "-"), message)
        )
        try:
            ctx = ssl.create_default_context()
            with smtplib.SMTP(host, port) as s:
                s.starttls(context=ctx)
                s.login(user, pw)
                s.send_message(msg)
            return jsonify(ok=True)
        except Exception:
            return jsonify(ok=False, error="Sending failed. Please email me directly."), 500
