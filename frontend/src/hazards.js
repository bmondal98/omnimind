// Display labels for the hazard types in docs/API.md, in menu order.
export const HAZARD_LABELS = {
  person_fallen: 'Person fallen',
  fire_smoke: 'Fire or smoke',
  stove_unattended: 'Stove left unattended',
  water_leak: 'Water leak',
  intruder: 'Intruder',
};

export const hazardLabel = (type) => HAZARD_LABELS[type] ?? 'Hazard';

export function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

export function formatCountdown(totalSeconds) {
  const seconds = Math.max(0, totalSeconds);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
