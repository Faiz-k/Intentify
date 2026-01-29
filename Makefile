.PHONY: build up down logs restart shell db-shell frontend-shell backend-shell clean dev prod

# Build all services
build:
	docker compose build

# Start all services
up:
	docker compose up -d

# Start in development mode with hot-reload
dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Start in production mode (no source mounts, ENVIRONMENT=production)
prod:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Stop all services
down:
	docker compose down

# View logs
logs:
	docker compose logs -f

# View backend logs
logs-backend:
	docker compose logs -f backend

# View frontend logs
logs-frontend:
	docker compose logs -f frontend

# Restart backend
restart-backend:
	docker compose restart backend

# Restart frontend
restart-frontend:
	docker compose restart frontend

# Access backend container shell
backend-shell:
	docker compose exec backend bash

# Access frontend container shell
frontend-shell:
	docker compose exec frontend sh

# Access PostgreSQL shell (uses default user/db)
db-shell:
	docker compose exec postgres psql -U intentify -d intentify_db

# Clean everything
clean:
	docker compose down -v
	docker system prune -f

# Rebuild and restart
rebuild:
	docker compose up -d --build
