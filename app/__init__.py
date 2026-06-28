"""Application factory."""
import os
from datetime import datetime

from flask import Flask, render_template

from .content import load, fmt_date, BASE_DIR
from .routes import register_routes


def create_app():
    app = Flask(
        __name__,
        template_folder=os.path.join(BASE_DIR, "templates"),
        static_folder=os.path.join(BASE_DIR, "static"),
    )

    @app.context_processor
    def inject_globals():
        return {
            "profile": load("profile.json"),
            "site": load("site.json"),
            "year": datetime.now().year,
            "fmt_date": fmt_date,
        }

    @app.errorhandler(404)
    def not_found(_e):
        return render_template("404.html", active=""), 404

    register_routes(app)
    return app
