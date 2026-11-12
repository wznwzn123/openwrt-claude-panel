import React from 'react';
import { AbsoluteFill } from 'remotion';
import { ensureFonts, useT } from './lib/core';
import { Act1 } from './acts/Act1';
import { Act2 } from './acts/Act2';
import { Act3 } from './acts/Act3';
import { Act4 } from './acts/Act4';
import { Act5 } from './acts/Act5';
import { Subtitles } from './Subtitles';

ensureFonts();

export const ACTS = [
  { id: 'a1', start: 0, end: 12 },
  { id: 'a2', start: 12, end: 28 },
  { id: 'a3', start: 28, end: 54 },
  { id: 'a4', start: 54, end: 74 },
  { id: 'a5', start: 74, end: 90 },
];

export const Main: React.FC<{ subtitles?: boolean }> = ({ subtitles = true }) => {
  const t = useT();
  return (
    <AbsoluteFill style={{ background: '#07090E', overflow: 'hidden' }}>
      {t < 12 && <Act1 />}
      {t >= 12 && t < 28 && <Act2 />}
      {t >= 28 && t < 54 && <Act3 />}
      {t >= 54 && t < 74 && <Act4 />}
      {t >= 74 && <Act5 />}
      {subtitles && <Subtitles />}
    </AbsoluteFill>
  );
};
