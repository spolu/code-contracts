.PHONY: bundle check preflight

bundle:
	uv run python -m deepswe_eval.build_bundle

preflight:
	uv run python -m deepswe_eval.preflight

check:
	uv run ruff format --check deepswe_eval tests
	uv run ruff check deepswe_eval tests
	uv run python -m unittest discover -s tests
	uv run python -m deepswe_eval.preflight
