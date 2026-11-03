import { useEffect, useRef, useState } from 'react';
import DemoControls from './DemoControls.jsx';
import {
  AlertIcon,
  BellIcon,
  CheckIcon,
  CloseIcon,
  EyeIcon,
  PhoneIcon,
  ShieldIcon,
  SirenIcon,
} from './Icons.jsx';
import { formatCountdown, formatTime, hazardLabel } from '../hazards.js';

const STATUS_LABELS = {
  idle: 'Idle',
  monitoring: 'Monitoring',
  hazard_detected: 'Hazard detected',
  escalating: 'Escalating',
  resolved: 'Resolved',
};

const STEP_STATUS_LABELS = {
  pending: 'Pending',
  in_progress: 'In progress',
  success: 'Done',
  failed: 'Failed',
};

const STEP_ICONS = {
  hazard_detected: AlertIcon,
  alert_owner: BellIcon,
  call_owner: PhoneIcon,
  contact_person: PhoneIcon,
  dispatch_emergency: SirenIcon,
  owner_ack: ShieldIcon,
};

function statusHint(status, detection, escalation) {
  switch (status) {
    case 'idle':
      return 'Start the camera to begin watching over your home.';
    case 'monitoring':
      return 'Watching for hazards. All clear.';
    case 'resolved':
      return escalation?.resolution === 'owner_confirmed'
        ? 'You confirmed you are safe.'
        : 'Emergency services have been dispatched.';
    default:
      return detection?.description || (escalation ? hazardLabel(escalation.hazard_type) : '');
  }
}

function StatusCard({ agent }) {
  const { status, detection, escalation, simulate, isEscalationActive } = agent;
  return (
    <section className={`status-card status-card--${status}`} aria-live="polite">
      <div className="status-card__row">
        <span className="status-card__dot" aria-hidden="true" />
        <h2>{STATUS_LABELS[status] ?? status}</h2>
        {simulate && <DemoControls onSimulate={simulate} disabled={isEscalationActive} />}
      </div>
      <p>{statusHint(status, detection, escalation)}</p>
    </section>
  );
}

function Countdown({ nextAction, clockOffsetMs }) {
  const remaining = () => Math.ceil((Date.parse(nextAction.at) - (Date.now() + clockOffsetMs)) / 1000);
  const [seconds, setSeconds] = useState(remaining);

  useEffect(() => {
    setSeconds(remaining());
    const intervalId = setInterval(() => setSeconds(remaining()), 250);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextAction.at, clockOffsetMs]);

  return (
    <p className="countdown" role="timer">
      {nextAction.label} in <strong>{formatCountdown(seconds)}</strong>
    </p>
  );
}

function TimelineStep({ step }) {
  const Icon = STEP_ICONS[step.type] ?? CheckIcon;
  const time = step.finished_at || step.started_at;
  // e.g. "No answer": a step that finished, but not the way anyone hoped.
  const outcomeLabel = step.outcome_label;

  return (
    <li className={`step step--${step.status}${outcomeLabel ? ' step--outcome' : ''}`}>
      <div className="step__marker">
        {step.status === 'in_progress' ? (
          <span className="spinner spinner--sm" aria-hidden="true" />
        ) : step.status === 'failed' ? (
          <CloseIcon width={16} height={16} />
        ) : (
          <Icon width={16} height={16} />
        )}
      </div>
      <div className="step__body">
        <div className="step__head">
          <h3>{step.title}</h3>
          {time && <time dateTime={time}>{formatTime(time)}</time>}
        </div>
        <span className="step__status">{outcomeLabel || (STEP_STATUS_LABELS[step.status] ?? step.status)}</span>
        {step.message && <p className="step__message">{step.message}</p>}
        {step.status === 'failed' && step.reason && <p className="step__reason">{step.reason}</p>}
        {step.transcript?.length > 0 && (
          <details className="transcript">
            <summary>Transcript (simulated)</summary>
            {step.transcript.map((line, index) => (
              <p key={index}>
                <strong>{line.speaker}:</strong> {line.text}
              </p>
            ))}
          </details>
        )}
      </div>
    </li>
  );
}

export default function AgentPanel({ agent }) {
  const { escalation, isEscalationActive, clockOffsetMs, isUnreachable, isStopping, stopError, stop } = agent;
  const steps = escalation?.steps ?? [];
  const scrollRef = useRef(null);

  // Keep the newest step in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [steps.length]);

  return (
    <div className="agent">
      <div className="agent__scroll" ref={scrollRef}>
        <StatusCard agent={agent} />

        {isUnreachable && (
          <p className="agent__error" role="alert">
            Can't reach the OmniMind backend. The status shown may be out of date.
          </p>
        )}

        {steps.length === 0 ? (
          <div className="agent__empty">
            <p className="agent__empty-icon">
              <EyeIcon />
            </p>
            <p>If a hazard is detected and you don't respond, every step OmniMind takes will appear here.</p>
          </div>
        ) : (
          <>
            <h2 className="agent__heading">{isEscalationActive ? 'Escalation timeline' : 'Last escalation'}</h2>
            <ol className="timeline" aria-live="polite">
              {steps.map((step) => (
                <TimelineStep key={step.id} step={step} />
              ))}
            </ol>
            <p className="agent__note">Calls, messages and dispatches are simulated.</p>
          </>
        )}
      </div>

      {isEscalationActive && (
        <div className="agent__footer">
          {escalation?.next_action && <Countdown nextAction={escalation.next_action} clockOffsetMs={clockOffsetMs} />}
          {stopError && (
            <p className="agent__error" role="alert">
              {stopError}
            </p>
          )}
          <button type="button" className="btn btn--safe" onClick={stop} disabled={isStopping}>
            <ShieldIcon /> {isStopping ? 'Stopping…' : "I'm OK, stop"}
          </button>
        </div>
      )}
    </div>
  );
}
