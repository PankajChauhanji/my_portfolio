"""All view functions, registered onto the app (bare endpoint names)."""
import os
import ssl
import smtplib
from email.message import EmailMessage

from flask import render_template, abort, send_from_directory, request, jsonify

from .content import load, by_slug, render_markdown, DATA_DIR


def register_routes(app):
    @app.route("/")
    def home():
        return render_template("index.html", active="home")

    @app.route("/projects/")
    def projects():
        return render_template("projects.html", active="projects", projects=load("projects.json"))

    @app.route("/explorer/")
    def explorer():
        entries = sorted(load("explorer.json"), key=lambda e: e.get("altitude_m", 0), reverse=True)
        return render_template("explorer.html", active="explorer", entries=entries)

    @app.route("/explorer/<slug>/")
    def explorer_detail(slug):
        entry = by_slug(load("explorer.json"), slug)
        if not entry:
            abort(404)
        return render_template("explorer_detail.html", active="explorer", entry=entry)

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
