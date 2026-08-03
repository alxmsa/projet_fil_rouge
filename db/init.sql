-- Exécuté automatiquement par l'image officielle postgres au premier démarrage
-- du conteneur (dossier monté sur /docker-entrypoint-initdb.d), uniquement si
-- le volume nommé est vide. C'est ce qui garantit un schéma prêt dès le
-- premier docker compose up, sans étape manuelle.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY,
    description VARCHAR(2000) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'done')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
