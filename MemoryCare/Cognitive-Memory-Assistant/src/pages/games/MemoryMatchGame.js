import React, { useEffect, useRef, useState } from 'react';
import { t } from '../../i18n';
import { clampLevel } from '../../services/adaptive';
import { speak, setVoiceLang, stopSpeaking } from '../../services/voice';
import { GAME_TYPES, applyAdaptiveAndSave } from '../../services/gameStore';
import {
  nextPatternRound,
  getShapeSet,
  getEmojiSet,
  getPhotoRound,
  pickPoolItems,
  localizePatternItem,
} from '../../content/patternMatchingContent';
import { GameHeader, GameSummaryView, ShapeMark, shuffle } from './GameParts';

function buildDeck(level, roundIndex, lang) {
  if (level === 1) {
    const shapes = getShapeSet(roundIndex);
    const pairContent = shuffle([...shapes, ...shapes]);
    return {
      columns: 3,
      cards: pairContent.map((shape, i) => ({
        id: `card_${i}`,
        pairId: shape,
        kind: 'shape',
        shape,
        isFlipped: false,
        isMatched: false,
      })),
    };
  }
  if (level === 2) {
    const emojis = getEmojiSet(roundIndex);
    const pairContent = shuffle([...emojis, ...emojis]);
    return {
      columns: 3,
      cards: pairContent.map((emoji, i) => ({
        id: `card_${i}`,
        pairId: emoji,
        kind: 'emoji',
        emoji,
        isFlipped: false,
        isMatched: false,
      })),
    };
  }

  // Level 3 & 4: word-only pairs (no images)
  const spec = getPhotoRound(level, roundIndex);
  const items = pickPoolItems(spec.category, spec.pairs, spec.offset);
  const faces = [];
  items.forEach((item) => {
    const label = localizePatternItem(item, lang);
    // Both cards in the pair show the word — no images
    faces.push({ pairId: item.name, kind: 'word', label });
    faces.push({ pairId: item.name, kind: 'word', label });
  });
  const shuffled = shuffle(faces);
  return {
    columns: 4,
    cards: shuffled.map((face, i) => ({
      id: `card_${i}`,
      ...face,
      isFlipped: false,
      isMatched: false,
    })),
  };
}

function CardFace({ card }) {
  if (card.kind === 'shape') return <ShapeMark shape={card.shape} size={48} />;
  if (card.kind === 'emoji') return <span className="card-emoji">{card.emoji}</span>;
  if (card.kind === 'word') return <span className="card-word">{card.label}</span>;
  return null;
}

function MemoryMatchGame({ lang, level, onHome }) {
  const [, setTick] = useState(0);
  const forceRender = () => setTick((tick) => tick + 1);
  const S = useRef(null);

  if (!S.current) {
    const activeLevel = clampLevel(level);
    const roundIndex = nextPatternRound(activeLevel);
    const deck = buildDeck(activeLevel, roundIndex, lang);
    S.current = {
      activeLevel,
      level,
      lang,
      cards: deck.cards,
      columns: deck.columns,
      flipped: [],
      busy: false,
      attempts: 0,
      correctMatches: 0,
      lastFlipTime: null,
      responseTimes: [],
      sessionStart: Date.now(),
      resumeLevel: activeLevel,
      summary: null,
    };
  }

  const state = S.current;

  useEffect(() => {
    setVoiceLang(state.lang);
    speak(t(state.lang, 'patternHelp'));
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restart = (nextLevel) => {
    stopSpeaking();
    const activeLevel = clampLevel(nextLevel || state.resumeLevel);
    const roundIndex = nextPatternRound(activeLevel);
    const deck = buildDeck(activeLevel, roundIndex, state.lang);
    Object.assign(S.current, {
      activeLevel,
      resumeLevel: activeLevel,
      cards: deck.cards,
      columns: deck.columns,
      flipped: [],
      busy: false,
      attempts: 0,
      correctMatches: 0,
      lastFlipTime: null,
      responseTimes: [],
      sessionStart: Date.now(),
      summary: null,
    });
    speak(t(state.lang, 'patternHelp'));
    forceRender();
  };

  const allMatched = () => state.cards.every((card) => card.isMatched);

  const handleTap = (index) => {
    if (state.busy) return;
    if (state.cards[index].isFlipped || state.cards[index].isMatched) return;
    if (state.flipped.length === 2) return;
    if (!state.lastFlipTime) state.lastFlipTime = Date.now();

    state.cards = state.cards.map((c, i) => (i === index ? { ...c, isFlipped: true } : c));
    state.flipped = [...state.flipped, index];
    forceRender();

    if (state.flipped.length === 2) {
      state.attempts += 1;
      checkMatch();
    }
  };

  const checkMatch = () => {
    state.busy = true;
    const [i1, i2] = state.flipped;
    const isMatch = state.cards[i1].pairId === state.cards[i2].pairId;
    if (state.lastFlipTime) {
      state.responseTimes.push(Date.now() - state.lastFlipTime);
      state.lastFlipTime = null;
    }

    window.setTimeout(() => {
      if (isMatch) {
        state.cards = state.cards.map((c, i) => (i === i1 || i === i2 ? { ...c, isMatched: true } : c));
        state.correctMatches += 1;
        state.flipped = [];
        state.busy = false;
        if (allMatched()) finish();
        else forceRender();
      } else {
        state.cards = state.cards.map((c, i) => (i === i1 || i === i2 ? { ...c, isFlipped: false } : c));
        state.flipped = [];
        state.busy = false;
        forceRender();
      }
    }, isMatch ? 500 : 1100);
  };

  const finish = async () => {
    const times = state.responseTimes;
    const avgResponseMs = times.length === 0 ? 0 : Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const accuracyPercent = state.attempts === 0 ? 0 : Number(((state.correctMatches / state.attempts) * 100).toFixed(1));
    const mistakes = state.attempts - state.correctMatches;
    const totalTimeSeconds = Math.round((Date.now() - state.sessionStart) / 1000);
    const { nextPlayLevel, passed } = await applyAdaptiveAndSave(GAME_TYPES.pattern_matching, {
      level: state.activeLevel,
      attempts: state.attempts,
      mistakes,
      accuracyPercent,
      avgResponseMs,
      totalTimeSeconds,
      extra: { grid_size: state.cards.length, correct_matches: state.correctMatches },
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

  return (
    <>
      <GameHeader
        lang={state.lang}
        title={t(state.lang, 'patternName')}
        subtitle={state.activeLevel ? `${t(state.lang, 'level')} ${state.activeLevel}` : undefined}
        onBack={onHome}
        speechControls
      />
      <main className="screen">
        <p className="instruction">{t(state.lang, 'patternHelp')}</p>
        <div className={`grid cols-${state.columns}`}>
          {state.cards.map((card, index) => {
            const show = card.isFlipped || card.isMatched;
            return (
              <button
                key={card.id}
                className={`card-btn${show ? ' face' : ''}${card.isMatched ? ' matched' : ''}`}
                type="button"
                aria-label={show ? `Card showing ${card.label || card.emoji || card.shape}` : 'Face-down card'}
                onClick={() => handleTap(index)}
              >
                {show ? <CardFace card={card} /> : '?'}
              </button>
            );
          })}
        </div>
      </main>
    </>
  );
}

export default MemoryMatchGame;