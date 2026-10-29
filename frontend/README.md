# OmniMind — Frontend

React + Vite (JavaScript, plain CSS) frontend for OmniMind, a visual memory assistant.
The phone camera streams what you see, frames are captured every few seconds, and you
ask questions by voice or text. The backend is stubbed for now (see `src/api.js`).

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

## Structure

```
src/
  api.js                 backend stubs: sendFrame(), askQuestion()
  config.js              frame interval, size, JPEG quality, reply delay
  App.jsx                layout + message state
  hooks/
    useCamera.js         getUserMedia stream + UI state
    useFrameCapture.js   periodic JPEG capture via canvas
    useVoiceInput.js     MediaRecorder + Web Speech API push-to-talk
  components/
    CameraView.jsx       live feed, state overlays, LIVE chip, frame counter
    ChatSidebar.jsx      header, messages, mic + text composer
    MessageList.jsx      chat bubbles, live transcript, typing indicator
    MicButton.jsx        push-to-talk button
    Logo.jsx, Icons.jsx  inline SVGs
  styles.css             all styles (light/dark tokens, mobile bottom sheet)
```

## Connecting the backend

Replace the stub bodies in `src/api.js`:

- `sendFrame(blob, timestamp)` is called once per captured JPEG frame.
- `askQuestion(text, audioBlob)` must resolve to `{ text }`, the assistant's answer.
  `text` can be empty for voice questions when speech recognition isn't available. In that
  case use `audioBlob`.
