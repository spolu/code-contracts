from __future__ import annotations

import unittest

from deepswe_eval.preflight import DEFAULT_CONFIG, DEFAULT_MANIFEST, run_preflight


class PreflightTests(unittest.TestCase):
    def test_frozen_phase1_inputs_pass_preflight(self) -> None:
        run_preflight(DEFAULT_CONFIG, DEFAULT_MANIFEST)


if __name__ == "__main__":
    unittest.main()
