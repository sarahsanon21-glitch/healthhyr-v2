"""Re-derive the control counts and diff them against the baseline.

Run from the repo root, before and after every redesign commit:

    python docs/button-inventory-count.py

A lower number in any column is a failure. Cross-column movement (an <a>
becoming a <button>, say) is not necessarily a loss, but must be reported
and reconciled against the per-page inventory in docs/button-inventory/.

Verified on 2026-10-15 to reproduce docs/button-inventory-before.csv
exactly: 54 of 54 files, all four totals.
"""
import csv
import io
import os
import re

ROOT = "frontend/src"
BASELINE = "docs/button-inventory-before.csv"

PATTERNS = {
    "Buttons": re.compile(r"<button\b", re.I),
    "OnClick": re.compile(r"\bonClick\b"),
    # Both React Router <Link> and raw <a> anchors. Counting <Link> alone
    # gives 53 and misses App.jsx's two footer anchors plus one in Messages.
    "Links": re.compile(r"<Link\b|<a\s"),
    "Submit": re.compile(r"\bonSubmit\b"),
}

# Read the baseline.
base = {}
with io.open(BASELINE, encoding="utf-8-sig") as fh:
    for row in csv.DictReader(fh):
        key = row["File"].replace("\\", "/")
        base[key] = {k: int(row[k]) for k in PATTERNS}

# Count ourselves.
mine = {}
for root, dirs, names in os.walk(ROOT):
    dirs[:] = [d for d in dirs if d not in ("node_modules", "assets")]
    for n in sorted(names):
        if not n.endswith((".jsx", ".js")):
            continue
        path = os.path.join(root, n)
        key = ("frontend/" + os.path.relpath(path, "frontend").replace(os.sep, "/"))
        src = io.open(path, encoding="utf-8", errors="replace").read()
        mine[key] = {k: len(p.findall(src)) for k, p in PATTERNS.items()}

only_base = sorted(set(base) - set(mine))
only_mine = sorted(set(mine) - set(base))
shared = sorted(set(base) & set(mine))

print("baseline rows: %d   files found now: %d   shared: %d"
      % (len(base), len(mine), len(shared)))
if only_base:
    print("\nIn baseline but NOT on disk (%d):" % len(only_base))
    for f in only_base:
        print("   ", f)
if only_mine:
    print("\nOn disk but NOT in baseline (%d):" % len(only_mine))
    for f in only_mine:
        print("   ", f, mine[f])

mismatch = []
for f in shared:
    diffs = {k: (base[f][k], mine[f][k]) for k in PATTERNS if base[f][k] != mine[f][k]}
    if diffs:
        mismatch.append((f, diffs))

print("\nfiles matching exactly : %d / %d" % (len(shared) - len(mismatch), len(shared)))
if mismatch:
    print("\nMISMATCHES (baseline -> mine):")
    for f, d in mismatch:
        parts = ", ".join("%s %d->%d" % (k, a, b) for k, (a, b) in d.items())
        print("   %-52s %s" % (f.replace("frontend/src/", ""), parts))

tot_b = {k: sum(v[k] for v in base.values()) for k in PATTERNS}
tot_m = {k: sum(mine[f][k] for f in shared) for k in PATTERNS}
print("\nTOTALS   baseline: %s" % tot_b)
print("TOTALS   mine    : %s" % tot_m)
