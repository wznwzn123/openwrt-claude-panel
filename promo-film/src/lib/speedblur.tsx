// 来源：video-shotcraft demos/_fixtures/Polish.tsx 的 SpeedBlur（按速度给方向性运动模糊，静止时为 0）
import React from 'react';

export const SpeedBlur: React.FC<{
  vx: number; vy?: number; amount?: number; max?: number; children: React.ReactNode; style?: React.CSSProperties;
}> = ({ vx, vy = 0, amount = 0.45, max = 36, children, style }) => {
  const rid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const speed = Math.hypot(vx, vy);
  const sd = Math.min(max, speed * amount);
  const fill: React.CSSProperties = { position: 'absolute', inset: 0 };
  if (sd < 0.35) return <div style={{ ...fill, ...style }}>{children}</div>;
  const deg = (Math.atan2(vy, vx) * 180) / Math.PI;
  const id = `speedblur-${rid}`;
  return (
    <div style={{ ...fill, ...style }}>
      <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
        <filter id={id} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation={`${sd.toFixed(2)} 0`} edgeMode="none" />
        </filter>
      </svg>
      <div style={{ ...fill, transform: `rotate(${deg}deg)`, filter: `url(#${id})` }}>
        <div style={{ ...fill, transform: `rotate(${-deg}deg)` }}>{children}</div>
      </div>
    </div>
  );
};
