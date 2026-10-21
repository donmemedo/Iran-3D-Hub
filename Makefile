# Tiny task runner. PY points at the backend venv; override in CI: make test PY=python
PY ?= .venv/bin/python
.PHONY: test audit up down secret

test: ; cd backend && $(PY) -m pytest
audit: ; cd backend && $(PY) -m bandit -r app -ll && $(PY) -m pip_audit -r requirements.txt && cd ../frontend && npm audit --omit=dev --audit-level=high
up: ; docker compose up --build -d   # needs JWT_SECRET (see: make secret) in the shell or in .env
down: ; docker compose down
secret: ; @openssl rand -hex 32
