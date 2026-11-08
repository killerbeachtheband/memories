"""Build data.js from the band's Google Sheet log (replaces the Notion sync).

The sheet is the single source of truth. One row = one record.
Columns (tab "entries"):
  member | category | title | originalTitle | creator | rating | tags |
  experiencedDate | releaseDate | hallOfFame | legacy | note | body

Usage:
  python3 scripts/sync_sheets.py --csv entries.csv        # local CSV export
  python3 scripts/sync_sheets.py --sheet-id <ID>          # gviz CSV export
      (the gviz route needs the sheet shared as "anyone with the link can view")

In GitHub Actions, set the SHEET_ID repository variable and share the sheet
view-only by link; see .github/workflows/publish-sheets.yml.
"""
import argparse
import csv
import hashlib
import io
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SHEET_ID = "16N2fcTJAG94xfBznAptM3xrO0alUxDWsOGZnt_-vp3c"
SHEET_URL = "https://docs.google.com/spreadsheets/d/{}/edit"

SOURCES = {"映画": "movies", "音楽": "music", "アート": "art", "舞台・ライブ": "live",
           "ゲーム": "games", "建築": "arch", "本": "books", "その他": "other"}
LABELS = {"映画": "CINEMA", "本": "LITERATURE", "音楽": "MUSIC", "アート": "ART",
          "舞台・ライブ": "LIVE", "ゲーム": "GAMES", "建築": "ARCHITECTURE", "その他": "OTHER"}


def truthy(value):
    return str(value or "").strip().lower() in ("true", "1", "yes", "y", "はい", "○")


def parse_rating(value):
    text = str(value or "").strip()
    if not text:
        return None
    try:
        rating = float(text)
    except ValueError:
        raise SystemExit(f"Invalid rating {text!r}; expected a number from 0 to 10.")
    if not 0 <= rating <= 10:
        raise SystemExit(f"Invalid rating {text!r}; expected a number from 0 to 10.")
    return int(rating) if rating == int(rating) else rating


def normalize(row, sheet_url):
    category = (row.get("category") or "その他").strip() or "その他"
    if category not in SOURCES:
        raise SystemExit(f"Unknown category {category!r}; use one of {', '.join(SOURCES)}.")
    title = (row.get("title") or "").strip()
    if not title:
        return None
    member = (row.get("member") or "").strip()
    experienced = (row.get("experiencedDate") or "").strip() or None
    released = (row.get("releaseDate") or "").strip() or None
    sort_date = experienced or released
    rating = parse_rating(row.get("rating"))
    uid = hashlib.md5(f"{member}|{category}|{title}|{experienced or ''}|{released or ''}".encode()).hexdigest()
    return dict(
        id=uid, source=SOURCES[category], member=member, title=title,
        originalTitle=(row.get("originalTitle") or "").strip(), creator=(row.get("creator") or "").strip(),
        category=category, label=LABELS[category], rating=rating,
        ratingLabel=f"{rating:g} / 10" if rating is not None else "未評価", ratingScale=10,
        hallOfFame=truthy(row.get("hallOfFame")), legacy=truthy(row.get("legacy")),
        sortDate=sort_date, sortDateProperty="体験日" if experienced else "リリース日",
        dateLabel="EXPERIENCED ON" if experienced else "RELEASED ON", sourceDatabase=None,
        experiencedDate=experienced, releaseDate=released, readingStartedDate=None, visitedDate=None,
        createdDate=None, tags=[t.strip() for t in (row.get("tags") or "").replace("、", ",").split(",") if t.strip()],
        note=(row.get("note") or "").strip(), body=(row.get("body") or "").strip(),
        format=None, scores={}, links={}, url=sheet_url, cover=(row.get("cover") or "").strip() or None)


def read_rows(args):
    if args.csv:
        text = Path(args.csv).read_text(encoding="utf-8-sig")
    else:
        sheet_id = args.sheet_id
        url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?tqx=out:csv&sheet=entries"
        with urlopen(Request(url, headers={"User-Agent": "MemoriesSheetSync/1.0"}), timeout=30) as response:
            text = response.read().decode("utf-8-sig")
        if text.lstrip().startswith("<"):
            raise SystemExit("The sheet is not readable by link. Share it as "
                             "'anyone with the link can view', or export a CSV and use --csv.")
    return list(csv.DictReader(io.StringIO(text)))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", help="Path to a CSV export of the entries tab.")
    parser.add_argument("--sheet-id", default=DEFAULT_SHEET_ID,
                        help="Spreadsheet ID to read through the gviz CSV export.")
    args = parser.parse_args()
    sheet_url = SHEET_URL.format(args.sheet_id)
    entries = [entry for row in read_rows(args) if (entry := normalize(row, sheet_url))]
    if not entries:
        raise SystemExit("No rows found; keeping the current site.")
    if len({e["id"] for e in entries}) != len(entries):
        raise SystemExit("Duplicate records (same member, category, title and dates).")
    now = datetime.now(timezone(timedelta(hours=9)))
    archive = {"snapshotDate": now.strftime("%Y.%m.%d"), "snapshotAt": now.isoformat(), "entries": entries}
    (ROOT / "data.js").write_text(
        "const ARCHIVE = " + json.dumps(archive, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8")
    print(f"Updated {len(entries)} records from the sheet.")


if __name__ == "__main__":
    main()
