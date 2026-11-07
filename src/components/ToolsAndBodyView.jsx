import React, { useState, useMemo } from 'react';
import {
  Disc,
  Flame,
  Calculator,
  Scale,
  Plus,
  Trash2,
  Check,
} from 'lucide-react';
import {
  calculatePlateBreakdown,
  calculateWarmupSets,
  calculate1RM,
  formatWeightValue,
  toLbs,
} from '../utils/workoutMath';

export default function ToolsAndBodyView({
  lang,
  unit,
  t,
  measurements,
  setMeasurements,
}) {
  // Plate Calculator & Warmup State
  const [targetWeight, setTargetWeight] = useState(unit === 'kg' ? 100 : 225);
  const [barWeight, setBarWeight] = useState(unit === 'kg' ? 20 : 45);

  // 1RM Calculator State
  const [calcWeight, setCalcWeight] = useState(unit === 'kg' ? 85 : 185);
  const [calcReps, setCalcReps] = useState(8);

  // Body Measurement Form State
  const [showAddMeasure, setShowAddMeasure] = useState(false);
  const [mWeight, setMWeight] = useState(unit === 'kg' ? 83.5 : 184);
  const [mBodyFat, setMBodyFat] = useState(14.0);
  const [mChest, setMChest] = useState(43.8);
  const [mWaist, setMWaist] = useState(31.7);
  const [mArms, setMArms] = useState(16.5);
  const [mThighs, setMThighs] = useState(24.6);

  const plateData = useMemo(() => {
    return calculatePlateBreakdown(targetWeight, barWeight, unit);
  }, [targetWeight, barWeight, unit]);

  const warmupSets = useMemo(() => {
    return calculateWarmupSets(targetWeight, barWeight, unit);
  }, [targetWeight, barWeight, unit]);

  const est1RM = useMemo(() => {
    return calculate1RM(calcWeight, calcReps);
  }, [calcWeight, calcReps]);

  const repMaxTable = useMemo(() => {
    const percentages = [
      { pct: 100, reps: '1 RM' },
      { pct: 95, reps: '2 Reps' },
      { pct: 90, reps: '4 Reps' },
      { pct: 85, reps: '6 Reps' },
      { pct: 80, reps: '8 Reps' },
      { pct: 75, reps: '10 Reps' },
      { pct: 70, reps: '12 Reps' },
    ];
    return percentages.map((row) => ({
      ...row,
      weight: Math.round((est1RM * (row.pct / 100)) * 2) / 2,
    }));
  }, [est1RM]);

  const quickWeightPresets =
    unit === 'kg' ? [60, 80, 100, 120, 140, 180] : [135, 185, 225, 275, 315, 405];

  const handleAddMeasurement = (e) => {
    e.preventDefault();
    const entry = {
      id: `m-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      weightLbs: toLbs(mWeight, unit),
      bodyFat: Number(mBodyFat) || 0,
      chest: Number(mChest) || 0,
      waist: Number(mWaist) || 0,
      arms: Number(mArms) || 0,
      thighs: Number(mThighs) || 0,
    };
    setMeasurements((prev) => [...prev, entry]);
    setShowAddMeasure(false);
  };

  const handleDeleteMeasurement = (id) => {
    setMeasurements((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <div className="section-container">
      {/* Header */}
      <div className="section-top-header">
        <div>
          <h2>
            <Disc size={22} className="text-blue" /> {t.tools.title}
          </h2>
          <p className="section-subtitle">{t.tools.subtitle}</p>
        </div>
      </div>

      {/* Top Grid: Visual Plate Calculator + Warm-up Generator */}
      <div className="analytics-two-col">
        {/* Visual Barbell Plate Calculator */}
        <div className="analytics-card">
          <h4>
            <Disc size={17} className="text-blue" /> {t.tools.plateCalcTitle} (
            {unit.toUpperCase()})
          </h4>

          <div className="form-row-2 mt-12">
            <div className="form-group">
              <label>
                {t.tools.targetWeightLabel} ({unit})
              </label>
              <input
                type="number"
                value={targetWeight}
                onChange={(e) => setTargetWeight(Number(e.target.value))}
              />
            </div>

            <div className="form-group">
              <label>
                {t.tools.barWeightLabel} ({unit})
              </label>
              <select
                value={barWeight}
                onChange={(e) => setBarWeight(Number(e.target.value))}
              >
                {unit === 'kg' ? (
                  <>
                    <option value={20}>20 kg (Olímpica)</option>
                    <option value={15}>15 kg (Femenina)</option>
                    <option value={10}>10 kg (Barra Z)</option>
                  </>
                ) : (
                  <>
                    <option value={45}>45 lbs (Olímpica)</option>
                    <option value={35}>35 lbs (Bella Bar)</option>
                    <option value={25}>25 lbs (Barra Z)</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Preset Quick Buttons */}
          <div className="preset-weights-row">
            {quickWeightPresets.map((val) => (
              <button
                key={val}
                type="button"
                className={`preset-w-btn ${
                  Number(targetWeight) === val ? 'active' : ''
                }`}
                onClick={() => setTargetWeight(val)}
              >
                {val} {unit}
              </button>
            ))}
          </div>

          {/* Visual Olympic Barbell Graphic */}
          <div className="visual-barbell-stage">
            <div className="barbell-shaft-left" />
            <div className="barbell-collar" />
            <div className="barbell-sleeve-plates">
              {plateData.platesPerSide.length === 0 ? (
                <span className="empty-bar-label">
                  {lang === 'es' ? 'Solo Barra' : 'Empty Bar'}
                </span>
              ) : (
                plateData.platesPerSide.map((p, idx) => (
                  <div
                    key={idx}
                    className="visual-plate-slice"
                    style={{
                      height: `${p.height}px`,
                      backgroundColor: p.color,
                      color:
                        p.weight === 10 || p.weight === 5 ? '#0f172a' : '#fff',
                    }}
                  >
                    <span>{p.label}</span>
                  </div>
                ))
              )}
            </div>
            <div className="barbell-sleeve-end" />
          </div>

          <div className="plate-summary-footer">
            <div>
              <span className="text-muted">{t.tools.perSideLabel}</span>{' '}
              <strong>
                {plateData.perSideWeight} {unit} /{' '}
                {lang === 'es' ? 'lado' : 'side'}
              </strong>
            </div>
            <div>
              <span className="text-muted">Total:</span>{' '}
              <strong className="text-blue">
                {plateData.achievedTotal} {unit}
              </strong>
            </div>
          </div>
        </div>

        {/* Warm-up Set Generator & 1RM Calculator */}
        <div className="analytics-card">
          <h4>
            <Flame size={17} className="text-amber" /> {t.tools.warmupTitle}
          </h4>
          <p className="card-helper-text">
            {lang === 'es'
              ? `Series de aproximación calculadas para tu peso efectivo de ${targetWeight} ${unit}:`
              : `Progressive warm-up sets calculated for your ${targetWeight} ${unit} working weight:`}
          </p>

          <div className="warmup-table">
            {warmupSets.map((ws) => {
              const b = calculatePlateBreakdown(ws.weight, barWeight, unit);
              return (
                <div key={ws.stage} className="warmup-row">
                  <span className="set-type-badge type-warmup">W{ws.stage}</span>
                  <div className="warmup-main">
                    <strong>
                      {ws.weight} {unit} × {ws.reps} reps
                    </strong>
                    <small>{ws.pct}</small>
                  </div>
                  <div className="warmup-plates">
                    {b.platesPerSide.length === 0 ? (
                      <span className="text-muted">Barra</span>
                    ) : (
                      b.platesPerSide.map((p, i) => (
                        <span key={i} className="warmup-plate-chip">
                          {p.label}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 1RM Calculator */}
          <h4 className="mt-20">
            <Calculator size={17} className="text-emerald" />{' '}
            {t.tools.oneRmTitle}
          </h4>
          <div className="form-row-2 mt-10">
            <div className="form-group">
              <label>
                {t.workout.weightCol} ({unit})
              </label>
              <input
                type="number"
                value={calcWeight}
                onChange={(e) => setCalcWeight(Number(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label>{t.workout.repsCol}</label>
              <input
                type="number"
                value={calcReps}
                onChange={(e) => setCalcReps(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="rep-max-pills-grid">
            {repMaxTable.map((r) => (
              <div
                key={r.pct}
                className={`rep-max-pill ${r.pct === 100 ? 'highlight' : ''}`}
              >
                <span className="rm-pct">
                  {r.pct}% ({r.reps})
                </span>
                <strong>
                  {r.weight} {unit}
                </strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Body Weight & Measurements Tracker */}
      <div className="analytics-card mt-20">
        <div className="section-top-header mb-12">
          <div>
            <h4>
              <Scale size={18} className="text-blue" />{' '}
              {t.tools.bodyTrackerTitle}
            </h4>
          </div>

          <button
            type="button"
            className="primary-btn"
            onClick={() => setShowAddMeasure(!showAddMeasure)}
          >
            <Plus size={16} />
            <span>{t.tools.addMeasurementBtn}</span>
          </button>
        </div>

        {showAddMeasure && (
          <form onSubmit={handleAddMeasurement} className="measure-log-form">
            <div className="measure-inputs-grid">
              <div className="form-group">
                <label>
                  {t.tools.bodyWeight} ({unit})
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={mWeight}
                  onChange={(e) => setMWeight(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>{t.tools.bodyFat}</label>
                <input
                  type="number"
                  step="0.1"
                  value={mBodyFat}
                  onChange={(e) => setMBodyFat(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>{t.tools.chestMeasure}</label>
                <input
                  type="number"
                  step="0.1"
                  value={mChest}
                  onChange={(e) => setMChest(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>{t.tools.waistMeasure}</label>
                <input
                  type="number"
                  step="0.1"
                  value={mWaist}
                  onChange={(e) => setMWaist(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>{t.tools.armsMeasure}</label>
                <input
                  type="number"
                  step="0.1"
                  value={mArms}
                  onChange={(e) => setMArms(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>{t.tools.thighsMeasure}</label>
                <input
                  type="number"
                  step="0.1"
                  value={mThighs}
                  onChange={(e) => setMThighs(e.target.value)}
                />
              </div>
            </div>
            <button type="submit" className="primary-btn mt-12">
              <Check size={16} />
              <span>{lang === 'es' ? 'Guardar Registro' : 'Save Entry'}</span>
            </button>
          </form>
        )}

        <div className="measurements-table-wrapper">
          <table className="measurements-table">
            <thead>
              <tr>
                <th>{lang === 'es' ? 'Fecha' : 'Date'}</th>
                <th>
                  {t.tools.bodyWeight} ({unit})
                </th>
                <th>{t.tools.bodyFat}</th>
                <th>{t.tools.chestMeasure}</th>
                <th>{t.tools.waistMeasure}</th>
                <th>{t.tools.armsMeasure}</th>
                <th>{t.tools.thighsMeasure}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[...measurements].reverse().map((m) => (
                <tr key={m.id}>
                  <td>{m.date}</td>
                  <td>
                    <strong className="text-blue">
                      {formatWeightValue(m.weightLbs, unit)} {unit}
                    </strong>
                  </td>
                  <td>{m.bodyFat}%</td>
                  <td>{m.chest}</td>
                  <td>{m.waist}</td>
                  <td>{m.arms}</td>
                  <td>{m.thighs}</td>
                  <td>
                    <button
                      type="button"
                      className="icon-btn-subtle danger"
                      onClick={() => handleDeleteMeasurement(m.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
