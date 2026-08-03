# projet_fil_rouge — Todo API

API REST de gestion de tâches (CRUD complet), démarrée ce matin comme un "hello"
Node.js dockerisé à la truelle, et transformée au fil de la journée en une
petite stack conteneurisée complète : API Node/Express + PostgreSQL persistant
+ service de statistiques Python, réseau isolé, configuration 100% externalisée,
images publiées sur un registry.

## Démarrage rapide

```bash
git clone https://github.com/alxmsa/projet_fil_rouge.git
cd projet_fil_rouge
cp .env.example .env        # puis ajuster les secrets si besoin
docker compose up -d --build
curl http://localhost:3000/health
```

La stack complète (API + PostgreSQL + service de stats) démarre avec cette
seule commande. Aucune ligne de configuration n'est en dur dans le code :
tout passe par `.env` (voir `.env.example` pour la liste complète des variables).

## Les routes

Toutes les routes de tâches sont sous `/api/tasks` :

| Méthode | Route | Description |
|---|---|---|
| POST | `/api/tasks` | créer une tâche |
| GET | `/api/tasks` | lister toutes les tâches |
| GET | `/api/tasks/:id` | voir une tâche |
| PUT | `/api/tasks/:id` | modifier une tâche |
| DELETE | `/api/tasks/:id` | supprimer une tâche |

Une `Task` : `{ id: uuid, description: string, status: "pending"|"in_progress"|"done", createdAt, updatedAt }`.

`GET /health` renvoie `{ status: "ok", timestamp }` — utilisé par le
`HEALTHCHECK` Docker et par `depends_on: condition: service_healthy`.

## Tests de l'API (à la main)

```bash
# Création puis lecture
curl -X POST localhost:3000/api/tasks -H 'Content-Type: application/json' \
  -d '{"description":"Écrire le README"}'
curl localhost:3000/api/tasks

# 404 propre sur un id inexistant
curl -i localhost:3000/api/tasks/3fa85f64-5717-4562-b3fc-2c963f66afa6

# 400 propre sur un JSON malformé
curl -i -X POST localhost:3000/api/tasks -H 'Content-Type: application/json' \
  -d '{"description": "oops'
```

## Journal de bord

Une entrée par chapitre : ce qui a été mesuré, ce qui a cassé, et pourquoi.

### Le socle : la Todo API

CRUD testé avec les 3 cas demandés, tous passent : création + lecture renvoie
bien la tâche avec son id généré, un `GET` sur un id inexistant renvoie un 404
JSON propre (jamais de crash du process), un corps JSON malformé ou une
description surdimensionnée renvoie un 400 clair.

Le bug volontairement introduit par l'énoncé — une description de 50 000
caractères qui fait planter le process — vient de deux endroits distincts s'ils
ne sont pas gardés séparément : (1) `express.json()` sans limite explicite
accepte n'importe quelle taille de corps et peut saturer la mémoire du process
sur un flot de requêtes, et (2) même avec une limite au niveau du parseur, rien
n'empêchait une description de 2000 caractères "valides" mais absurdes de passer.
Solution : une limite au niveau du parseur (`express.json({ limit: '100kb' })`,
piloté par `JSON_BODY_LIMIT`) qui rejette tôt avec un 400, doublée d'une
validation explicite de longueur de champ (`MAX_DESCRIPTION_LENGTH = 2000`)
dans `utils/validation.js`. Les deux erreurs (parseur et validation métier)
remontent au même format JSON `{ error, details? }` grâce au error handler
central — pas de fuite de stacktrace, pas de page HTML par défaut d'Express.

### Persistance PostgreSQL & Dockerfile de production

Le tableau en mémoire du matin a été remplacé par un vrai modèle PostgreSQL
(`src/models/task.js` + `src/db.js`, pool `pg`). Le schéma (`db/init.sql`) est
monté dans `/docker-entrypoint-initdb.d` de l'image officielle `postgres`, qui
l'exécute automatiquement au tout premier démarrage — donc seulement si le
volume nommé est vide. Vérifié en pratique : `docker compose down` puis
`docker compose up` sans `-v` conserve les tâches créées ; `docker compose down -v`
les efface, comme attendu.

Le `Dockerfile` de l'API est multi-stage : une étape `deps` fait un `npm ci
--omit=dev` (dépendances de prod uniquement, `--omit=dev` remplace l'ancien
`--only=production` déprécié depuis npm 7), une étape `runtime` repart d'une
image `node:24.18.1-alpine3.24` propre et ne copie que `node_modules` + `src`.
Résultat mesuré : l'image finale ne contient ni `devDependencies` (jest,
supertest, nodemon) ni le dossier `tests/`, exclu via `.dockerignore`.
L'utilisateur `node` (uid 1000, déjà fourni par l'image officielle) est utilisé
explicitement via `USER node` : `docker exec ... whoami` confirme qu'aucun
process ne tourne en root dans le conteneur.

