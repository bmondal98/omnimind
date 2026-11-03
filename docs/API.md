# OmniMind Backend API

This is the contract between the frontend and the backend. The frontend's mock
(`frontend/src/mockApi.js`) follows it, so the mock is a working reference for any behaviour
described here.

## Conventions

- **Base URL:** `VITE_API_URL` on the frontend, default `http://localhost:8000`. Paths are at the root, with no `/api` prefix.
- **CORS:** the frontend runs on another origin (`http://localhost:5173`, or a LAN or tunnel address). Allow the frontend's origin for `GET`, `POST` and the `Content-Type` header.
- **Responses:** every response body is JSON. Success is status `200`.
- **Errors:** any non-2xx status counts as a failure. Body: `{ "error": "human-readable message" }`. Use `400` for bad input and `500` for server errors. The frontend does not parse the message; it only logs the status and shows its own text.
- **Timestamps:** ISO-8601 in UTC with milliseconds, e.g. `2026-10-31T14:14:03.120Z`.
- **Field names:** `snake_case`. Every field shown is always present. Where a field can be empty it is `null`, never omitted.
- **Timeouts:** the frontend gives up after 5 s on `GET /state` and after 30 s on every other request. Only one `POST /frame` is in flight at a time, so a slow model delays the next frame rather than queueing frames.

## Allowed values

Values are lowercase and must match exactly.

