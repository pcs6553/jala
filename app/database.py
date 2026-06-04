import sqlite3
import os
from flask import g, current_app


def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(
            current_app.config['DATABASE'],
            check_same_thread=False
        )
        g.db.row_factory = sqlite3.Row
        g.db.execute('PRAGMA journal_mode=WAL')
    return g.db


def close_db(e=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()


def init_db():
    db_path = current_app.config['DATABASE']
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    db = sqlite3.connect(db_path, check_same_thread=False)
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('''
        CREATE TABLE IF NOT EXISTS bills (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            society_name    TEXT    NOT NULL,
            tenant_name     TEXT    NOT NULL,
            flat_number     TEXT    NOT NULL,
            floor           TEXT    NOT NULL,
            mobile          TEXT    DEFAULT '',
            meter_number    TEXT    NOT NULL,
            billing_month   TEXT    NOT NULL,
            last_reading    REAL    NOT NULL,
            present_reading REAL    NOT NULL,
            units_consumed  REAL    NOT NULL,
            rate_per_unit   REAL    NOT NULL,
            total_amount    REAL    NOT NULL,
            remarks         TEXT    DEFAULT '',
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Additive migration for databases created before mobile/remarks existed.
    existing = {row[1] for row in db.execute('PRAGMA table_info(bills)').fetchall()}
    for col in ('mobile', 'remarks'):
        if col not in existing:
            db.execute(f"ALTER TABLE bills ADD COLUMN {col} TEXT DEFAULT ''")

    db.commit()
    db.close()
