#!/usr/bin/env python3
"""Generate pronunciation audio with Edge TTS (free, no key).

Usage:  python3 scripts/generate-audio.py
Needs:  pip install edge-tts

Writes public/audio/<chapterId>/<entryIndex>.mp3 (word) and <entryIndex>-ex.mp3 (example).
public/audio/manifest.json remembers the text of each clip, so only new or changed
entries are generated on later runs.
"""
import asyncio
import json
import re
from pathlib import Path

import edge_tts

VOICE = "de-DE-SeraphinaMultilingualNeural"
RATE = "-10%"
ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"
OUT = ROOT / "public" / "audio"
MANIFEST = OUT / "manifest.json"


def speech_text(entry):
    # Mirrors speechText() in src/app.js.
    return re.sub(r"\(.*?\)", "", entry.get("word", "")).split("/")[0].strip()


def jobs():
    index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
    chapters = index if isinstance(index, list) else index["chapters"]
    for meta in chapters:
        chapter = json.loads((DATA / meta["file"]).read_text(encoding="utf-8"))
        for i, entry in enumerate(chapter.get("entries", [])):
            word = speech_text(entry)
            if word:
                yield f"{chapter['id']}/{i}.mp3", word
            example = (entry.get("example") or "").strip()
            if example:
                yield f"{chapter['id']}/{i}-ex.mp3", example


async def main():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    todo = [(name, text) for name, text in jobs() if manifest.get(name) != text or not (OUT / name).exists()]
    print(f"{len(todo)} clips to generate")
    sem = asyncio.Semaphore(4)
    done = 0

    async def run(name, text):
        nonlocal done
        path = OUT / name
        path.parent.mkdir(parents=True, exist_ok=True)
        async with sem:
            for attempt in range(4):
                try:
                    await edge_tts.Communicate(text, VOICE, rate=RATE).save(str(path))
                    manifest[name] = text
                    break
                except Exception as error:  # network hiccup, retry
                    if attempt == 3:
                        print("FAILED", name, error)
                    await asyncio.sleep(2 * (attempt + 1))
        done += 1
        if done % 50 == 0:
            print(f"{done}/{len(todo)}")
            MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=0), encoding="utf-8")

    await asyncio.gather(*(run(n, t) for n, t in todo))
    OUT.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=0), encoding="utf-8")
    print("done")


asyncio.run(main())
