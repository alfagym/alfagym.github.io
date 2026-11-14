// Authentic Stereo 2-Strike Gym Bell ("DING-DING!") & Resilient iOS PWA Audio Engine
// Works 100% offline & through iPhone Vibrate-Only / Silent Mode without cutting Spotify on set checkmarks

import {
  BOXING_BELL_SAMPLE_RATE,
  BOXING_BELL_LEAD_IN_SEC,
  BOXING_BELL_DURATION_SEC,
  BOXING_BELL_WAV_DATA_URI,
} from '../data/boxingBellAsset';

const SILENT_LEAD_IN_SEC = BOXING_BELL_LEAD_IN_SEC;
const BELL_DURATION_SEC = BOXING_BELL_DURATION_SEC;

let sharedAudioCtx = null;
let uiCtxSuspendTimer = null;
let cachedBellAudioBuffer = null;

let bellAudioEl = null;
let bellAudioUnlocked = false;
let bellUnlockInFlight = false;
let needsReprimeAfterBackground = false;
let isBellCurrentlyRinging = false;
let activeRingToken = 0;
let cleanupRingTimeoutId = null;

let wakeLockSentinel = null;
let wakeLockDesired = false;
let globalUnlockInstalled = false;

export const REST_AUDIO_MODES = ['background', 'music100', 'lockscreen', 'off'];
const REST_AUDIO_MODE_KEY = 'alfa_gym_rest_audio_mode';
const BAKED_SAMPLE_RATE = 22050;
const MAX_BAKED_SEC = 360;
const IS_LITTLE_ENDIAN =
  typeof Uint16Array !== 'undefined'
    ? new Uint8Array(new Uint16Array([1]).buffer)[0] === 1
    : true;

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

export function getRestAudioMode() {
  if (currentRestAudioModeCache && REST_AUDIO_MODES.includes(currentRestAudioModeCache)) {
    return currentRestAudioModeCache;
  }
  try {
    const saved =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(REST_AUDIO_MODE_KEY)
        : null;
    if (saved && REST_AUDIO_MODES.includes(saved)) {
      currentRestAudioModeCache = saved;
      return saved;
    }
  } catch {
    // Ignore storage read errors
  }
  currentRestAudioModeCache = 'background';
  return 'background';
}

export function setRestAudioMode(mode) {
  const valid = REST_AUDIO_MODES.includes(mode) ? mode : 'background';
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
  return Boolean(
    timerId &&
      isRestAudioActive &&
      restAudioConfig?.timerId === timerId &&
      restTimerAudioEl &&
      !restTimerAudioEl.paused &&
      !restTimerAudioEl.ended
  );
}

