SHELL := /bin/bash

.PHONY: dev dev-bff dev-frontend dev-docs dev-stop

dev:
	@printf "BFF: http://127.0.0.1:3000/v1/health\n"
	@printf "App: http://127.0.0.1:5173/app/\n"
	@printf "Documentacion: http://127.0.0.1:5174/\n\n"
	@printf "Pulsa Ctrl+C para detener los tres procesos.\n"
	@trap 'for job in $$(jobs -pr); do kill $$job 2>/dev/null || true; done' EXIT INT TERM; \
		pnpm bff:dev & \
		pnpm dev & \
		pnpm docs:dev & \
		wait

dev-bff:
	pnpm bff:dev

dev-frontend:
	pnpm dev

dev-docs:
	pnpm docs:dev

dev-stop:
	@fuser -k 3000/tcp 5173/tcp 5174/tcp 2>/dev/null || true
