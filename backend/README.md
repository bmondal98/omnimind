# OmniMind backend

FastAPI backend for the contract in [`../docs/API.md`](../docs/API.md).
`POST /frame` sends the uploaded JPEG to Muse Spark and updates the agent state
before responding. Escalation timers advance independently of frontend polling.
All calls, SMS messages, and emergency dispatches are simulated.

## Run locally

Run these commands from the repository root. Use Python 3.12 or newer with pip
and venv available:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
test -f backend/.env || cp backend/.env.example backend/.env
chmod 600 backend/.env
```

For local development, set `MODEL_API_KEY` in `backend/.env`. This file is
git-ignored; the example file contains no key. The default provider is
`https://api.meta.ai/v1` and model is `muse-spark-1.3`. Change `MODEL_API_BASE_URL`
or `MODEL_API_MODEL` in that same file if your account uses a different
endpoint/model. Restart the server after editing configuration. No API key is
needed in the frontend.

### Configuration precedence

Each setting (`MODEL_API_KEY`, `MODEL_API_BASE_URL`, `MODEL_API_MODEL`,
`CORS_ORIGINS`) is read from a real **environment variable first**, then from
`backend/.env`, then the built-in default. An environment variable that is set
but empty counts as unset. `backend/.env` is optional, so a host with no file
works as long as the variables are set.

## Deploy (Render / Railway)

1. Set the build command to `pip install -r backend/requirements.txt` and run it
   from the repository root.
2. Set the start command to
   `python -m uvicorn backend.app:app --host 0.0.0.0 --port $PORT --workers 1`.
   The host provides `PORT`. Run one worker, because state is in memory.
3. Add `MODEL_API_KEY` (and optionally `MODEL_API_MODEL`, `MODEL_API_BASE_URL`)
   as environment variables or secrets in the host's dashboard. Do not commit a
   `backend/.env`.
4. Set `CORS_ORIGINS` to the deployed frontend's origin, e.g.
   `https://omnimind.example.com` (comma-separated for several).
5. Point the frontend at it with `VITE_API_URL=https://your-backend.onrender.com`
   (no `/api` suffix).

This workspace already has the virtual environment and dependencies installed.
Start the backend from the repository root:

```bash
backend/.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Use **one worker**: the home profile, current detection, and escalation history
are held in memory for one shared demo session and reset on restart. Development
`--reload` also resets state. API documentation is at `http://localhost:8000/docs`.
`GET /health` reports whether a model key is configured; a successful live
`POST /frame` verifies that the key actually works.

## Public demo tunnel

In a second terminal, from the repository root:

```bash
backend/.tools/cloudflared tunnel --url http://127.0.0.1:8000 --protocol http2 --no-autoupdate
```

The ignored `.tools` directory contains the verified Cloudflare binary installed
for this workspace. On a fresh checkout, install `cloudflared` using the
[official instructions](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
and use `cloudflared` in place of `backend/.tools/cloudflared`.

Copy the printed `https://…trycloudflare.com` base URL. Both the backend and
tunnel processes must remain running; a new quick tunnel generally gets a new
URL. The URL exposes this shared demo API without authentication.

The teammate should put this in `frontend/.env.local`, then restart Vite:

```dotenv
VITE_USE_MOCK=false
VITE_API_URL=https://YOUR-TUNNEL.trycloudflare.com
```

No `/api` suffix. `Simulate hazard` belongs to mock mode and disappears when
using the real backend; start the camera to submit actual frames. CORS allows
all origins by default, without cookies/credentials. To restrict it, set
`CORS_ORIGINS=http://localhost:5173,https://your-frontend.example` in `backend/.env`
(or as an environment variable) and restart.

## Endpoints and behavior

| Endpoint | Implementation |
| --- | --- |
| `POST /frame` | JPEG `image` + ISO-8601 `timestamp` multipart fields; Muse Spark structured hazard detection. |
| `GET /state` | Fast in-memory state, pinned active hazard, simulated escalation timeline. |
| `POST /ack` | Stops timers, resolves the run, clears banner, suppresses the same hazard for 60 seconds. |
| `POST /profile` | Replaces the in-memory home profile. Gate code is only included in the simulated emergency transcript. |
| `POST /ask` | Muse Spark answers from current state; typed questions and browser speech transcripts work. |
| `GET /health` | Process health and model-key presence, without exposing secrets. |

**Current audio limitation:** audio-only WebM/MP4 recordings are not converted.
When browser speech recognition supplies `text`, that transcript is used and
the recording is ignored. Audio-only requests require MP3/WAV; unsupported
formats receive `400` with a JSON error. Browser audio fallback needs a later
transcoding integration. Meta also documents degraded audio performance for
Muse Spark 1.3; this initial implementation prioritizes `/frame`.

Frame uploads must be valid JPEG, at most 960 px wide, 4096 px high, and 5 MiB.
Entire requests are capped at 6 MiB. Capture timestamps require a timezone and
are returned in UTC with milliseconds. The model call has a 25-second deadline,
with no retries, below the frontend's 30-second timeout. Invalid model output,
provider failure, or missing credentials return JSON errors; they never create
a false clear detection or overwrite state. One frame is analyzed at a time.

No image files or request payloads are logged or persisted by this backend.
Uploaded frames are sent to the configured model provider for inference.

## Verify

```bash
backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt
backend/.venv/bin/python -m pytest backend/tests -q
```

Tests mock the model transport and check request/schema compatibility, malformed
uploads and timestamps, JSON errors, CORS (including errors), state-before-return,
timer-driven escalation, failed-contact recovery, acknowledgement cancellation,
cooldowns, and gate-code handling. Live smoke tests with a blank JPEG establish
provider connectivity and response shape; they do not measure hazard accuracy
on real camera footage.

Provider integration follows Meta's [image understanding](https://dev.meta.ai/docs/image-understanding),
[structured output](https://dev.meta.ai/docs/structured-output),
[Chat Completions](https://dev.meta.ai/docs/protocols/chat-completions), and
[audio](https://dev.meta.ai/docs/video-understanding) documentation.
