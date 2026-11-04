import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Refuse to overlap another installation or its agent.
await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', () => reject(new Error('Port 3037 is in use. Stop the existing application first.')));
  probe.listen(3037, '127.0.0.1', () => probe.close(resolve));
});
const configPath = path.join(root, 'config', 'boss-agent.json');
let config = {};
try { config = JSON.parse(await fs.readFile(configPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
// Each manual launch requires enabling replies in the UI again.
await fs.mkdir(path.dirname(configPath), { recursive: true });
await fs.writeFile(configPath, JSON.stringify({ ...config, enabled: false, loginRequested: false }, null, 2));
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === 'win32' && child.pid) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill();
  }
  process.exitCode = code;
}
for (const [file, args, cwd] of [
  ['server.mjs', ['start', '-p', '3037'], path.join(root, 'web')],
  ['boss-agent.mjs', ['daemon'], root],
]) {
  const child = spawn(process.execPath, [path.join(cwd, file), ...args], { cwd, stdio: 'inherit', env: { ...process.env, CAREER_OPS_ROOT: root } });
  children.push(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code || 0); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
console.log('AI直聘: http://127.0.0.1:3037 — Ctrl+C or windows/stop.cmd to stop.');
console.log('自动回复默认暂停；先导入自己的简历并设置岗位，再在常驻助手页面启用。');
