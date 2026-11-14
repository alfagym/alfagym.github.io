// Authentic Stereo 2-Strike Gym Bell ("DING-DING!") & Ambient-Only Web Audio Engine
// Keeps navigator.audioSession.type locked to 'ambient' (MixWithOthers) so Spotify/Apple Music never pause.

import {
  BOXING_BELL_SAMPLE_RATE,
  BOXING_BELL_LEAD_IN_SEC,
  BOXING_BELL_DURATION_SEC,
  BOXING_BELL_WAV_DATA_URI,
} from '../data/boxingBellAsset';

const SILENT_LEAD_IN_SEC = BOXING_BELL_LEAD_IN_SEC;
const BELL_DURATION_SEC = BOXING_BELL_DURATION_SEC;

let sharedAudioCtx = null;
let cachedBellAudioBuffer = null;

let isBellCurrentlyRinging = false;
let activeRingToken = 0;
let activeImmediateBell = null;
let cleanupRingTimeoutId = null;

let wakeLockSentinel = null;
let wakeLockDesired = false;
let globalUnlockInstalled = false;

export const REST_AUDIO_MODES = ['background', 'off'];
const REST_AUDIO_MODE_KEY = 'alfa_gym_rest_audio_mode';

let currentRestAudioModeCache = null;
let scheduleToken = 0;
let activeScheduledRest = null;
let coldRearmCleanup = null;
let swRegistrationPromise = null;
const rungTimerIds = new Set();

function lockAmbientAudioSession() {
  try {
    if (
      typeof navigator !== 'undefined' &&
      'audioSession' in navigator &&
      navigator.audioSession &&
      'type' in navigator.audioSession
    ) {
      if (navigator.audioSession.type !== 'ambient') {
        navigator.audioSession.type = 'ambient';
      }
    }
  } catch {
    // Safari/browser without AudioSession API
  }
}

function getOrCreateAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioCtx();
    cachedBellAudioBuffer = null;
  }
  return sharedAudioCtx;
}

/**
 * Lazily decodes the stereo 16-bit PCM frames directly from BOXING_BELL_WAV_DATA_URI
 * (skipping the 250ms silent lead-in) into a reusable Web Audio AudioBuffer.
 */
function getBoxingBellAudioBuffer(ctx) {
  if (cachedBellAudioBuffer) return cachedBellAudioBuffer;

  const commaIdx = BOXING_BELL_WAV_DATA_URI.indexOf(',');
  const b64 =
    commaIdx >= 0
      ? BOXING_BELL_WAV_DATA_URI.slice(commaIdx + 1)
      : BOXING_BELL_WAV_DATA_URI;
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const view = new DataView(bytes.buffer);
  const leadInFrames = Math.round(SILENT_LEAD_IN_SEC * BOXING_BELL_SAMPLE_RATE);
  const pcmByteStart = 44 + leadInFrames * 4; // 44-byte RIFF header + stereo int16 lead-in
  const totalBellFrames = Math.max(
    1,
    Math.floor((bytes.byteLength - pcmByteStart) / 4)
  );

  const buffer = ctx.createBuffer(2, totalBellFrames, BOXING_BELL_SAMPLE_RATE);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  let ptr = pcmByteStart;
  for (let i = 0; i < totalBellFrames; i++) {
    left[i] = view.getInt16(ptr, true) / 32768;
    right[i] = view.getInt16(ptr + 2, true) / 32768;
    ptr += 4;
  }

  cachedBellAudioBuffer = buffer;
  return buffer;
}

function disconnectNodeSafe(node) {
  if (!node) return;
  try {
    node.disconnect();
  } catch {
    // ignore disconnect errors
  }
}

function stopAudioSourceSafe(node) {
  if (!node) return;
  try {
    // Detach onended BEFORE stop() so manual cancellations never invoke completion handlers
    node.onended = null;
  } catch {
    // ignore
  }
  try {
    node.stop();
  } catch {
    // ignore if unstarted or already stopped
  }
  disconnectNodeSafe(node);
}

function clearImmediateBell() {
  if (cleanupRingTimeoutId) {
    clearTimeout(cleanupRingTimeoutId);
    cleanupRingTimeoutId = null;
  }
  const current = activeImmediateBell;
  activeImmediateBell = null;
  if (current) {
    stopAudioSourceSafe(current.source);
    disconnectNodeSafe(current.gain);
  }
  isBellCurrentlyRinging = false;
}

function cancelScheduledRestAudio() {
  scheduleToken += 1;
  const active = activeScheduledRest;
  activeScheduledRest = null;
  if (active) {
    stopAudioSourceSafe(active.source);
    disconnectNodeSafe(active.gain);
  }
}

function clearColdRearmListener() {
  if (typeof coldRearmCleanup === 'function') {
    coldRearmCleanup();
    coldRearmCleanup = null;
  }
}

