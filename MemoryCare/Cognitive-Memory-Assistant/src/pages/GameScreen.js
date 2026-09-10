import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getAppLanguage } from '../i18n';
import { GAME_TYPES, getPlayLevel } from '../services/gameStore';
import MemoryMatchGame from './games/MemoryMatchGame';
import ShapeSortGame from './games/ShapeSortGame';
import FaceNameGame from './games/FaceNameGame';
import StoryGame from './games/StoryGame';
import Navigation from '../components/Navigation';
import OfflineLangAlert from '../components/OfflineLangAlert';
import TopBackButton from '../components/TopBackButton';
import '../styles/GameScreen.css';
import '../styles/Games.css';

const GAME_COMPONENTS = {
  [GAME_TYPES.pattern_matching]: MemoryMatchGame,
  [GAME_TYPES.shape_sort]: ShapeSortGame,
  [GAME_TYPES.face_name_recall]: FaceNameGame,
  [GAME_TYPES.remember_my_story]: StoryGame,
};

const GAME_META = {
  [GAME_TYPES.pattern_matching]: { nameKey: 'patternName', blurbKey: 'patternBlurb' },
  [GAME_TYPES.shape_sort]: { nameKey: 'shapeName', blurbKey: 'shapeBlurb' },
  [GAME_TYPES.face_name_recall]: { nameKey: 'faceName', blurbKey: 'faceBlurb' },
  [GAME_TYPES.remember_my_story]: { nameKey: 'storyName', blurbKey: 'storyBlurb' },
};

function GameScreen({ patient }) {
  const navigate = useNavigate();
  const { gameId } = useParams();
  const lang = patient?.language || getAppLanguage();
  const [currentLevel, setCurrentLevel] = useState(1);

  const Component = GAME_COMPONENTS[gameId];
  const meta = GAME_META[gameId];

  useEffect(() => {
    if (!Component) {
      navigate('/games', { replace: true });
      return;
    }
    let cancelled = false;
    getPlayLevel(gameId).then((lvl) => {
      if (cancelled) return;
      setCurrentLevel(lvl || 1);
    });
    return () => {
      cancelled = true;
    };
  }, [gameId, Component, navigate]);

  if (!Component || !meta) return null;

  const goBackToGames = () => navigate('/games');

  return (
    <div className="game-page">
      <div className="game-container">
        <div className="top-back-row">
          <TopBackButton to="/games" />
        </div>
        <OfflineLangAlert lang={lang} />
        <div className="game-content">
          <Component
            key={`${gameId}-${currentLevel}`}
            lang={lang}
            level={currentLevel}
            onHome={goBackToGames}
          />
        </div>
      </div>
      <Navigation lang={lang} />
    </div>
  );
}

export default GameScreen;