# Makefile — pile Docker du POSTE LOCAL (docker-compose.yml)
# Windows : installer make via  winget install GnuWin32.Make, ou lancer les commandes docker compose directement
#
# JAMAIS sur la VM Oracle, qui héberge d'autres projets : y utiliser deploy/oracle/next.sh.
# Garde-fous :
#   - projet Compose nommé : les commandes ne visent que les conteneurs de ce projet ;
#   - services listés explicitement : jamais le profil dev sans le demander (up-dev) ;
#   - aucune commande Docker globale (prune, suppression de tous les conteneurs ou volumes) ;
#   - volumes du projet supprimés seulement avec CONFIRM=supprimer-volumes-locaux ;
#   - arrêt immédiat si un conteneur blog-api existe hors de ce projet (cas de la VM de production).

PROJECT  := adjoumani-portfolio
COMPOSE  := docker compose -p $(PROJECT) --env-file .env.docker
SERVICES := api latex-runner cv-extractor frontend

guard:
	@owner=$$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' blog-api 2>/dev/null) \
	  && [ "$$owner" != "$(PROJECT)" ] \
	  && { echo "ARRET : un conteneur blog-api existe hors du projet $(PROJECT) (VM de production ?). Rien n'a ete lance."; exit 1; } \
	  || true

up: guard
	$(COMPOSE) up -d $(SERVICES)
	@echo ✅ Demarré — Frontend: http://localhost:8080  API: http://localhost:5000

up-build: guard
	$(COMPOSE) up -d --build $(SERVICES)
	@echo ✅ Build et démarré

up-dev: guard
	$(COMPOSE) --profile dev up -d $(SERVICES) mongo mongo-express
	@echo ✅ Dev — MongoDB UI: http://localhost:8081

down: guard
	$(COMPOSE) down

# Supprime aussi les volumes de CE projet (MongoDB local, fichiers téléversés) : confirmation exigée
down-clean: guard
	@[ "$(CONFIRM)" = "supprimer-volumes-locaux" ] \
	  || { echo "REFUS : make down-clean CONFIRM=supprimer-volumes-locaux (efface les volumes du projet $(PROJECT))"; exit 1; }
	$(COMPOSE) --profile dev down -v

build: guard
	$(COMPOSE) build --no-cache api latex-runner cv-extractor frontend

build-api: guard
	$(COMPOSE) build --no-cache api

build-front: guard
	$(COMPOSE) build --no-cache frontend

logs:
	$(COMPOSE) logs -f

logs-api:
	$(COMPOSE) logs -f api

logs-front:
	$(COMPOSE) logs -f frontend

status:
	$(COMPOSE) ps

restart: guard
	$(COMPOSE) restart $(SERVICES)

restart-api: guard
	$(COMPOSE) restart api

shell-api:
	$(COMPOSE) exec api sh

shell-mongo:
	$(COMPOSE) exec mongo mongosh -u "$$MONGO_USER" -p "$$MONGO_PASSWORD"

health:
	curl -s http://localhost:5000/api/health

# Arrête le projet et retire les images construites pour lui ; volumes et autres projets intacts
clean: guard
	$(COMPOSE) down --rmi local

.PHONY: guard up up-build up-dev down down-clean build build-api build-front \
        logs logs-api logs-front status restart restart-api \
        shell-api shell-mongo health clean
