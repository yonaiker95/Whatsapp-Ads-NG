const { spawn } = require('child_process');

const ROOT = __dirname;

function prefix(label, color) {
  return `\x1b[${color}m[${label}]\x1b[0m`;
}

function run(name, color, command, args) {
  const child = spawn(command, args, {
    cwd: ROOT,
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1' },
  });
  child.stdout.on('data', (d) => {
    for (const line of d.toString().split('\n')) {
      if (line) process.stdout.write(`${prefix(name, color)} ${line}\n`);
    }
  });
  child.stderr.on('data', (d) => {
    for (const line of d.toString().split('\n')) {
      if (line) process.stderr.write(`${prefix(name, color)} ${line}\n`);
    }
  });
  child.on('exit', (code) => {
    process.stdout.write(`${prefix(name, color)} proceso terminado (code=${code})\n`);
  });
  return child;
}

const api = run('API', '36', 'node', ['server.js']);
const web = run('WEB', '34', 'node', ['node_modules/@angular/cli/bin/ng.js', 'serve']);

function shutdown() {
  process.stdout.write('\nCerrando servicios...\n');
  try { api.kill(); } catch { /* ignore */ }
  try { web.kill(); } catch { /* ignore */ }
  setTimeout(() => process.exit(0), 300);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
