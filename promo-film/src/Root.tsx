import React from 'react';
import { Composition } from 'remotion';
import { Film4 } from './v4/Film4';
import { FPS, TOTAL } from './v4/beat';
import '@fontsource-variable/noto-sans-sc';
import '@fontsource-variable/noto-serif-sc';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Film" component={Film4} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} defaultProps={{ music: true }} />
  </>
);