function normalizeRestAudioMode(mode) {
  return mode === 'off' ? 'off' : 'background';
}

export function getRestAudioMode() {
  if (
    currentRestAudioModeCache &&
    REST_AUDIO_MODES.includes(currentRestAudioModeCache)
  ) {
    return currentRestAudioModeCache;
  }
  try {
    const saved =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(REST_AUDIO_MODE_KEY)
        : null;
    if (saved === 'off') {
      currentRestAudioModeCache = 'off';
      return 'off';
    }
    if (saved === 'music100' || saved === 'lockscreen') {
      currentRestAudioModeCache = 'background';
      try {
        localStorage.setItem(REST_AUDIO_MODE_KEY, 'background');
      } catch {
        // Ignore storage write errors
      }
      return 'background';
    }
    if (saved === 'background') {
      currentRestAudioModeCache = 'background';
      return 'background';
    }
  } catch {
    // Ignore storage read errors
  }
  currentRestAudioModeCache = 'background';
  return 'background';
}

export function setRestAudioMode(mode) {
  const valid = normalizeRestAudioMode(mode);
  currentRestAudioModeCache = valid;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(REST_AUDIO_MODE_KEY, valid);
    }
  } catch {
    // Ignore storage write errors
  }
  return valid;
}

function markRestBellRung(timerId) {
  if (!timerId) return;
  if (rungTimerIds.size > 40) {
    const first = rungTimerIds.values().next().value;
    rungTimerIds.delete(first);
  }
  rungTimerIds.add(timerId);
}

export function hasTimerBellAlreadyRung(timerId) {
  return Boolean(timerId && rungTimerIds.has(timerId));
}

export function isBakedRestAudioPlayingFor(timerId) {
  if (!timerId || !activeScheduledRest) return false;
  if (activeScheduledRest.timerId !== timerId) return false;
  if (hasTimerBellAlreadyRung(timerId)) return false;
  if (!sharedAudioCtx || sharedAudioCtx.state !== 'running') return false;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return false;
  }
  const now = Date.now();
  return (
    now >= activeScheduledRest.expectedWallEndMs - 200 &&
    now <= activeScheduledRest.expectedBellFinishWallMs + 350
  );
}

async function acquireWakeLockSafe() {
  if (!wakeLockDesired || wakeLockSentinel) return;
  if (
    typeof navigator === 'undefined' ||
    !('wakeLock' in navigator) ||
    !navigator.wakeLock
  ) {
    return;
  }
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return;
  }
  try {
    const sentinel = await navigator.wakeLock.request('screen');
    if (!wakeLockDesired) {
      try {
        await sentinel.release();
      } catch {
        // ignore
      }
      return;
    }
    wakeLockSentinel = sentinel;
    sentinel.addEventListener('release', () => {
      if (wakeLockSentinel === sentinel) {
        wakeLockSentinel = null;
      }
    });
  } catch {
    // Low Power Mode or restricted context may decline Screen Wake Lock; non-fatal
  }
}

async function releaseWakeLockSafe() {
  const current = wakeLockSentinel;
  wakeLockSentinel = null;
  if (current) {
    try {
      await current.release();
    } catch {
      // ignore
    }
  }
}

/**
 * Unlocks Web Audio inside user gesture handlers under permanent 'ambient' AudioSession
 * without ever suspending the AudioContext or pausing external music.
 */
export function unlockGymAudio() {
  lockAmbientAudioSession();

  try {
    if (wakeLockDesired && !wakeLockSentinel) {
      acquireWakeLockSafe();
    }

    const ctx = getOrCreateAudioContext();
    if (!ctx) return false;

    if (ctx.state !== 'running') {
      try {
        const resumePromise = ctx.resume();
        if (resumePromise && typeof resumePromise.catch === 'function') {
          resumePromise.catch(() => {});
        }
      } catch {
        // ignore resume errors
      }

      try {
        const silentBuffer = ctx.createBuffer(1, 1, 22050);
        const silentSource = ctx.createBufferSource();
        silentSource.buffer = silentBuffer;
        silentSource.connect(ctx.destination);
        silentSource.onended = () => {
          disconnectNodeSafe(silentSource);
        };
        silentSource.start(0);
      } catch {
        // ignore silent unlock errors
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function installGlobalAudioUnlock() {
  lockAmbientAudioSession();
  if (globalUnlockInstalled || typeof window === 'undefined') return;
  globalUnlockInstalled = true;

  const handleUserGesture = () => {
    unlockGymAudio();
  };

  window.addEventListener('touchend', handleUserGesture, {
    capture: true,
    passive: true,
  });
  window.addEventListener('click', handleUserGesture, {
    capture: true,
    passive: true,
  });
  window.addEventListener('keydown', handleUserGesture, {
    capture: true,
    passive: true,
  });

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        // Prevent frozen iOS background ctx.currentTime from firing a stale bell on return
        cancelScheduledRestAudio();
      } else if (document.visibilityState === 'visible') {
        lockAmbientAudioSession();
        if (wakeLockDesired && !wakeLockSentinel) {
          acquireWakeLockSafe();
        }
      }
    });
  }

  window.addEventListener('pagehide', () => {
    cancelScheduledRestAudio();
  });
}

