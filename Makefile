.PHONY: help install up up-build down down-v build logs ps restart portal typecheck test clean

help:
	@echo "easy-auth make targets:"
	@echo "  make install    - pnpm install (registry, cli, packages, apps)"
	@echo "  make up         - docker compose up (foreground)"
	@echo "  make up-build   - docker compose up --build (foreground, rebuilds images)"
	@echo "  make down       - docker compose down"
	@echo "  make down-v     - docker compose down -v (also drops the Postgres volume)"
	@echo "  make build      - docker compose build"
	@echo "  make restart    - docker compose down && docker compose up --build"
	@echo "  make logs       - docker compose logs -f"
	@echo "  make ps         - docker compose ps"
	@echo "  make portal     - run the dev portal (http://localhost:8080)"
	@echo "  make typecheck  - pnpm -r typecheck"
	@echo "  make test       - pnpm -r test"
	@echo "  make clean      - docker compose down -v --remove-orphans"

install:
	pnpm install

up:
	docker compose up

up-build:
	docker compose up --build

down:
	docker compose down

down-v:
	docker compose down -v

build:
	docker compose build

restart: down up-build

logs:
	docker compose logs -f

ps:
	docker compose ps

portal:
	pnpm portal

typecheck:
	pnpm -r typecheck

test:
	pnpm -r test

clean:
	docker compose down -v --remove-orphans
