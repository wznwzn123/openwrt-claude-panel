import React from 'react';
import { Composition } from 'remotion';
import { Film5 } from './v5/Film5';
import { Spike } from './v5/Spike';
import { FPS, TOTAL } from './v4/beat';
import '@fontsource-variable/noto-sans-sc';
import '@fontsource-variable/noto-serif-sc';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Film" component={Film5} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} defaultProps={{ music: true }} />
    <Composition id="Spike" component={Spike} durationInFrames={300} fps={30} width={1920} height={1080} />
  </>
);
