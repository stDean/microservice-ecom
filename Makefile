# E-Commerce Microservices Makefile
.PHONY: dev prod down logs clean rebuild shell db-shell rabbit-ui mailhog-ui

# Development
dev:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build

dev-detach:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d

# Production
prod:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d

# Management
down:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml down -v

down-prod:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml down

logs:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f

logs-prod:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# Rebuild
rebuild:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml down
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d

# Cleanup
clean:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml down -v
	docker system prune -f

# Service Access
shell:
	docker exec -it notification-service /bin/sh

db-shell:
	docker exec -it auth_db psql -U user -d auth_db

rabbit-ui:
	open http://localhost:15672

mailhog-ui:
	open http://localhost:8025

# Status
status:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml ps

# Individual Services
auth-logs:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f auth-service

notification-logs:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f notification-service

gateway-logs:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f api-gateway

# Help
help:
	@echo "Available commands:"
	@echo "  dev           - Start development with logs"
	@echo "  dev-detach    - Start development in background"
	@echo "  prod          - Start production"
	@echo "  down          - Stop development"
	@echo "  down-prod     - Stop production"
	@echo "  logs          - View development logs"
	@echo "  logs-prod     - View production logs"
	@echo "  rebuild       - Rebuild and restart development"
	@echo "  clean         - Remove everything (containers, volumes)"
	@echo "  shell         - Access notification service shell"
	@echo "  db-shell      - Access database shell"
	@echo "  rabbit-ui     - Open RabbitMQ management"
	@echo "  mailhog-ui    - Open MailHog web UI"
	@echo "  status        - Show service status"
	@echo "  auth-logs     - View auth service logs"
	@echo "  notification-logs - View notification service logs"
	@echo "  gateway-logs  - View API gateway logs"