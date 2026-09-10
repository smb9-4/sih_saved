import React, { useEffect, useRef, useState } from 'react';
import { t, missingTranslation } from '../../i18n';
import { clampLevel } from '../../services/adaptive';
import { speak, setVoiceLang, stopSpeaking } from '../../services/voice';
import { GAME_TYPES, applyAdaptiveAndSave } from '../../services/gameStore';
import { buildShapeSortRound } from '../../content/shapeSortContent';
import { GameHeader, GameSummaryView, ShapeMark } from './GameParts';

function tileContent(item) {
  if (item.kind === 'emoji') return <span className="sort-emoji">{item.emoji}</span>;
  if (item.kind === 'object') return <span className="card-word">{item.label || item.name || ''}</span>;
  return <ShapeMark shape={item.shape} fill="#D85A30" size={52} />;
}

function foundLabel(lang, found, total) {
  const fallback = `${found} / ${total} ${missingTranslation(lang, 'shape.foundLabel')}`;
  const labels = {
    en: `Found ${found} of ${total}`,
    hi: `${found} / ${total} मिल गए`,
    as: `${found} / ${total} বিচাৰি পালে`,
    bn: `${found} / ${total} খুঁজে পেয়েছেন`,
    mni: `${found} / ${total} ফংলে`,
  };
  return labels[lang] || fallback;
}

function ShapeSortGame({ lang, level, onHome }) {
  const [, setTick] = useState(0);
  const forceRender = () => setTick((tick) => tick + 1);
  const S = useRef(null);

  if (!S.current) {
    const activeLevel = clampLevel(level);
    const { spec, items, targetIds } = buildShapeSortRound(activeLevel, lang);
    S.current = {
      activeLevel,
      lang,
      spec,
      items,
      targetIds: new Set(targetIds),
      foundIds: new Set(),
      wrongTaps: 0,
      lastWrongId: null,
      finished: false,
      remainingMs: spec.timeLimitMs,
      sessionStart: Date.now(),
      actionStart: Date.now(),
      responseTimes: [],
      resumeLevel: activeLevel,
      summary: null,
    };
  }

  const state = S.current;

  useEffect(() => {
    setVoiceLang(state.lang);
    speak(state.spec.instruction);
    if (state.spec.timeLimitMs) {
      const timerId = window.setInterval(() => {
        if (state.finished) return;
        state.remainingMs -= 250;
        forceRender();
        if (state.remainingMs <= 0) {
          window.clearInterval(timerId);
          finish();
        }
      }, 250);
      return () => {
        window.clearInterval(timerId);
        stopSpeaking();
      };
    }
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restart = (nextLevel) => {
    stopSpeaking();
    const activeLevel = clampLevel(nextLevel || state.resumeLevel);
    const { spec, items, targetIds } = buildShapeSortRound(activeLevel, state.lang);
    Object.assign(S.current, {
      activeLevel,
      resumeLevel: activeLevel,
      spec,
      items,
      targetIds: new Set(targetIds),
      foundIds: new Set(),
      wrongTaps: 0,
      lastWrongId: null,
      finished: false,
      remainingMs: spec.timeLimitMs,
      sessionStart: Date.now(),
      actionStart: Date.now(),
      responseTimes: [],
      summary: null,
    });
    speak(spec.instruction);
    forceRender();
  };

  const allTargetsFound = () => {
    return state.targetIds.size > 0 && [...state.targetIds].every((id) => state.foundIds.has(id));
  };

  const handleTap = (item) => {
    if (state.finished || state.foundIds.has(item.id)) return;
    state.responseTimes.push(Date.now() - state.actionStart);
    state.actionStart = Date.now();
    state.lastWrongId = null;

    if (state.targetIds.has(item.id)) {
      state.foundIds.add(item.id);
      speak(t(state.lang, 'nice'));
      if (allTargetsFound()) finish();
      else forceRender();
      return;
    }

    state.wrongTaps += 1;
    state.lastWrongId = item.id;
    speak(t(state.lang, 'tryAgain'));
    forceRender();
  };

  const finish = async () => {
    if (state.finished) return;
    state.finished = true;

    const foundCount = [...state.targetIds].filter((id) => state.foundIds.has(id)).length;
    const missed = state.targetIds.size - foundCount;
    const mistakes = state.wrongTaps + missed;
    const attempts = foundCount + state.wrongTaps;
    const accuracyPercent = state.targetIds.size + state.wrongTaps === 0
      ? 0
      : Number(((foundCount / (state.targetIds.size + state.wrongTaps)) * 100).toFixed(1));
    const times = state.responseTimes;
    const avgResponseMs = times.length === 0 ? 0 : Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const totalTimeSeconds = Math.round((Date.now() - state.sessionStart) / 1000);
    const { nextPlayLevel, passed } = await applyAdaptiveAndSave(GAME_TYPES.shape_sort, {
      level: state.activeLevel,
      attempts: Math.max(attempts, foundCount + mistakes),
      mistakes,
      accuracyPercent,
      avgResponseMs,
      totalTimeSeconds,
      extra: {
        content_pack_id: `shape_sort_l${state.activeLevel}`,
        targets: state.targetIds.size,
        found: foundCount,
        missed,
        wrong_taps: state.wrongTaps,
      },
    });
    state.resumeLevel = state.activeLevel;
    state.summary = {
      level: state.activeLevel,
      accuracyPercent,
      totalTimeSeconds,
      attempts: Math.max(attempts, foundCount + mistakes),
      mistakes,
      nextPlayLevel,
      passed,
    };
    speak(allTargetsFound() ? t(state.lang, 'allFound') : t(state.lang, 'wellDone'));
    forceRender();
  };

  if (state.summary) {
    return (
      <GameSummaryView
        lang={state.lang}
        summary={state.summary}
        onRestart={restart}
        onHome={onHome}
        onNext={
          state.summary.passed && state.summary.nextPlayLevel > state.activeLevel
            ? () => restart(state.summary.nextPlayLevel)
            : null
        }
      />
    );
  }

  const cols = state.items.length >= 20 ? 5 : state.items.length >= 10 ? 5 : 4;

  return (
    <>
      <GameHeader
        lang={state.lang}
        title={t(state.lang, 'shapeName')}
        subtitle={`${t(state.lang, 'level')} ${state.activeLevel}`}
        onBack={onHome}
        speechControls
      />
      <main className="screen">
        {state.spec.timeLimitMs ? (
          <div className="timer">
            {Math.max(0, Math.ceil(state.remainingMs / 1000))}s
          </div>
        ) : null}
        <p className="instruction">{state.spec.instruction}</p>
        <p className="instruction">
          {foundLabel(state.lang, state.foundIds.size, state.targetIds.size)}
        </p>
        <div className={`sort-grid cols-${cols}`}>
          {state.items.map((item) => {
            const found = state.foundIds.has(item.id);
            const wrongFlash = state.lastWrongId === item.id;
            return (
              <button
                key={item.id}
                className={`sort-item${found ? ' selected correct' : ''}${wrongFlash ? ' wrong' : ''}`}
                type="button"
                onClick={() => handleTap(item)}
              >
                {tileContent(item)}
              </button>
            );
          })}
        </div>
        <button className="btn sort-done-btn" type="button" onClick={finish}>
          {t(state.lang, 'done')}
        </button>
      </main>
    </>
  );
}

export default ShapeSortGame;