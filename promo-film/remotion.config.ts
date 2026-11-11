import { Config } from '@remotion/cli/config';
// 采集机上用预装的 Chromium headless shell（不另外下载）
Config.setBrowserExecutable('/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell');
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setChromiumOpenGlRenderer('swangle');
