# OmniMind — Frontend

React + Vite (JavaScript, plain CSS) frontend for OmniMind, an AI home-safety agent.
A camera watches the home, a vision model on the backend detects hazards, and an autonomous
agent escalates step by step if the owner doesn't respond: alert owner, call owner, contact
people, dispatch emergency service. All calls, messages and dispatches are simulated and shown
on screen. You can also ask the agent questions by voice or text.

## Run

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173 (also exposed on your LAN)
npm run build      # production build into dist/
npm run preview    # serve the build (also on your LAN)
```

`npm run dev` also prints a **Network** URL (e.g. `http://192.168.1.20:5173`) for devices on
the same Wi-Fi.

## Demo without a backend

The in-browser mock is on by default. On the **Agent** tab, press **Simulate hazard** and pick a
hazard type to run a full escalation. In the mock the first contact never answers, so every run
shows the agent recovering. Timings are in `ESCALATION_TIMINGS` in `src/config.js`.

## Backend

The contract is in [`docs/API.md`](../docs/API.md). To use a real backend, copy `.env.example` to
`.env.local` and set:

```
VITE_USE_MOCK=false
VITE_API_URL=http://localhost:8000
```

Restart `npm run dev` after changing these.

## Phone camera needs HTTPS

Browsers only allow camera and microphone access in a *secure context*: `https://…` or
`http://localhost`. On your laptop, `http://localhost:5173` works as is. On a phone the LAN
address is plain `http://`, so the camera and mic are blocked and the app shows a
"needs HTTPS" error.

Ways to test on a phone:

1. **Self-signed HTTPS in Vite:** `npm i -D @vitejs/plugin-basic-ssl`, add `basicSsl()` to
   `plugins` in `vite.config.js`, open `https://<LAN-IP>:5173` and accept the certificate warning.
2. **Android Chrome only:** open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`,
   add `http://<LAN-IP>:5173`, enable it and relaunch Chrome.
3. **Tunnel** (ngrok, cloudflared, etc.): gives a public HTTPS URL with a valid certificate.
   This needs an extra tool and isn't installed.

A real backend on another device must also be reachable over HTTPS from an HTTPS page.

## Structure

```
src/
  api.js                 real backend calls; switches to the mock with VITE_USE_MOCK
  mockApi.js             in-browser backend, including the escalation run
  config.js              frame, polling and escalation timings, demo profile
  hazards.js             hazard labels, time formatting
  App.jsx                layout + message state
  hooks/
    useCamera.js         getUserMedia stream + UI state
    useFrameCapture.js   periodic capture, scene-change filter, heartbeat
    useAgentState.js     polls GET /state; ack and simulate actions
    useProfile.js        home profile in localStorage + saveProfile()
    useVoiceInput.js     MediaRecorder + Web Speech API push-to-talk
  components/
    CameraView.jsx       live feed, state overlays, chips
    HazardBanner.jsx     severity-coloured alert over the video
    Sidebar.jsx          header, settings button, Agent / Ask tabs
    AgentPanel.jsx       status card, escalation timeline, countdown, stop button
    DemoControls.jsx     "Simulate hazard" menu (mock mode only)
    ProfilePanel.jsx     home profile ("Active Memory") dialog
    ChatSidebar.jsx      messages, mic + text composer
    MessageList.jsx      chat bubbles, live transcript, typing indicator
    MicButton.jsx        push-to-talk button
    Logo.jsx, Icons.jsx  inline SVGs
  styles.css             all styles (light/dark tokens, mobile bottom sheet)
```
