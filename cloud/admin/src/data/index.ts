/* 品牌与全局配置 */
export const APP = Object.freeze({
  name: '路由器面板 · 托管服务管理后台',
  shortName: '管理后台',
  subtitle: 'Router Panel Hub',
  version: 'v4.0',
})

export interface NavLeaf { key: string; label: string; icon: string; path: string; badge?: string }
export interface NavGroup { key: string; label: string; icon: string; single?: boolean; items: NavLeaf[] }
export const AVATAR_TINTS = ['#236de9', '#3f9d3a', '#4b5a63', '#2f8f9d', '#7a5cd6', '#c2603e']
