// Authentic Stereo 2-Strike Gym Bell ("DING-DING!") & Ambient-Only Hybrid iOS PWA Audio Engine
// Keeps navigator.audioSession.type permanently locked to 'ambient' (MixWithOthers) so Spotify/Apple Music never pause.

import {
  BOXING_BELL_SAMPLE_RATE,
  BOXING_BELL_LEAD_IN_SEC,
  BOXING_BELL_DURATION_SEC,
  BOXING_BELL_WAV_DATA_URI,
} from '../data/boxingBellAsset';

const SILENT_LEAD_IN_SEC = BOXING_BELL_LEAD_IN_SEC;
const BELL_DURATION_SEC = BOXING_BELL_DURATION_SEC;

const BAKED_SAMPLE_RATE = 22050;
const MAX_BAKED_SEC = 360;
const IS_LITTLE_ENDIAN =
  typeof Uint16Array !== 'undefined'
    ? new Uint8Array(new Uint16Array([1]).buffer)[0] === 1
    : true;

let sharedAudioCtx = null;
let cachedBellAudioBuffer = null;
let hasAmbientAudioSessionLock = false;

let bellAudioEl = null;
let bellAudioUnlocked = false;
let bellUnlockInFlight = false;
let bellUnlockPauseTimer = null;

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
let cachedBellMono22kPcm = null;
let cachedDitherChunk = null;
let isRestAudioActive = false;
let restTimerAudioEl = null;
let activeRestBlobUrl = null;
let restAudioGenId = 0;
let restAudioConfig = null;
let coldRearmCleanup = null;
let swRegistrationPromise = null;
const rungTimerIds = new Set();
const notifiedTimerIds = new Set();

function hasAudioSessionSupport() {
  return (
    typeof navigator !== 'undefined' &&
    'audioSession' in navigator &&
    Boolean(navigator.audioSession) &&
    'type' in navigator.audioSession
  );
}

