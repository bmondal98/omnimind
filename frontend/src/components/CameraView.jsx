import Logo from './Logo.jsx';
import { AlertIcon, CameraIcon, CameraOffIcon } from './Icons.jsx';

// Centered overlay content for every non-live camera state.
function CameraPlaceholder({ status, error, onStart }) {
  if (status === 'requesting') {
    return (
      <div className="camera-placeholder">
        <div className="spinner" aria-hidden="true" />
        <p className="camera-placeholder__title">Waiting for camera permission…</p>
        <p className="camera-placeholder__text">Allow access in the browser prompt to continue.</p>
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="camera-placeholder">
        <div className="camera-placeholder__icon camera-placeholder__icon--warn">
          <CameraOffIcon width={28} height={28} />
        </div>
        <p className="camera-placeholder__title">Camera access was blocked</p>
        <p className="camera-placeholder__text">
          Allow camera access for this site in your browser settings, then try again.
        </p>
        <button type="button" className="btn btn--primary" onClick={onStart}>
          Try again
        </button>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="camera-placeholder">
        <div className="camera-placeholder__icon camera-placeholder__icon--warn">
          <AlertIcon width={28} height={28} />
        </div>
        <p className="camera-placeholder__title">Camera unavailable</p>
        <p className="camera-placeholder__text">{error}</p>
        <button type="button" className="btn btn--primary" onClick={onStart}>
          Try again
        </button>
      </div>
    );
  }

  // idle
  return (
    <div className="camera-placeholder">
      <div className="camera-placeholder__icon">
        <CameraIcon width={28} height={28} />
      </div>
      <p className="camera-placeholder__title">Show OmniMind your world</p>
      <p className="camera-placeholder__text">
        Start your camera and OmniMind will remember what you see.
      </p>
      <button type="button" className="btn btn--primary btn--lg" onClick={onStart}>
        <CameraIcon /> Start camera
      </button>
    </div>
  );
}

export default function CameraView({ camera, frameCount, lastFrame }) {
  const { videoRef, status, error, start, stop } = camera;
  const isLive = status === 'live';

  return (
    <section className={`camera ${isLive ? 'is-live' : ''}`} aria-label="Camera">
      {/* Always mounted so the stream can attach as soon as it arrives. */}
      <video ref={videoRef} className="camera__video" autoPlay playsInline muted />

      <header className="camera__topbar">
        <div className="brand">
          <Logo size={28} />
          <span className="brand__name">OmniMind</span>
        </div>

        {isLive && (
          <div className="camera__chips">
            <span className="chip chip--live">
              <span className="chip__dot" aria-hidden="true" /> LIVE
            </span>
            <span className="chip" aria-live="polite">
              {frameCount} {frameCount === 1 ? 'frame' : 'frames'}
            </span>
          </div>
        )}
      </header>

      {!isLive && <CameraPlaceholder status={status} error={error} onStart={start} />}

      {isLive && (
        <div className="camera__bottombar">
          {lastFrame && (
            <figure className="frame-preview" title={`Last frame: ${lastFrame.width}×${lastFrame.height}, ${lastFrame.sizeKB} KB`}>
              <img src={lastFrame.url} alt="Most recent captured frame" />
              <figcaption>{lastFrame.sizeKB} KB</figcaption>
            </figure>
          )}
          <button type="button" className="btn btn--glass" onClick={stop}>
            <span className="stop-square" aria-hidden="true" /> Stop camera
          </button>
        </div>
      )}
    </section>
  );
}
