// tools/app-version.sh：App 版本和强不强制（用户 11/28 14:35：只有 6.0.1 这一次强制，后面不强制）
// 在临时 git 仓库里造几个版本跑一遍，强制的判断要跟官网判断路由器的 mustUpdate 一样
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0;
const ok = (name, c, extra) => { if (c) { pass++; console.log('✓ ' + name); } else { fail++; console.log('✗ ' + name + (extra ? '  ' + extra : '')); } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appver-'));
const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
const put = (f, s) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), s); };
const commit = (msg) => { git('add', '-A'); git('commit', '-q', '-m', msg); };
const run = (v) => JSON.parse(execFileSync('sh', ['tools/app-version.sh', v], { cwd: dir, encoding: 'utf8' }));

try {
	git('init', '-q');
	put('tools/app-version.sh', fs.readFileSync(path.join(ROOT, 'tools', 'app-version.sh'), 'utf8'));
	put('android/app/a.txt', '1');
	put('tools/release-notes.md', '说明\n\n最低版本：v6.0.0【必须更新】（比 v6.0.0 旧的必须更新）\n');
	commit('6.0.0'); git('tag', 'v6.0.0');

	// 6.0.1：App 没改，路由器这版强制
	put('src/x', '1');
	put('tools/release-notes.md', '说明\n\n最低版本：v6.0.1【必须更新】（比 v6.0.1 旧的必须更新）\n');
	commit('6.0.1');
	let r = run('v6.0.1');
	ok('App 没改：沿用 App 上次改的版本 6.0.0', r.version === '6.0.0', JSON.stringify(r.version));
	ok('App 没改：用 6.0.0 那份说明，6.0.0 本身是强制的（旧 App 要更新）', r.force === true && r.body.includes('v6.0.0'));
	git('tag', 'v6.0.1');

	// 6.1.0：App 改了，说明沿用「最低版本：v6.0.1【必须更新】」→ 不强制
	put('android/app/a.txt', '2');
	put('tools/release-notes.md', '说明\n\n最低版本：v6.0.1【必须更新】（比 v6.0.1 旧的必须更新）\n\n- 新功能\n');
	commit('6.1.0');
	r = run('v6.1.0');
	ok('App 改了：版本 = 这次发布的 6.1.0', r.version === '6.1.0');
	ok('沿用上一版的「最低版本：v6.0.1【必须更新】」不算强制', r.force === false);
	git('tag', 'v6.1.0');

	// 6.2.0：App 改了，最低版本写成这一版 → 强制
	put('android/app/a.txt', '3');
	put('tools/release-notes.md', '说明\n\n最低版本：v6.2.0【必须更新】\n');
	commit('6.2.0');
	r = run('v6.2.0');
	ok('最低版本写的就是这一版：强制', r.version === '6.2.0' && r.force === true);

	// 说明里别处另外写了【必须更新】：强制；最低版本没带【必须更新】、别处也没写：不强制
	put('tools/release-notes.md', '说明\n\n最低版本：v6.0.1【必须更新】\n\n- 修好一个安全问题【必须更新】\n');
	r = run('v6.2.0');
	ok('别处另外写了【必须更新】：强制', r.force === true);
	put('tools/release-notes.md', '说明\n\n最低版本：v6.2.0\n\n- 新功能\n');
	r = run('v6.2.0');
	ok('没写【必须更新】：不强制', r.force === false);
	put('tools/release-notes.md', '说明\n\n最低版本:6.2.0 【必须更新】\n');
	r = run('v6.2.0');
	ok('半角冒号、不带 v、中间有空格也认得', r.force === true);

	// 跟仓库里现在的更新说明对一遍：下一版（比如 6.0.2）照抄现在这份，不强制
	put('tools/release-notes.md', fs.readFileSync(path.join(ROOT, 'tools', 'release-notes.md'), 'utf8'));
	put('android/app/a.txt', '4');
	commit('6.0.2');
	r = run('v6.0.2');
	ok('现在的 release-notes.md 照抄到下一版：App 不强制', r.version === '6.0.2' && r.force === false, JSON.stringify({ v: r.version, f: r.force }));
} finally {
	fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\n通过 ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