function setAudioSessionTypeSafe(type) {
  if (
    typeof navigator !== 'undefined' &&
    'audioSession' in navigator &&
    navigator.audioSession
  ) {
    try {
      if (navigator.audioSession.type !== type) {
        navigator.audioSession.type = type;
      }
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function releasePlaybackSessionToAuto() {
  // Step 'playback' -> 'ambient' -> 'auto' so WebKit GPUProcess releases
  // AVAudioSessionCategoryPlayback immediately while leaving 'auto' clean in rest state
  setAudioSessionTypeSafe('ambient');
  setAudioSessionTypeSafe('auto');
}

function getOrCreateAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

/**
 * Lazily decodes the stereo 16-bit PCM frames directly from BOXING_BELL_WAV_DATA_URI
 * (skipping the 250ms silent lead-in) for the emergency WebAudio fallback without duplicating bundle bytes.
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

function finishBellSession(token) {
  if (token !== undefined && token !== activeRingToken) return;
  isBellCurrentlyRinging = false;
  if (cleanupRingTimeoutId) {
    clearTimeout(cleanupRingTimeoutId);
    cleanupRingTimeoutId = null;
  }
  if (bellAudioEl) {
    try {
      if (!bellAudioEl.paused) {
        bellAudioEl.pause();
      }
      if (bellAudioEl.readyState >= 1) {
        bellAudioEl.currentTime = SILENT_LEAD_IN_SEC;
      }
    } catch {
      // ignore seek errors
    }
  }
  releasePlaybackSessionToAuto();
}

function ensureBellAudioElement() {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  if (bellAudioEl && !bellAudioEl.error) return bellAudioEl;

  // Immutable Base64 stereo WAV Data URI: immune to iOS Home Screen PWA BlobRegistry eviction
  const el = new Audio(BOXING_BELL_WAV_DATA_URI);
  el.preload = 'auto';
  el.playsInline = true;
  el.volume = 1.0;
  // MUST remain false so WebKit clears RequireUserGestureForAudioRateChange on unlock
  el.muted = false;

  el.addEventListener('timeupdate', () => {
    // Hard safety guard: during silent gesture unlock, never allow playhead past 120ms of the 250ms silent lead-in
    if (bellUnlockInFlight && !isBellCurrentlyRinging && el.currentTime >= 0.12) {
      el.pause();
    }
  });

  el.addEventListener('ended', () => {
    finishBellSession(activeRingToken);
  });

  bellAudioEl = el;
  bellAudioUnlocked = false;
  return bellAudioEl;
}

async function acquireWakeLockSafe() {
  if (!wakeLockDesired || wakeLockSentinel) return;
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator) || !navigator.wakeLock) {
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
 * Called synchronously inside user gesture handlers (touchend / click / keydown).
 * Blesses the persistent HTMLAudioElement using its 250ms 0x0000 silent lead-in under 'ambient'
 * so Spotify/Apple Music is NEVER interrupted on set checkmarks, then parks at 0.25s in 'auto'.
 */
export function unlockGymAudio() {
  try {
    if (wakeLockDesired && !wakeLockSentinel) {
      acquireWakeLockSafe();
    }

    const el = ensureBellAudioElement();
    if (!el) return;

    // Never collide with an active bell ring, baked rest stream, or an already in-flight unlock
    if (isBellCurrentlyRinging || isRestAudioActive || bellUnlockInFlight) return;

    const shouldPrime =
      !bellAudioUnlocked ||
      needsReprimeAfterBackground ||
      el.error !== null ||
      el.readyState < 1;

    if (!shouldPrime) return;

    const ringAtStart = activeRingToken;
    bellUnlockInFlight = true;

    // Use 'ambient' ONLY during the ~20ms silent 0x0000 blessing so Spotify never pauses on tap
    setAudioSessionTypeSafe('ambient');
    el.muted = false;
    el.volume = 1.0;

    try {
      el.currentTime = 0;
    } catch {
      // ignore if metadata is still parsing
    }

    const playPromise = el.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => {
          bellUnlockInFlight = false;
          bellAudioUnlocked = true;
          needsReprimeAfterBackground = false;
          // Abort cleanup if playBoxingRingBell() took over while unlock promise was resolving
          if (
            ringAtStart !== activeRingToken ||
            isBellCurrentlyRinging ||
            isRestAudioActive
          ) {
            return;
          }
          el.pause();
          try {
            if (el.readyState >= 1) {
              el.currentTime = SILENT_LEAD_IN_SEC;
            }
          } catch {
            // ignore
          }
          setAudioSessionTypeSafe('auto');
        })
        .catch(() => {
          bellUnlockInFlight = false;
          if (
            ringAtStart !== activeRingToken ||
            isBellCurrentlyRinging ||
            isRestAudioActive
          ) {
            return;
          }
          setAudioSessionTypeSafe('auto');
        });
    } else {
      bellUnlockInFlight = false;
      bellAudioUnlocked = true;
      needsReprimeAfterBackground = false;
      if (
        ringAtStart === activeRingToken &&
        !isBellCurrentlyRinging &&
        !isRestAudioActive
      ) {
        el.pause();
        setAudioSessionTypeSafe('auto');
      }
    }
  } catch {
    bellUnlockInFlight = false;
  }
}

export function installGlobalAudioUnlock() {
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
        needsReprimeAfterBackground = true;
        if (
          isRestAudioActive &&
          restAudioConfig &&
          restAudioConfig.mode === 'music100'
        ) {
          setAudioSessionTypeSafe('transient');
        }
      } else if (document.visibilityState === 'visible') {
        if (wakeLockDesired && !wakeLockSentinel) {
          acquireWakeLockSafe();
        }
        if (
          isRestAudioActive &&
          restTimerAudioEl &&
          restAudioConfig &&
          restAudioConfig.mode === 'music100' &&
          restTimerAudioEl.currentTime <
            Math.max(0, restAudioConfig.silenceSeconds - 2)
        ) {
          setAudioSessionTypeSafe('ambient');
        }
        if (bellAudioEl && bellAudioEl.error) {
          bellAudioEl = null;
          bellAudioUnlocked = false;
        }
      }
    });
  }

  window.addEventListener('pagehide', () => {
    if (
      isRestAudioActive &&
      restAudioConfig &&
      restAudioConfig.mode === 'music100'
    ) {
      setAudioSessionTypeSafe('transient');
    }
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

function triggerWebAudioBellFallback(token) {
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) {
      finishBellSession(token);
      return;
    }
    if (uiCtxSuspendTimer) {
      clearTimeout(uiCtxSuspendTimer);
      uiCtxSuspendTimer = null;
    }
    setAudioSessionTypeSafe(
      getRestAudioMode() === 'lockscreen' ? 'playback' : 'transient'
    );

    const startBuffer = () => {
      if (token !== activeRingToken) return;
      const buffer = getBoxingBellAudioBuffer(ctx);
      const source = ctx.createBufferSource();
      const masterGain = ctx.createGain();
      source.buffer = buffer;
      masterGain.gain.setValueAtTime(1.0, ctx.currentTime);
      source.connect(masterGain);
      masterGain.connect(ctx.destination);
      source.onended = () => {
        finishBellSession(token);
        try {
          if (ctx.state === 'running' && !isBellCurrentlyRinging) {
            ctx.suspend().catch(() => {});
          }
        } catch {
          // ignore
        }
      };
      source.start(0);
    };

    if (ctx.state === 'running') {
      startBuffer();
    } else {
      ctx
        .resume()
        .then(startBuffer)
        .catch(() => finishBellSession(token));
    }
  } catch {
    finishBellSession(token);
  }
}