function lockAmbientAudioSession() {
  if (!hasAudioSessionSupport()) {
    hasAmbientAudioSessionLock = false;
    return false;
  }
  try {
    if (navigator.audioSession.type !== 'ambient') {
      navigator.audioSession.type = 'ambient';
    }
    hasAmbientAudioSessionLock = navigator.audioSession.type === 'ambient';
    return hasAmbientAudioSessionLock;
  } catch {
    hasAmbientAudioSessionLock = false;
    return false;
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

function softBoostInt16(sampleFloat, gain = 1.3) {
  const scaled = sampleFloat * gain;
  const absVal = Math.abs(scaled);
  let limited = scaled;
  if (absVal > 0.75) {
    // C1-continuous soft knee saturates smoothly up to 0.99 without harsh clipping
    limited = Math.sign(scaled) * (0.75 + 0.24 * Math.tanh((absVal - 0.75) / 0.24));
  }
  const clamped = Math.max(-0.99, Math.min(0.99, limited));
  return Math.round(clamped * 32767);
}

function getDitherChunk() {
  if (cachedDitherChunk) return cachedDitherChunk;
  const chunk = new Int16Array(4096);
  for (let i = 0; i < chunk.length; i++) {
    chunk[i] = (i & 31) === 0 ? (i & 32 ? 2 : -2) : 0;
  }
  cachedDitherChunk = chunk;
  return chunk;
}

function getBellMono22kPcm() {
  if (cachedBellMono22kPcm) return cachedBellMono22kPcm;

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
  const pcmByteStart = 44 + leadInFrames * 4;
  const totalStereoFrames = Math.max(
    1,
    Math.floor((bytes.byteLength - pcmByteStart) / 4)
  );
  const monoLen = Math.max(1, Math.floor(totalStereoFrames / 2));
  const mono = new Int16Array(monoLen);

  let ptr = pcmByteStart;
  for (let i = 0; i < monoLen; i++) {
    const l0 = view.getInt16(ptr, true);
    const r0 = view.getInt16(ptr + 2, true);
    const l1 = view.getInt16(ptr + 4, true);
    const r1 = view.getInt16(ptr + 6, true);
    const avgNorm = (l0 + r0 + l1 + r1) / (4 * 32768);
    mono[i] = softBoostInt16(avgNorm, 1.3);
    ptr += 8;
  }

  cachedBellMono22kPcm = mono;
  return mono;
}

function createBakedRestWavBlob(remainingMs) {
  const bellPcm = getBellMono22kPcm();
  const ditherChunk = getDitherChunk();
  const safeSec = Math.max(
    0.15,
    Math.min(MAX_BAKED_SEC, Number(remainingMs || 0) / 1000)
  );
  const silenceFrames = Math.max(0, Math.round(safeSec * BAKED_SAMPLE_RATE));
  const totalFrames = silenceFrames + bellPcm.length;
  const dataBytes = totalFrames * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeStr = (off, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(off + i, str.charCodeAt(i));
    }
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, BAKED_SAMPLE_RATE, true);
  view.setUint32(28, BAKED_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  if (IS_LITTLE_ENDIAN) {
    const pcmOut = new Int16Array(buffer, 44, totalFrames);
    let pos = 0;
    while (pos < silenceFrames) {
      const take = Math.min(ditherChunk.length, silenceFrames - pos);
      pcmOut.set(
        take === ditherChunk.length
          ? ditherChunk
          : ditherChunk.subarray(0, take),
        pos
      );
      pos += take;
    }
    pcmOut.set(bellPcm, silenceFrames);
  } else {
    let byteOff = 44;
    for (let i = 0; i < silenceFrames; i++) {
      const sample = (i & 31) === 0 ? (i & 32 ? 2 : -2) : 0;
      view.setInt16(byteOff, sample, true);
      byteOff += 2;
    }
    for (let i = 0; i < bellPcm.length; i++) {
      view.setInt16(byteOff, bellPcm[i], true);
      byteOff += 2;
    }
  }

  return {
    blob: new Blob([buffer], { type: 'audio/wav' }),
    silenceSeconds: silenceFrames / BAKED_SAMPLE_RATE,
    totalDurationSeconds: totalFrames / BAKED_SAMPLE_RATE,
  };
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

function clearBellUnlockPauseTimer() {
  if (bellUnlockPauseTimer) {
    clearTimeout(bellUnlockPauseTimer);
    bellUnlockPauseTimer = null;
  }
}

function ensureBellAudioElement() {
  if (
    typeof window === 'undefined' ||
    typeof Audio === 'undefined' ||
    !hasAudioSessionSupport()
  ) {
    return null;
  }
  if (bellAudioEl) return bellAudioEl;
  const el = new Audio(BOXING_BELL_WAV_DATA_URI);
  el.preload = 'auto';
  el.playsInline = true;
  el.volume = 1.0;
  el.muted = false;
  bellAudioEl = el;
  return el;
}

function ensureRestTimerAudioElement() {
  if (
    typeof window === 'undefined' ||
    typeof Audio === 'undefined' ||
    !hasAudioSessionSupport()
  ) {
    return null;
  }
  if (restTimerAudioEl) return restTimerAudioEl;

  const el = new Audio();
  el.preload = 'auto';
  el.playsInline = true;
  el.volume = 1.0;
  el.muted = false;

  const handleBellReached = () => {
    const cfg = restAudioConfig;
    if (!isRestAudioActive || !cfg || !cfg.timerId) return;
    if (!hasTimerBellAlreadyRung(cfg.timerId)) {
      markRestBellRung(cfg.timerId);
      try {
        if (
          typeof navigator !== 'undefined' &&
          typeof navigator.vibrate === 'function'
        ) {
          navigator.vibrate([100, 155, 220]);
        }
      } catch {
        // ignore vibrate errors
      }
      sendRestDoneNotification({
        timerId: cfg.timerId,
        exerciseName: cfg.exerciseName,
        lang: cfg.lang,
        silent: getRestAudioMode() === 'off',
      });
      try {
        cfg.onBellRung?.(cfg.timerId);
      } catch {
        // ignore callback errors
      }
    }
  };

  el.addEventListener('timeupdate', () => {
    const cfg = restAudioConfig;
    if (!isRestAudioActive || !cfg) return;
    if (el.currentTime >= cfg.silenceSeconds) {
      handleBellReached();
    }
  });

  el.addEventListener('ended', () => {
    const cfg = restAudioConfig;
    if (isRestAudioActive && cfg) {
      handleBellReached();
    }
    stopBakedRestTimerAudio();
  });

  restTimerAudioEl = el;
  return el;
}

function clearImmediateBell() {
  clearBellUnlockPauseTimer();
  if (cleanupRingTimeoutId) {
    clearTimeout(cleanupRingTimeoutId);
    cleanupRingTimeoutId = null;
  }
  const current = activeImmediateBell;
  activeImmediateBell = null;
  if (current) {
    stopAudioSourceSafe(current.source);
    disconnectNodeSafe(current.gain);
    disconnectNodeSafe(current.compressor);
  }
  if (bellAudioEl && !bellUnlockInFlight) {
    try {
      if (!bellAudioEl.paused) {
        bellAudioEl.pause();
      }
      if (bellAudioEl.readyState >= 1) {
        bellAudioEl.currentTime = SILENT_LEAD_IN_SEC;
      }
    } catch {
      // ignore seek/pause errors
    }
  }
  isBellCurrentlyRinging = false;
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

function markTimerNotified(timerId) {
  if (!timerId) return;
  if (notifiedTimerIds.size > 40) {
    const first = notifiedTimerIds.values().next().value;
    notifiedTimerIds.delete(first);
  }
  notifiedTimerIds.add(timerId);
}

export function hasTimerBellAlreadyRung(timerId) {
  return Boolean(timerId && rungTimerIds.has(timerId));
}

export function isBakedRestAudioPlayingFor(timerId) {
  return Boolean(
    timerId &&
      isRestAudioActive &&
      restAudioConfig?.timerId === timerId &&
      restTimerAudioEl &&
      !restTimerAudioEl.paused &&
      !restTimerAudioEl.ended &&
      restTimerAudioEl.readyState >= 2 &&
      restTimerAudioEl.currentTime >=
        Math.max(0, restAudioConfig.silenceSeconds - 0.15)
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
 * Unlocks Web Audio (plus one-time silent blessing of bellAudioEl on AudioSession-capable iOS Safari)
 * under permanent 'ambient' AudioSession without ever suspending AudioContext or pausing external music.
 */
export function unlockGymAudio() {
  const ambientLocked = lockAmbientAudioSession();

  try {
    if (wakeLockDesired && !wakeLockSentinel) {
      acquireWakeLockSafe();
    }

    const ctx = getOrCreateAudioContext();
    if (ctx && ctx.state !== 'running') {
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

    if (
      ambientLocked &&
      !bellAudioUnlocked &&
      !bellUnlockInFlight &&
      !isRestAudioActive &&
      !isBellCurrentlyRinging
    ) {
      const el = ensureBellAudioElement();
      if (el) {
        const ringAtStart = activeRingToken;
        bellUnlockInFlight = true;
        el.muted = false;
        el.volume = 1.0;
        try {
          el.currentTime = 0;
        } catch {
          // ignore if metadata is still parsing
        }

        const finishOneTimeBless = () => {
          bellAudioUnlocked = true;
          bellUnlockInFlight = false;
          if (
            ringAtStart !== activeRingToken ||
            isBellCurrentlyRinging ||
            isRestAudioActive
          ) {
            return;
          }
          clearBellUnlockPauseTimer();
          // Pause at ~45ms inside the 250ms 0x0000 silent lead-in so hardware unlock sticks without audible click
          bellUnlockPauseTimer = setTimeout(() => {
            bellUnlockPauseTimer = null;
            if (
              ringAtStart !== activeRingToken ||
              isBellCurrentlyRinging ||
              isRestAudioActive
            ) {
              return;
            }
            try {
              if (!el.paused) {
                el.pause();
              }
              if (el.readyState >= 1) {
                el.currentTime = SILENT_LEAD_IN_SEC;
              }
            } catch {
              // ignore
            }
          }, 45);
        };

        try {
          const playPromise = el.play();
          if (playPromise && typeof playPromise.then === 'function') {
            playPromise.then(finishOneTimeBless).catch(() => {
              bellUnlockInFlight = false;
            });
          } else {
            finishOneTimeBless();
          }
        } catch {
          bellUnlockInFlight = false;
        }
      }
    }

    return Boolean(ctx || bellAudioEl);
  } catch {
    bellUnlockInFlight = false;
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
      if (document.visibilityState === 'visible') {
        lockAmbientAudioSession();
        if (wakeLockDesired && !wakeLockSentinel) {
          acquireWakeLockSafe();
        }
        if (
          isRestAudioActive &&
          restTimerAudioEl &&
          restAudioConfig &&
          Number.isFinite(restAudioConfig.expectedWallEndMs)
        ) {
          const msLeft = restAudioConfig.expectedWallEndMs - Date.now();
          if (msLeft > 400) {
            const targetTime = Math.max(
              0,
              restAudioConfig.silenceSeconds - msLeft / 1000
            );
            const drift = Math.abs(
              (restTimerAudioEl.currentTime || 0) - targetTime
            );
            if (drift > 0.55) {
              try {
                restTimerAudioEl.currentTime = targetTime;
              } catch {
                // ignore seek error if not ready
              }
            }
            if (drift > 0.55 || restTimerAudioEl.paused) {
              try {
                const p = restTimerAudioEl.play();
                if (p && typeof p.catch === 'function') p.catch(() => {});
              } catch {
                // ignore
              }
            }
          }
        }
        if (bellAudioEl && bellAudioEl.error) {
          bellAudioEl = null;
          bellAudioUnlocked = false;
        }
      }
    });
  }
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
  const ambientLocked = lockAmbientAudioSession();

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([100, 155, 220]);
    }
  } catch {
    // ignore vibrate errors
  }

  try {
    clearImmediateBell();
    const token = ++activeRingToken;
    isBellCurrentlyRinging = true;

    const ctx = getOrCreateAudioContext();

    const startImmediateWebAudioBell = () => {
      if (token !== activeRingToken || !ctx) return false;
      try {
        const buffer = getBoxingBellAudioBuffer(ctx);
        const source = ctx.createBufferSource();
        const masterGain = ctx.createGain();
        source.buffer = buffer;
        masterGain.gain.setValueAtTime(1.35, ctx.currentTime);

        let compressor = null;
        if (typeof ctx.createDynamicsCompressor === 'function') {
          compressor = ctx.createDynamicsCompressor();
          compressor.threshold.setValueAtTime(-6, ctx.currentTime);
          compressor.knee.setValueAtTime(12, ctx.currentTime);
          compressor.ratio.setValueAtTime(8, ctx.currentTime);
          compressor.attack.setValueAtTime(0.002, ctx.currentTime);
          compressor.release.setValueAtTime(0.15, ctx.currentTime);
          source.connect(masterGain);
          masterGain.connect(compressor);
          compressor.connect(ctx.destination);
        } else {
          source.connect(masterGain);
          masterGain.connect(ctx.destination);
        }

        activeImmediateBell = { source, gain: masterGain, compressor };

        source.onended = () => {
          if (token !== activeRingToken) return;
          activeImmediateBell = null;
          disconnectNodeSafe(source);
          disconnectNodeSafe(masterGain);
          disconnectNodeSafe(compressor);
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
        return true;
      } catch {
        if (token === activeRingToken) {
          clearImmediateBell();
        }
        return false;
      }
    };

    if (ctx && ctx.state === 'running') {
      return startImmediateWebAudioBell();
    }

    const fallbackWebAudioResume = () => {
      if (token !== activeRingToken || !ctx) {
        if (token === activeRingToken) clearImmediateBell();
        return false;
      }
      try {
        const resumePromise = ctx.resume();
        if (resumePromise && typeof resumePromise.then === 'function') {
          resumePromise
            .then(() => {
              if (token !== activeRingToken) return;
              if (ctx.state === 'running') {
                startImmediateWebAudioBell();
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
          return startImmediateWebAudioBell();
        }
      } catch {
        // ignore resume errors
      }
      clearImmediateBell();
      return false;
    };

    if (ambientLocked && hasAudioSessionSupport()) {
      const el = ensureBellAudioElement();
      if (el) {
        if (ctx) {
          try {
            const p = ctx.resume();
            if (p && typeof p.catch === 'function') p.catch(() => {});
          } catch {
            // ignore
          }
        }
        try {
          if (!el.paused) {
            el.pause();
          }
          if (el.readyState >= 1) {
            el.currentTime = SILENT_LEAD_IN_SEC;
          }
        } catch {
          // ignore seek errors
        }
        el.muted = false;
        el.volume = 1.0;

        try {
          const playPromise = el.play();
          const scheduleCleanup = () => {
            if (token !== activeRingToken) return;
            bellAudioUnlocked = true;
            cleanupRingTimeoutId = setTimeout(() => {
              if (token !== activeRingToken) return;
              clearImmediateBell();
            }, Math.round(BELL_DURATION_SEC * 1000) + 300);
          };
          if (playPromise && typeof playPromise.then === 'function') {
            playPromise.then(scheduleCleanup).catch(() => {
              if (token === activeRingToken) {
                fallbackWebAudioResume();
              }
            });
            return true;
          }
          scheduleCleanup();
          return true;
        } catch {
          // fall through to WebAudio resume fallback
        }
      }
    }

    return fallbackWebAudioResume();
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
  restAudioGenId += 1;
  isRestAudioActive = false;
  restAudioConfig = null;
  clearColdRearmListener();

  if (restTimerAudioEl) {
    try {
      if (!restTimerAudioEl.paused) {
        restTimerAudioEl.pause();
      }
      restTimerAudioEl.removeAttribute('src');
      restTimerAudioEl.load();
    } catch {
      // ignore
    }
  }
  if (activeRestBlobUrl) {
    try {
      URL.revokeObjectURL(activeRestBlobUrl);
    } catch {
      // ignore
    }
    activeRestBlobUrl = null;
  }
}

export function startBakedRestTimerAudio({
  timerId,
  remainingMs,
  totalSec,
  exerciseName = '',
  lang = 'es',
  onBellRung,
  onSkipFromLockScreen,
} = {}) {
  const mode = getRestAudioMode();
  clearColdRearmListener();

  if (
    !timerId ||
    mode === 'off' ||
    hasTimerBellAlreadyRung(timerId) ||
    !Number.isFinite(remainingMs) ||
    remainingMs <= 150
  ) {
    stopBakedRestTimerAudio();
    return false;
  }

  const ambientLocked = lockAmbientAudioSession();

  // Non-AudioSession browsers use WebAudio-only (no <audio> element to claim media focus)
  if (!hasAudioSessionSupport() || !ambientLocked) {
    stopBakedRestTimerAudio();
    const ctx = getOrCreateAudioContext();
    if (ctx && ctx.state !== 'running') {
      try {
        const p = ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {
        // ignore
      }
    }
    return Boolean(ctx && ctx.state === 'running');
  }

  const el = ensureRestTimerAudioElement();
  if (!el) return false;

  const gen = ++restAudioGenId;

  try {
    if (!el.paused) {
      el.pause();
    }
    el.removeAttribute('src');
    el.load();
  } catch {
    // ignore
  }
  if (activeRestBlobUrl) {
    try {
      URL.revokeObjectURL(activeRestBlobUrl);
    } catch {
      // ignore
    }
    activeRestBlobUrl = null;
  }

  const { blob, silenceSeconds, totalDurationSeconds } =
    createBakedRestWavBlob(remainingMs);
  const blobUrl = URL.createObjectURL(blob);
  activeRestBlobUrl = blobUrl;
  isRestAudioActive = true;
  restAudioConfig = {
    timerId,
    silenceSeconds,
    totalDurationSeconds,
    expectedWallEndMs: Date.now() + remainingMs,
    totalSec,
    exerciseName,
    lang,
    onBellRung,
    onSkipFromLockScreen,
  };

  lockAmbientAudioSession();
  el.muted = false;
  el.volume = 1.0;
  el.src = blobUrl;

  try {
    const playPromise = el.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        if (gen !== restAudioGenId) return;
        isRestAudioActive = false;
        restAudioConfig = null;
        try {
          el.removeAttribute('src');
          el.load();
        } catch {
          // ignore
        }
        if (activeRestBlobUrl === blobUrl) {
          try {
            URL.revokeObjectURL(blobUrl);
          } catch {
            // ignore
          }
          activeRestBlobUrl = null;
        }
      });
    }
  } catch {
    if (gen === restAudioGenId) {
      isRestAudioActive = false;
      restAudioConfig = null;
    }
    return false;
  }
  return true;
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

async function getServiceWorkerRegistrationBounded(timeoutMs = 700) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  const lookupPromise = (async () => {
    try {
      if (swRegistrationPromise) {
        const reg = await swRegistrationPromise;
        if (reg) return reg;
      }
      const existing = await navigator.serviceWorker.getRegistration?.('./');
      if (existing) return existing;
      const readyReg = await navigator.serviceWorker.ready;
      return readyReg || null;
    } catch {
      return null;
    }
  })();

  let timeoutId = null;
  try {
    return await Promise.race([
      lookupPromise,
      new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function sendRestDoneNotification({
  timerId = '',
  exerciseName = '',
  lang = 'es',
  silent = false,
} = {}) {
  if (timerId && notifiedTimerIds.has(timerId)) {
    return true;
  }
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
  const tag = timerId ? `alfa-rest-${timerId}` : `alfa-rest-${Date.now()}`;

  let icon = './apple-touch-icon.png';
  try {
    if (window.location?.href) {
      icon = new URL('./apple-touch-icon.png', window.location.href).href;
    }
  } catch {
    icon = './apple-touch-icon.png';
  }

  const reg = await getServiceWorkerRegistrationBounded(700);
  if (reg && typeof reg.showNotification === 'function') {
    try {
      await reg.showNotification(title, {
        body,
        icon,
        tag,
        silent: Boolean(silent),
      });
      markTimerNotified(timerId);
      return true;
    } catch {
      try {
        await reg.showNotification(title, {
          body,
          tag,
          silent: Boolean(silent),
        });
        markTimerNotified(timerId);
        return true;
      } catch {
        // Continue to SW postMessage or window.Notification fallback
      }
    }
  }

  if (reg?.active && typeof reg.active.postMessage === 'function') {
    try {
      reg.active.postMessage({
        type: 'SHOW_REST_NOTIFICATION',
        title,
        body,
        icon,
        tag,
        silent: Boolean(silent),
      });
      markTimerNotified(timerId);
      return true;
    } catch {
      // Fallback to browser Notification below
    }
  }

  try {
    new window.Notification(title, {
      body,
      icon,
      tag,
      silent: Boolean(silent),
    });
    markTimerNotified(timerId);
    return true;
  } catch {
    return false;
  }
}
