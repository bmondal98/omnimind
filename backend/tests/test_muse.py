import asyncio
import base64
import json
import unittest
from unittest.mock import patch

import httpx

from backend.muse import MuseClient, MuseError, UnsupportedAudioError


CLEAR = {"hazard_detected": False, "hazard_type": None, "severity": None, "description": "No hazards detected."}
HAZARD = {"hazard_detected": True, "hazard_type": "fire_smoke", "severity": "critical", "description": "Smoke and flames are visible near the sofa."}


def completion(content, finish_reason="stop"):
    return httpx.Response(200, json={"choices": [{"message": {"content": content}, "finish_reason": finish_reason}]})


class MuseClientTests(unittest.IsolatedAsyncioTestCase):
    def client(self, handler):
        client = MuseClient("test-secret", transport=httpx.MockTransport(handler))
        self.addAsyncCleanup(client.close)
        return client

    async def test_missing_key_allows_startup_but_never_calls_provider(self):
        def handle(_):
            self.fail("Missing credentials must be rejected before contacting the provider")

        client = MuseClient("", transport=httpx.MockTransport(handle))
        self.addAsyncCleanup(client.close)
        with self.assertRaisesRegex(MuseError, "Configure the Muse API key in backend/.env"):
            await client.analyze(b"jpeg")
        with self.assertRaisesRegex(MuseError, "Configure the Muse API key in backend/.env"):
            await client.ask("How is home?", {})

    async def test_frame_payload_and_json_detection(self):
        requests = []

        def handle(request):
            requests.append(request)
            return completion(json.dumps(HAZARD))

        result = await self.client(handle).analyze(b"jpeg-test-bytes")
        self.assertEqual(result, HAZARD)
        self.assertEqual(len(requests), 1)
        request = requests[0]
        self.assertEqual(str(request.url), "https://api.meta.ai/v1/chat/completions")
        self.assertEqual(request.headers["Authorization"], "Bearer test-secret")
        payload = json.loads(request.content)
        self.assertEqual(payload["model"], "muse-spark-1.3")
        image_url = payload["messages"][1]["content"][1]["image_url"]["url"]
        self.assertEqual(image_url, "data:image/jpeg;base64," + base64.b64encode(b"jpeg-test-bytes").decode())
        schema = payload["response_format"]["json_schema"]
        self.assertTrue(schema["strict"])
        self.assertFalse(schema["schema"]["additionalProperties"])
        self.assertEqual(set(schema["schema"]["required"]), set(HAZARD))

    async def test_normalizes_clear_description(self):
        client = self.client(lambda _: completion(json.dumps({**CLEAR, "description": "The room appears clear."})))
        self.assertEqual(await client.analyze(b"jpeg"), CLEAR)

    async def test_rejects_invalid_detection_without_fabricating_clear_state(self):
        invalid = [
            "```json\n{}\n```", "[1]", "null", "not-json", "{}",
            json.dumps({**HAZARD, "extra": "unexpected"}),
            json.dumps({**HAZARD, "hazard_detected": "true"}),
            json.dumps({**HAZARD, "hazard_type": "suspicious_person"}),
            json.dumps({**HAZARD, "severity": None}),
            json.dumps({**HAZARD, "description": " "}),
            json.dumps({**CLEAR, "hazard_type": "water_leak"}),
        ]
        for content in invalid:
            with self.subTest(content=content):
                client = self.client(lambda _, content=content: completion(content))
                with self.assertRaisesRegex(MuseError, "invalid hazard detection"):
                    await client.analyze(b"jpeg")

    async def test_rejects_malformed_provider_envelope_and_truncation(self):
        responses = [
            httpx.Response(200, content=b"not-json"),
            httpx.Response(200, json={"choices": []}),
            httpx.Response(200, json={"choices": [{"message": None}]}),
            completion(None), completion(""), completion(json.dumps(CLEAR), "length"),
        ]
        for response in responses:
            with self.subTest(response=response):
                client = self.client(lambda _, response=response: response)
                with self.assertRaisesRegex(MuseError, "incomplete or invalid response"):
                    await client.analyze(b"jpeg")

    async def test_provider_errors_are_redacted_and_never_retried(self):
        for status, expected in [(401, "authorization"), (403, "authorization"), (429, "rate limited"), (500, "unavailable"), (400, "rejected"), (307, "rejected")]:
            requests = []

            def handle(request):
                requests.append(request)
                return httpx.Response(status, json={"error": "test-secret and private-image-data"})

            with self.subTest(status=status):
                with self.assertRaisesRegex(MuseError, expected) as exc:
                    await self.client(handle).analyze(b"jpeg")
                self.assertNotIn("test-secret", str(exc.exception))
                self.assertNotIn("private-image-data", str(exc.exception))
                self.assertEqual(len(requests), 1)

    async def test_timeout_and_connection_error_are_safe(self):
        for error, expected in [(httpx.ReadTimeout("private-data"), "timed out"), (httpx.ConnectError("test-secret"), "Could not reach")]:
            def handle(_, error=error):
                raise error

            with self.subTest(error=error):
                with self.assertRaisesRegex(MuseError, expected):
                    await self.client(handle).analyze(b"jpeg")

    async def test_wall_deadline_cancels_slow_provider(self):
        cancelled = asyncio.Event()

        async def handle(_):
            try:
                await asyncio.sleep(1)
            finally:
                cancelled.set()
            return completion(json.dumps(CLEAR))

        with patch("backend.muse.REQUEST_DEADLINE_SECONDS", 0.01):
            with self.assertRaisesRegex(MuseError, "timed out"):
                await self.client(handle).analyze(b"jpeg")
        self.assertTrue(cancelled.is_set())

    async def test_ask_prefers_transcript_and_omits_private_profile(self):
        requests = []

        def handle(request):
            requests.append(json.loads(request.content))
            return completion("The last frame showed no hazards.")

        state = {"status": "monitoring", "latest_detection": CLEAR, "profile": {"gate_code": "private-gate"}, "escalation": {"steps": [{"type": "dispatch_emergency", "status": "success", "transcript": [{"text": "private-gate"}]}]}}
        answer = await self.client(handle).ask("How is home?", state, b"recording", "audio/webm")
        self.assertEqual(answer, "The last frame showed no hazards.")
        serialized = json.dumps(requests[0])
        self.assertNotIn("private-gate", serialized)
        self.assertNotIn("input_audio", serialized)
        self.assertIn("How is home?", serialized)

    async def test_audio_only_unsupported_format_does_not_call_provider(self):
        def handle(_):
            self.fail("Unsupported audio must be rejected before contacting the provider")

        client = self.client(handle)
        for mime in ("audio/webm", "audio/mp4", None):
            with self.subTest(mime=mime):
                with self.assertRaises(UnsupportedAudioError):
                    await client.ask("", {}, b"recording", mime)

    async def test_audio_only_wav_uses_documented_format(self):
        requests = []

        def handle(request):
            requests.append(json.loads(request.content))
            return completion("There are no camera observations yet.")

        await self.client(handle).ask("", {}, b"wav-test-bytes", "audio/wav")
        audio = requests[0]["messages"][1]["content"][-1]
        self.assertEqual(audio, {"type": "input_audio", "input_audio": {"data": base64.b64encode(b"wav-test-bytes").decode(), "format": "wav"}})
        self.assertEqual(requests[0]["max_completion_tokens"], 4000)