| Field | Allowed values |
|---|---|
| `hazard_type` | `person_fallen`, `fire_smoke`, `stove_unattended`, `water_leak`, `intruder`, or `null` when there is no hazard |
| `severity` | `critical`, `high`, `medium`, or `null` when there is no hazard |
| `status` (the agent's escalation status) | `idle`, `monitoring`, `hazard_detected`, `escalating`, `resolved` |
| step `status` | `pending`, `in_progress`, `success`, `failed` |
| step `type` | `hazard_detected`, `alert_owner`, `call_owner`, `contact_person`, `dispatch_emergency`, `owner_ack` |
| `resolution` | `owner_confirmed`, `emergency_dispatched`, or `null` while running |

Default severity per hazard, as used by the mock. The backend may change it case by case, using only the allowed values:

| `hazard_type` | `severity` |
|---|---|
| `person_fallen` | `critical` |
| `fire_smoke` | `critical` |
| `stove_unattended` | `high` |
| `intruder` | `high` |
| `water_leak` | `medium` |

## Objects

### Detection

| Field | Type | Notes |
|---|---|---|
| `hazard_detected` | boolean | |
| `hazard_type` | string or null | `null` if and only if `hazard_detected` is `false` |
| `severity` | string or null | `null` if and only if `hazard_detected` is `false` |
| `description` | string | One sentence, shown on the camera banner. Use `"No hazards detected."` when clear. |
| `timestamp` | string | The capture time of the analysed frame |

### Agent state

| Field | Type | Notes |
|---|---|---|
| `status` | string | See [Status meanings](#status-meanings) |
| `server_time` | string | The backend's current time. The frontend uses it to correct the countdown for clock differences. |
| `latest_detection` | Detection or null | Drives the camera banner. See the [rules](#how-the-escalation-should-behave). |
| `escalation` | Escalation or null | The running escalation, or the most recent one. `null` only if none has ever run. |

### Escalation

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique per run. A new `id` tells the frontend to bring the Agent tab forward. |
| `hazard_type` | string | Never `null` here |
| `severity` | string | Never `null` here |
| `started_at` | string | |
| `ended_at` | string or null | Set when `resolution` is set |
| `resolution` | string or null | |
| `next_action` | object or null | The countdown. Non-null if and only if a step is `pending`. |
| `next_action.label` | string | Shown as `"<label> in 0:08"`, e.g. `"Calling Sarah (neighbor)"` |
| `next_action.at` | string | When that step becomes `in_progress` |
| `steps` | Step[] | Oldest first. New steps are appended. |

### Step

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique and stable across polls, used as the UI key |
| `type` | string | Selects the icon |
| `title` | string | e.g. `"Call Sarah (neighbor)"` |
| `message` | string | What is happening, or what happened. Update it as the step progresses. |
| `status` | string | |
| `reason` | string or null | Why it failed. Non-null if and only if `status` is `failed`. |
| `started_at` | string or null | `null` while `pending` |
| `finished_at` | string or null | Set when `status` becomes `success` or `failed` |
| `transcript` | array or null | Simulated call or SMS text. `null` if there is none, e.g. for `hazard_detected`. |
| `transcript[].speaker` | string | Free text, e.g. `"OmniMind"`, `"OmniMind (SMS)"`, `"Dispatcher"`, `"System"` |
| `transcript[].text` | string | |
| `outcome_label` | string or null | Optional short label that replaces the default status label ("Done", "Failed") in the UI, shown in a neutral amber tone. Use it when `status` alone reads wrong, e.g. `"No answer"` for an owner call that finished (`success`) but nobody picked up, or `"Answered, can't come"` for a contact who answered but can't help in time. Set it when the step finishes; `null` otherwise. It never changes `status`. |

Example of a finished step with an outcome label:

```json
{
  "id": "step_3",
  "type": "call_owner",
  "title": "Call owner",
  "message": "Nobody picked up. Voicemail left.",
  "status": "success",
  "reason": null,
  "started_at": "2026-10-31T14:14:17.120Z",
  "finished_at": "2026-10-31T14:14:22.120Z",
  "transcript": [
    { "speaker": "OmniMind", "text": "Hello Ahmad, this is OmniMind. ..." }
  ],
  "outcome_label": "No answer"
}
```

The list holds at most one `pending` step and at most one `in_progress` step, never both at once.

## Endpoints

### POST /frame

Analyses one camera frame. The frontend captures every 2 s and sends a frame when the scene changed, and at least every 10 s as a heartbeat. Starting an escalation is the backend's job; the frontend does not start one from this response.

**Request:** `multipart/form-data`

| Field | Type | Notes |
|---|---|---|
| `image` | file | JPEG named `frame.jpg`, at most 960 px wide |
| `timestamp` | text | Capture time, ISO-8601 |

**Response:** the analysis of this frame, as a Detection.

```json
{
  "hazard_detected": true,
  "hazard_type": "person_fallen",
  "severity": "critical",
  "description": "A person is lying motionless on the living room floor.",
  "timestamp": "2026-10-31T14:14:03.120Z"
}
```

With no hazard:

```json
{
  "hazard_detected": false,
  "hazard_type": null,
  "severity": null,
  "description": "No hazards detected.",
  "timestamp": "2026-10-31T14:14:13.120Z"
}
```

After a successful response the frontend immediately calls `GET /state`, so update the state before responding. **The UI reads hazards from `/state` only**, so the banner follows `latest_detection`, not this response.

### GET /state

Returns the agent state. No parameters.

**Polling:** once per second while the camera is live or `status` is `hazard_detected` or `escalating`, plus once on page load and after each successful `POST /frame`. Polling stops when the camera is off and nothing is active, so the backend must run escalations on its own timers and never rely on polls to advance them. Keep this endpoint fast: no model calls.

**Response while idle, before any escalation:**

```json
{
  "status": "idle",
  "server_time": "2026-10-31T14:10:00.000Z",
  "latest_detection": null,
  "escalation": null
}
```

**Response during an escalation, after a failed step, counting down to the recovery step:**

```json
{
  "status": "escalating",
  "server_time": "2026-10-31T14:15:12.000Z",
  "latest_detection": {
    "hazard_detected": true,
    "hazard_type": "person_fallen",
    "severity": "critical",
    "description": "A person is lying motionless on the living room floor.",
    "timestamp": "2026-10-31T14:14:03.120Z"
  },
  "escalation": {
    "id": "esc_17",
    "hazard_type": "person_fallen",
    "severity": "critical",
    "started_at": "2026-10-31T14:14:03.120Z",
    "ended_at": null,
    "resolution": null,
    "next_action": {
      "label": "Calling Omar (brother)",
      "at": "2026-10-31T14:15:20.000Z"
    },
    "steps": [
      {
        "id": "step_1",
        "type": "hazard_detected",
        "title": "Person fallen detected",
        "message": "A person is lying motionless on the living room floor.",
        "status": "success",
        "reason": null,
        "started_at": "2026-10-31T14:14:03.120Z",
        "finished_at": "2026-10-31T14:14:03.120Z",
        "transcript": null,
        "outcome_label": null
      },
      {
        "id": "step_2",
        "type": "alert_owner",
        "title": "Alert owner",
        "message": "SMS and push alert delivered. No reply yet.",
        "status": "success",
        "reason": null,
        "started_at": "2026-10-31T14:14:07.120Z",
        "finished_at": "2026-10-31T14:14:09.120Z",
        "transcript": [
          { "speaker": "OmniMind (SMS)", "text": "OmniMind alert: A possible fall was detected in the living room at 2:14 PM. Reply OK or tap \"I'm OK\" if you are safe." }
        ],
        "outcome_label": null
      },
      {
        "id": "step_3",
        "type": "call_owner",
        "title": "Call owner",
        "message": "Nobody picked up. Voicemail left.",
        "status": "success",
        "reason": null,
        "started_at": "2026-10-31T14:14:17.120Z",
        "finished_at": "2026-10-31T14:14:22.120Z",
        "transcript": [
          { "speaker": "OmniMind", "text": "Hello Ahmad, this is OmniMind. A possible fall was detected in the living room at 2:14 PM. Please confirm you are safe, or I will contact your emergency contacts." }
        ],
        "outcome_label": "No answer"
      },
      {
        "id": "step_4",
        "type": "contact_person",
        "title": "Call Sarah (neighbor)",
        "message": "Sarah didn't answer.",
        "status": "failed",
        "reason": "No answer after 6 rings.",
        "started_at": "2026-10-31T14:14:30.120Z",
        "finished_at": "2026-10-31T14:14:35.120Z",
        "transcript": [
          { "speaker": "System", "text": "Ringing… no answer after 6 rings. Call ended." }
        ],
        "outcome_label": null
      },
      {
        "id": "step_5",
        "type": "contact_person",
        "title": "Call Omar (brother)",
        "message": "Sarah didn't answer. Trying the next option: Omar.",
        "status": "pending",
        "reason": null,
        "started_at": null,
        "finished_at": null,
        "transcript": null,
        "outcome_label": null
      }
    ]
  }
}
```

**Response after the owner stopped it.** Only the changed fields differ from the shape above:

```json
{
  "status": "resolved",
  "server_time": "2026-10-31T14:14:42.000Z",
  "latest_detection": null,
  "escalation": {
    "id": "esc_17",
    "hazard_type": "person_fallen",
    "severity": "critical",
    "started_at": "2026-10-31T14:14:03.120Z",
    "ended_at": "2026-10-31T14:14:41.500Z",
    "resolution": "owner_confirmed",
    "next_action": null,
    "steps": [
      {
        "id": "step_6",
        "type": "owner_ack",
        "title": "Owner confirmed safe, escalation stopped",
        "message": "Ahmad confirmed they are safe. No further action will be taken.",
        "status": "success",
        "reason": null,
        "started_at": "2026-10-31T14:14:41.500Z",
        "finished_at": "2026-10-31T14:14:41.500Z",
        "transcript": null,
        "outcome_label": null
      }
    ]
  }
}
```

The real response keeps all earlier steps ahead of `step_6`. They are left out here for length.

### POST /ack

The owner pressed "I'm OK, stop". No request body.

**Response:** the agent state after stopping, same shape as `GET /state`. If nothing is active, change nothing and return `200` with the current state.

### POST /ask

Answers a question from the Ask tab.

**Request:** `multipart/form-data`

| Field | Type | Notes |
|---|---|---|
| `text` | text | Always sent. Typed text or speech transcript. Empty string when speech recognition wasn't available; then use `audio`. |
| `audio` | file | Optional. Browser recording, usually `audio/webm` (Chrome, Firefox) or `audio/mp4` (Safari). |

**Audio limitation.** When `text` is non-empty, the backend answers from `text` and ignores `audio`. A voice-only request (empty `text`) is answered from `audio` only if it is **MP3 or WAV**. WebM and MP4 recordings are not transcoded and return `400` with an `{ "error": … }` body. So the frontend should always send the browser's speech transcript as `text` and treat `audio` as optional. If speech recognition is unavailable and the browser records WebM/MP4, expect a `400`.

**Response:**

```json
{ "text": "Everything looks calm at home. No hazards detected." }
```

### POST /profile

Stores the home profile. The frontend sends it once on page load and whenever the owner saves it. Each call replaces the whole profile. The agent uses it for names, numbers and transcripts.

**Request:** `application/json`. All fields are always sent; strings may be empty and `contacts` may be empty.

```json
{
  "owner_name": "Ahmad",
  "owner_phone": "+1 555 0100",
  "address": "12 Maple Street, Springfield",
  "gate_code": "4821",
  "contacts": [
    { "name": "Sarah", "relation": "neighbor", "phone": "+1 555 0142" },
    { "name": "Omar", "relation": "brother", "phone": "+1 555 0177" }
  ]
}
```

`gate_code` is sensitive. Don't log it, and give it only to the emergency service, never to personal contacts.

**Response:**

```json
{ "ok": true }
```

## Status meanings

| `status` | Meaning | Moves to |
|---|---|---|
| `idle` | No frame received in the last 15 s | `monitoring` on a frame |
| `monitoring` | Frames arriving, nothing wrong | `hazard_detected` on a hazard; `idle` after 15 s without frames |
| `hazard_detected` | Hazard found, countdown to the first step running | `escalating` when the first step starts; `resolved` on ack |
| `escalating` | Working through the ladder | `resolved` on ack or after dispatch |
| `resolved` | Finished; held 30 s so the outcome stays visible | `monitoring` or `idle` |

The frontend overrides `idle` and `monitoring` using its own knowledge of whether the camera is on, so those two only need to be roughly right.

## How the escalation should behave

The backend runs this on its own timers once a frame shows a hazard. The default pacing is short for demos.

| Step | Wait before it | Duration | Outcome in the mock |
|---|---|---|---|
| `hazard_detected` | none | instant | Added as `success` when the hazard is found |
| `alert_owner` | 4 s | 2 s | `success`: alert delivered, no reply |
| `call_owner` | 8 s | 5 s | `success` with `outcome_label: "No answer"`: no pick-up, voicemail left |
| `contact_person`, once per profile contact in order | 8 s each | 5 s each | First contact: `failed`, no answer (`outcome_label: null`, shown as "Failed"). Later contacts: `success` with `outcome_label: "Answered, can't come"`, too far away. |
| `dispatch_emergency` | 8 s | 4 s | `success`, then `status` becomes `resolved` with `resolution: "emergency_dispatched"` |

**Step lifecycle.** When a step finishes, append the next one as `pending` and set `next_action`. Set the pending step's `message` to explain the decision. When the wait ends, set the step to `in_progress`, set `started_at`, clear `next_action` and update `message`. When it finishes, set `success` or `failed`, set `finished_at`, fill in `transcript`, and set `outcome_label` if the default status label would read wrong.

**Recovery.** A `failed` step never ends the escalation. Record the `reason`, then move to the next option, and say so in the next step's `message`, e.g. `"Sarah didn't answer. Trying the next option: Omar."` With no contacts on file, go straight from `call_owner` to `dispatch_emergency`.

**What ends an escalation.** Only `POST /ack` or a completed `dispatch_emergency`. In particular:

- A contact answering does not stop it. The ladder continues to dispatch unless the owner acks.
- A later clean frame does not stop it. Models can miss a hazard in one frame.
- A new hazard during an active escalation does not start a second one. Only one runs at a time.

**On `POST /ack`:**

1. Cancel all pending timers. No further simulated calls may happen.
2. Remove the `pending` step, if any.
3. Set an `in_progress` step, if any, to `failed` with `reason: "Stopped: owner confirmed safe."`
4. Append a step with `type: "owner_ack"`, `status: "success"` and `title: "Owner confirmed safe, escalation stopped"`.
5. Set `status: "resolved"`, `resolution: "owner_confirmed"`, `ended_at` and `next_action: null`.

**Rules for `latest_detection`:**

- While `status` is `hazard_detected` or `escalating`, it stays the detection that started the escalation, whatever later frames show.
- It becomes `null` the moment `status` becomes `resolved`, which clears the banner.
- While `status` is `monitoring` or `idle`, it is the latest frame's detection, or `null`. A hazard here always means an escalation has started, so in practice it has `hazard_detected: false`.

**Cooldown after resolving.** The scene may still show the hazard after an ack, for example the person is still on the floor. Ignore the same `hazard_type` for at least 60 s after `ended_at`, or the agent would restart right after being told to stop. During this time `POST /frame` may still report the hazard truthfully, but `/state` must not. A different `hazard_type` escalates immediately.

**After resolving.** Keep the finished `escalation` in `/state` until a new one replaces it, so the timeline stays on screen. Return `status` to `monitoring` or `idle` after 30 s.

**Everything is simulated.** Never place real calls, messages or dispatches. The transcripts are generated text for the on-screen timeline.
