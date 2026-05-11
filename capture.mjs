import { spawn } from 'child_process';

const vercelLogs = spawn('vercel', ['logs', 'kalori-dev.vercel.app', '--json'], {
  env: {
    ...process.env,
    VERCEL_TOKEN: 'vcp_7sJ1Jljbo40NwD2hAS0sG8GYErS4WygpmKEalx9MNiPg2QG48X0wgOZb',
  },
  shell: true,
});

vercelLogs.stdout.on('data', (data) => {
  console.log(`LOGS: ${data}`);
});

vercelLogs.stderr.on('data', (data) => {
  console.log(`ERR: ${data}`);
});

setTimeout(() => {
  console.log('Triggering fetch...');
  globalThis
    .fetch('https://kalori-dev.vercel.app')
    .then((r) => console.log('Fetch status:', r.status));
}, 5000);

setTimeout(() => {
  vercelLogs.kill();
  process.exit(0);
}, 15000);
