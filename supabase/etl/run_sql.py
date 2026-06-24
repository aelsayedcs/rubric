#!/usr/bin/env python3
"""
Run a .sql file against the Supabase project via the Management API
(https://api.supabase.com/v1/projects/{ref}/database/query) over HTTPS/IPv4.
Used because the direct Postgres port is IPv6-only on this network.

Usage:  python run_sql.py ../setup.sql
Env (.env.local): SUPABASE_ACCESS_TOKEN (sbp_…), NEXT_PUBLIC_SUPABASE_URL
"""
import os, sys, json, urllib.request
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env.local")

TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN")
URL   = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
REF   = URL.split("://")[-1].split(".")[0] if URL else None

def run_sql(sql: str):
    if not TOKEN or not REF:
        sys.exit("Need SUPABASE_ACCESS_TOKEN and NEXT_PUBLIC_SUPABASE_URL in .env.local")
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{REF}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/124 Safari/537.36",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            body = r.read().decode()
            return True, body
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}: {e.read().decode()}"
    except Exception as e:
        return False, str(e)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: python run_sql.py <file.sql>")
    sql = Path(sys.argv[1]).read_text(encoding="utf-8")
    print(f"Running {sys.argv[1]} on project {REF} via Management API…")
    ok, out = run_sql(sql)
    if ok:
        print("✓ success")
        print(out[:2000])
    else:
        print("✗ failed")
        print(out[:3000])
        sys.exit(1)
