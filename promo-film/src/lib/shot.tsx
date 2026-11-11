// 按 layout.json 的坐标，从电脑端整页截图（2x 纹理）里取一块区域显示。
// 对应 video-shotcraft 阶段 4 的「全页 2x 纹理 + 元素坐标表」用法：画面里的每块界面都来自真实页面截图。
import React from 'react';
import { Img, staticFile } from 'remotion';
import LAYOUT from '../../public/ui/layout.json';

export type Rect = { x: number; y: number; w: number; h: number };
export const L = LAYOUT as unknown as Record<string, Record<string, any>>;
export const PAGE = { w: 1920, h: 1200 };

// 页面 page（desk-home / desk-auto / desk-myfb）里的 rect 区域，显示成宽 width 的一块
export const Region: React.FC<{
  page: string; rect: Rect; width: number; pad?: number; radius?: number; style?: React.CSSProperties; children?: React.ReactNode;
}> = ({ page, rect, width, pad = 0, radius = 22, style, children }) => {
  const r = { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 };
  const k = width / r.w;
  return (
    <div style={{ position: 'relative', width, height: r.h * k, overflow: 'hidden', borderRadius: radius, ...style }}>
      <Img src={staticFile(`ui/${page}.png`)} style={{ position: 'absolute', left: -r.x * k, top: -r.y * k, width: PAGE.w * k, height: PAGE.h * k, maxWidth: 'none' }} />
      {children}
    </div>
  );
};
