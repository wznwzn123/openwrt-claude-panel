import React from 'react';
import { Composition } from 'remotion';
import { Film } from './Film';
import { FPS, TOTAL } from './timeline';
import '@fontsource-variable/noto-sans-sc';
import '@fontsource-variable/noto-serif-sc';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Film" component={Film} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} defaultProps={{ music: true }} />
  </>
);