/**
 * Keeps the iPhone screen awake via Screen Wake Lock API while the between-set rest timer
 * is actively counting down.
 */
export function setRestAudioKeepAlive(active) {
  wakeLockDesired = Boolean(active);
  if (!wakeLockDesired) {
    releaseWakeLockSafe();
    return;
  }
  acquireWakeLockSafe();
}

export function playBoxingRingBell() {
  lockAmbientAudioSession();

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([100, 155, 220]);
    }
  } catch {
    // ignore vibrate errors
  }

  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return false;

    clearImmediateBell();
    const token = ++activeRingToken;
    isBellCurrentlyRinging = true;

    const startImmediateBell = () => {
      if (token !== activeRingToken) return;
      try {
        const buffer = getBoxingBellAudioBuffer(ctx);
        const source = ctx.createBufferSource();
        const masterGain = ctx.createGain();
        source.buffer = buffer;
        masterGain.gain.setValueAtTime(1.0, ctx.currentTime);
        source.connect(masterGain);
        masterGain.connect(ctx.destination);

        activeImmediateBell = { source, gain: masterGain };

        source.onended = () => {
          if (token !== activeRingToken) return;
          activeImmediateBell = null;
          disconnectNodeSafe(source);
          disconnectNodeSafe(masterGain);
          isBellCurrentlyRinging = false;
          if (cleanupRingTimeoutId) {
            clearTimeout(cleanupRingTimeoutId);
            cleanupRingTimeoutId = null;
          }
        };

        source.start(0);

        const durationMs = Math.round(
          (Number.isFinite(buffer?.duration) && buffer.duration > 0
            ? buffer.duration
            : BELL_DURATION_SEC) * 1000
        );
        cleanupRingTimeoutId = setTimeout(() => {
          if (token !== activeRingToken) return;
          clearImmediateBell();
        }, durationMs + 400);
      } catch {
        if (token === activeRingToken) {
          clearImmediateBell();
        }
      }
    };

    if (ctx.state === 'running') {
      startImmediateBell();
      return true;
    }

    const resumePromise = ctx.resume();
    if (resumePromise && typeof resumePromise.then === 'function') {
      resumePromise
        .then(() => {
          if (token !== activeRingToken) return;
          if (ctx.state === 'running') {
            startImmediateBell();
          } else {
            clearImmediateBell();
          }
        })
        .catch(() => {
          if (token === activeRingToken) {
            clearImmediateBell();
          }
        });
      return true;
    }

    if (ctx.state === 'running') {
      startImmediateBell();
      return true;
    }

    clearImmediateBell();
    return false;
  } catch {
    clearImmediateBell();
    return false;
  }
}

export function playGymSound(type = 'check') {
  if (type === 'timerDone' || type === 'boxingBell') {
    return playBoxingRingBell();
  }
  // 'check' and 'pr' are intentionally silent so music playback is undisturbed
  return false;
}

export function stopBakedRestTimerAudio() {
  clearColdRearmListener();
  cancelScheduledRestAudio();
}

