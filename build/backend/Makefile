# Backend Makefile — FastAPI app for the Rated app.
#
# Quick start:
#   make install    # create venv and install deps
#   make dev        # run uvicorn with autoreload on http://localhost:8000
#
# All targets assume you're in the backend/ directory.

PYTHON ?= python3
VENV   ?= .venv
PIP    := $(VENV)/bin/pip
PY     := $(VENV)/bin/python
UVICORN := $(VENV)/bin/uvicorn
PORT   ?= 8000
HOST   ?= 0.0.0.0

DB_FILE ?= rated.db

ALEMBIC := $(VENV)/bin/alembic

.PHONY: help install dev run test lint format typecheck clean freeze db-reset db-shell migrate migration migrate-down

help:
	@echo "Targets:"
	@echo "  install     Create venv and install requirements.txt"
	@echo "  dev         Run uvicorn with --reload (local development)"
	@echo "  run         Run uvicorn without reload (production-ish)"
	@echo "  test        Run pytest"
	@echo "  lint        Run ruff"
	@echo "  format      Run ruff format + black"
	@echo "  typecheck   Run mypy"
	@echo "  db-reset    Delete the SQLite file (next start re-seeds fixtures)"
	@echo "  db-shell    Open sqlite3 REPL on the dev DB"
	@echo "  migrate     alembic upgrade head — apply pending migrations"
	@echo "  migrate-down  alembic downgrade -1 — roll back one migration"
	@echo "  migration MSG='...' — autogenerate a new migration from model diff"
	@echo "  clean       Remove venv, caches, build artifacts"
	@echo "  freeze      Write current pip freeze to requirements.lock"

$(VENV)/bin/activate:
	$(PYTHON) -m venv $(VENV)
	$(PIP) install --upgrade pip

install: $(VENV)/bin/activate
	$(PIP) install -r requirements.txt

dev: install
	$(UVICORN) api:app --reload --reload-dir . --reload-exclude .venv --reload-exclude '*.db' --reload-exclude '*.db-journal' --host $(HOST) --port $(PORT)

run: install
	$(UVICORN) api:app --host $(HOST) --port $(PORT)

test: install
	$(PIP) install pytest >/dev/null
	$(VENV)/bin/pytest -q

lint: install
	$(PIP) install ruff >/dev/null
	$(VENV)/bin/ruff check .

format: install
	$(PIP) install ruff black >/dev/null
	$(VENV)/bin/ruff check --fix .
	$(VENV)/bin/black .

typecheck: install
	$(PIP) install mypy >/dev/null
	$(VENV)/bin/mypy .

freeze:
	$(PIP) freeze > requirements.lock

db-reset:
	rm -f $(DB_FILE)
	@echo "Removed $(DB_FILE) — next 'make dev' will re-seed fixtures."

db-shell:
	sqlite3 $(DB_FILE)

migrate: install
	$(ALEMBIC) upgrade head

migrate-down: install
	$(ALEMBIC) downgrade -1

# Usage:  make migration MSG="add foo column"
migration: install
	@if [ -z "$(MSG)" ]; then echo "Usage: make migration MSG='your message'"; exit 1; fi
	$(ALEMBIC) revision --autogenerate -m "$(MSG)"

clean:
	rm -rf $(VENV) .pytest_cache .ruff_cache .mypy_cache __pycache__ */__pycache__
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
