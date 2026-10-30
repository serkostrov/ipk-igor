type Listener = () => void;

let count = 0;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((listener) => listener());
}

/** Interactive open tasks assigned to the signed-in user (menu badge). */
export function getMyOpenAutomationTaskCount() {
  return count;
}

export function setMyOpenAutomationTaskCount(next: number) {
  const safe = Number.isFinite(next) ? Math.max(0, Math.floor(next)) : 0;
  if (safe === count) return;
  count = safe;
  notify();
}

export function clearMyOpenAutomationTaskCount() {
  setMyOpenAutomationTaskCount(0);
}

export function subscribeMyOpenAutomationTaskCount(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
