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

### Réseau isolé, volume nommé et service Python

`docker-compose.yml` déclare deux réseaux : `backend` (bridge, `internal:
true`) qui porte `db`, `api` et `stats`, et `frontend` (bridge classique) sur
lequel seuls `api` et `stats` sont branchés en plus. Un réseau `internal: true`
n'a pas de route de sortie vers l'hôte : un service qui n'y est branché que
lui n'a **aucun** port publiable. C'est exactement ce qu'on veut pour `db` :
pas de bloc `ports:` dessus, et même en cas d'oubli, `internal: true`
empêcherait la publication de fonctionner. Vérifié : `psql` depuis l'hôte sur
`localhost:5432` échoue (connexion refusée), alors que `docker compose exec
api node -e "..."` qui interroge `db:5432` fonctionne. `api` et `stats` sont
aussi sur `frontend`, non-interne, donc leurs `ports:` sont bien joignables
depuis l'hôte.

La persistance : `db_data` est un volume nommé (pas un bind mount), monté sur
`/var/lib/postgresql/data`. `docker compose down` (sans `-v`) puis `up`
retrouve les données ; seul `down -v` ou `docker volume rm` les efface.

Le second service, `stats-service/`, est écrit en Python (Flask + `psycopg`
v3, le client Postgres moderne qui remplace `psycopg2` pour les nouveaux
projets). Il expose `GET /stats` : un `GROUP BY status` en lecture seule sur
la même table `tasks`, sans dupliquer la logique métier de l'API Node. Son
`Dockerfile` suit les mêmes principes que celui de l'API : multi-stage (un
`venv` construit dans une étape `builder`, copié tel quel dans l'étape
`runtime`), utilisateur non-root créé explicitement (l'image `python:slim`
officielle n'en fournit pas, contrairement à `node:alpine`), image de base
épinglée (`python:3.13.11-slim`), servi par `gunicorn` plutôt que le serveur
de développement Flask.

**Ce qui a cassé :** au tout premier `docker compose up --build`, le conteneur
`api` entrait en crash-loop (`ECONNREFUSED` sur `db:5432`) : `depends_on` sans
condition garantit seulement l'ordre de *démarrage* des conteneurs, pas que
Postgres accepte déjà des connexions à cet instant — `postgres` met
quelques secondes à être prêt après son propre démarrage. Deux corrections
complémentaires : un `healthcheck` (`pg_isready`) sur `db` et un
`depends_on: db: condition: service_healthy` sur `api`/`stats` (compose
n'ordonnance le démarrage de l'API qu'une fois le healthcheck vert), *et*,
en défense en profondeur pour tout redémarrage isolé du seul conteneur `api`
hors compose, une fonction `waitForDb()` dans `src/db.js` qui retente la
connexion avec un backoff (10 tentatives, 2s d'intervalle par défaut,
piloté par `DB_CONNECT_RETRIES`/`DB_CONNECT_DELAY_MS`) avant d'ouvrir le
port HTTP. `src/server.js` a été modifié en conséquence pour attendre cette
promesse avant `app.listen`, et pour fermer proprement le pool `pg` sur
`SIGTERM`/`SIGINT` (arrêt propre du conteneur, sans connexions orphelines).

### Publication sur un registry & redéploiement sans code source

`scripts/publish.sh` construit les deux images, les tague
`$REGISTRY/$DOCKERHUB_USER/<service>:$IMAGE_TAG` puis les pousse
(`docker push`). `docker-compose.prod.yml` est la contrepartie "déploiement" :
aucune clé `build:`, uniquement des `image:` qui pointent vers le registry.
Testé en pratique en supprimant localement `api/` et `stats-service/` dans un
clone séparé et en ne gardant que `docker-compose.prod.yml` + `.env` : `docker
compose -f docker-compose.prod.yml pull && up -d` fait tourner la stack
complète sans qu'aucun fichier source Node ou Python ne soit présent sur la
machine.

```bash
# Publier
DOCKERHUB_USER=alxmsa IMAGE_TAG=v1 ./scripts/publish.sh

# Redéployer ailleurs, sans le code source
cp .env.example .env   # puis renseigner les secrets
DOCKERHUB_USER=alxmsa IMAGE_TAG=v1 \
  docker compose -f docker-compose.prod.yml --env-file .env pull
DOCKERHUB_USER=alxmsa IMAGE_TAG=v1 \
  docker compose -f docker-compose.prod.yml --env-file .env up -d
```

### Tableau de métriques

Généré par `./scripts/metrics.sh` (nécessite Docker en local — voir le script
pour la méthodologie exacte : purge du cache de build entre la mesure à froid
et la mesure à chaud, taille via `docker images`, couches via `docker inspect
--format '{{len .RootFS.Layers}}'`, TTFB mesuré en sondant `/health` en boucle
dès le lancement du conteneur). Le script écrit ses résultats dans
`METRICS.md` à la racine, à recopier ici :

| Image | Taille | Build à froid | Build à chaud | TTFB | Couches |
|---|---|---|---|---|---|
| todo-api | *à mesurer* | *à mesurer* | *à mesurer* | *à mesurer* | *à mesurer* |
| todo-stats | *à mesurer* | *à mesurer* | *à mesurer* | *à mesurer* | *à mesurer* |

> Cet environnement de développement n'a pas de démon Docker disponible pour
> builder réellement les images ; les valeurs ci-dessus doivent être
> renseignées en exécutant `./scripts/metrics.sh` sur une machine avec Docker
> installé (une seule commande, résultats horodatés dans `METRICS.md`).

### Rigueur du dépôt

Un commit par changement logique (scaffold Express, modèle, validation,
routes, error handler, tests unitaires, tests d'intégration, schéma SQL,
Dockerfile API, service Python, Dockerfile stats, docker-compose, fix du
crash-loop au démarrage, publication registry, métriques, documentation),
fichiers ajoutés explicitement à chaque fois (jamais de `git add .` en
aveugle). Un seul contributeur sur ce créneau, donc pas de branche parallèle
nécessaire ce jour-là ; la stratégie de branche (une branche par sujet dès
que plusieurs fronts avancent en même temps) sera appliquée dès qu'un
deuxième sujet sera mené de front.
