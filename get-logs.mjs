import { spawn } from 'child_process';

const vercelLogs = spawn('npx.cmd', ['vercel', 'logs', 'kalori-dev.vercel.app', '--json'], {
  env: {
    ...process.env,
    VERCEL_TOKEN: 'vcp_7sJ1Jljbo40NwD2hAS0sG8GYErS4WygpmKEalx9MNiPg2QG48X0wgOZb',
  },
});

vercelLogs.stdout.on('data', (data) => {
  console.log(`LOGS: ${data}`);
});

vercelLogs.stderr.on('data', (data) => {
  console.log(`ERR: ${data}`);
});

// Wait 5 seconds for connection, then trigger the 500 error
setTimeout(() => {
  console.log('Triggering fetch...');
  fetch('https://kalori-dev.vercel.app').then((r) => console.log('Fetch status:', r.status));
}, 5000);

// Stop after 15 seconds
setTimeout(() => {
  vercelLogs.kill();
  process.exit(0);
}, 15000);
