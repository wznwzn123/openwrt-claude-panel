import React from 'react';
import { FONT } from './core';

/* 旧式路由器后台（传统 LuCI 英文界面的通用复刻）：1024px 桌面页，塞进手机后字只剩 4px —— 开篇痛点 */
const row = (cells: string[], i: number, hi = false) => (
  <tr key={i} style={{ background: hi ? '#fde8e8' : i % 2 ? '#f6f6f6' : '#fff' }}>
    {cells.map((c, k) => (
      <td key={k} style={{ padding: '5px 8px', borderTop: '1px solid #ddd', color: hi && k === 5 ? '#c00' : '#333' }}>
        {c}
      </td>
    ))}
  </tr>
);

export const LegacyAdmin: React.FC<{ errorOn?: number; dialogOn?: number }> = ({ errorOn = 0, dialogOn = 0 }) => (
  <div style={{ width: 1024, height: 2048, background: '#fff', fontFamily: 'Arial, "Noto Sans SC", sans-serif', fontSize: 12, color: '#333', position: 'relative' }}>
    <div style={{ height: 44, background: '#2b2b2b', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 22, color: '#ddd' }}>
      <b style={{ color: '#fff', fontSize: 18 }}>OpenWrt</b>
      {['Status', 'System', 'Services', 'Network', 'VPN', 'Statistics', 'Logout'].map((n) => (
        <span key={n} style={{ fontSize: 13 }}>{n} ▾</span>
      ))}
      <span style={{ marginLeft: 'auto', background: '#c00', color: '#fff', borderRadius: 3, padding: '2px 6px', fontSize: 11 }}>Unsaved Changes: 3</span>
    </div>
    <div style={{ padding: '14px 18px' }}>
      <div style={{ display: 'flex', gap: 2, marginBottom: 12 }}>
        {['General Settings', 'Port Forwards', 'Traffic Rules', 'NAT Rules', 'Custom Rules'].map((n, i) => (
          <span key={n} style={{ padding: '6px 10px', border: '1px solid #ccc', borderBottom: i === 1 ? '1px solid #fff' : '1px solid #ccc', background: i === 1 ? '#fff' : '#eee', fontSize: 12 }}>{n}</span>
        ))}
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 400, margin: '4px 0 6px' }}>Firewall - Port Forwards</h2>
      <div style={{ fontSize: 11, color: '#666', marginBottom: 10, lineHeight: 1.5 }}>
        Port forwarding allows remote computers on the Internet to connect to a specific computer or service within the private LAN.
        Configure the external zone, protocol, external port, internal IP address and internal port for each rule below.
      </div>
      {errorOn > 0 && (
        <div style={{ border: '1px solid #e0a0a0', background: '#fdecec', color: '#c00', padding: '10px 12px', marginBottom: 10, fontSize: 13, opacity: errorOn }}>
          <b>✕ 端口映射失败 · Port forwarding failed</b> — WAN address 100.64.23.18 is behind carrier-grade NAT. Rule <i>wan_8443</i> unreachable.
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ background: '#eaeaea' }}>
            {['Name', 'Match', 'Forward to', 'Enable', 'Sort', 'Status', ''].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {row(['nas_web', 'IPv4-TCP, From any host in wan, Via any router IP at port 5000', 'IP 192.168.1.20, port 5000 in lan', '☑', '▲▼', 'timeout', '[Edit] [Delete]'], 0)}
          {row(['wan_8443', 'IPv4-TCP, From any host in wan, Via any router IP at port 8443', 'IP 192.168.1.1, port 443 in lan', '☑', '▲▼', 'FAILED', '[Edit] [Delete]'], 1, errorOn > 0)}
          {row(['ssh_alt', 'IPv4-TCP, From any host in wan, Via any router IP at port 2222', 'IP 192.168.1.1, port 22 in lan', '☐', '▲▼', 'disabled', '[Edit] [Delete]'], 2)}
          {row(['cam_rtsp', 'IPv4-UDP, From any host in wan, Via any router IP at port 554', 'IP 192.168.1.66, port 554 in lan', '☑', '▲▼', 'timeout', '[Edit] [Delete]'], 3)}
          {row(['game_udp', 'IPv4-UDP, From any host in wan, Via any router IP at port 27015', 'IP 192.168.1.30, port 27015 in lan', '☑', '▲▼', 'timeout', '[Edit] [Delete]'], 4)}
        </tbody>
      </table>
      <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
        {['Add', 'Save & Apply', 'Save', 'Reset'].map((b, i) => (
          <span key={b} style={{ padding: '5px 10px', border: '1px solid #999', borderRadius: 3, background: i === 1 ? '#3a75c4' : '#eee', color: i === 1 ? '#fff' : '#333' }}>{b}</span>
        ))}
      </div>
      <h3 style={{ fontSize: 15, fontWeight: 400, margin: '22px 0 6px' }}>Interfaces » WAN</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <tbody>
          {[
            ['Protocol', 'PPPoE'],
            ['Uptime', '0h 3m 12s'],
            ['IPv4', '100.64.23.18/32 (CGNAT)'],
            ['IPv6', '—'],
            ['RX', '1.02 GB (1203391 Pkts.)'],
            ['TX', '96.31 MB (402213 Pkts.)'],
            ['DDNS', 'Error: public address mismatch'],
          ].map((r, i) => row([r[0], r[1]], i))}
        </tbody>
      </table>
      <pre style={{ fontFamily: FONT.mono, fontSize: 10, background: '#f4f4f4', padding: 8, marginTop: 16, color: '#555', lineHeight: 1.45 }}>
{`Tue Nov 11 23:41:07 daemon.err uhttpd[1532]: luci: accepted login on / for root
Tue Nov 11 23:41:22 daemon.warn odhcpd[1188]: No default route present, overriding ra_lifetime!
Tue Nov 11 23:41:30 user.notice firewall: Reloading firewall due to ifupdate of wan (pppoe-wan)
Tue Nov 11 23:41:31 daemon.err ddns-scripts[3301]: myddns_ipv4: public IP not found
Tue Nov 11 23:41:47 kern.warn kernel: [ 1873.2] nf_conntrack: table full, dropping packet`}
      </pre>
    </div>
    {dialogOn > 0 && (
      <div style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, background: `rgba(0,0,0,${0.45 * dialogOn})` }}>
        <div style={{ position: 'absolute', left: 212, top: 300, width: 600, background: '#fff', border: '1px solid #999', boxShadow: '0 10px 40px rgba(0,0,0,0.4)', opacity: dialogOn }}>
          <div style={{ background: '#e9e9e9', padding: '8px 12px', fontSize: 13, fontWeight: 600 }}>Connection Error</div>
          <div style={{ padding: '18px 18px 10px', fontSize: 15, lineHeight: 1.6 }}>
            <div style={{ color: '#b45309', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>⚠ 公网 IP 缺失，无法远程连接</div>
            Remote access to 100.64.23.18:8443 timed out (ERR_CONNECTION_TIMED_OUT). Your ISP did not assign a public IPv4 address.
          </div>
          <div style={{ padding: '6px 18px 16px', textAlign: 'right' }}>
            <span style={{ padding: '5px 14px', border: '1px solid #999', borderRadius: 3, background: '#eee', fontSize: 12 }}>Dismiss</span>
          </div>
        </div>
      </div>
    )}
  </div>
);
