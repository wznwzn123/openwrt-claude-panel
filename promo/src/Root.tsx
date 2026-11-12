import React from 'react';
import { Composition } from 'remotion';
import { Main } from './Main';
import { Vertical } from './Vertical';

export const Root: React.FC = () => (
  <>
    <Composition id="Promo90" component={Main} durationInFrames={5400} fps={60} width={1920} height={1080} defaultProps={{ subtitles: true }} />
    <Composition id="Promo90Clean" component={Main} durationInFrames={5400} fps={60} width={1920} height={1080} defaultProps={{ subtitles: false }} />
    {/* 剪映底片 / 预览循环用：无字幕 30fps（场景按秒作画，帧率无关） */}
    <Composition id="Plate30" component={Main} durationInFrames={2700} fps={30} width={1920} height={1080} defaultProps={{ subtitles: false }} />
    <Composition id="Vertical60" component={Vertical} durationInFrames={1800} fps={30} width={1080} height={1920} />
  </>
);
