import React, { useEffect, useRef, useState } from 'react';
import { t, tf } from '../../i18n';
import { clampLevel } from '../../services/adaptive';
import { speak, speakSequence, setVoiceLang, stopSpeaking } from '../../services/voice';
import { GAME_TYPES, applyAdaptiveAndSave, listFamilyMembers } from '../../services/gameStore';
import { buildFaceSession, choiceText } from '../../content/faceNameContent';
import { GameHeader, GameSummaryView } from './GameParts';

function FaceNameGame({ lang, level, onHome }) {
  const [, setTick] = useState(0);
  const forceRender = () => setTick((tick) => tick + 1);
  const S = useRef(null);
  const [loading, setLoading] = useState(true);
  const [needPeople, setNeedPeople] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setVoiceLang(lang);
    (async () => {
      const pool = await listFamilyMembers();
      if (cancelled) return;
      if (pool.length < 3) {
        setNeedPeople(true);
        setLoading(false);
        return;
      }
      const activeLevel = clampLevel(level);
      const session = buildFaceSession(activeLevel, pool, lang);
      const rounds = session.rounds;
      S.current = {
        activeLevel,
        lang,
        rounds,
        roundIndex: 0,
        attempts: 0,
        correctCount: 0,
        responseTimes: [],
        roundStart: Date.now(),
        sessionStart: Date.now(),
        resumeLevel: activeLevel,
        answering: false,
        summary: null,
        loading: false,
      };
      speakRound(S.current);
      setLoading(false);
      forceRender();
    })();
    return () => {
      cancelled = true;
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const state = S.current;

  const speakRound = (st = state) => {
    const round = st.rounds && st.rounds[st.roundIndex];
    if (!round) return;
    const speakOptions = () => speakSequence(
      round.choices.map((person, index) =>
        `Option ${String.fromCharCode(65 + index)}: ${choiceText(st.lang, person, st.activeLevel) || person.name}`)
    );
    speak(round.prompt, speakOptions);
  };

  const restart = (nextLevel) => {
    stopSpeaking();
    const activeLevel = clampLevel(nextLevel || state.resumeLevel);
    setVoiceLang(state.lang);
    (async () => {
      const pool = await listFamilyMembers();
      const session = buildFaceSession(activeLevel, pool, state.lang);
      const rounds = session.rounds;
      Object.assign(S.current, {
        activeLevel,
        resumeLevel: activeLevel,
        rounds,
        roundIndex: 0,
        attempts: 0,
        correctCount: 0,
        responseTimes: [],
        roundStart: Date.now(),
        sessionStart: Date.now(),
        answering: false,
        summary: null,
      });
      speakRound();
      forceRender();
    })();
  };

  const handleChoice = (person) => {
    if (state.answering) return;
    state.answering = true;
    state.attempts += 1;
    state.responseTimes.push(Date.now() - state.roundStart);
    setVoiceLang(state.lang);
    const current = state.rounds[state.roundIndex];
    const feedback = person.id === current.target.id ? t(state.lang, 'nice') : t(state.lang, 'tryAgain');
    if (person.id === current.target.id) {
      state.correctCount += 1;
    }
    speak(feedback, () => {
      state.roundIndex += 1;
      if (state.roundIndex >= state.rounds.length) {
        finish();
        return;
      }
      state.answering = false;
      state.roundStart = Date.now();
      speakRound();
      forceRender();
    });
  };

  const finish = async () => {
    const times = state.responseTimes;
    const avgResponseMs = times.length === 0 ? 0 : Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const mistakes = state.attempts - state.correctCount;
    const accuracyPercent = state.attempts === 0 ? 0 : Number(((state.correctCount / state.attempts) * 100).toFixed(1));
    const totalTimeSeconds = Math.round((Date.now() - state.sessionStart) / 1000);
    const { nextPlayLevel, passed } = await applyAdaptiveAndSave(GAME_TYPES.face_name_recall, {
      level: state.activeLevel,
      attempts: state.attempts,
      mistakes,
      accuracyPercent,
      avgResponseMs,
      totalTimeSeconds,
    });
    state.resumeLevel = state.activeLevel;
    state.summary = {
      level: state.activeLevel,
      accuracyPercent,
      totalTimeSeconds,
      attempts: state.attempts,
      mistakes,
      nextPlayLevel,
      passed,
    };
    speak(t(state.lang, 'wellDone'));
    forceRender();
  };

  if (loading) {
    return <main className="screen"><p className="instruction">…</p></main>;
  }

  if (needPeople) {
    return (
      <>
        <GameHeader
          lang={lang}
          title={t(lang, 'faceName')}
          subtitle={tf(lang, 'levelCurrent', { n: clampLevel(level) })}
          onBack={onHome}
        />
        <main className="screen">
          <p className="instruction">{t(lang, 'faceHelp')}</p>
          <p className="story-card">{t(lang, 'noPhoto')}</p>
        </main>
      </>
    );
  }

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

  const round = state.rounds[state.roundIndex];

  return (
    <>
      <GameHeader
        lang={state.lang}
        title={t(state.lang, 'faceName')}
        subtitle={`${t(state.lang, 'level')} ${state.activeLevel} · ${state.roundIndex + 1} / ${state.rounds.length}`}
        onBack={onHome}
        speechControls
      />
      <main className="screen">
        <p className="instruction">{round.prompt}</p>
        {round.mode === 'photos' ? (
          <div className="face-option-grid">
            {round.choices.map((person) => (
              <button
                key={person.id}
                className="face-option-btn"
                type="button"
                onClick={() => handleChoice(person)}
              >
                <span className="face-name-label">{person.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="face-stage">
              <span className="face-stage-name">{round.target.name}</span>
            </div>
            <div className="choice-col">
              {round.choices.map((person) => (
                <button
                  key={person.id}
                  className="choice-btn"
                  type="button"
                  onClick={() => handleChoice(person)}
                >
                  {choiceText(state.lang, person, state.activeLevel)}
                </button>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}

export default FaceNameGame;