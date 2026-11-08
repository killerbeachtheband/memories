import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from sync_sheets import normalize, parse_rating

URL = "https://docs.google.com/spreadsheets/d/test/edit"


def row(**overrides):
    base = {"member": "Yamashita", "category": "映画", "title": "テスト映画",
            "originalTitle": "Test Film", "creator": "監督", "rating": "9",
            "tags": "SF, 名作", "experiencedDate": "2026-11-01", "releaseDate": "",
            "hallOfFame": "TRUE", "legacy": "", "note": "よかった", "body": "## 概要\n本文"}
    base.update(overrides)
    return base


class NormalizeTest(unittest.TestCase):
    def test_maps_sheet_row_to_archive_entry(self):
        entry = normalize(row(), URL)
        self.assertEqual(entry["source"], "movies")
        self.assertEqual(entry["label"], "CINEMA")
        self.assertEqual(entry["member"], "Yamashita")
        self.assertEqual(entry["rating"], 9)
        self.assertEqual(entry["ratingLabel"], "9 / 10")
        self.assertTrue(entry["hallOfFame"])
        self.assertFalse(entry["legacy"])
        self.assertEqual(entry["sortDate"], "2026-11-01")
        self.assertEqual(entry["tags"], ["SF", "名作"])
        self.assertEqual(entry["url"], URL)
        self.assertIsNone(entry["cover"])

    def test_blank_title_is_skipped(self):
        self.assertIsNone(normalize(row(title="  "), URL))

    def test_unrated_row(self):
        entry = normalize(row(rating=""), URL)
        self.assertIsNone(entry["rating"])
        self.assertEqual(entry["ratingLabel"], "未評価")

    def test_unknown_category_rejected(self):
        with self.assertRaises(SystemExit):
            normalize(row(category="ポッドキャスト"), URL)

    def test_rating_range_validated(self):
        with self.assertRaises(SystemExit):
            parse_rating("11")
        self.assertEqual(parse_rating("7.5"), 7.5)


if __name__ == "__main__":
    unittest.main()
