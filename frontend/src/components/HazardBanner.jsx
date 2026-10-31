import { AlertIcon } from './Icons.jsx';
import { formatTime, hazardLabel } from '../hazards.js';

// Overlay on the camera for the latest hazard detection, coloured by severity.
export default function HazardBanner({ detection }) {
  return (
    <div className={`hazard-banner hazard-banner--${detection.severity}`} role="alert">
      <AlertIcon className="hazard-banner__icon" width={22} height={22} />
      <div className="hazard-banner__body">
        <p className="hazard-banner__title">
          {hazardLabel(detection.hazard_type)}
          <span className="hazard-banner__severity">{detection.severity}</span>
          <time dateTime={detection.timestamp}>{formatTime(detection.timestamp)}</time>
        </p>
        <p className="hazard-banner__text">{detection.description}</p>
      </div>
    </div>
  );
}
