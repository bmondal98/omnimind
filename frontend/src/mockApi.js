// In-browser stand-in for the backend. Same responses as docs/API.md, including a full
// escalation run where the first contact doesn't answer and the agent moves on.
import {
  DEMO_PROFILE,
  ESCALATION_TIMINGS as TIMINGS,
  FRAME_HEARTBEAT_MS,
  MOCK_REPLY_DELAY_MS,
  MOCK_REQUEST_DELAY_MS,
} from './config.js';
import { hazardLabel } from './hazards.js';

const SCENARIOS = {
  person_fallen: {
    severity: 'critical',
    description: 'A person is lying motionless on the living room floor.',
    spoken: 'A possible fall was detected in the living room',
    service: 'Ambulance',
  },
  fire_smoke: {
    severity: 'critical',
    description: 'Smoke and flames are visible in the kitchen.',
    spoken: 'Possible fire and smoke were detected in the kitchen',
    service: 'Fire department',
  },
  stove_unattended: {
    severity: 'high',
    description: 'The stove is on and nobody has been in the kitchen for 20 minutes.',
    spoken: 'A stove was left on unattended in the kitchen',
    service: 'Fire department',
  },
  water_leak: {
    severity: 'medium',
    description: 'Water is spreading across the bathroom floor.',
    spoken: 'A water leak was detected in the bathroom',
    service: 'Emergency plumber',
  },
  intruder: {
    severity: 'high',
    description: 'An unrecognized person entered through the back door.',
    spoken: 'A possible intruder was detected at the back door',
    service: 'Police',
  },
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isoNow = () => new Date().toISOString();
const spokenTime = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

let profile = DEMO_PROFILE;
let lastFrameAt = 0;
let phase = null; // 'hazard_detected' | 'escalating' | 'resolved' | null
let latestDetection = null;
let escalation = null;
let activeRun = null; // { timer } while an escalation is running
let resolvedTimer = null;
let idCounter = 0;

function snapshot() {
  const recentFrame = Date.now() - lastFrameAt < FRAME_HEARTBEAT_MS * 1.5;
  return structuredClone({
    status: phase ?? (recentFrame ? 'monitoring' : 'idle'),
    server_time: isoNow(),
    latest_detection: latestDetection,
    escalation,
  });
}

const cleanDetection = (timestamp) => ({
  hazard_detected: false,
  hazard_type: null,
  severity: null,
  description: 'No hazards detected.',
  timestamp,
});

function addStep(fields) {
  const step = {
    id: `step_${++idCounter}`,
    status: 'pending',
    reason: null,
    started_at: null,
    finished_at: null,
    transcript: null,
    outcome_label: null,
    ...fields,
  };
  escalation.steps.push(step);
  return step;
}

// The ladder for one run. Each entry says what to show before, during and after the step.
function buildPlan(type) {
  const { spoken, service } = SCENARIOS[type];
  const owner = profile.owner_name || 'the homeowner';
  const address = profile.address || 'the address on file';
  const time = spokenTime();
  const message = `${spoken} at ${time}`;
  const contacts = profile.contacts.filter((contact) => contact.name);

  const plan = [
    {
      type: 'alert_owner',
      title: 'Alert owner',
      actionLabel: 'Alerting owner',
      pending: `Will text ${owner} if the hazard isn't cleared.`,
      active: `Sending SMS and push alert to ${profile.owner_phone || owner}…`,
      durationMs: TIMINGS.alertDurationMs,
      outcome: {
        status: 'success',
        message: 'SMS and push alert delivered. No reply yet.',
        transcript: [{ speaker: 'OmniMind (SMS)', text: `OmniMind alert: ${message}. Reply OK or tap "I'm OK" if you are safe.` }],
      },
    },
    {
      type: 'call_owner',
      title: 'Call owner',
      actionLabel: 'Calling owner',
      pending: `No reply from ${owner}. A call comes next.`,
      active: `Calling ${owner} at ${profile.owner_phone || 'the number on file'}…`,
      durationMs: TIMINGS.callDurationMs,
      outcome: {
        status: 'success',
        message: 'Nobody picked up. Voicemail left.',
        outcome_label: 'No answer',
        transcript: [
          { speaker: 'OmniMind', text: `Hello ${owner}, this is OmniMind. ${message}. Please confirm you are safe, or I will contact your emergency contacts.` },
        ],
      },
    },
  ];

  contacts.forEach((contact, index) => {
    const name = contact.relation ? `${contact.name} (${contact.relation})` : contact.name;
    const intro = `Hello ${contact.name}, this is OmniMind calling on behalf of ${owner}. ${message}.`;
    const isFirst = index === 0;
    plan.push({
      type: 'contact_person',
      title: `Call ${name}`,
      actionLabel: `Calling ${name}`,
      pending: isFirst
        ? `${owner} isn't responding. Moving on to emergency contacts.`
        : `${contacts[index - 1].name} didn't answer. Trying the next option: ${contact.name}.`,
      active: `Calling ${contact.name} at ${contact.phone || 'the number on file'}…`,
      durationMs: TIMINGS.callDurationMs,
      // The first contact never answers in the mock, so every demo shows the recovery.
      outcome: isFirst
        ? {
            status: 'failed',
            message: `${contact.name} didn't answer.`,
            reason: 'No answer after 6 rings.',
            transcript: [{ speaker: 'System', text: 'Ringing… no answer after 6 rings. Call ended.' }],
          }
        : {
            status: 'success',
            message: `${contact.name} answered, but is 25 minutes away.`,
            outcome_label: "Answered, can't come",
            transcript: [
              { speaker: 'OmniMind', text: `${intro} The address is ${address}. Can you get there now?` },
              { speaker: contact.name, text: "I'm 25 minutes away. I'm leaving now, but please send help." },
            ],
          },
    });
  });

  const lastContact = contacts[contacts.length - 1];
  plan.push({
    type: 'dispatch_emergency',
    title: `Dispatch ${service.toLowerCase()}`,
    actionLabel: `Dispatching ${service.toLowerCase()}`,
    pending: !lastContact
      ? 'No contacts on file. Moving on to emergency services.'
      : contacts.length === 1
        ? `${lastContact.name} didn't answer. Moving on to emergency services.`
        : `${lastContact.name} can't arrive in time. Moving on to emergency services.`,
    active: `Calling dispatch (simulated)…`,
    durationMs: TIMINGS.dispatchDurationMs,
    outcome: {
      status: 'success',
      message: `${service} dispatched to ${address}.`,
      transcript: [
        {
          speaker: 'OmniMind',
          text: `This is OmniMind, an automated home-safety agent, calling on behalf of ${owner}. ${message}. The address is ${address}.${profile.gate_code ? ` The gate code is ${profile.gate_code}.` : ''} Nobody at the home is responding.`,
        },
        { speaker: 'Dispatcher', text: 'Understood. Help is on the way.' },
      ],
    },
  });

  return plan;
}

function finish(resolution) {
  phase = 'resolved';
  latestDetection = null;
  activeRun = null;
  escalation.resolution = resolution;
  escalation.ended_at = isoNow();
  escalation.next_action = null;
  resolvedTimer = setTimeout(() => {
    phase = null;
  }, TIMINGS.resolvedHoldMs);
}

async function runEscalation(type, run) {
  // ack() clears run.timer, which leaves this function suspended for good: that's the cancel.
  const sleep = (ms) =>
    new Promise((resolve) => {
      run.timer = setTimeout(resolve, ms);
    });

  const plan = buildPlan(type);
  for (const [index, item] of plan.entries()) {
    const delayMs = index === 0 ? TIMINGS.detectionGraceMs : TIMINGS.stepGapMs;
    const step = addStep({ type: item.type, title: item.title, message: item.pending });
    escalation.next_action = { label: item.actionLabel, at: new Date(Date.now() + delayMs).toISOString() };
    await sleep(delayMs);

    phase = 'escalating';
    escalation.next_action = null;
    Object.assign(step, { status: 'in_progress', message: item.active, started_at: isoNow() });
    await sleep(item.durationMs);

    Object.assign(step, item.outcome, { finished_at: isoNow() });
  }
  finish('emergency_dispatched');
}

export async function simulateHazard(type) {
  await wait(MOCK_REQUEST_DELAY_MS);
  const scenario = SCENARIOS[type];
  if (!scenario || activeRun) return snapshot();

  clearTimeout(resolvedTimer);
  const timestamp = isoNow();
  latestDetection = {
    hazard_detected: true,
    hazard_type: type,
    severity: scenario.severity,
    description: scenario.description,
    timestamp,
  };
  phase = 'hazard_detected';
  escalation = {
    id: `esc_${++idCounter}`,
    hazard_type: type,
    severity: scenario.severity,
    started_at: timestamp,
    ended_at: null,
    resolution: null,
    next_action: null,
    steps: [],
  };
  addStep({
    type: 'hazard_detected',
    title: `${hazardLabel(type)} detected`,
    message: scenario.description,
    status: 'success',
    started_at: timestamp,
    finished_at: timestamp,
  });

  activeRun = { timer: null };
  runEscalation(type, activeRun);
  return snapshot();
}

export async function sendFrame(blob, timestamp) {
  await wait(MOCK_REQUEST_DELAY_MS);
  lastFrameAt = Date.now();
  return latestDetection ? { ...latestDetection, timestamp } : cleanDetection(timestamp);
}

export async function getState() {
  await wait(MOCK_REQUEST_DELAY_MS);
  return snapshot();
}

export async function ack() {
  await wait(MOCK_REQUEST_DELAY_MS);
  if (!activeRun) return snapshot();

  clearTimeout(activeRun.timer);
  const now = isoNow();
  escalation.steps = escalation.steps.filter((step) => step.status !== 'pending');
  escalation.steps.forEach((step) => {
    if (step.status !== 'in_progress') return;
    Object.assign(step, {
      status: 'failed',
      message: 'Cancelled.',
      reason: 'Stopped: owner confirmed safe.',
      finished_at: now,
    });
  });
  addStep({
    type: 'owner_ack',
    title: 'Owner confirmed safe, escalation stopped',
    message: `${profile.owner_name || 'The owner'} confirmed they are safe. No further action will be taken.`,
    status: 'success',
    started_at: now,
    finished_at: now,
  });
  finish('owner_confirmed');
  return snapshot();
}

export async function askQuestion(text, audioBlob = null) {
  await wait(MOCK_REPLY_DELAY_MS);
  if (activeRun && escalation) {
    const current = escalation.steps[escalation.steps.length - 1];
    return {
      text: `${latestDetection.description} I'm escalating right now. Latest step: ${current.title}. Tap "I'm OK, stop" on the Agent tab if you are safe.`,
    };
  }
  if (escalation?.resolution === 'emergency_dispatched') {
    return { text: `Emergency services were dispatched for the last hazard: ${hazardLabel(escalation.hazard_type).toLowerCase()}.` };
  }
  if (escalation?.resolution === 'owner_confirmed') {
    return { text: 'You confirmed you were safe, so I stopped the last escalation. Everything looks calm now.' };
  }
  return { text: audioBlob && !text ? "I heard you. Everything looks calm at home." : 'Everything looks calm at home. No hazards detected.' };
}

export async function saveProfile(nextProfile) {
  await wait(MOCK_REQUEST_DELAY_MS);
  profile = structuredClone(nextProfile);
  return { ok: true };
}
