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
  return child;
}

function build() {
  return new Promise((resolve) => {
    const b = run('BUILD', '33', 'node', ['node_modules/@angular/cli/bin/ng.js', 'build', '--configuration', 'production']);
    b.on('exit', (code) => resolve(code === 0));
  });
}

async function main() {
  process.stdout.write(`${prefix('PROD', '35')} Compilando aplicación...\n`);
  const ok = await build();
  if (!ok) {
    process.stderr.write(`${prefix('PROD', '31')} Compilación fallida. No se iniciará el servidor.\n`);
    process.exit(1);
  }

  process.stdout.write(`${prefix('PROD', '35')} Compilación OK. Sirviendo app + API en http://localhost:${process.env.PORT || '3000'}\n`);
  const api = run('API', '36', 'node', ['server.js']);

  let shuttingDown = false;
  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write('\nCerrando servidor...\n');
    try { api.kill(); } catch { /* ignore */ }
    setTimeout(() => process.exit(0), 300);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
