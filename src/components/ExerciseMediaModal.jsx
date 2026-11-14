import React, { useState, useEffect } from 'react';
import { X, Film, Image as ImageIcon, Info } from 'lucide-react';
import ExerciseVideoPlayer from './ExerciseVideoPlayer';

export default function ExerciseMediaModal({
  exercise,
  lang,
  t,
  onClose,
}) {
  const hasVideo = Boolean(
    exercise?.videoUrl && exercise.videoUrl.toLowerCase().endsWith('.mp4')
  );
  const fullImageUrl =
    exercise?.imageUrl ||
    (!hasVideo && exercise?.videoUrl
      ? exercise.videoUrl
      : exercise?.thumbnailUrl || exercise?.videoUrl);

  const [viewMode, setViewMode] = useState(hasVideo ? 'video' : 'image');

  useEffect(() => {
    setViewMode(
      exercise?.videoUrl && exercise.videoUrl.toLowerCase().endsWith('.mp4')
        ? 'video'
        : 'image'
    );
  }, [exercise]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!exercise) return null;

  const name =
    lang === 'es'
      ? exercise.nameEs || exercise.nameEn
      : exercise.nameEn || exercise.nameEs;

  const tips =
    lang === 'es'
      ? exercise.tipsEs || exercise.tipsEn
      : exercise.tipsEn || exercise.tipsEs;

  return (
    <div
      className="modal-backdrop media-lightbox-backdrop"
      onClick={onClose}
    >
      <div
        className="modal-panel media-lightbox-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <div className="live-ex-tags mb-6">
              {exercise.primaryMuscle && t?.muscles?.[exercise.primaryMuscle] && (
                <span className="muscle-tag">
                  {t.muscles[exercise.primaryMuscle]}
                </span>
              )}
              {exercise.equipment && t?.equipment?.[exercise.equipment] && (
                <span className="equip-tag">
                  {t.equipment[exercise.equipment]}
                </span>
              )}
            </div>
            <h3>{name}</h3>
          </div>

          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Toggle between Video and Full Image if both exist */}
        {hasVideo && (exercise.imageUrl || exercise.thumbnailUrl) && (
          <div className="media-lightbox-tabs">
            <button
              type="button"
              className={`media-tab-btn ${viewMode === 'video' ? 'active' : ''}`}
              onClick={() => setViewMode('video')}
            >
              <Film size={14} />
              <span>
                {lang === 'es' ? 'Demostración en Grande' : 'Large Video Demo'}
              </span>
            </button>
            <button
              type="button"
              className={`media-tab-btn ${viewMode === 'image' ? 'active' : ''}`}
              onClick={() => setViewMode('image')}
            >
              <ImageIcon size={14} />
              <span>
                {lang === 'es' ? 'Imagen en Grande' : 'Large Image'}
              </span>
            </button>
          </div>
        )}

        <div className="media-lightbox-stage">
          {hasVideo && viewMode === 'video' ? (
            <ExerciseVideoPlayer
              videoUrl={exercise.videoUrl}
              posterUrl={exercise.thumbnailUrl}
              alt={name}
              lang={lang}
              isFallbackMedia={Boolean(exercise.isFallbackMedia)}
              fallbackImage={fullImageUrl}
            />
          ) : fullImageUrl ? (
            <img
              src={fullImageUrl}
              alt={name}
              className="media-lightbox-visual"
            />
          ) : null}
        </div>

        {tips && (
          <div className="ex-cue-banner">
            <Info size={16} className="text-blue shrink-0" />
            <p>{tips}</p>
          </div>
        )}
      </div>
    </div>
  );
}