export function startBakedRestTimerAudio({ timerId, remainingMs, onBellRung } = {}) {
  stopBakedRestTimerAudio();

  const mode = getRestAudioMode();
  if (
    !timerId ||
    mode === 'off' ||
    hasTimerBellAlreadyRung(timerId) ||
    !Number.isFinite(remainingMs) ||
    remainingMs <= 150
  ) {
    return false;
  }

  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return false;
  }

  lockAmbientAudioSession();

  const ctx = getOrCreateAudioContext();
  if (!ctx) return false;

  const token = scheduleToken;
  const expectedWallEndMs = Date.now() + remainingMs;

  const scheduleOnContext = (currentRemainingMs) => {
    if (token !== scheduleToken) return false;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return false;
    }
    if (hasTimerBellAlreadyRung(timerId) || currentRemainingMs <= 150) {
      return false;
    }

    try {
      const buffer = getBoxingBellAudioBuffer(ctx);
      const source = ctx.createBufferSource();
      const masterGain = ctx.createGain();
      source.buffer = buffer;

      const delaySec = Math.max(0.05, currentRemainingMs / 1000);
      const startCtxTime = ctx.currentTime + delaySec;
      const bellDurationMs = Math.round(
        (Number.isFinite(buffer?.duration) && buffer.duration > 0
          ? buffer.duration
          : BELL_DURATION_SEC) * 1000
      );
      const wallEndMs = Date.now() + Math.max(50, currentRemainingMs);
      const expectedBellFinishWallMs = wallEndMs + bellDurationMs;

      masterGain.gain.setValueAtTime(1.0, startCtxTime);
      source.connect(masterGain);
      masterGain.connect(ctx.destination);

      activeScheduledRest = {
        token,
        timerId,
        source,
        gain: masterGain,
        expectedWallEndMs: wallEndMs,
        expectedBellFinishWallMs,
      };

      source.onended = () => {
        if (token !== scheduleToken) return;
        const current = activeScheduledRest;
        if (!current || current.token !== token) return;
        activeScheduledRest = null;
        disconnectNodeSafe(source);
        disconnectNodeSafe(masterGain);

        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
          return;
        }
        const now = Date.now();
        if (
          now < current.expectedWallEndMs - 200 ||
          Math.abs(now - current.expectedBellFinishWallMs) > 1500
        ) {
          return;
        }

        markRestBellRung(timerId);
        try {
          if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate([100, 155, 220]);
          }
        } catch {
          // ignore vibrate errors
        }
        if (typeof onBellRung === 'function') {
          try {
            onBellRung(timerId);
          } catch {
            // ignore callback errors
          }
        }
      };

      source.start(startCtxTime);
      return true;
    } catch {
      if (token === scheduleToken) {
        cancelScheduledRestAudio();
      }
      return false;
    }
  };

  if (ctx.state === 'running') {
    return scheduleOnContext(remainingMs);
  }

  try {
    const resumePromise = ctx.resume();
    if (resumePromise && typeof resumePromise.then === 'function') {
      resumePromise
        .then(() => {
          if (token !== scheduleToken || ctx.state !== 'running') return;
          const actualRemainingMs = expectedWallEndMs - Date.now();
          if (scheduleOnContext(actualRemainingMs)) {
            clearColdRearmListener();
          }
        })
        .catch(() => {});
    }
  } catch {
    // ignore resume failure outside gesture
  }
  return false;
}

export function armRestAudioOnNextTap(getConfigFn) {
  clearColdRearmListener();
  if (typeof window === 'undefined' || typeof getConfigFn !== 'function') return;
  const handler = () => {
    clearColdRearmListener();
    const cfg = getConfigFn();
    if (cfg && cfg.remainingMs > 150) {
      startBakedRestTimerAudio(cfg);
    }
  };
  window.addEventListener('touchstart', handler, {
    capture: true,
    passive: true,
    once: true,
  });
  window.addEventListener('mousedown', handler, {
    capture: true,
    passive: true,
    once: true,
  });
  coldRearmCleanup = () => {
    window.removeEventListener('touchstart', handler, { capture: true });
    window.removeEventListener('mousedown', handler, { capture: true });
  };
}

export function getNotificationPermissionState() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return window.Notification.permission || 'default';
}

export function registerGymServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  if (!swRegistrationPromise) {
    swRegistrationPromise = navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .catch(() => null);
  }
  return swRegistrationPromise;
}

export async function requestGymNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const perm = await window.Notification.requestPermission();
    if (perm === 'granted') {
      registerGymServiceWorker();
    }
    return perm;
  } catch {
    return window.Notification.permission || 'denied';
  }
}

export async function sendRestDoneNotification({
  exerciseName = '',
  lang = 'es',
  silent = true,
} = {}) {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    window.Notification.permission !== 'granted'
  ) {
    return false;
  }
  const title =
    lang === 'es' ? '🔔 ¡Descanso terminado!' : '🔔 Rest Complete!';
  const body = exerciseName
    ? lang === 'es'
      ? `Siguiente serie: ${exerciseName}`
      : `Next set: ${exerciseName}`
    : lang === 'es'
    ? 'Tu tiempo de descanso ha finalizado. ¡Vamos!'
    : 'Your rest timer has finished. Let’s go!';

  try {
    const reg =
      (await (swRegistrationPromise ||
        navigator.serviceWorker?.getRegistration?.('./'))) ||
      (await navigator.serviceWorker?.ready);
    if (reg && typeof reg.showNotification === 'function') {
      await reg.showNotification(title, {
        body,
        icon: './apple-touch-icon.png',
        badge: './apple-touch-icon.png',
        tag: 'alfa-rest-timer',
        renotify: true,
        silent: Boolean(silent),
      });
      return true;
    }
  } catch {
    // Fallback to browser Notification if SW registration unavailable
  }

  try {
    new window.Notification(title, {
      body,
      icon: './apple-touch-icon.png',
      tag: 'alfa-rest-timer',
      silent: Boolean(silent),
    });
    return true;
  } catch {
    return false;
  }
}
