"""Copy images still hosted on Buildy's storage into public/media and point the code at the copies.

Site pages use the relative path /media/<file>. Edge functions (emails) need a full
URL, so they use https://sivanshanivet.com/media/<file>.
"""
import hashlib
import pathlib
import re
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
PATTERN = re.compile(r"https://ellprnxjjzatijdxcogk\.supabase\.co/storage/v1/object/public/[^\"'\s)`]+")
FILES = [p for d in ("src", "supabase/functions", "public") for p in (ROOT / d).rglob("*") if p.suffix in {".ts", ".tsx", ".html", ".css", ".json"}]
FILES.append(ROOT / "index.html")
MEDIA = ROOT / "public" / "media"
MEDIA.mkdir(parents=True, exist_ok=True)

local = {}
for path in FILES:
    for url in PATTERN.findall(path.read_text(encoding="utf-8")):
        if url in local:
            continue
        name = url.rsplit("/", 1)[-1].split("?")[0]
        stem, dot, ext = name.rpartition(".")
        name = f"{hashlib.sha1(url.encode()).hexdigest()[:8]}-{(stem or ext)[-40:]}.{ext if dot else 'png'}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                (MEDIA / name).write_bytes(res.read())
        except Exception as error:  # leave this reference as it is
            print("FAILED", url, error)
            continue
        local[url] = name
        print("copied", name)

for path in FILES:
    text = path.read_text(encoding="utf-8")
    absolute = "supabase/functions" in str(path)
    new = PATTERN.sub(lambda m: ("https://sivanshanivet.com" if absolute else "") + "/media/" + local[m.group(0)] if m.group(0) in local else m.group(0), text)
    if new != text:
        path.write_text(new, encoding="utf-8")
        print("updated", path.relative_to(ROOT))
print(len(local), "images")
