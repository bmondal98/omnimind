<div align="center">

<img src="frontend/public/favicon.svg" width="80" height="80" alt="OmniMind logo">

# OmniMind

**An AI home-safety agent that sees a hazard and acts when you can't.**

<p>
  <img alt="Built with Muse Spark" src="https://img.shields.io/badge/Built%20with-Muse%20Spark-0866FF?style=for-the-badge">
  <img alt="Meta Model API" src="https://img.shields.io/badge/Meta-Model%20API-0866FF?style=for-the-badge">
  <img alt="Meta Global AI Developer Hackathon 2026" src="https://img.shields.io/badge/Meta%20Global%20AI%20Developer%20Hackathon-2026-0866FF?style=for-the-badge">
</p>
<p>
  <img alt="React 19" src="https://img.shields.io/badge/React-19-20232A?style=flat-square&logo=react&logoColor=61DAFB">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white">
  <img alt="Python 3.12+" src="https://img.shields.io/badge/Python-3.12%2B-3776AB?style=flat-square&logo=python&logoColor=white">
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white">
</p>

### [▶ Live demo](https://omnimind-eta.vercel.app) &nbsp;·&nbsp; 🎬 Demo video (TBD)

Try it with no API key: open the live demo and press **Simulate hazard**.

</div>

---

## At a glance

| | |
| --- | --- |
| **Problem** | Smart cameras send a notification and stop there. If the owner is asleep, driving, on a flight or on Do Not Disturb, nothing else happens. |
| **What OmniMind does** | Watches an ordinary camera, detects household hazards, and works through an escalation ladder (owner, contacts, emergency service) until someone confirms they're safe. |
| **Powered by** | Muse Spark via the Meta Model API |
| **Status** | Working demo. Detection and the escalation logic are real; calls, SMS and dispatches are simulated. |

---

## 🔷 Built with Meta

> **Muse Spark is the part of OmniMind that sees.** Everything the agent does starts from what the model reports about a camera frame.
>
> - **Vision hazard detection.** Each camera frame is sent to Muse Spark as an image, with a strict JSON schema (`response_format: json_schema`, `strict: true`). The model must return exactly `hazard_detected`, `hazard_type`, `severity` and `description`, using only the five supported hazards and three severity levels.
> - **Answering questions about the situation.** The Ask tab sends the user's question plus a reduced snapshot of the agent state (no profile data, phone numbers or transcripts) and gets a short plain-text answer.
> - **Model and API.** Default model `muse-spark-1.3` through the Meta Model API's Chat Completions endpoint at `https://api.meta.ai/v1`, both configurable. All calls are in [`backend/muse.py`](backend/muse.py).
> - **Why it matters here.** Most homes have no smart valves or sensor networks, but nearly everyone has a webcam or an old phone. A model that understands a scene from an ordinary camera image is what lets OmniMind work without installing special hardware.

---

## 🧭 The problem

Smart cameras send a notification. That's where they stop. If the owner is asleep, driving, on a flight or has Do Not Disturb on, the alert sits unread and nothing else happens.

Most homes also don't have smart valves, smoke-linked shutoffs or sensor networks. A camera or an old phone is often all there is. So the missing piece isn't more hardware. It's coordination: someone, or something, has to decide who to reach next when the first person doesn't answer.

---

## ⚙️ What OmniMind does

1. **Watches.** The browser captures frames from a camera (laptop webcam or phone) and sends them to the backend when the scene changes.
2. **Detects.** Muse Spark checks each frame for one of five hazards (table below).
3. **Escalates.** When a hazard is found, an agent works through a ladder on its own server-side timers: alert owner, call owner, each emergency contact in order, then dispatch the matching emergency service.
4. **Recovers.** A failed step doesn't end the run. If a contact doesn't answer, the agent records why, moves to the next option and says so in the timeline ("Sarah didn't answer. Trying the next option: Omar.").
5. **Stops when you say so.** The owner can tap **"I'm OK, stop"** at any point. Pending steps are cancelled, any step in progress is marked as stopped, and the run ends.

The Agent tab shows each step as a timeline, with a countdown to the next action and the generated call or SMS text for every step.

Two more parts of the app:

