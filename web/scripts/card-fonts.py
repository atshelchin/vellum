#!/usr/bin/env python3
"""
Cuts the faces a share card is set in, and measures them.

A card is drawn in the Worker, which has no fonts of its own, so the faces that
write Latin, Cyrillic, Greek and Vietnamese travel with the site: the same
text face and the same serif the book is set in, cut down to those writings.
(Every other writing has a face of its own, which the Worker reads a piece at
a time from the same files a browser is sent: see `src/lib/server/card/fonts.ts`.)

This writes, into `src/lib/server/card/`:

    VellumText.ttf        Literata Regular
    VellumTextItalic.ttf  Literata Italic
    VellumSerif.ttf       Cormorant Garamond SemiBold, with lining figures
    VellumItalic.ttf      Cormorant Garamond Medium Italic, with lining figures
    widths.json           how wide each letter of each is, in ems

Each is renamed, so that nothing on the machine that draws a card can be taken
for it. Cormorant's figures are old-style unless asked otherwise, and whatever
draws a card cannot ask, so the lining ones are put where the old ones were.

    pip install fonttools brotli
    python3 scripts/card-fonts.py

Run it from `web/`. It fetches the faces from Google Fonts, which hands a very
old browser one whole TrueType file.
"""

import json
import pathlib
import re
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont

OUT = pathlib.Path("src/lib/server/card")

# Only a very old browser is sent plain TrueType, whole.
OLD_BROWSER = (
    "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 "
    "(KHTML, like Gecko) Version/5.0.5 Safari/533.21.1"
)

FACES = {
    "text": ("Vellum Text", "VellumText", "Literata:wght@400", False),
    "textItalic": ("Vellum Text Italic", "VellumTextItalic", "Literata:ital,wght@1,400", False),
    "serif": ("Vellum Serif", "VellumSerif", "Cormorant+Garamond:wght@600", True),
    "italic": ("Vellum Italic", "VellumItalic", "Cormorant+Garamond:ital,wght@1,500", True),
}

# The writing these faces are kept for: Latin with its accents, Greek,
# Cyrillic, Vietnamese, and the marks and signs that go with them.
KEPT = [
    (0x0020, 0x007E),  # Basic Latin
    (0x00A0, 0x024F),  # Latin-1, Latin Extended A and B
    (0x02B0, 0x02FF),  # spacing modifiers
    (0x0300, 0x036F),  # combining marks
    (0x0370, 0x03FF),  # Greek
    (0x0400, 0x052F),  # Cyrillic and its supplement
    (0x1E00, 0x1EFF),  # Latin Extended Additional: Vietnamese
    (0x1F00, 0x1FFF),  # Greek with its breathings
    (0x2000, 0x206F),  # general punctuation
    (0x20A0, 0x20BF),  # currency
    (0x2100, 0x214F),  # letterlike: the numero sign, the trade mark
    (0x2190, 0x2193),  # the four arrows
    (0x2212, 0x2212),  # a true minus
]


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": OLD_BROWSER})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def source(family: str) -> bytes:
    css = fetch(f"https://fonts.googleapis.com/css2?family={family}").decode()
    found = re.search(r"url\((https://fonts\.gstatic\.com/[^)]+)\)", css)
    if not found:
        raise SystemExit(f"Google Fonts gave no file for {family}")
    return fetch(found.group(1))


def lining_figures(font: TTFont) -> None:
    """Puts the lining figures where the old-style ones are: what `lnum` would do, done for good."""
    table = font["GSUB"].table
    swaps: dict[str, str] = {}
    for record in table.FeatureList.FeatureRecord:
        if record.FeatureTag != "lnum":
            continue
        for index in record.Feature.LookupListIndex:
            for sub in table.LookupList.Lookup[index].SubTable:
                if hasattr(sub, "ExtSubTable"):
                    sub = sub.ExtSubTable
                swaps.update(getattr(sub, "mapping", {}))
    if not swaps:
        raise SystemExit("this face has no lining figures to put in")
    for cmap in font["cmap"].tables:
        for code, glyph in list(cmap.cmap.items()):
            if glyph in swaps:
                cmap.cmap[code] = swaps[glyph]


def rename(font: TTFont, family: str, postscript: str) -> None:
    for record in font["name"].names:
        if record.nameID in (1, 16):
            record.string = family
        elif record.nameID in (2, 17):
            record.string = "Regular"
        elif record.nameID == 4:
            record.string = family
        elif record.nameID == 6:
            record.string = postscript
    # One weight of each, asked for by name alone.
    font["OS/2"].usWeightClass = 400
    font["OS/2"].fsSelection = (font["OS/2"].fsSelection & ~0b100001) | 0b1000000
    font["head"].macStyle = 0
    if "post" in font:
        font["post"].italicAngle = font["post"].italicAngle


def cut(font: TTFont) -> None:
    kept = {code for first, last in KEPT for code in range(first, last + 1)}
    options = subset.Options()
    options.layout_features = ["kern", "mark", "mkmk", "ccmp", "locl", "liga", "calt"]
    options.hinting = False
    options.desubroutinize = True
    options.name_IDs = [1, 2, 4, 6, 13, 14]
    options.notdef_outline = True
    cutter = subset.Subsetter(options)
    cutter.populate(unicodes=kept & set(font.getBestCmap()))
    cutter.subset(font)


def main() -> None:
    widths: dict[str, dict[str, float]] = {}
    for key, (family, postscript, wanted, figures) in FACES.items():
        path = OUT / f"{postscript}.ttf"
        whole = OUT / f".{postscript}.whole.ttf"
        whole.write_bytes(source(wanted))
        font = TTFont(whole)
        if figures:
            lining_figures(font)
        cut(font)
        rename(font, family, postscript)
        font.save(path)
        whole.unlink()

        font = TTFont(path)
        em = font["head"].unitsPerEm
        metrics = font["hmtx"]
        widths[key] = {
            chr(code): round(metrics[glyph][0] / em, 3)
            for code, glyph in sorted(font.getBestCmap().items())
            # A mark that sits on a letter takes no room of its own.
            if not 0x0300 <= code <= 0x036F
        }
        print(f"{path}: {path.stat().st_size:,} bytes, {len(widths[key])} letters")

    (OUT / "widths.json").write_text(
        json.dumps(widths, ensure_ascii=False, indent="\t") + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
