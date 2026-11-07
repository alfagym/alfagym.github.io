import React from 'react';

export default function MuscleHeatmapSVG({
  selectedMuscle = 'all',
  primaryMuscles = [],
  secondaryMuscles = [],
  muscleScores = null, // optional map { chest: 12, back: 15, ... }
  onSelectMuscle,
  t,
  compact = false,
}) {
  const getMuscleFill = (muscleKey) => {
    if (selectedMuscle === muscleKey) {
      return '#1d8cf8';
    }
    if (primaryMuscles.includes(muscleKey)) {
      return '#ef4444';
    }
    if (secondaryMuscles.includes(muscleKey)) {
      return '#f59e0b';
    }
    if (muscleScores && typeof muscleScores[muscleKey] === 'number') {
      const count = muscleScores[muscleKey];
      if (count >= 12) return '#1d8cf8';
      if (count >= 6) return '#38bdf8';
      if (count >= 1) return 'rgba(56, 189, 248, 0.45)';
    }
    return '#1e293b';
  };

  const getMuscleStroke = (muscleKey) => {
    if (
      selectedMuscle === muscleKey ||
      primaryMuscles.includes(muscleKey) ||
      secondaryMuscles.includes(muscleKey)
    ) {
      return '#f8fafc';
    }
    return '#334155';
  };

  const handleClick = (muscleKey) => {
    if (!onSelectMuscle) return;
    if (selectedMuscle === muscleKey) {
      onSelectMuscle('all');
    } else {
      onSelectMuscle(muscleKey);
    }
  };

  return (
    <div className={`muscle-map-wrapper ${compact ? 'compact' : ''}`}>
      <div className="muscle-figures-row">
        {/* ================= FRONT ANATOMY VIEW ================= */}
        <div className="muscle-figure-col">
          {!compact && <span className="figure-label">{t?.exercises?.frontView || 'Frontal'}</span>}
          <svg
            viewBox="0 0 200 410"
            className="anatomy-svg"
            aria-label="Front Muscle Map"
          >
            {/* Head & Neck */}
            <circle cx="100" cy="30" r="20" fill="#1e293b" stroke="#475569" strokeWidth="2" />
            <rect x="92" y="50" width="16" height="12" rx="4" fill="#1e293b" />

            {/* Traps (Front Upper) */}
            <g
              className="muscle-part"
              onClick={() => handleClick('traps')}
            >
              <title>{t?.muscles?.traps || 'Trapecios'}</title>
              <polygon
                points="70,64 92,55 92,66 74,70"
                fill={getMuscleFill('traps')}
                stroke={getMuscleStroke('traps')}
                strokeWidth="1.5"
              />
              <polygon
                points="130,64 108,55 108,66 126,70"
                fill={getMuscleFill('traps')}
                stroke={getMuscleStroke('traps')}
                strokeWidth="1.5"
              />
            </g>

            {/* Shoulders (Deltoids Front) */}
            <g
              className="muscle-part"
              onClick={() => handleClick('shoulders')}
            >
              <title>{t?.muscles?.shoulders || 'Hombros'}</title>
              <path
                d="M70,65 C52,67 44,82 47,102 C54,104 64,98 69,85 Z"
                fill={getMuscleFill('shoulders')}
                stroke={getMuscleStroke('shoulders')}
                strokeWidth="1.5"
              />
              <path
                d="M130,65 C148,67 156,82 153,102 C146,104 136,98 131,85 Z"
                fill={getMuscleFill('shoulders')}
                stroke={getMuscleStroke('shoulders')}
                strokeWidth="1.5"
              />
            </g>

            {/* Chest (Pectorals) */}
            <g
              className="muscle-part"
              onClick={() => handleClick('chest')}
            >
              <title>{t?.muscles?.chest || 'Pecho'}</title>
              <path
                d="M70,68 L98,68 L98,112 C84,115 71,110 66,96 Z"
                fill={getMuscleFill('chest')}
                stroke={getMuscleStroke('chest')}
                strokeWidth="1.5"
              />
              <path
                d="M130,68 L102,68 L102,112 C116,115 129,110 134,96 Z"
                fill={getMuscleFill('chest')}
                stroke={getMuscleStroke('chest')}
                strokeWidth="1.5"
              />
            </g>

            {/* Biceps */}
            <g
              className="muscle-part"
              onClick={() => handleClick('biceps')}
            >
              <title>{t?.muscles?.biceps || 'Bíceps'}</title>
              <rect
                x="45"
                y="104"
                width="19"
                height="44"
                rx="9"
                transform="rotate(6 54 126)"
                fill={getMuscleFill('biceps')}
                stroke={getMuscleStroke('biceps')}
                strokeWidth="1.5"
              />
              <rect
                x="136"
                y="104"
                width="19"
                height="44"
                rx="9"
                transform="rotate(-6 145 126)"
                fill={getMuscleFill('biceps')}
                stroke={getMuscleStroke('biceps')}
                strokeWidth="1.5"
              />
            </g>

            {/* Forearms */}
            <g
              className="muscle-part"
              onClick={() => handleClick('forearms')}
            >
              <title>{t?.muscles?.forearms || 'Antebrazos'}</title>
              <rect
                x="39"
                y="152"
                width="16"
                height="48"
                rx="7"
                transform="rotate(8 47 176)"
                fill={getMuscleFill('forearms')}
                stroke={getMuscleStroke('forearms')}
                strokeWidth="1.5"
              />
              <rect
                x="145"
                y="152"
                width="16"
                height="48"
                rx="7"
                transform="rotate(-8 153 176)"
                fill={getMuscleFill('forearms')}
                stroke={getMuscleStroke('forearms')}
                strokeWidth="1.5"
              />
            </g>

            {/* Abs / Core */}
            <g
              className="muscle-part"
              onClick={() => handleClick('abs')}
            >
              <title>{t?.muscles?.abs || 'Abdominales / Core'}</title>
              <rect
                x="77"
                y="116"
                width="20"
                height="22"
                rx="4"
                fill={getMuscleFill('abs')}
                stroke={getMuscleStroke('abs')}
                strokeWidth="1.5"
              />
              <rect
                x="103"
                y="116"
                width="20"
                height="22"
                rx="4"
                fill={getMuscleFill('abs')}
                stroke={getMuscleStroke('abs')}
                strokeWidth="1.5"
              />
              <rect
                x="78"
                y="141"
                width="19"
                height="22"
                rx="4"
                fill={getMuscleFill('abs')}
                stroke={getMuscleStroke('abs')}
                strokeWidth="1.5"
              />
              <rect
                x="103"
                y="141"
                width="19"
                height="22"
                rx="4"
                fill={getMuscleFill('abs')}
                stroke={getMuscleStroke('abs')}
                strokeWidth="1.5"
              />
              <rect
                x="80"
                y="166"
                width="17"
                height="24"
                rx="4"
                fill={getMuscleFill('abs')}
                stroke={getMuscleStroke('abs')}
                strokeWidth="1.5"
              />
              <rect
                x="103"
                y="166"
                width="17"
                height="24"
                rx="4"
                fill={getMuscleFill('abs')}
                stroke={getMuscleStroke('abs')}
                strokeWidth="1.5"
              />
            </g>

            {/* Quadriceps */}
            <g
              className="muscle-part"
              onClick={() => handleClick('quads')}
            >
              <title>{t?.muscles?.quads || 'Cuádriceps'}</title>
              <path
                d="M68,196 L96,196 L93,290 C76,292 65,280 65,245 Z"
                fill={getMuscleFill('quads')}
                stroke={getMuscleStroke('quads')}
                strokeWidth="1.5"
              />
              <path
                d="M132,196 L104,196 L107,290 C124,292 135,280 135,245 Z"
                fill={getMuscleFill('quads')}
                stroke={getMuscleStroke('quads')}
                strokeWidth="1.5"
              />
            </g>

            {/* Calves (Front Tibialis / Gastroc) */}
            <g
              className="muscle-part"
              onClick={() => handleClick('calves')}
            >
              <title>{t?.muscles?.calves || 'Pantorrillas'}</title>
              <rect
                x="69"
                y="302"
                width="20"
                height="74"
                rx="9"
                fill={getMuscleFill('calves')}
                stroke={getMuscleStroke('calves')}
                strokeWidth="1.5"
              />
              <rect
                x="111"
                y="302"
                width="20"
                height="74"
                rx="9"
                fill={getMuscleFill('calves')}
                stroke={getMuscleStroke('calves')}
                strokeWidth="1.5"
              />
            </g>
          </svg>
        </div>

        {/* ================= BACK ANATOMY VIEW ================= */}
        <div className="muscle-figure-col">
          {!compact && <span className="figure-label">{t?.exercises?.backView || 'Posterior'}</span>}
          <svg
            viewBox="0 0 200 410"
            className="anatomy-svg"
            aria-label="Back Muscle Map"
          >
            {/* Head */}
            <circle cx="100" cy="30" r="20" fill="#1e293b" stroke="#475569" strokeWidth="2" />

            {/* Traps (Upper & Mid Back Diamond) */}
            <g
              className="muscle-part"
              onClick={() => handleClick('traps')}
            >
              <title>{t?.muscles?.traps || 'Trapecios'}</title>
              <polygon
                points="100,52 68,66 100,115 132,66"
                fill={getMuscleFill('traps')}
                stroke={getMuscleStroke('traps')}
                strokeWidth="1.5"
              />
            </g>

            {/* Rear Shoulders */}
            <g
              className="muscle-part"
              onClick={() => handleClick('shoulders')}
            >
              <title>{t?.muscles?.shoulders || 'Hombros'}</title>
              <path
                d="M68,66 C50,68 44,82 47,100 C55,102 64,96 68,84 Z"
                fill={getMuscleFill('shoulders')}
                stroke={getMuscleStroke('shoulders')}
                strokeWidth="1.5"
              />
              <path
                d="M132,66 C150,68 156,82 153,100 C145,102 136,96 132,84 Z"
                fill={getMuscleFill('shoulders')}
                stroke={getMuscleStroke('shoulders')}
                strokeWidth="1.5"
              />
            </g>

            {/* Back / Lats (V-Taper) */}
            <g
              className="muscle-part"
              onClick={() => handleClick('back')}
            >
              <title>{t?.muscles?.back || 'Espalda / Dorsales'}</title>
              <path
                d="M68,86 L97,114 L97,178 L75,172 C64,142 62,112 68,86 Z"
                fill={getMuscleFill('back')}
                stroke={getMuscleStroke('back')}
                strokeWidth="1.5"
              />
              <path
                d="M132,86 L103,114 L103,178 L125,172 C136,142 138,112 132,86 Z"
                fill={getMuscleFill('back')}
                stroke={getMuscleStroke('back')}
                strokeWidth="1.5"
              />
            </g>

            {/* Triceps */}
            <g
              className="muscle-part"
              onClick={() => handleClick('triceps')}
            >
              <title>{t?.muscles?.triceps || 'Tríceps'}</title>
              <rect
                x="44"
                y="103"
                width="19"
                height="46"
                rx="9"
                transform="rotate(6 53 126)"
                fill={getMuscleFill('triceps')}
                stroke={getMuscleStroke('triceps')}
                strokeWidth="1.5"
              />
              <rect
                x="137"
                y="103"
                width="19"
                height="46"
                rx="9"
                transform="rotate(-6 146 126)"
                fill={getMuscleFill('triceps')}
                stroke={getMuscleStroke('triceps')}
                strokeWidth="1.5"
              />
            </g>

            {/* Forearms Back */}
            <g
              className="muscle-part"
              onClick={() => handleClick('forearms')}
            >
              <title>{t?.muscles?.forearms || 'Antebrazos'}</title>
              <rect
                x="39"
                y="152"
                width="16"
                height="48"
                rx="7"
                transform="rotate(8 47 176)"
                fill={getMuscleFill('forearms')}
                stroke={getMuscleStroke('forearms')}
                strokeWidth="1.5"
              />
              <rect
                x="145"
                y="152"
                width="16"
                height="48"
                rx="7"
                transform="rotate(-8 153 176)"
                fill={getMuscleFill('forearms')}
                stroke={getMuscleStroke('forearms')}
                strokeWidth="1.5"
              />
            </g>

            {/* Glutes */}
            <g
              className="muscle-part"
              onClick={() => handleClick('glutes')}
            >
              <title>{t?.muscles?.glutes || 'Glúteos'}</title>
              <path
                d="M72,178 L99,178 L99,224 C78,228 66,214 68,192 Z"
                fill={getMuscleFill('glutes')}
                stroke={getMuscleStroke('glutes')}
                strokeWidth="1.5"
              />
              <path
                d="M128,178 L101,178 L101,224 C122,228 134,214 132,192 Z"
                fill={getMuscleFill('glutes')}
                stroke={getMuscleStroke('glutes')}
                strokeWidth="1.5"
              />
            </g>

            {/* Hamstrings */}
            <g
              className="muscle-part"
              onClick={() => handleClick('hamstrings')}
            >
              <title>{t?.muscles?.hamstrings || 'Isquiotibiales'}</title>
              <rect
                x="69"
                y="228"
                width="25"
                height="64"
                rx="11"
                fill={getMuscleFill('hamstrings')}
                stroke={getMuscleStroke('hamstrings')}
                strokeWidth="1.5"
              />
              <rect
                x="106"
                y="228"
                width="25"
                height="64"
                rx="11"
                fill={getMuscleFill('hamstrings')}
                stroke={getMuscleStroke('hamstrings')}
                strokeWidth="1.5"
              />
            </g>

            {/* Calves (Posterior Gastrocnemius) */}
            <g
              className="muscle-part"
              onClick={() => handleClick('calves')}
            >
              <title>{t?.muscles?.calves || 'Pantorrillas'}</title>
              <path
                d="M70,300 C65,325 68,355 76,376 L88,376 C93,355 95,325 90,300 Z"
                fill={getMuscleFill('calves')}
                stroke={getMuscleStroke('calves')}
                strokeWidth="1.5"
              />
              <path
                d="M110,300 C105,325 107,355 112,376 L124,376 C132,355 135,325 130,300 Z"
                fill={getMuscleFill('calves')}
                stroke={getMuscleStroke('calves')}
                strokeWidth="1.5"
              />
            </g>
          </svg>
        </div>
      </div>

      {!compact && (
        <div className="muscle-legend-row">
          <span className="legend-chip">
            <span className="legend-dot primary" />
            {langLabel(t, 'Principal / Selección', 'Primary / Selected')}
          </span>
          <span className="legend-chip">
            <span className="legend-dot secondary" />
            {langLabel(t, 'Secundario', 'Secondary')}
          </span>
        </div>
      )}
    </div>
  );
}

function langLabel(t, esText, enText) {
  return t?.updatedPrefix === 'Actualizado:' ? esText : enText;
}
