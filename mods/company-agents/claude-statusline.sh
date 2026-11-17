#!/bin/sh
# Claude Code status line for Pixel HQ. Claude hands this script a JSON blob on stdin after every turn;
# it tells Herdr how full the context is (label claude.context, 0-100), how much of the 5-hour window is left (claude.quota, 0-100)
# and the effort level (claude.effort) so the desk can show HP/SP bars, and prints a short status.
# Also clears the labels when Claude stops reporting them, so a stale number never outlives its source.
# Needs python3. Outside a Herdr terminal it only prints the status.
input=$(cat)
fields=$(printf '%s' "$input" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    if not isinstance(d, dict):
        d = {}
except Exception:
    d = {}

def clean(v):
    if not isinstance(v, str):
        v = "" if v is None else str(v)
    out = []
    for ch in v:
        o = ord(ch)
        if o <= 31 or o == 127:
            continue
        out.append(ch)
    return "".join(out).replace("|", "·")

m = (d.get("model") if isinstance(d.get("model"), dict) else {}) or {}
m = clean(m.get("display_name") or "")
c = (d.get("context_window") if isinstance(d.get("context_window"), dict) else {}) or {}
p = c.get("used_percentage")
if p is None:
    # older Claude Code: estimate from the last assistant message in the transcript
    try:
        last = None
        for line in open(clean(d.get("transcript_path") or "") or "/nonexistent"):
            try:
                u = (json.loads(line).get("message") or {}).get("usage")
            except Exception:
                u = None
            if u:
                last = u
        if last:
            used = last.get("input_tokens", 0) + last.get("cache_read_input_tokens", 0) + last.get("cache_creation_input_tokens", 0)
            size = 1000000 if "1m" in clean((d.get("model") or {}).get("id", "") if isinstance(d.get("model"), dict) else "").lower() else 200000
            p = used * 100.0 / size
    except Exception:
        pass
pct = str(max(0, min(100, int(round(p))))) if isinstance(p, (int, float)) else ""
rl = d.get("rate_limits") if isinstance(d.get("rate_limits"), dict) else {}
five = rl.get("five_hour") if isinstance(rl.get("five_hour"), dict) else {}
q = five.get("used_percentage")
if isinstance(q, (int, float)) and 0 <= q <= 100:
    q = str(int(round(100 - q)))
else:
    q = ""
eff = d.get("effort") if isinstance(d.get("effort"), dict) else {}
e = clean(eff.get("level") or "")
print(pct + "|" + m + "|" + q + "|" + e)
' 2>/dev/null)
pct=${fields%%\|*}; rest=${fields#*\|}; model=${rest%%\|*}; rest=${rest#*\|}; quota=${rest%%\|*}; effort=${rest#*\|}

if [ -n "$HC_TERMINAL_ID" ] && command -v hc >/dev/null 2>&1; then
  if [ -n "$pct" ]; then hc label "$HC_TERMINAL_ID" "claude.context=$pct" "claude.model=$model" >/dev/null 2>&1 &
  else hc label "$HC_TERMINAL_ID" "claude.context=" "claude.model=" >/dev/null 2>&1 & fi
  if [ -n "$quota" ]; then hc label "$HC_TERMINAL_ID" "claude.quota=$quota" >/dev/null 2>&1 &
  else hc label "$HC_TERMINAL_ID" "claude.quota=" >/dev/null 2>&1 & fi
  if [ -n "$effort" ]; then hc label "$HC_TERMINAL_ID" "claude.effort=$effort" >/dev/null 2>&1 &
  else hc label "$HC_TERMINAL_ID" "claude.effort=" >/dev/null 2>&1 & fi
fi
if [ -n "$pct" ]; then
  if [ -n "$quota" ]; then printf '%s · %s%% context · %s%% 5h left' "$model" "$pct" "$quota"; else printf '%s · %s%% context' "$model" "$pct"; fi
else printf '%s' "$model"
fi
