#!/usr/bin/env python3
"""
Apply the QA migrations in order to the Supabase Postgres database,
then optionally seed the first super_admin.

Reads SUPABASE_DB_URL from ../../.env.local.

Usage:
  python apply_migrations.py
  python apply_migrations.py --admin you@example.com
"""
import argparse, os, sys
from pathlib import Path
import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env.local")
DB_URL = os.environ.get("SUPABASE_DB_URL")
MIG_DIR = ROOT / "supabase" / "migrations"

FILES = [
    "001_enums.sql", "002_public_identity.sql", "003_qa_scorecard.sql",
    "004_qa_evaluations.sql", "005_qa_workflow.sql", "006_rls_policies.sql",
    "007_seed_scorecard.sql",
]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--admin", help="email to grant quality super_admin")
    a = ap.parse_args()

    if not DB_URL:
        sys.exit("SUPABASE_DB_URL missing in .env.local")

    with psycopg.connect(DB_URL, autocommit=False) as conn:
        with conn.cursor() as cur:
            for f in FILES:
                path = MIG_DIR / f
                sql = path.read_text(encoding="utf-8")
                print(f"» applying {f} …")
                cur.execute(sql)
            conn.commit()
            print("✓ migrations applied")

            if a.admin:
                email = a.admin.strip().lower()
                cur.execute("""
                    insert into public.profiles (id, email)
                    select id, email from auth.users where lower(email)=%s
                    on conflict (email) do nothing
                """, (email,))
                cur.execute("""
                    insert into public.app_access (email, app, role)
                    values (%s, 'quality', 'super_admin')
                    on conflict (email, app) do update set role='super_admin', archived=false
                """, (email,))
                conn.commit()
                # warn if no auth user yet
                cur.execute("select 1 from auth.users where lower(email)=%s", (email,))
                if not cur.fetchone():
                    print(f"⚠ {email} granted in app_access, but no auth user exists yet — "
                          f"create it in Authentication → Users, then it works on next login.")
                else:
                    print(f"✓ {email} is now quality super_admin")

    print("done.")

if __name__ == "__main__":
    main()