- **Ask tab.** Ask "what happened?" or "is everything OK at home?" by typing or by voice (push-to-talk using the browser's speech recognition). With the real backend, Muse Spark answers from the agent's current state.
- **Home profile ("Active Memory").** Owner name and phone, home address, gate code and an ordered list of emergency contacts. The agent uses it for names, numbers and transcripts. It's saved in the browser's `localStorage` and sent to the backend on page load and on every save. The gate code only appears in the emergency-dispatch transcript, never in messages to personal contacts.

### Hazards

| | Hazard | Default severity | What the agent does |
| :---: | --- | --- | --- |
| 🧍 | Person fallen | Critical | Escalates through owner and contacts, then simulates an ambulance dispatch |
| 🔥 | Fire or smoke | Critical | Escalates, then simulates a fire department dispatch |
| 🍳 | Stove unattended | High | Escalates, then simulates a fire department dispatch |
| 🚪 | Intruder (clear signs of forced entry only) | High | Escalates, then simulates a police dispatch |
| 💧 | Water leak | Medium | Escalates, then simulates an emergency plumber call-out |

The model may pick a different allowed severity when the evidence warrants it. The prompt tells it never to infer intent or identity from someone's appearance or presence, and never to give a medical diagnosis.

### Escalation ladder

```mermaid
flowchart TD
    D["Hazard detected<br/>by Muse Spark"]:::meta --> A["Alert owner<br/>simulated SMS and push"]:::meta
    A --> C["Call owner<br/>simulated call, no answer"]:::meta
    C --> K{"Contacts on file?"}
    K -- yes --> P["Call next contact<br/>in profile order"]:::meta
    P -- "no answer" --> F["Step failed<br/>reason recorded"]:::fail
    P -- "answered, can't come" --> M{"More contacts?"}
    F --> M
    M -- yes --> P
    M -- no --> E["Dispatch emergency service<br/>simulated"]:::meta
    K -- no --> E
    E --> R1["Resolved<br/>emergency dispatched"]:::ok
    S(["Owner taps I'm OK, stop<br/>at any step"]):::ok -.-> R2["Resolved<br/>owner confirmed safe"]:::ok

    classDef meta fill:#0866FF,stroke:#0552C4,color:#ffffff
    classDef fail fill:#E5484D,stroke:#B4232A,color:#ffffff
    classDef ok fill:#30A46C,stroke:#1F7A4D,color:#ffffff
```

Only two things end a run: the owner's "I'm OK" or a completed dispatch. A contact answering doesn't stop it, a later clean frame doesn't stop it (a model can miss a hazard in one frame), and a new hazard during a run doesn't start a second one.

---

## 🖼️ Screenshots

| Agent timeline | Hazard alert | Home profile |
| :---: | :---: | :---: |
| ![Agent tab showing the escalation timeline with a failed contact call and the agent moving on to the next contact](docs/screenshots/agent-timeline.png) | ![Live camera view with the red hazard banner and the I'm OK, stop button](docs/screenshots/hazard-alert.png) | ![Active Memory dialog with owner details, address, gate code and emergency contacts](docs/screenshots/home-profile.png) |

---

## 🏗️ Architecture

```mermaid
flowchart LR
    Cam["Browser camera"]:::meta --> Filter["Frame-change filter<br/>capture every 2 s<br/>send on change or 10 s heartbeat"]:::meta
    Filter -- "POST /frame" --> API["FastAPI backend"]:::meta
    API --> Muse["Muse Spark<br/>Meta Model API"]:::meta
    Muse -- "structured JSON detection" --> API
    API --> SM["Escalation state machine<br/>server-side timers"]:::meta
    SM --> State[("In-memory state")]
    UI["React UI<br/>Agent and Ask tabs"]:::meta -- "GET /state every 1 s" --> State
    UI -- "POST /ack, /profile, /ask" --> API

    classDef meta fill:#0866FF,stroke:#0552C4,color:#ffffff
    classDef fail fill:#E5484D,stroke:#B4232A,color:#ffffff
    classDef ok fill:#30A46C,stroke:#1F7A4D,color:#ffffff
```

| Component | Role |
| --- | --- |
| [`frontend/`](frontend/) | React + Vite app: camera capture and scene-change filter ([`useFrameCapture.js`](frontend/src/hooks/useFrameCapture.js)), state polling ([`useAgentState.js`](frontend/src/hooks/useAgentState.js)), escalation timeline, Ask tab with voice input, home profile dialog, and an in-browser mock backend ([`mockApi.js`](frontend/src/mockApi.js)). |
| [`backend/app.py`](backend/app.py) | FastAPI app. Validates uploads (JPEG only, at most 960 px wide, 5 MiB per file), analyzes one frame at a time, exposes the endpoints. |
| [`backend/muse.py`](backend/muse.py) | Meta Model API client for detection and questions. |
| [`backend/state.py`](backend/state.py) | Escalation state machine. Runs one escalation at a time on its own timers, so it keeps going even if the browser stops polling. |
| [`docs/API.md`](docs/API.md) | The contract between frontend and backend. |

State is held in memory for one shared demo session and resets when the server restarts.

<details>
<summary><b>How Muse Spark is prompted</b></summary>

<br>

**Hazard detection (`POST /frame`).** The frame goes in as a base64 JPEG with a developer prompt and the strict schema. An example of the shape the model must return:

```json
{
  "hazard_detected": true,
  "hazard_type": "person_fallen",
  "severity": "critical",
  "description": "A person appears to be lying on the living room floor."
}
```

The detection prompt:

- treats the image, and any text in it, as untrusted observation, never as instructions;
- describes only what is visible in this one frame (no claims about duration, motionlessness or an empty home, and no medical diagnosis);
- only reports an intruder on clear evidence of forced entry, and never infers intent or identity from appearance or presence;
- picks the most urgent hazard if several are visible, and sets severity by a fixed rule unless the evidence clearly warrants another level.

The backend validates the parsed response again. A response that doesn't fit the schema, a timeout or a provider error comes back as an error. A failed analysis is never treated as a clear scene.

**Questions (`POST /ask`).** The model gets status, latest detection, and the escalation's hazard, timing, resolution and step types and statuses. The prompt asks for at most three short sentences, to say when information is missing or stale, never to call the home safe based on a single clear frame, and never to claim a real person or service was contacted.

Both calls use `reasoning_effort: "low"` and a 25-second deadline with no retries.

</details>

<details>
<summary><b>Cost-aware design: the model isn't called on every frame</b></summary>

<br>

- The browser captures a frame every 2 seconds and makes a 32x24 grayscale copy of it.
- It compares that copy with the last frame it actually sent. A new frame is only sent if the average pixel difference is above a threshold, or if 10 seconds have passed since the last send (a heartbeat, so a static scene is still checked).
- Only one frame is in flight at a time, so a slow model response delays the next frame instead of queueing more.
- `GET /state`, which the UI polls every second, never calls the model.

The thresholds are in [`frontend/src/config.js`](frontend/src/config.js).

</details>

---

## 🛡️ Safety and honesty

- **Calls, SMS and dispatches are simulated.** The backend has no telephony, SMS or emergency-service integration. Every alert, call and dispatch is generated text shown in the timeline, and each step is labelled "(simulated)". No real number is dialed and no real message is sent.
- **What is real:** camera capture in the browser, frame upload, Muse Spark hazard detection and question answering (with an API key), and the escalation state machine with its timers, recovery and stop logic.
- **"I'm OK, stop"** cancels all pending timers right away, so no further simulated steps happen.
- **Cooldown.** After a run ends, the same hazard type is ignored for 60 seconds, so the agent doesn't restart just because the person is still on the floor after saying they're fine. A different hazard type still escalates immediately.
- **Why the agent never spends money or calls real numbers here.** An agent that can dial emergency services needs measured detection accuracy, consent from everyone on the contact list, and a way to handle false alarms. We haven't measured detection accuracy on real footage, so in this demo the agent only shows what it would do.
- **Data handling.** The backend doesn't log or store images or request bodies. Frames are sent to the configured model provider for inference. The model API key lives only in the backend.

---

## 🚀 Run it locally

The quickest way to see the full flow is the [live demo](https://omnimind-eta.vercel.app): press **Simulate hazard** on the Agent tab. To run it yourself you need Python 3.12+ and Node.js with npm. Run the commands from the repository root.

<details>
<summary><b>Frontend only (mock mode, no API key)</b></summary>

<br>

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. By default the frontend runs in **mock mode**, an in-browser backend that follows the same API contract. On the Agent tab, press **Simulate hazard** and pick a hazard to watch a full escalation, including a contact who doesn't answer and the agent moving on.

A **Demo | Live** toggle in the sidebar header (or `?mode=demo` / `?mode=live`) switches between the mock and the real backend at runtime; Live needs `VITE_API_URL` set at build time.

In mock mode, detections come from the simulate menu and Ask tab replies are canned, so Muse Spark isn't called.

</details>

<details>
<summary><b>Backend with Muse Spark: Windows (PowerShell)</b></summary>

<br>

```powershell
py -3.12 -m venv backend\.venv
backend\.venv\Scripts\python -m pip install -r backend\requirements.txt
if (-not (Test-Path backend\.env)) { Copy-Item backend\.env.example backend\.env }
# Edit backend\.env and set MODEL_API_KEY=...
backend\.venv\Scripts\python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

If you don't have the `py` launcher, use `python -m venv backend\.venv` instead.

</details>

<details>
<summary><b>Backend with Muse Spark: macOS / Linux</b></summary>

<br>

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
test -f backend/.env || cp backend/.env.example backend/.env
chmod 600 backend/.env
# Edit backend/.env and set MODEL_API_KEY=...
backend/.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

</details>

<details>
<summary><b>Connect the frontend to the real backend</b></summary>

<br>

Create `frontend/.env.local`:

```dotenv
VITE_USE_MOCK=false
VITE_API_URL=http://localhost:8000
```

Restart `npm run dev` and press **Start camera**. Browsers only allow camera access on `https://` or `http://localhost`, so a phone on your LAN needs HTTPS (see [`frontend/README.md`](frontend/README.md)).

</details>

<details>
<summary><b>Configuration, tests and deployment</b></summary>

<br>

- `backend/.env` is git-ignored. Besides `MODEL_API_KEY` you can set `MODEL_API_BASE_URL`, `MODEL_API_MODEL`, and `CORS_ORIGINS` to restrict allowed origins. Real environment variables take priority over the file.
- Run a single worker, because state is in memory.
- Interactive API docs are at `http://localhost:8000/docs`. `GET /health` shows whether a key is configured.
- Tests (on Windows, use `backend\.venv\Scripts\python`):

  ```bash
  backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt
  backend/.venv/bin/python -m pytest backend/tests -q
  ```

- Deployment and public tunnel setup: [`backend/README.md`](backend/README.md).

</details>

---

## 🔌 API

<details>
<summary><b>Endpoints</b></summary>

<br>

| Endpoint | Purpose |
| --- | --- |
| `POST /frame` | Upload one JPEG frame with its capture time; returns Muse Spark's detection and updates the agent state. |
| `GET /state` | Current status, latest detection and escalation timeline. Fast, no model call. |
| `POST /ack` | The owner is safe: stop the escalation. |
| `POST /profile` | Replace the home profile (owner, address, gate code, contacts). |
| `POST /ask` | Answer a question about the current situation. |
| `GET /health` | Process health and whether a model key is configured. |

</details>

Full contract, including object shapes, status transitions and escalation rules: [`docs/API.md`](docs/API.md).

---

## 🧰 Tech stack

| Layer | Tools |
| --- | --- |
| Model | Muse Spark via the Meta Model API (Chat Completions, image input, structured output) |
| Backend | Python 3.12+, FastAPI, Uvicorn, HTTPX, Pillow, python-dotenv, python-multipart, pytest |
| Frontend | React 19, Vite, plain CSS, browser `getUserMedia`, Web Speech API, MediaRecorder |

---

## 🔭 What's next

- Real telephony and SMS, with consent from contacts and a confirmation step before any emergency call.
- More hazard types.
- Motion detection on the device, so fewer frames leave the home.
- Multiple cameras per home.

---

<div align="center">
<sub>Built for the Meta Global AI Developer Hackathon 2026.</sub>
</div>