/**
 * Rings the authentic 2-strike stereo gym bell ("DING-DING!") audibly
 * EVEN WHEN iPHONE IS IN VIBRATE-ONLY / SILENT MODE.
 */
export function playBoxingRingBell() {
  try {
    // Tactile 2-strike vibration calibrated to exact strike 1 (0ms) and strike 2 (255ms)
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate([100, 155, 220]);
      } catch {
        // ignore
      }
    }

    const token = ++activeRingToken;
    isBellCurrentlyRinging = true;
    bellUnlockInFlight = false;

    if (cleanupRingTimeoutId) {
      clearTimeout(cleanupRingTimeoutId);
      cleanupRingTimeoutId = null;
    }

    // Suspend any lingering UI WebAudio context so AVPlayer owns the audio route cleanly
    if (sharedAudioCtx && sharedAudioCtx.state === 'running') {
      try {
        sharedAudioCtx.suspend().catch(() => {});
      } catch {
        // ignore
      }
    }

    // 'transient' bypasses hardware Ring/Silent switch & survives speakers/AirPods WITHOUT pausing Spotify;
    // 'playback' is used only when user explicitly selects Lock Screen Widget mode.
    setAudioSessionTypeSafe(
      getRestAudioMode() === 'lockscreen' ? 'playback' : 'transient'
    );

    const el = ensureBellAudioElement();
    if (!el) {
      triggerWebAudioBellFallback(token);
      return;
    }

    el.muted = false;
    el.volume = 1.0;

    try {
      if (!el.paused) {
        el.pause();
      }
      if (
        el.readyState >= 1 &&
        (!el.seekable ||
          el.seekable.length === 0 ||
          el.seekable.end(0) >= SILENT_LEAD_IN_SEC)
      ) {
        el.currentTime = SILENT_LEAD_IN_SEC;
      } else {
        el.currentTime = 0;
      }
    } catch {
      // Plays seamlessly through the 250ms silent prefix if seek is not ready yet
    }

    const safetyMs = Math.ceil(
      (BELL_DURATION_SEC + SILENT_LEAD_IN_SEC + 0.35) * 1000
    );
    cleanupRingTimeoutId = setTimeout(() => {
      finishBellSession(token);
    }, safetyMs);

    const playPromise = el.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => {
          bellAudioUnlocked = true;
          needsReprimeAfterBackground = false;
        })
        .catch(() => {
          triggerWebAudioBellFallback(token);
        });
    } else {
      bellAudioUnlocked = true;
    }
  } catch {
    isBellCurrentlyRinging = false;
    releasePlaybackSessionToAuto();
  }
}

