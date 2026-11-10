#!/usr/bin/env python3
"""
Standalone Garmin -> files fetcher for the solace "Sync Garmin" button.

This is the standalone fetch half of the Garmin sync.
It reuses the cached garth OAuth token (the SAME one the garmin MCP uses) and the SAME
field mappings as Taxuspt/garmin_mcp, then writes the two artifact files the existing
Node ingest pipeline already understands:

  1. Garmin run FIT files -> <runs-dir>/<activity_id>.fit   (deduped downstream by hash)
  2. the rolling wellness -> <wellness-file>                (merged, garmin-mcp.json shape)

It does NOT touch the database. The Node orchestrator (`syncGarmin` in @solace/data)
computes the date windows, runs this, then ingests the files + recomputes stats.

stdout is a SINGLE JSON object (the run summary). On auth failure it exits non-zero with
{"ok": false, "error": "auth", ...} so the caller can tell the user to re-auth. Human
progress goes to stderr.

Invoked as:
  uv run --python 3.12 --with garminconnect==0.3.2 python garmin_fetch.py <args>
(garminconnect is pinned to match Taxuspt/garmin_mcp so the cached token store loads cleanly.)
"""
import argparse
import gzip
import io
import json
import os
import sys
import zipfile
from datetime import date, timedelta


def log(*a):
    print(*a, file=sys.stderr)


def emit_fail(error, message, code):
    # The summary contract for the Node side: ok=false + a stable `error` tag.
    print(json.dumps({"ok": False, "error": error, "message": message}))
    sys.exit(code)


def extract_fit_bytes(raw):
    """Garmin's ORIGINAL download is usually a ZIP holding one .fit; sometimes gzip; sometimes raw.

    Ported verbatim from garmin_mcp.activity_analysis._extract_fit_bytes so the FIT we
    write is byte-identical to what the MCP download path produces.
    Adapted from garmin_mcp (https://github.com/Taxuspt/garmin_mcp), MIT License, Copyright (c) 2025 Alexandre Domingues.
    """
    if raw[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(raw)) as zf:
            names = [n for n in zf.namelist() if n.lower().endswith(".fit")]
            if not names:
                raise ValueError("ZIP archive contains no .fit files")
            return zf.read(names[0])
    if raw[:2] == b"\x1f\x8b":
        return gzip.decompress(raw)
    return raw


def date_range(start_iso, end_iso):
    s = date.fromisoformat(start_iso)
    e = date.fromisoformat(end_iso)
    d = s
    while d <= e:
        yield d.isoformat()
        d += timedelta(days=1)


def pos(v):
    """Keep only real, positive numbers; everything else (None / 0 / "No data") -> None.

    This is the deterministic form of the original manual sync procedure's "omit any metric whose source returns
    no data; never write 0 as a placeholder" rule. Integral floats (Garmin returns RHR as
    58.0) are coerced to int so the rolling file stays tidy (58, not 58.0).
    """
    if isinstance(v, bool) or not isinstance(v, (int, float)) or v <= 0:
        return None
    return int(v) if isinstance(v, float) and v.is_integer() else v


def fetch_runs(g, dl_fmt, query_start, after, today, runs_dir):
    """Download FIT for running activities in [query_start, today] with date strictly > `after`."""
    os.makedirs(runs_dir, exist_ok=True)
    try:
        activities = g.get_activities_by_date(query_start, today, "running") or []
    except Exception as e:  # noqa: BLE001 — surface as a fetch error to the Node side
        raise RuntimeError("get_activities_by_date failed: %s" % e)

    new_runs = []
    for a in activities:
        start_local = a.get("startTimeLocal") or ""
        d = start_local[:10]
        # `after` is the runs high-water mark (a calendar DATE). Include the boundary day itself (`< after`,
        # not `<= after`) so a SECOND run logged on the latest-imported day isn't lost; the downstream
        # FIT-hash dedupe drops the already-imported run, so re-including its day is safe.
        if not d or d < after:
            continue
        aid = a.get("activityId")
        if aid is None:
            continue
        path = os.path.join(runs_dir, "%s.fit" % aid)
        if not os.path.exists(path):
            raw = g.download_activity(aid, dl_fmt=dl_fmt)
            if not raw:
                log("no FIT bytes returned for activity %s" % aid)
                continue
            payload = extract_fit_bytes(bytes(raw))
            # Write atomically (temp + rename) so a timeout-killed mid-write can't leave a truncated .fit
            # that os.path.exists() would then treat as already-downloaded and never re-fetch.
            tmp = path + ".tmp"
            with open(tmp, "wb") as f:
                f.write(payload)
            os.replace(tmp, path)
            log("downloaded run %s (%s) -> %s" % (aid, d, path))
        new_runs.append({"id": aid, "date": d, "file": os.path.abspath(path)})
    return new_runs


