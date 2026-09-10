import React, { useEffect, useRef, useState } from 'react';
import { t, tf } from '../../i18n';
import { clampLevel } from '../../services/adaptive';
import { speak, setVoiceLang, stopSpeaking, registerRepeatHandler } from '../../services/voice';
import { GAME_TYPES, applyAdaptiveAndSave } from '../../services/gameStore';
import storyContent from '../../content/storyContent';
import { GameHeader, GameSummaryView, levelSubtitle } from './GameParts';

function pickStory(level, lang = 'en') {
  const poolSet = storyContent[lang] || storyContent.en;
  if (!poolSet) {
    return { id: `missing-${lang}`, text: `[story.content]`, questions: [] };
  }
  const pool = poolSet[level] || poolSet[1] || storyContent.en[level] || storyContent.en[1];
  if (!pool) {
    return { id: `missing-${lang}-level-${level}`, text: `[story.level.${level}]`, questions: [] };
  }
  const orderedPool = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  return orderedPool[Math.floor(Math.random() * orderedPool.length)];
}

function prepareQuestions(story) {
  return story.questions.map((q) => ({
    question: q.question,
    options: q.options.map((text, i) => ({ text, correct: i === q.correctIndex })),
  }));
}

function StoryGame({ lang, level, onHome }) {
  const [, setTick] = useState(0);
  const forceRender = () => setTick((tick) => tick + 1);
  const S = useRef(null);

  if (!S.current) {
    const activeLevel = clampLevel(level);
    const story = pickStory(activeLevel, lang);
    const questions = prepareQuestions(story);
    S.current = {
      activeLevel,
      lang,
      story,
      questions,
      questionIndex: 0,
      attempts: 0,
      mistakes: 0,
      sessionStart: Date.now(),
      responseTimes: [],
      questionStart: Date.now(),
      resumeLevel: activeLevel,
      finishing: false,
      summary: null,
    };
  }

  const state = S.current;

  const handleRepeat = () => {
    stopSpeaking();
    setVoiceLang(state.lang);
    speakCurrentContext();
  };

  useEffect(() => {
    setVoiceLang(state.lang);
    speakCurrentContext();
    const unregister = registerRepeatHandler(() => {
      handleRepeat();
    });
    return () => {
      unregister();
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const speechForQuestion = (index) => {
    const question = state.questions[index];
    if (!question) return [];
    const prefix = state.lang === 'hi' ? 'विकल्प'
      : state.lang === 'bn' ? 'বিকল্প'
      : state.lang === 'as' ? 'বিকল্প'
      : state.lang === 'mni' ? 'অপশন'
      : state.lang === 'brx' ? 'थाखाय'
      : 'Option';
    return [
      question.question,
      ...question.options.map((option, optionIndex) =>
        `${prefix} ${optionIndex + 1}: ${option.text}`),
    ];
  };

  const speakOptions = (index, onDone) => {
    const question = state.questions[index];
    if (!question || !question.options.length) {
      if (onDone) onDone();
      return;
    }
    const chainOption = (i) => {
      if (i >= question.options.length) {
        if (onDone) onDone();
        return;
      }
      speak(speechForQuestion(index)[i + 1], () => chainOption(i + 1));
    };
    chainOption(0);
  };

  const speakCurrentContext = (onDone = null) => {
    const question = state.questions[state.questionIndex];
    if (!question) {
      if (onDone) onDone();
      return;
    }
    const speakQuestion = () => speak(question.question, () => speakOptions(state.questionIndex, onDone));
    speak(state.story.text, speakQuestion);
  };

  const restart = (nextLevel) => {
    stopSpeaking();
    const activeLevel = clampLevel(nextLevel || state.resumeLevel);
    const story = pickStory(activeLevel, state.lang);
    const questions = prepareQuestions(story);
    Object.assign(S.current, {
      activeLevel,
      resumeLevel: activeLevel,
      story,
      questions,
      questionIndex: 0,
      attempts: 0,
      mistakes: 0,
      sessionStart: Date.now(),
      responseTimes: [],
      questionStart: Date.now(),
      finishing: false,
      summary: null,
    });
    setVoiceLang(state.lang);
    speakCurrentContext();
    forceRender();
  };

  const handleChoice = (option) => {
    if (state.finishing) return;
    state.attempts += 1;
    state.responseTimes.push(Date.now() - state.questionStart);
    setVoiceLang(state.lang);
    if (!option.correct) {
      state.mistakes += 1;
      speak(t(state.lang, 'tryAgain'));
      forceRender();
      return;
    }
    speak(t(state.lang, 'nice'), () => {
      state.questionIndex += 1;
      if (state.questionIndex >= state.questions.length) {
        finish();
        return;
      }
      state.questionStart = Date.now();
      speakCurrentContext();
      forceRender();
    });
  };

  const finish = async () => {
    if (state.finishing) return;
    state.finishing = true;
    const times = state.responseTimes;
    const avgResponseMs = times.length === 0 ? 0 : Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const completed = true;
    const accuracyPercent = state.attempts === 0 ? 100 : Math.round(((state.attempts - state.mistakes) / state.attempts) * 100);
    const totalTimeSeconds = Math.round((Date.now() - state.sessionStart) / 1000);
    const { nextPlayLevel, passed } = await applyAdaptiveAndSave(GAME_TYPES.remember_my_story, {
      level: state.activeLevel,
      attempts: state.attempts,
      mistakes: state.mistakes,
      accuracyPercent,
      avgResponseMs,
      totalTimeSeconds,
      extra: {
        content_pack_id: `remember_my_story_l${state.activeLevel}`,
        story_id: state.story.id,
        completed,
        correct: state.attempts - state.mistakes,
      },
    });
    state.resumeLevel = state.activeLevel;
    state.summary = {
      level: state.activeLevel,
      accuracyPercent,
      totalTimeSeconds,
      attempts: state.attempts,
      mistakes: state.mistakes,
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

  const q = state.questions[state.questionIndex];

  return (
    <>
      <GameHeader
        lang={state.lang}
        title={t(state.lang, 'storyName')}
        subtitle={`${levelSubtitle(state.lang, state.activeLevel)} · ${tf(state.lang, 'storyQuestionOf', { n: state.questionIndex + 1, total: state.questions.length })}`}
        onBack={onHome}
        speechControls
        onRepeat={handleRepeat}
      />
      <main className="screen">
        <p className="instruction">{t(state.lang, 'storyHelp')}</p>
        <p className="story-card">{state.story.text}</p>
        <p className="instruction">{q ? q.question : ''}</p>
        <div className="choice-col">
          {q ? q.options.map((option) => (
            <button
              key={option.text}
              className="choice-btn"
              type="button"
              onClick={() => handleChoice(option)}
            >
              {option.text}
            </button>
          )) : null}
        </div>
      </main>
    </>
  );
}

export default StoryGame;