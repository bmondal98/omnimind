import asyncio
import json
import unittest

from backend.state import StateEngine


def detection(hazard="person_fallen"):
    return {
        "hazard_detected": hazard is not None,
        "hazard_type": hazard,
        "severity": "critical" if hazard else None,
        "description": "A person is on the floor." if hazard else "No hazards detected.",
        "timestamp": "2026-10-31T14:14:03.120Z",
    }


class StateEngineTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = StateEngine(timing_scale=0.01)
        self.addAsyncCleanup(self.engine.close)

    async def wait_for(self, predicate, timeout=2):
        deadline = asyncio.get_running_loop().time() + timeout
        while asyncio.get_running_loop().time() < deadline:
            state = self.engine.snapshot()
            if predicate(state):
                return state
            await asyncio.sleep(0.003)
        self.fail("State transition did not occur before deadline")

    def assert_contract(self, state):
        self.assertEqual(set(state), {"status", "server_time", "latest_detection", "escalation"})
        self.assertRegex(state["server_time"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$")
        escalation = state["escalation"]
        if escalation is None:
            return
        pending = [s for s in escalation["steps"] if s["status"] == "pending"]
        active = [s for s in escalation["steps"] if s["status"] == "in_progress"]
        self.assertLessEqual(len(pending) + len(active), 1)
        self.assertEqual(escalation["next_action"] is not None, bool(pending))
        ids = [step["id"] for step in escalation["steps"]]
        self.assertEqual(len(ids), len(set(ids)))
        for step in escalation["steps"]:
            self.assertEqual(set(step), {"id", "type", "title", "message", "status", "reason", "started_at", "finished_at", "transcript"})
            self.assertEqual(step["reason"] is not None, step["status"] == "failed")
            self.assertEqual(step["started_at"] is None, step["status"] == "pending")
            self.assertEqual(step["finished_at"] is not None, step["status"] in ("success", "failed"))

    async def test_progresses_to_dispatch_without_any_polls(self):
        self.engine.record_detection(detection())
        # The no-contact ladder takes 31 simulated seconds, then holds for 30.
        await asyncio.sleep(0.40)
        state = self.engine.snapshot()
        self.assert_contract(state)
        self.assertEqual(state["status"], "resolved")
        self.assertEqual(state["escalation"]["resolution"], "emergency_dispatched")
        self.assertIsNone(state["latest_detection"])
        self.assertEqual([s["type"] for s in state["escalation"]["steps"]], ["hazard_detected", "alert_owner", "call_owner", "dispatch_emergency"])
        self.assertIn("No real service was contacted", state["escalation"]["steps"][-1]["message"])

    async def test_pending_ack_cancels_all_future_steps_and_is_idempotent(self):
        self.engine.record_detection(detection())
        first = self.engine.snapshot()
        self.assertEqual(first["status"], "hazard_detected")
        self.assert_contract(first)
        stopped = self.engine.acknowledge()
        self.assert_contract(stopped)
        self.assertEqual([s["type"] for s in stopped["escalation"]["steps"]], ["hazard_detected", "owner_ack"])
        self.assertEqual(stopped["escalation"]["resolution"], "owner_confirmed")
        await asyncio.sleep(0.40)
        self.assertEqual(self.engine.acknowledge()["escalation"], stopped["escalation"])

    async def test_ack_during_in_progress_fails_step_then_stops(self):
        self.engine.record_detection(detection())
        await self.wait_for(lambda s: s["escalation"]["steps"][-1]["status"] == "in_progress")
        stopped = self.engine.acknowledge()
        self.assert_contract(stopped)
        interrupted = stopped["escalation"]["steps"][-2]
        self.assertEqual(interrupted["status"], "failed")
        self.assertEqual(interrupted["reason"], "Stopped: owner confirmed safe.")
        self.assertIsNone(interrupted["transcript"])
        await asyncio.sleep(0.40)
        self.assertEqual(self.engine.snapshot()["escalation"], stopped["escalation"])

    async def test_detection_is_pinned_and_snapshots_cannot_mutate_state(self):
        original = detection()
        self.engine.record_detection(original)
        first = self.engine.snapshot()
        original["description"] = "Changed outside engine"
        self.engine.record_detection(detection(None))
        self.engine.record_detection(detection("fire_smoke"))
        self.assertEqual(self.engine.snapshot()["latest_detection"], first["latest_detection"])
        self.assertEqual(self.engine.snapshot()["escalation"]["id"], first["escalation"]["id"])
        first["escalation"]["steps"][0]["message"] = "Tampered"
        self.assertNotEqual(self.engine.snapshot()["escalation"]["steps"][0]["message"], "Tampered")

    async def test_resolved_hold_idle_and_cooldown_expiry(self):
        self.engine.record_detection(detection())
        stopped = self.engine.acknowledge()
        self.engine.record_detection(detection(None))
        self.assertIsNone(self.engine.snapshot()["latest_detection"])
        self.engine.record_detection(detection())
        self.assertEqual(self.engine.snapshot()["status"], "resolved")
        await asyncio.sleep(0.35)
        self.assertEqual(self.engine.snapshot()["status"], "idle")
        self.engine.record_detection(detection())
        state = self.engine.snapshot()
        self.assertEqual(state["status"], "monitoring")
        self.assertIsNone(state["latest_detection"])
        self.assertEqual(state["escalation"], stopped["escalation"])
        await asyncio.sleep(0.30)
        self.engine.record_detection(detection())
        self.assertEqual(self.engine.snapshot()["status"], "hazard_detected")
        self.assertNotEqual(self.engine.snapshot()["escalation"]["id"], stopped["escalation"]["id"])

    async def test_cooldown_is_per_hazard_and_new_run_cancels_old_hold(self):
        self.engine.record_detection(detection())
        first = self.engine.acknowledge()
        await asyncio.sleep(0.18)
        self.engine.record_detection(detection("fire_smoke"))
        self.assertEqual(self.engine.snapshot()["status"], "hazard_detected")
        second = self.engine.acknowledge()
        self.assertNotEqual(first["escalation"]["id"], second["escalation"]["id"])
        self.engine.record_detection(detection())
        self.assertEqual(self.engine.snapshot()["escalation"]["id"], second["escalation"]["id"])
        self.assertIsNone(self.engine.snapshot()["latest_detection"])
        # The first run's hold expires during the second run's resolved hold.
        await asyncio.sleep(0.16)
        self.assertEqual(self.engine.snapshot()["status"], "resolved")
        await asyncio.sleep(0.18)
        self.assertEqual(self.engine.snapshot()["status"], "idle")

    async def test_failed_contact_recovers_gate_code_only_goes_to_dispatch(self):
        profile = {
            "owner_name": "Ahmad", "owner_phone": "+1 555 0100",
            "address": "12 Maple Street", "gate_code": "SECRET-GATE-4821",
            "contacts": [
                {"name": "Sarah", "relation": "neighbor", "phone": "+1 555 0142"},
                {"name": "Omar", "relation": "brother", "phone": "+1 555 0177"},
                {"name": "Jo", "relation": "friend", "phone": "+1 555 0178"},
            ],
        }
        self.engine.set_profile(profile)
        profile["contacts"][0]["name"] = "External mutation"
        self.engine.record_detection(detection())
        recovered = await self.wait_for(lambda s: len(s["escalation"]["steps"]) == 5 and s["escalation"]["steps"][-1]["status"] == "pending")
        self.assert_contract(recovered)
        self.assertEqual(recovered["escalation"]["steps"][-2]["status"], "failed")
        self.assertIn("Sarah didn't answer", recovered["escalation"]["steps"][-1]["message"])
        self.assertIn("Omar", recovered["escalation"]["steps"][-1]["message"])
        third_contact = await self.wait_for(lambda s: len(s["escalation"]["steps"]) == 6 and s["escalation"]["steps"][-1]["status"] == "pending")
        self.assert_contract(third_contact)
        self.assertEqual(third_contact["escalation"]["steps"][-2]["status"], "success")
        self.assertIn("Omar cannot arrive in time", third_contact["escalation"]["steps"][-1]["message"])
        self.assertIn("Jo", third_contact["escalation"]["steps"][-1]["message"])
        final = await self.wait_for(lambda s: s["status"] == "resolved")
        self.assert_contract(final)
        self.assertEqual(final["escalation"]["resolution"], "emergency_dispatched")
        steps = final["escalation"]["steps"]
        self.assertNotIn("SECRET-GATE-4821", json.dumps(steps[:-1]))
        self.assertIn("SECRET-GATE-4821", json.dumps(steps[-1]["transcript"]))
        for step in steps[1:]:
            self.assertTrue(all("simulat" in entry["text"].lower() for entry in step["transcript"]))

    async def test_clean_frames_monitor_then_idle_and_close_cancels(self):
        self.assertEqual(self.engine.snapshot()["status"], "idle")
        self.engine.record_detection(detection(None))
        self.assertEqual(self.engine.snapshot()["status"], "monitoring")
        await asyncio.sleep(0.18)
        self.assertEqual(self.engine.snapshot()["status"], "idle")
        self.engine.record_detection(detection())
        before = self.engine.snapshot()["escalation"]
        await self.engine.close()
        await self.engine.close()
        await asyncio.sleep(0.40)
        self.assertEqual(self.engine.snapshot()["escalation"], before)
        with self.assertRaises(RuntimeError):
            self.engine.record_detection(detection())


if __name__ == "__main__":
    unittest.main()
