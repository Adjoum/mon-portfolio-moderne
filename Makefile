# Makefile — D:\adjoumani-portfolio\Makefile
# Windows : installer make via  winget install GnuWin32.Make
# Ou utiliser directement les commandes docker compose

up:
	docker compose up -d
	@echo ✅ Demarré — Frontend: http://localhost  API: http://localhost:5000

up-build:
	docker compose up -d --build
	@echo ✅ Build et démarré

up-dev:
	docker compose --profile dev up -d
	@echo ✅ Dev — MongoDB UI: http://localhost:8081

down:
	docker compose down

down-clean:
	docker compose down -v --remove-orphans

build:
	docker compose build --no-cache

build-api:
	docker compose build --no-cache api

build-front:
	docker compose build --no-cache frontend

logs:
	docker compose logs -f

logs-api:
	docker compose logs -f api

logs-front:
	docker compose logs -f frontend

status:
	docker compose ps

restart:
	docker compose restart

restart-api:
	docker compose restart api

shell-api:
	docker compose exec api sh

shell-mongo:
	docker compose exec mongo mongosh -u admin -p secret

health:
	curl -s http://localhost:5000/api/health

clean:
	docker compose down
	docker image prune -f
	docker volume prune -f

.PHONY: up up-build up-dev down down-clean build build-api build-front \
        logs logs-api logs-front status restart restart-api \
        shell-api shell-mongo health clean