export function playGymSound(type = 'check') {
  try {
    if (type === 'timerDone' || type === 'boxingBell') {
      playBoxingRingBell();
      return;
    }

    if (!isBellCurrentlyRinging && !isRestAudioActive) {
      setAudioSessionTypeSafe('ambient');
    }

    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;

    if (type === 'check') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.11); // A5
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.17);
    } else if (type === 'pr') {
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.16, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.26);
      });
    }

    if (uiCtxSuspendTimer) {
      clearTimeout(uiCtxSuspendTimer);
    }
    uiCtxSuspendTimer = setTimeout(() => {
      uiCtxSuspendTimer = null;
      if (!isBellCurrentlyRinging && !isRestAudioActive) {
        setAudioSessionTypeSafe('auto');
        if (sharedAudioCtx && sharedAudioCtx.state === 'running') {
          try {
            sharedAudioCtx.suspend().catch(() => {});
          } catch {
            // ignore
          }
        }
      }
    }, 650);
  } catch {
    // Ignore audio context autoplay errors
  }
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
    mono[i] = (l0 + r0 + l1 + r1) >> 2;
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

function clearColdRearmListener() {
  if (coldRearmCleanup) {
    coldRearmCleanup();
    coldRearmCleanup = null;
  }
}

function clearLockScreenMediaSession() {
  if (
    typeof navigator === 'undefined' ||
    !('mediaSession' in navigator) ||
    !navigator.mediaSession
  ) {
    return;
  }
  try {
    navigator.mediaSession.playbackState = 'none';
  } catch {
    // ignore
  }
  try {
    navigator.mediaSession.metadata = null;
  } catch {
    // ignore
  }
  try {
    navigator.mediaSession.setActionHandler?.('nexttrack', null);
  } catch {
    // ignore
  }
  try {
    navigator.mediaSession.setActionHandler?.('pause', null);
  } catch {
    // ignore
  }
  try {
    navigator.mediaSession.setActionHandler?.('play', null);
  } catch {
    // ignore
  }
}

function applyLockScreenMediaSession({
  exerciseName,
  lang,
  remainingSec,
  totalSec,
  onSkip,
}) {
  if (
    typeof navigator === 'undefined' ||
    !('mediaSession' in navigator) ||
    !navigator.mediaSession
  ) {
    return;
  }
  try {
    if (typeof window !== 'undefined' && 'MediaMetadata' in window) {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: exerciseName
          ? `${lang === 'es' ? 'Descanso' : 'Rest'} • ${exerciseName}`
          : lang === 'es'
          ? 'Tiempo de Descanso'
          : 'Rest Timer',
        artist: 'Alfa Gym',
        album: lang === 'es' ? 'Entrenamiento en curso' : 'Active Workout',
        artwork: [
          {
            src: './apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
          },
        ],
      });
    }
    navigator.mediaSession.playbackState = 'playing';
    const safeDur = Math.max(1, Number(totalSec) || 60);
    const remClamped = Math.max(
      0,
      Math.min(safeDur, Number(remainingSec) || 0)
    );
    const pos = Math.max(0, Math.min(safeDur, safeDur - remClamped));
    try {
      navigator.mediaSession.setPositionState?.({
        duration: safeDur,
        playbackRate: 1,
        position: pos,
      });
    } catch {
      // ignore Safari range errors
    }
    if (typeof onSkip === 'function') {
      try {
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          onSkip();
        });
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

