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

    // Never collide with an active bell ring or an already in-flight unlock
    if (isBellCurrentlyRinging || bellUnlockInFlight) return;

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
          if (ringAtStart !== activeRingToken || isBellCurrentlyRinging) {
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
          if (ringAtStart !== activeRingToken || isBellCurrentlyRinging) {
            return;
          }
          setAudioSessionTypeSafe('auto');
        });
    } else {
      bellUnlockInFlight = false;
      bellAudioUnlocked = true;
      needsReprimeAfterBackground = false;
      if (ringAtStart === activeRingToken && !isBellCurrentlyRinging) {
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
      } else if (document.visibilityState === 'visible') {
        if (wakeLockDesired && !wakeLockSentinel) {
          acquireWakeLockSafe();
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
    setAudioSessionTypeSafe('playback');

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

    // 'playback' maps to AVAudioSessionCategoryPlayback (bypasses hardware Ring/Silent switch & Action Button)
    setAudioSessionTypeSafe('playback');

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

    if (!isBellCurrentlyRinging) {
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
      if (!isBellCurrentlyRinging) {
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
