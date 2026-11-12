import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Main } from './Main';
import { VCUTS } from './vcuts';

/* 9:16 竖屏 60s 精华版：复用同一套响应式场景组件（布局按画幅重排），按句边界剪辑 */
export const Vertical: React.FC = () => (
  <AbsoluteFill style={{ background: '#07090E' }}>
    {VCUTS.map((c) => (
      <Sequence key={c.dst} from={Math.round(c.dst * 30)} durationInFrames={Math.round((c.src[1] - c.src[0]) * 30)}>
        <Sequence from={-Math.round(c.src[0] * 30)}>
          <Main />
        </Sequence>
      </Sequence>
    ))}
  </AbsoluteFill>
);