function ensureRestTimerAudioElement() {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
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
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.vibrate === 'function'
      ) {
        try {
          navigator.vibrate([100, 155, 220]);
        } catch {
          // ignore
        }
      }
      sendRestDoneNotification({
        exerciseName: cfg.exerciseName,
        lang: cfg.lang,
        silent: true,
      });
      try {
        cfg.onBellRung?.(cfg.timerId);
      } catch {
        // ignore
      }
    }
  };

  el.addEventListener('timeupdate', () => {
    const cfg = restAudioConfig;
    if (!isRestAudioActive || !cfg) return;
    if (
      cfg.mode === 'music100' &&
      typeof document !== 'undefined' &&
      document.visibilityState === 'visible' &&
      el.currentTime >= Math.max(0, cfg.silenceSeconds - 0.45)
    ) {
      setAudioSessionTypeSafe('transient');
    }
    if (el.currentTime >= cfg.silenceSeconds + 0.04) {
      handleBellReached();
    }
  });

  el.addEventListener('ended', () => {
    handleBellReached();
    stopBakedRestTimerAudio();
  });

  restTimerAudioEl = el;
  return el;
}

export function stopBakedRestTimerAudio() {
  restAudioGenId++;
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
  clearLockScreenMediaSession();
  if (!isBellCurrentlyRinging) {
    releasePlaybackSessionToAuto();
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
}) {
  const mode = getRestAudioMode();
  clearColdRearmListener();

  if (mode === 'off' || !remainingMs || remainingMs <= 100) {
    stopBakedRestTimerAudio();
    return false;
  }

  // Cancel any pending UI-sound audioSession cleanup that could clobber the rest session
  if (uiCtxSuspendTimer) {
    clearTimeout(uiCtxSuspendTimer);
    uiCtxSuspendTimer = null;
  }
  if (sharedAudioCtx && sharedAudioCtx.state === 'running') {
    try {
      sharedAudioCtx.suspend().catch(() => {});
    } catch {
      // ignore
    }
  }

  const el = ensureRestTimerAudioElement();
  if (!el) return false;

  const gen = ++restAudioGenId;

  // Release any previous Blob safely before swapping src
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
    mode,
    silenceSeconds,
    totalDurationSeconds,
    totalSec,
    exerciseName,
    lang,
    onBellRung,
    onSkipFromLockScreen,
  };

  if (mode === 'lockscreen') {
    setAudioSessionTypeSafe('playback');
    applyLockScreenMediaSession({
      exerciseName,
      lang,
      remainingSec: remainingMs / 1000,
      totalSec,
      onSkip: onSkipFromLockScreen,
    });
  } else if (mode === 'music100') {
    clearLockScreenMediaSession();
    const isHidden =
      typeof document !== 'undefined' && document.visibilityState === 'hidden';
    setAudioSessionTypeSafe(isHidden ? 'transient' : 'ambient');
  } else {
    // 'background' default: MixWithOthers + DuckOthers survives iOS lock screen & never pauses Spotify
    clearLockScreenMediaSession();
    setAudioSessionTypeSafe('transient');
  }

  el.muted = false;
  el.volume = 1.0;
  el.src = blobUrl;

  try {
    const playPromise = el.play();
    if (playPromise && typeof playPromise.then === 'function') {
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
        clearLockScreenMediaSession();
        if (!isBellCurrentlyRinging) {
          releasePlaybackSessionToAuto();
        }
      });
    }
  } catch {
    if (gen === restAudioGenId) {
      isRestAudioActive = false;
      restAudioConfig = null;
      clearLockScreenMediaSession();
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
