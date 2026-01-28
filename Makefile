.PHONY: build up down logs restart shell db-shell frontend-shell backend-shell clean

# Build all services
build:
	docker-compose build

# Start all services
up:
	docker-compose up -d

# Start in development mode with hot-reload
dev:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# Stop all services
down:
	docker-compose down

# View logs
logs:
	docker-compose logs -f

# View backend logs
logs-backend:
	docker-compose logs -f backend

# View frontend logs
logs-frontend:
	docker-compose logs -f frontend

# Restart backend
restart-backend:
	docker-compose restart backend

# Restart frontend
restart-frontend:
	docker-compose restart frontend

# Access backend container shell
backend-shell:
	docker-compose exec backend bash

# Access frontend container shell
frontend-shell:
	docker-compose exec frontend sh

# Access PostgreSQL shell
db-shell:
	docker-compose exec postgres psql -U intentify -d intentify_db

# Clean everything
clean:
	docker-compose down -v
	docker system prune -f

# Rebuild and restart
rebuild:
	docker-compose up -d --build
