import React, { useState } from 'react';
import { t } from '../../i18n';
import { clampLevel, MAX_LEVEL, levelTier } from '../../services/adaptive';
import { repeatLast, toggleSpeaking, isSpeechPaused } from '../../services/voice';

export function levelSubtitle(lang, level) {
  const n = clampLevel(level);
  return `${t(lang, 'level')} ${n} · ${t(lang, levelTier(n))}`;
}

export function GameHeader({ lang, title, subtitle, onBack, speechControls = false, onRepeat = null }) {
  const [paused, setPaused] = useState(isSpeechPaused());
  const [repeatCooldown, setRepeatCooldown] = useState(false);

  const handleToggle = () => {
    const isPaused = toggleSpeaking();
    setPaused(isPaused);
  };

  const handleRepeatClick = () => {
    if (repeatCooldown) return;
    setRepeatCooldown(true);
    setTimeout(() => setRepeatCooldown(false), 350);
    setPaused(false);
    if (onRepeat) {
      onRepeat();
    } else {
      repeatLast();
    }
  };

  return (
    <div className="app-header game-header">
      <div className="game-header-text">
        <h1 className="game-title">{title}</h1>
        {subtitle ? <p className="game-subtitle">{subtitle}</p> : null}
      </div>
      <div className="header-actions">
        {onBack ? (
          <button className="header-btn" type="button" onClick={onBack}>
            {t(lang, 'back')}
          </button>
        ) : null}
        {speechControls ? (
          <>
            <button className="header-btn" type="button" onClick={handleRepeatClick}>
              {t(lang, 'repeat')}
            </button>
            <button className="header-btn" type="button" onClick={handleToggle}>
              {paused ? t(lang, 'play') : t(lang, 'pause')}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function GameSummaryView({ lang, summary, onRestart, onHome, onNext }) {
  const passed = Boolean(summary.passed);
  const isFinal = clampLevel(summary.level) >= MAX_LEVEL;

  let headline = t(lang, 'wellDone');
  if (!passed) headline = t(lang, 'tryAgain');
  else if (isFinal) headline = t(lang, 'allLevelsComplete');

  return (
    <div className="summary screen">
      <div className={`star${passed ? ' star-passed' : ' star-missed'}`}>{passed ? '⭐' : '🔁'}</div>
      <h2>{headline}</h2>
      {summary.patientMessage ? (
        <div style={{
          background: 'rgba(216, 90, 48, 0.08)',
          border: '1.5px solid rgba(216, 90, 48, 0.3)',
          borderRadius: '12px',
          padding: '10px 16px',
          margin: '12px 0 16px 0',
          color: '#D85A30',
          fontWeight: '600',
          fontSize: '1.05rem',
          textAlign: 'center',
        }}>
          {summary.patientMessage}
        </div>
      ) : null}
      <SummaryRow label={t(lang, 'level')} value={levelSubtitle(lang, summary.level)} />
      <SummaryRow label={t(lang, 'accuracy')} value={`${summary.accuracyPercent}%`} />
      <SummaryRow label={t(lang, 'timeTaken')} value={`${summary.totalTimeSeconds}s`} />
      <SummaryRow label={t(lang, 'attempts')} value={String(summary.attempts)} />
      <SummaryRow label={t(lang, 'mistakes')} value={String(summary.mistakes)} />
      {summary.nextPlayLevel ? (
        <SummaryRow label={t(lang, 'nextSession')} value={levelSubtitle(lang, summary.nextPlayLevel)} />
      ) : null}
      {onNext ? (
        <button className="btn summary-btn" type="button" onClick={onNext}>
          {t(lang, 'nextLevel')}
        </button>
      ) : null}
      <button className="btn summary-btn" type="button" onClick={onRestart}>
        {t(lang, 'playAgain')}
      </button>
      <button className="btn summary-btn summary-btn-home" type="button" onClick={onHome}>
        {t(lang, 'home')}
      </button>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="summary-row">
      <span>{label}</span>
      <span className="summary-value">{value}</span>
    </div>
  );
}

const SHAPE_DEFS = {
  circle: '<circle cx="50" cy="50" r="38" fill="{fill}" />',
  square: '<rect x="16" y="16" width="68" height="68" rx="8" fill="{fill}" />',
  rectangle: '<rect x="10" y="28" width="80" height="44" rx="8" fill="{fill}" />',
  star: '<polygon points="50,8 61,38 94,38 67,58 78,90 50,70 22,90 33,58 6,38 39,38" fill="{fill}" />',
  pentagon: '<polygon points="50,8 92,38 76,88 24,88 8,38" fill="{fill}" />',
  triangle: '<polygon points="50,12 90,86 10,86" fill="{fill}" />',
};

export function ShapeMark({ shape, fill = '#D85A30', size = 64 }) {
  const inner = (SHAPE_DEFS[shape] || SHAPE_DEFS.triangle).split('{fill}').join(fill);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}