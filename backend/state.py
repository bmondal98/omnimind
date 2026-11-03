"""In-memory agent state and simulated escalation timers for docs/API.md.

All methods must be used from the application's one asyncio event loop. Nothing
in this module sends a message, makes a call, or contacts emergency services.
"""

from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import math
import time
from uuid import uuid4


HAZARDS = {
    "person_fallen": ("Person fallen", "ambulance"),
    "fire_smoke": ("Fire or smoke", "fire department"),
    "stove_unattended": ("Unattended stove", "fire department"),
    "water_leak": ("Water leak", "emergency plumber"),
    "intruder": ("Possible intruder", "police"),
}


def _iso_now(delay: float = 0) -> str:
    value = datetime.now(timezone.utc) + timedelta(seconds=delay)
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")


class StateEngine:
    """Keep one active run, the last finished run, and per-hazard cooldowns.

    ``timing_scale`` scales all waits, including idle/hold/cooldown windows, for
    isolated tests. Production uses the default 1.0 (60-second cooldown).
    The caller validates Detection and Profile objects before passing them in.
    """

    def __init__(self, *, timing_scale: float = 1.0) -> None:
        if not math.isfinite(timing_scale) or timing_scale <= 0:
            raise ValueError("timing_scale must be finite and positive")
        self._scale = timing_scale
        self._profile = {
            "owner_name": "",
            "owner_phone": "",
            "address": "",
            "gate_code": "",
            "contacts": [],
        }
        self._run_owner = "The owner"
        self._phase: str | None = None
        self._last_frame_at: float | None = None
        self._latest_detection: dict | None = None
        self._escalation: dict | None = None
        self._cooldowns: dict[str, float] = {}
        self._timer: asyncio.TimerHandle | None = None
        self._resolved_timer: asyncio.TimerHandle | None = None
        self._closed = False

    def snapshot(self) -> dict:
        recent = (
            self._last_frame_at is not None
            and time.monotonic() - self._last_frame_at < 15 * self._scale
        )
        return deepcopy(
            {
                "status": self._phase or ("monitoring" if recent else "idle"),
                "server_time": _iso_now(),
                "latest_detection": self._latest_detection,
                "escalation": self._escalation,
            }
        )

    def record_detection(self, detection: dict) -> None:
        self._ensure_open()
        now = time.monotonic()
        self._last_frame_at = now
        if self._phase in ("hazard_detected", "escalating"):
            return  # Keep the initiating detection pinned throughout the run.

        if detection["hazard_detected"]:
            hazard = detection["hazard_type"]
            if self._cooldowns.get(hazard, 0) > now:
                # /frame returns the real observation; /state suppresses it.
                self._latest_detection = None
                return
            self._start_escalation(deepcopy(detection))
        elif self._phase != "resolved":
            self._latest_detection = deepcopy(detection)

    def acknowledge(self) -> dict:
        self._ensure_open()
        if self._phase not in ("hazard_detected", "escalating"):
            return self.snapshot()
        self._cancel_run_timer()
        now = _iso_now()
        escalation = self._escalation
        assert escalation is not None
        escalation["steps"] = [
            step for step in escalation["steps"] if step["status"] != "pending"
        ]
        for step in escalation["steps"]:
            if step["status"] == "in_progress":
                step.update(
                    status="failed",
                    message="Simulation cancelled: owner confirmed safe.",
                    reason="Stopped: owner confirmed safe.",
                    finished_at=now,
                )
        self._add_step(
            type="owner_ack",
            title="Owner confirmed safe, escalation stopped",
            message=f"{self._run_owner} confirmed they are safe. No further action will be taken.",
            status="success",
            started_at=now,
            finished_at=now,
        )
        self._finish("owner_confirmed")
        return self.snapshot()

    def set_profile(self, profile: dict) -> None:
        self._ensure_open()
        self._profile = deepcopy(profile)

    async def close(self) -> None:
        """Cancel every timer; safe to call more than once during shutdown."""
        self._closed = True
        self._cancel_run_timer()
        if self._resolved_timer is not None:
            self._resolved_timer.cancel()
            self._resolved_timer = None

    def _ensure_open(self) -> None:
        if self._closed:
            raise RuntimeError("State engine is closed")

    def _cancel_run_timer(self) -> None:
        if self._timer is not None:
            self._timer.cancel()
            self._timer = None

    def _add_step(self, **fields) -> dict:
        assert self._escalation is not None
        step = {
            "id": f"step_{uuid4().hex}",
            "status": "pending",
            "reason": None,
            "started_at": None,
            "finished_at": None,
            "transcript": None,
            "outcome_label": None,
            **fields,
        }
        self._escalation["steps"].append(step)
        return step

    def _start_escalation(self, detection: dict) -> None:
        # Fail immediately if a caller tries to start timers outside its loop.
        asyncio.get_running_loop()
        plan = self._build_plan(detection)
        if self._resolved_timer is not None:
            self._resolved_timer.cancel()
            self._resolved_timer = None
        self._latest_detection = detection
        self._phase = "hazard_detected"
        self._run_owner = self._profile.get("owner_name") or "The owner"
        self._escalation = {
            "id": f"esc_{uuid4().hex}",
            "hazard_type": detection["hazard_type"],
            "severity": detection["severity"],
            "started_at": detection["timestamp"],
            "ended_at": None,
            "resolution": None,
            "next_action": None,
            "steps": [],
        }
        self._add_step(
            type="hazard_detected",
            title=f"{HAZARDS[detection['hazard_type']][0]} detected",
            message=detection["description"],
            status="success",
            started_at=detection["timestamp"],
            finished_at=detection["timestamp"],
        )
        self._queue_step(self._escalation["id"], plan, 0)

    def _is_active(self, run_id: str) -> bool:
        return (
            not self._closed
            and self._phase in ("hazard_detected", "escalating")
            and self._escalation is not None
            and self._escalation["id"] == run_id
        )

    def _queue_step(self, run_id: str, plan: list[dict], index: int) -> None:
        item = plan[index]
        delay = (4 if index == 0 else 8) * self._scale
        step = self._add_step(
            type=item["type"], title=item["title"], message=item["pending"]
        )
        assert self._escalation is not None
        self._escalation["next_action"] = {
            "label": item["label"], "at": _iso_now(delay)
        }
        self._timer = asyncio.get_running_loop().call_later(
            delay, self._start_step, run_id, plan, index, step
        )

    def _start_step(self, run_id: str, plan: list[dict], index: int, step: dict) -> None:
        if not self._is_active(run_id):
            return
        self._timer = None
        self._phase = "escalating"
        assert self._escalation is not None
        self._escalation["next_action"] = None
        item = plan[index]
        step.update(status="in_progress", message=item["active"], started_at=_iso_now())
        self._timer = asyncio.get_running_loop().call_later(
            item["duration"] * self._scale,
            self._complete_step,
            run_id,
            plan,
            index,
            step,
        )

    def _complete_step(self, run_id: str, plan: list[dict], index: int, step: dict) -> None:
        if not self._is_active(run_id):
            return
        self._timer = None
        step.update(plan[index]["outcome"], finished_at=_iso_now())
        if index + 1 < len(plan):
            self._queue_step(run_id, plan, index + 1)
        else:
            self._finish("emergency_dispatched")

    def _finish(self, resolution: str) -> None:
        assert self._escalation is not None
        self._phase = "resolved"
        self._latest_detection = None
        self._escalation.update(
            resolution=resolution, ended_at=_iso_now(), next_action=None
        )
        self._cooldowns[self._escalation["hazard_type"]] = time.monotonic() + 60 * self._scale
        self._resolved_timer = asyncio.get_running_loop().call_later(
            30 * self._scale, self._release_resolved, self._escalation["id"]
        )

    def _release_resolved(self, run_id: str) -> None:
        if (
            not self._closed
            and self._phase == "resolved"
            and self._escalation is not None
            and self._escalation["id"] == run_id
        ):
            self._phase = None
            self._resolved_timer = None

    def _build_plan(self, detection: dict) -> list[dict]:
        """Freeze profile text for this run; gate code appears only at dispatch."""
        profile = self._profile
        owner = profile.get("owner_name") or "the homeowner"
        owner_number = profile.get("owner_phone") or "the number on file"
        address = profile.get("address") or "the address on file"
        message = detection["description"]
        contacts = [c for c in profile.get("contacts", []) if c.get("name")]
        service = HAZARDS[detection["hazard_type"]][1]
        plan = [
            {
                "type": "alert_owner",
                "title": "Alert owner (simulated)",
                "label": "Simulating owner alert",
                "pending": f"Simulation: will alert {owner} unless they confirm they are safe.",
                "active": f"Simulating SMS and push alert to {owner} at {owner_number}.",
                "duration": 2,
                "outcome": {
                    "status": "success",
                    "message": "Simulation: alert delivered, no reply. No real message was sent.",
                    "transcript": [{"speaker": "OmniMind (simulated SMS)", "text": f'Simulated alert: {message} Tap "I\'m OK" if you are safe.'}],
                },
            },
            {
                "type": "call_owner",
                "title": "Call owner (simulated)",
                "label": "Simulating owner call",
                "pending": f"Simulation: no reply from {owner}. Trying an owner call next.",
                "active": f"Simulating a call to {owner} at {owner_number}.",
                "duration": 5,
                "outcome": {
                    "status": "success",
                    "message": "Simulation: nobody picked up; voicemail left. No real call was placed.",
                    "outcome_label": "No answer",
                    "transcript": [{"speaker": "OmniMind (simulated)", "text": f"Simulated voicemail: Hello {owner}. {message} Please confirm you are safe, or the simulation will contact your emergency contacts."}],
                },
            },
        ]
        for index, contact in enumerate(contacts):
            name = contact["name"]
            label = f"{name} ({contact['relation']})" if contact.get("relation") else name
            if index == 0:
                pending = f"Simulation: {owner} is not responding. Trying {name} next."
            elif index == 1:
                pending = f"Simulation: {contacts[index - 1]['name']} didn't answer. Trying the next option: {name}."
            else:
                pending = f"Simulation: {contacts[index - 1]['name']} cannot arrive in time. Trying the next option: {name}."
            outcome = (
                {
                    "status": "failed",
                    "message": f"Simulation: {name} didn't answer. No real call was placed.",
                    "reason": "Simulated no answer after 6 rings.",
                    "transcript": [{"speaker": "System (simulated)", "text": "Simulation: ringing, no answer after 6 rings. No real call was placed."}],
                }
                if index == 0
                else {
                    "status": "success",
                    "message": f"Simulation: {name} answered, but is 25 minutes away. No real call was placed.",
                    "outcome_label": "Answered, can't come",
                    "transcript": [
                        {"speaker": "OmniMind (simulated)", "text": f"Simulated call: Hello {name}, calling on behalf of {owner}. {message} The address is {address}. Can you get there now?"},
                        {"speaker": f"{name} (simulated)", "text": "Simulated response: I'm 25 minutes away. Please send help."},
                    ],
                }
            )
            plan.append(
                {
                    "type": "contact_person",
                    "title": f"Call {label} (simulated)",
                    "label": f"Simulating call to {label}",
                    "pending": pending,
                    "active": f"Simulating a call to {name} at {contact.get('phone') or 'the number on file'}.",
                    "duration": 5,
                    "outcome": outcome,
                }
            )
        if not contacts:
            pending = "Simulation: no contacts on file. Moving on to emergency services."
        elif len(contacts) == 1:
            pending = f"Simulation: {contacts[-1]['name']} didn't answer. Moving on to emergency services."
        else:
            pending = f"Simulation: {contacts[-1]['name']} cannot arrive in time. Moving on to emergency services."
        gate = f" The gate code is {profile['gate_code']}." if profile.get("gate_code") else ""
        plan.append(
            {
                "type": "dispatch_emergency",
                "title": f"Dispatch {service} (simulated)",
                "label": f"Simulating {service} dispatch",
                "pending": pending,
                "active": "Simulating emergency dispatch. No real service is being contacted.",
                "duration": 4,
                "outcome": {
                    "status": "success",
                    "message": f"Simulation complete: {service} would be dispatched to {address}. No real service was contacted.",
                    "transcript": [
                        {"speaker": "OmniMind (simulated)", "text": f"Simulated dispatch: calling on behalf of {owner}. {message} The address is {address}.{gate} Nobody at home is responding."},
                        {"speaker": "Dispatcher (simulated)", "text": "Simulated response: help is on the way. This is a demo; no actual dispatch occurred."},
                    ],
                },
            }
        )
        return plan
