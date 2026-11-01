from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from backend.app import MAX_REQUEST_BYTES, create_app
from backend.config import Settings
from backend.muse import MuseError


STAMP = "2026-10-31T14:14:03.120Z"
CLEAR = dict(hazard_detected=False, hazard_type=None, severity=None, description="Clear.")
HAZARD = dict(hazard_detected=True, hazard_type="fire_smoke", severity="critical", description="Smoke is visible.")


class FakeDetector:
    def __init__(self):
        self.result = CLEAR.copy()
        self.calls = 0

    async def analyze(self, image):
        self.calls += 1
        if isinstance(self.result, Exception):
            raise self.result
        return self.result.copy()

    async def ask(self, text, state, audio=None, audio_type=None):
        return f"Current status: {state['status']}."

    async def close(self):
        pass


@pytest.fixture
def api():
    detector = FakeDetector()
    with TestClient(create_app(Settings(), detector=detector)) as client:
        yield client, detector


def jpeg(width=100, height=100, format="JPEG"):
    buffer = BytesIO()
    Image.new("RGB", (width, height), "white").save(buffer, format=format)
    return buffer.getvalue()


def send_frame(client, data=None, timestamp=STAMP):
    return client.post("/frame", files={"image": ("frame.jpg", jpeg() if data is None else data, "image/jpeg")}, data={"timestamp": timestamp})


def test_clear_frame_exact_contract_and_capture_time(api):
    client, detector = api
    assert client.get("/state").json()["latest_detection"] is None
    response = send_frame(client, timestamp="2026-10-31T19:14:03.120+05:00")
    expected = {**CLEAR, "description": "No hazards detected.", "timestamp": STAMP}
    assert response.status_code == 200
    assert response.json() == expected
    state = client.get("/state").json()
    assert set(state) == {"status", "server_time", "latest_detection", "escalation"}
    assert state["status"] == "monitoring"
    assert state["latest_detection"] == expected
    assert state["escalation"] is None


def test_hazard_starts_state_then_ack_and_cooldown(api):
    client, detector = api
    detector.result = HAZARD
    response = send_frame(client)
    state = client.get("/state").json()
    assert state["latest_detection"] == response.json()
    assert state["status"] == "hazard_detected"
    escalation_id = state["escalation"]["id"]
    assert state["escalation"]["steps"][0]["type"] == "hazard_detected"
    detector.result = CLEAR
    assert send_frame(client).json()["hazard_detected"] is False
    assert client.get("/state").json()["latest_detection"] == response.json()
    stopped = client.post("/ack").json()
    assert stopped["status"] == "resolved"
    assert stopped["latest_detection"] is None
    assert stopped["escalation"]["resolution"] == "owner_confirmed"
    assert stopped["escalation"]["next_action"] is None
    detector.result = HAZARD
    assert send_frame(client).json()["hazard_detected"] is True
    assert client.get("/state").json()["escalation"]["id"] == escalation_id
    assert client.get("/state").json()["latest_detection"] is None


@pytest.mark.parametrize("data,timestamp", [
    (b"", STAMP),
    (b"this is not an image", STAMP),
    (jpeg(format="PNG"), STAMP),
    (jpeg(width=961), STAMP),
    (jpeg(), "not-a-timestamp"),
    (jpeg(), "2026-10-31T14:14:03"),
    (jpeg()[:-20], STAMP),
])
def test_bad_inputs_do_not_call_model(api, data, timestamp):
    client, detector = api
    response = send_frame(client, data, timestamp)
    assert response.status_code == 400
    assert set(response.json()) == {"error"}
    assert detector.calls == 0


def test_missing_fields_return_json_400(api):
    client, _ = api
    assert client.post("/frame").status_code == 400
    assert set(client.post("/frame").json()) == {"error"}
    assert client.post("/ask").status_code == 400


@pytest.mark.parametrize("result", [
    MuseError("provider response secret must not escape"),
    {**CLEAR, "hazard_type": "intruder"},
    {**HAZARD, "severity": "low"},
    {**HAZARD, "hazard_detected": "true"},
    {**HAZARD, "unexpected": "value"},
])
def test_failed_analysis_leaves_state_unchanged_and_hides_provider_error(api, result):
    client, detector = api
    detector.result = result
    response = send_frame(client)
    assert response.status_code == 500
    assert set(response.json()) == {"error"}
    assert "secret" not in response.text
    state = client.get("/state").json()
    assert state["status"] == "idle"
    assert state["latest_detection"] is None


def test_browser_cors_and_preflight(api):
    client, _ = api
    origin = "https://teammate.example"
    preflight = client.options("/profile", headers={"Origin": origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == "*"
    assert "POST" in preflight.headers["access-control-allow-methods"]
    assert client.get("/state", headers={"Origin": origin}).headers["access-control-allow-origin"] == "*"
    bad_frame = client.post("/frame", headers={"Origin": origin})
    assert bad_frame.status_code == 400
    assert bad_frame.headers["access-control-allow-origin"] == "*"


def test_profile_and_ask_shape(api):
    client, _ = api
    profile = dict(owner_name="Owner", owner_phone="", address="", gate_code="secret-gate", contacts=[])
    assert client.post("/profile", json=profile).json() == {"ok": True}
    assert "secret-gate" not in client.get("/state").text
    assert client.post("/ask", data={"text": "What is happening?"}).json() == {"text": "Current status: idle."}
    bad = client.post("/profile", json={**profile, "contacts": "secret-gate"})
    assert bad.status_code == 400
    assert "secret-gate" not in bad.text


def test_large_request_rejected_before_model(api):
    client, detector = api
    response = client.post("/frame", content=b"x" * (MAX_REQUEST_BYTES + 1), headers={"Origin": "https://teammate.example"})
    assert response.status_code == 400
    assert response.headers["access-control-allow-origin"] == "*"
    assert detector.calls == 0


def test_unexpected_errors_still_have_cors_and_hide_details():
    detector = FakeDetector()
    detector.result = RuntimeError("private internal detail")
    with TestClient(create_app(Settings(), detector=detector), raise_server_exceptions=False) as client:
        response = client.post("/frame", files={"image": ("frame.jpg", jpeg(), "image/jpeg")}, data={"timestamp": STAMP}, headers={"Origin": "https://teammate.example"})
        assert response.status_code == 500
        assert response.headers["access-control-allow-origin"] == "*"
        assert response.json() == {"error": "An internal server error occurred."}


def test_missing_key_keeps_health_and_state_available():
    with TestClient(create_app(Settings())) as client:
        assert client.get("/health").json()["model_configured"] is False
        assert client.get("/state").status_code == 200
        response = send_frame(client)
        assert response.status_code == 500
        assert "backend/.env" in response.json()["error"]
