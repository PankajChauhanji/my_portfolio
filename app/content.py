"""Data-access helpers: load JSON, find by slug, render Markdown, format dates."""
import json
import os
from datetime import datetime

import markdown as md_lib

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(BASE_DIR, "data")


def load(name):
    with open(os.path.join(DATA_DIR, name), "r", encoding="utf-8") as f:
        return json.load(f)


def by_slug(items, slug):
    for item in items:
        if item.get("slug") == slug:
            return item
    return None


def render_markdown(rel_path):
    path = os.path.join(DATA_DIR, "blog", rel_path)
    if not rel_path or not os.path.exists(path):
        return ""
    with open(path, "r", encoding="utf-8") as f:
        return md_lib.markdown(f.read(), extensions=["fenced_code", "tables", "sane_lists"])


def fmt_date(value):
    """ISO date string -> '18 May 2026'."""
    try:
        return datetime.strptime(value, "%Y-%m-%d").strftime("%d %b %Y")
    except (ValueError, TypeError):
        return value
