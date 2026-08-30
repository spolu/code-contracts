from __future__ import annotations

import unittest

from deepswe_eval.preflight import (
    DEFAULT_CONFIG,
    DEFAULT_MANIFEST,
    DEFAULT_PHASE3_CONFIG,
    DEFAULT_PROMPT_V2_SMOKE,
    DEFAULT_PROMPT_V3_SMOKE,
    DEFAULT_PROMPT_V4_SMOKE,
    run_preflight,
)


class PreflightTests(unittest.TestCase):
    def test_frozen_ablation_inputs_pass_preflight(self) -> None:
        run_preflight(
            DEFAULT_CONFIG,
            DEFAULT_MANIFEST,
            DEFAULT_PROMPT_V2_SMOKE,
            DEFAULT_PROMPT_V3_SMOKE,
            DEFAULT_PROMPT_V4_SMOKE,
            DEFAULT_PHASE3_CONFIG,
        )


if __name__ == "__main__":
    unittest.main()
