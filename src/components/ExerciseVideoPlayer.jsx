import React, { useState, useEffect, useRef } from 'react';
import { Play, AlertCircle, Film } from 'lucide-react';

export default function ExerciseVideoPlayer({
  videoUrl,
  posterUrl,
  alt = 'Demostración de ejercicio',
  lang = 'es',
  isFallbackMedia = false,
  fallbackImage = null,
  className = '',
}) {
  const videoRef = useRef(null);
  const [videoError, setVideoError] = useState(false);
  const [pausedByIos, setPausedByIos] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    setVideoError(false);
    setPausedByIos(false);
    setIsPlaying(false);

    const el = videoRef.current;
    if (!el || !videoUrl) return;

    // Hard-enforce muted properties in DOM before invoking play to survive WebKit autoplay policies
    el.defaultMuted = true;
    el.muted = true;
    el.playsInline = true;

    let isMounted = true;
    const playPromise = el.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise
        .then(() => {
          if (isMounted) {
            setIsPlaying(true);
            setPausedByIos(false);
          }
        })
        .catch(() => {
          // iOS Low Power Mode or WebKit blocked unprompted autoplay
          if (isMounted) {
            setIsPlaying(false);
            setPausedByIos(true);
          }
        });
    }

    return () => {
      isMounted = false;
      if (el) {
        try {
          el.pause();
          el.removeAttribute('src');
          el.load();
        } catch {
          // ignore cleanup errors
        }
      }
    };
  }, [videoUrl]);

  const handleManualPlay = (e) => {
    e.stopPropagation();
    const el = videoRef.current;
    if (!el) return;
    el.defaultMuted = true;
    el.muted = true;
    el.play()
      .then(() => {
        setIsPlaying(true);
        setPausedByIos(false);
      })
      .catch(() => {
        setVideoError(true);
      });
  };

  const handleVolumeChange = () => {
    const el = videoRef.current;
    if (el && !el.muted) {
      // Re-mute to protect gym bell WAV audio session & Spotify from AAC soundtrack collision
      el.muted = true;
    }
  };

  if (!videoUrl || videoError) {
    if (fallbackImage || posterUrl) {
      return (
        <div className={`exercise-video-stage-wrap ${className}`}>
          <img
            src={fallbackImage || posterUrl}
            alt={alt}
            className="media-lightbox-visual"
          />
        </div>
      );
    }
    return (
      <div className={`exercise-video-stage-wrap empty-stage ${className}`}>
        <Film size={36} className="text-muted" />
        <p className="text-muted text-xs mt-6">
          {lang === 'es' ? 'Video no disponible' : 'Video not available'}
        </p>
      </div>
    );
  }

  return (
    <div className={`exercise-video-stage-wrap ${className}`}>
      <video
        ref={videoRef}
        key={videoUrl}
        src={videoUrl}
        poster={posterUrl || undefined}
        autoPlay
        loop
        muted
        playsInline
        controls
        preload="metadata"
        disableRemotePlayback
        disablePictureInPicture
        onPlay={() => {
          setIsPlaying(true);
          setPausedByIos(false);
        }}
        onPause={() => setIsPlaying(false)}
        onVolumeChange={handleVolumeChange}
        onError={() => setVideoError(true)}
        className="media-lightbox-visual"
      />

      {pausedByIos && !isPlaying && (
        <button
          type="button"
          className="ios-video-play-overlay"
          onClick={handleManualPlay}
          aria-label={lang === 'es' ? 'Reproducir video' : 'Play video'}
        >
          <Play size={24} fill="currentColor" />
          <span>{lang === 'es' ? 'Reproducir Video' : 'Play Video'}</span>
        </button>
      )}

      {isFallbackMedia && (
        <div className="fallback-media-note">
          <span>💡</span>
          <span>
            {lang === 'es'
              ? 'Video demostrativo de referencia anatómica'
              : 'Reference demonstration video'}
          </span>
        </div>
      )}
    </div>
  );
}
