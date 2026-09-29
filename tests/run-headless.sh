#!/usr/bin/env bash
# Cybersprouts — run the placement test simulation without opening a browser.
#
#   ./run-headless.sh --compare   before/after the recheck fix
#   ./run-headless.sh          scenario matrices + rule variants
#   ./run-headless.sh --sweep  also run the exhaustive 65,536-profile sweep
#   ./run-headless.sh --save   also write report.html / report.txt next to this
#                              script, so the findings can be reopened later
#                              without running anything (combine with --sweep)
#
# The harness needs a real DOM, because its whole point is that it clicks the
# actual placement UI rather than re-implementing the rules. So this drives
# headless Chrome and pulls the plain-text report back out of the page.
#
# No Chrome? Just open placement-sim.html in any browser and press the button.

set -euo pipefail
cd "$(dirname "$0")"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || CHROME="$(command -v google-chrome || command -v chromium || true)"

if [ -z "${CHROME:-}" ] || [ ! -x "$CHROME" ]; then
  echo "Chrome not found. Open placement-sim.html in a browser instead." >&2
  exit 1
fi

MODE="1"; SAVE=""; PAGE="placement-sim"; STEM="report"
for arg in "$@"; do
  case "$arg" in
    --sweep)   MODE="sweep" ;;
    --save)    SAVE="1" ;;
    --compare) PAGE="placement-compare"; STEM="report-comparison" ;;
    *) echo "unknown option: $arg" >&2; exit 64 ;;
  esac
done
DOM="$(mktemp -t cs-placement-dom)"
trap 'rm -f "$DOM"' EXIT

"$CHROME" --headless=new --disable-gpu --no-sandbox --allow-file-access-from-files \
          --virtual-time-budget=180000 --dump-dom \
          "file://$PWD/$PAGE.html?auto=$MODE" > "$DOM" 2>/dev/null

python3 - "$DOM" "${SAVE:-}" "$STEM" <<'PY'
import html, re, sys
page = open(sys.argv[1]).read()
save = len(sys.argv) > 2 and sys.argv[2] == "1"
stem = sys.argv[3] if len(sys.argv) > 3 else "report"

banner = re.search(r'<div class="verify (\w+)">(.*?)</div>', page, re.S)
report = re.search(r'<pre class="report">(.*?)</pre>', page, re.S)

if not report:
    status = re.search(r'<div id="status">(.*?)</div>', page, re.S)
    print("The harness did not finish. Last status:",
          html.unescape(status.group(1)).strip() if status else "(none)")
    sys.exit(1)

print(html.unescape(report.group(1)))

if save:
    with open(stem + ".txt", "w") as f:
        f.write(html.unescape(report.group(1)) + "\n")

    # A standalone snapshot: strip the scripts so reopening it just shows the
    # findings instead of re-running the whole simulation, and drop the hidden
    # stage the real quiz was driven on.
    snap = re.sub(r'<script\b.*?</script>', '', page, flags=re.S)
    snap = re.sub(r'<div id="stage">.*?</div>\s*</body>', '</body>', snap, flags=re.S)
    snap = re.sub(r'<button id="run">.*?</button>', '', snap)
    snap = re.sub(r'<button id="sweep".*?</button>',
                  '<p class="sub" style="margin-bottom:22px">Saved snapshot &mdash; regenerate with '
                  '<code>./run-headless.sh --sweep --save</code>, or open the matching '
                  '<code>.html</code> harness to run it live.</p>', snap)
    with open(stem + ".html", "w") as f:
        f.write(snap)
    print("\nSaved: tests/%s.html and tests/%s.txt" % (stem, stem), file=sys.stderr)

# Exit non-zero if the model and the real UI disagreed, so this is usable in CI.
sys.exit(0 if banner and banner.group(1) == 'ok' else 2)
PY
