"""Service de statistiques, en Python, branché sur la même base Postgres que
l'API Node. Il ne fait qu'un GROUP BY en lecture seule sur la table `tasks` :
pas de logique métier dupliquée avec l'API, seulement de l'agrégation.

Toute la configuration vient de variables d'environnement (mêmes conventions
que l'API Node : DATABASE_URL, ou PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE).
"""

from __future__ import annotations

import os
import time
import logging

import psycopg
from psycopg.rows import dict_row
from flask import Flask, jsonify

logging.basicConfig(level=logging.INFO, format="[stats-service] %(message)s")
logger = logging.getLogger(__name__)


def get_dsn() -> str:
    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        return database_url
    return (
        f"host={os.environ.get('PGHOST', 'localhost')} "
        f"port={os.environ.get('PGPORT', '5432')} "
        f"user={os.environ.get('PGUSER', 'postgres')} "
        f"password={os.environ.get('PGPASSWORD', '')} "
        f"dbname={os.environ.get('PGDATABASE', 'postgres')}"
    )


def get_connection():
    """Ouvre une connexion à la demande plutôt que de garder un pool global :
    service à faible trafic, la simplicité prime. Robuste à une base pas
    encore prête : lève une exception explicite, jamais un crash silencieux.
    """
    return psycopg.connect(get_dsn(), connect_timeout=5, row_factory=dict_row)


def wait_for_db(retries: int = 10, delay_seconds: float = 2.0) -> None:
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            with get_connection() as conn:
                conn.execute("SELECT 1")
            logger.info("connexion PostgreSQL établie")
            return
        except Exception as exc:  # noqa: BLE001 - on veut logguer puis retenter
            last_error = exc
            logger.warning(
                "tentative %s/%s échouée (%s), nouvelle tentative dans %.1fs",
                attempt,
                retries,
                exc,
                delay_seconds,
            )
            time.sleep(delay_seconds)
    raise RuntimeError("Impossible de joindre PostgreSQL") from last_error


def create_app() -> Flask:
    app = Flask(__name__)

    @app.get("/health")
    def health():
        return jsonify(status="ok", timestamp=time.time())

    @app.get("/stats")
    def stats():
        try:
            with get_connection() as conn:
                total = conn.execute("SELECT count(*) AS total FROM tasks").fetchone()["total"]
                by_status_rows = conn.execute(
                    "SELECT status, count(*) AS count FROM tasks GROUP BY status"
                ).fetchall()
                bounds = conn.execute(
                    "SELECT min(created_at) AS oldest, max(created_at) AS newest FROM tasks"
                ).fetchone()
        except Exception as exc:  # noqa: BLE001
            logger.error("erreur lors du calcul des statistiques : %s", exc)
            return jsonify(error="Base de données indisponible."), 503

        by_status = {"pending": 0, "in_progress": 0, "done": 0}
        for row in by_status_rows:
            by_status[row["status"]] = row["count"]

        return jsonify(
            total=total,
            byStatus=by_status,
            oldestTaskAt=bounds["oldest"].isoformat() if bounds["oldest"] else None,
            newestTaskAt=bounds["newest"].isoformat() if bounds["newest"] else None,
        )

    return app


app = create_app()

if __name__ == "__main__":
    wait_for_db(
        retries=int(os.environ.get("DB_CONNECT_RETRIES", "10")),
        delay_seconds=float(os.environ.get("DB_CONNECT_DELAY_MS", "2000")) / 1000,
    )
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port)
