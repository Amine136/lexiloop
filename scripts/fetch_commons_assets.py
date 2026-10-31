#!/usr/bin/env python3
"""Fetch one freely licensed Wikimedia Commons image per concrete example word."""
from pathlib import Path
import json
import re
import sys
import time
from urllib.parse import quote, urlsplit, urlunsplit

import requests
from PIL import Image
from io import BytesIO

ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "public" / "data"
IMAGE_ROOT = ROOT / "public" / "images"
API = "https://commons.wikimedia.org/w/api.php"
HEADERS = {"User-Agent": "LexiLoop vocabulary trainer asset fetcher/1.0 (educational demo)"}


def clean(value):
    if isinstance(value, dict):
        return value.get("value", "")
    return value or ""


def fetch_candidate(term):
    params = {
        "action": "query",
        "generator": "search",
        "gsrsearch": term,
        "gsrnamespace": 6,
        "gsrlimit": 12,
        "prop": "imageinfo",
        "iiprop": "url|mime|extmetadata",
        "iiurlwidth": 480,
        "format": "json",
        "formatversion": 2,
    }
    response = requests.get(API, params=params, headers=HEADERS, timeout=30)
    response.raise_for_status()
    pages = response.json().get("query", {}).get("pages", [])
    for page in pages:
        info = (page.get("imageinfo") or [{}])[0]
        mime = info.get("mime", "")
        meta = info.get("extmetadata", {})
        license_name = clean(meta.get("LicenseShortName"))
        if not mime.startswith("image/") or mime in {"image/svg+xml", "image/gif"}:
            continue
        if not license_name:
            continue
        return {
            "title": page.get("title", "").replace("File:", "", 1),
            "thumburl": info.get("thumburl") or info.get("url"),
            "fileurl": info.get("url"),
            "file_page": "https://commons.wikimedia.org/wiki/" + quote(page.get("title", "").replace(" ", "_")),
            "author": clean(meta.get("Artist")) or clean(meta.get("Credit")) or "Unknown creator",
            "license": license_name,
            "license_url": clean(meta.get("LicenseUrl")) or "https://commons.wikimedia.org/wiki/Commons:Licensing",
            "description": clean(meta.get("ImageDescription")),
        }
    return None


def safe_name(value):
    return re.sub(r"[^a-z0-9-]+", "-", value.lower()).strip("-")


def download(url):
    parts = urlsplit(url)
    clean_url = urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
    for attempt in range(6):
        response = requests.get(clean_url, headers=HEADERS, timeout=45)
        if response.status_code != 429:
            response.raise_for_status()
            return response
        wait = 2 + attempt * 2
        print(f"  Commons is throttling downloads; retrying in {wait}s", flush=True)
        time.sleep(wait)
    response.raise_for_status()


def main():
    attribution_path = IMAGE_ROOT / "ATTRIBUTION.json"
    existing = json.loads(attribution_path.read_text()) if attribution_path.exists() else {"items": []}
    attribution_by_path = {item["path"]: item for item in existing.get("items", [])}
    missing = []
    for chapter_path in sorted(DATA_ROOT.glob("chapter-*.json")):
        chapter = json.loads(chapter_path.read_text())
        chapter_dir = IMAGE_ROOT / chapter["id"]
        chapter_dir.mkdir(parents=True, exist_ok=True)
        for entry in chapter["entries"]:
            if not entry.get("image"):
                continue
            target = ROOT / "public" / entry["image"]
            if target.exists():
                if entry["image"].replace("images/", "") not in attribution_by_path:
                    print(f"  existing image has no attribution record yet: {entry['word']}", flush=True)
                continue
            print(f"Searching Commons for {entry['word']}...", flush=True)
            candidate = fetch_candidate(entry.get("noun") or entry["word"])
            if not candidate:
                missing.append(entry["word"])
                print(f"  no usable image found for {entry['word']}", flush=True)
                continue
            image_response = download(candidate["thumburl"])
            image = Image.open(BytesIO(image_response.content)).convert("RGB")
            image.thumbnail((400, 400), Image.Resampling.LANCZOS)
            target.parent.mkdir(parents=True, exist_ok=True)
            image.save(target, "WEBP", quality=84, method=6)
            attribution_by_path[entry["image"].replace("images/", "")] = {
                "path": entry["image"].replace("images/", ""),
                "word": entry["word"],
                "source": candidate["file_page"],
                "creator": candidate["author"],
                "license": candidate["license"],
                "licenseUrl": candidate["license_url"],
                "original": candidate["fileurl"],
            }
            time.sleep(0.15)
            attribution_path.write_text(json.dumps({"source": "Wikimedia Commons", "items": list(attribution_by_path.values()), "missing": missing}, indent=2, ensure_ascii=False) + "\n")
    attribution_path.write_text(json.dumps({"source": "Wikimedia Commons", "items": list(attribution_by_path.values()), "missing": missing}, indent=2, ensure_ascii=False) + "\n")
    if missing:
        print("Missing images:", ", ".join(missing), file=sys.stderr)


if __name__ == "__main__":
    main()
