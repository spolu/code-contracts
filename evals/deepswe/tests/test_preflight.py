from __future__ import annotations

import json
import unittest

from deepswe_eval.preflight import (
    DEFAULT_CONFIG,
    DEFAULT_FULL_FALLBACK_MANIFEST,
    DEFAULT_FULL_MANIFEST,
    DEFAULT_MANIFEST,
    DEFAULT_PHASE3_CONFIG,
    DEFAULT_PHASE4_CONFIG,
    DEFAULT_PHASE5_CONFIG,
    DEFAULT_PHASE5_REGRADE_CODE_CONTRACTS_PWNTOOLS,
    DEFAULT_PHASE5_REGRADE_CONTROL_PWNTOOLS,
    DEFAULT_PHASE5_RELAUNCH_02_CONFIG,
    DEFAULT_PHASE5_RELAUNCH_CONFIG,
    DEFAULT_PHASE5_REPLACEMENT_CODE_CONTRACTS_AIOMONITOR,
    DEFAULT_PHASE5_REPLACEMENT_CODE_CONTRACTS_PWNTOOLS,
    DEFAULT_PHASE5_REPLACEMENT_CONTROL_PWNTOOLS,
    DEFAULT_PROMPT_V2_SMOKE,
    DEFAULT_PROMPT_V3_SMOKE,
    DEFAULT_PROMPT_V4_SMOKE,
    _assert_phase5_regrade_config,
    _assert_phase5_replacement_config,
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
            DEFAULT_PHASE4_CONFIG,
            DEFAULT_FULL_MANIFEST,
            DEFAULT_PHASE5_CONFIG,
            DEFAULT_PHASE5_RELAUNCH_CONFIG,
            DEFAULT_PHASE5_RELAUNCH_02_CONFIG,
            DEFAULT_PHASE5_REPLACEMENT_CONTROL_PWNTOOLS,
            DEFAULT_PHASE5_REPLACEMENT_CODE_CONTRACTS_PWNTOOLS,
            DEFAULT_PHASE5_REPLACEMENT_CODE_CONTRACTS_AIOMONITOR,
            DEFAULT_PHASE5_REGRADE_CONTROL_PWNTOOLS,
            DEFAULT_PHASE5_REGRADE_CODE_CONTRACTS_PWNTOOLS,
            DEFAULT_FULL_FALLBACK_MANIFEST,
        )

    def test_phase5_replacement_rejects_reasoning_drift(self) -> None:
        phase5_config = json.loads(DEFAULT_PHASE5_CONFIG.read_text())
        replacement = json.loads(DEFAULT_PHASE5_REPLACEMENT_CONTROL_PWNTOOLS.read_text())
        replacement["agents"][0]["kwargs"]["reasoning_effort"] = "high"

        with self.assertRaisesRegex(ValueError, "may differ only"):
            _assert_phase5_replacement_config(
                replacement,
                phase5_config,
                "full-v1-luna-k3-replacement-01-control-pwntools",
                "pwntools-tube-multiplexing",
                "deepswe_eval.agents:ControlAgent",
                1,
            )

    def test_phase5_regrade_rejects_verifier_timeout_drift(self) -> None:
        regrade = json.loads(DEFAULT_PHASE5_REGRADE_CONTROL_PWNTOOLS.read_text())
        regrade["verifier_timeout_multiplier"] = 1.0

        with self.assertRaisesRegex(ValueError, "may differ only"):
            _assert_phase5_regrade_config(
                regrade,
                "full-v1-luna-k3-regrade-01-control-pwntools",
                "full-v1-luna-k3-replacement-01-control-pwntools",
                "44d11593-db34-4864-bb59-f28787618b3d",
                1,
            )


if __name__ == "__main__":
    unittest.main()
