.PHONY: setup build api smoke
setup:
	pnpm install --frozen-lockfile
build:
	pnpm --filter buytuk-api typecheck
api:
	bash scripts/run-api-local.sh
smoke:
	bash scripts/smoke-local.sh