def fetch_wellness_day(g, d):
    """The 4 metrics for one day, using garmin_mcp's exact field paths. Omits anything unsettled."""
    out = {}

    # HRV overnight -> hrvSummary.lastNightAvg  (garmin_mcp training.get_hrv_data)
    try:
        hrv = g.get_hrv_data(d) or {}
        v = pos((hrv.get("hrvSummary") or {}).get("lastNightAvg"))
        if v is not None:
            out["hrvOvernightMs"] = v
    except Exception as e:  # noqa: BLE001
        log("hrv %s: %s" % (d, e))

    # Sleep score -> dailySleepDTO.sleepScores.overall.value  (garmin_mcp get_sleep_summary)
    try:
        sleep = g.get_sleep_data(d) or {}
        daily = sleep.get("dailySleepDTO") or {}
        v = pos(((daily.get("sleepScores") or {}).get("overall") or {}).get("value"))
        if v is not None:
            out["sleepScore"] = v
    except Exception as e:  # noqa: BLE001
        log("sleep %s: %s" % (d, e))

    # Daily stats give body battery morning peak + a resting-HR fallback.
    stats = {}
    try:
        stats = g.get_stats(d) or {}
    except Exception as e:  # noqa: BLE001
        log("stats %s: %s" % (d, e))

    # Body battery = bodyBatteryHighestValue (the morning peak), per the sync's convention.
    bb = pos(stats.get("bodyBatteryHighestValue"))
    if bb is not None:
        out["bodyBattery"] = bb

    # Resting HR: prefer get_rhr_day's metric, fall back to stats.restingHeartRate.
    rhr = None
    try:
        rd = g.get_rhr_day(d) or {}
        arr = (((rd.get("allMetrics") or {}).get("metricsMap") or {}).get("WELLNESS_RESTING_HEART_RATE")) or []
        if arr:
            rhr = pos(arr[0].get("value"))
    except Exception as e:  # noqa: BLE001
        log("rhr %s: %s" % (d, e))
    if rhr is None:
        rhr = pos(stats.get("restingHeartRate"))
    if rhr is not None:
        out["restingHrBpm"] = rhr

    return out


def merge_wellness(path, fresh):
    """Fold freshly-fetched days into the rolling file: per-field, non-null new value wins.

    Mirrors the original manual sync procedure's merge: read existing, upsert by date, drop empty days, sort, trailing newline.
    """
    existing = {"source": "garmin_mcp", "days": []}
    if os.path.exists(path):
        try:
            with open(path) as f:
                existing = json.load(f)
        except Exception as e:  # noqa: BLE001 — a corrupt file shouldn't abort the sync
            log("could not read existing wellness file (%s); starting fresh" % e)

    by_date = {}
    for day in existing.get("days", []):
        if isinstance(day, dict) and day.get("date"):
            by_date[day["date"]] = dict(day)

    touched = []
    for d, metrics in fresh.items():
        if not metrics:  # nothing settled for this day yet — leave it out (no false rock-bottom rows)
            continue
        cur = by_date.get(d, {"date": d})
        for k, v in metrics.items():
            if v is not None:
                cur[k] = v
        by_date[d] = cur
        touched.append(d)

    days = [by_date[k] for k in sorted(by_date)]
    out = {"source": "garmin_mcp", "days": days}
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    # Atomic rewrite: this rolling file aggregates merged wellness history, so a half-written file would
    # corrupt it and silently drop out-of-window days. Write a temp then os.replace (atomic on POSIX).
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(out, f, indent=2)
        f.write("\n")
    os.replace(tmp, path)
    return sorted(set(touched))


def main():
    ap = argparse.ArgumentParser(description="Fetch new Garmin runs + wellness into the rolling artifacts.")
    ap.add_argument("--today", required=True, help="upper bound (inclusive), YYYY-MM-DD")
    ap.add_argument("--runs-query-start", required=True, help="lower bound for the activity query, YYYY-MM-DD")
    ap.add_argument("--runs-after", required=True, help="import runs with date strictly greater than this, YYYY-MM-DD")
    ap.add_argument("--wellness-start", required=True, help="first wellness date (inclusive), YYYY-MM-DD")
    ap.add_argument("--runs-dir", required=True)
    ap.add_argument("--wellness-file", required=True)
    ap.add_argument("--tokens", default="~/.garminconnect", help="garth token store dir")
    args = ap.parse_args()

    try:
        from garminconnect import Garmin
    except Exception as e:  # noqa: BLE001
        emit_fail("import", "garminconnect import failed: %s" % e, 1)

    token_dir = os.path.expanduser(args.tokens)
    if not os.path.exists(token_dir):
        emit_fail("auth", "token store not found: %s" % token_dir, 2)

    try:
        g = Garmin()
        g.login(token_dir)
        g.get_full_name()  # cheap authenticated call — surfaces an expired token up front
    except Exception as e:  # noqa: BLE001
        msg = str(e).splitlines()[0][:200] if str(e) else repr(e)
        emit_fail("auth", "Garmin login expired (see the README, Garmin sync; run: uvx --python 3.12 --from git+https://github.com/Taxuspt/garmin_mcp@0.1.0 garmin-mcp-auth --force-reauth): %s" % msg, 2)

    try:
        new_runs = fetch_runs(
            g,
            Garmin.ActivityDownloadFormat.ORIGINAL,
            args.runs_query_start,
            args.runs_after,
            args.today,
            os.path.expanduser(args.runs_dir),
        )
    except Exception as e:  # noqa: BLE001
        emit_fail("fetch", str(e), 1)

    fresh = {d: fetch_wellness_day(g, d) for d in date_range(args.wellness_start, args.today)}
    touched = merge_wellness(os.path.expanduser(args.wellness_file), fresh)

    print(json.dumps({
        "ok": True,
        "newRuns": new_runs,
        "wellnessDays": touched,
        "windows": {
            "runsQueryStart": args.runs_query_start,
            "runsAfter": args.runs_after,
            "wellnessStart": args.wellness_start,
            "today": args.today,
        },
    }))


if __name__ == "__main__":
    main()
