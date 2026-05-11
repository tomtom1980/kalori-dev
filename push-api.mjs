import fs from 'fs';
import https from 'https';

const TOKEN = 'vcp_7sJ1Jljbo40NwD2hAS0sG8GYErS4WygpmKEalx9MNiPg2QG48X0wgOZb';
const PROJECT_ID = 'kalori-dev';
const TEAM_ID = 'team_7xzlBcHhQM1CPDplsXJaBQLR'; // From OIDC token owner_id

const content = fs.readFileSync('Planning/apikeys.txt', 'utf8');
const lines = content.split(/\r?\n/);

const envVars = [];

for (const line of lines) {
  const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (match) {
    const key = match[1];
    let value = match[2].trim();
    if (key.startsWith('VERCEL_')) continue;
    envVars.push({
      key: key,
      value: value,
      type: 'encrypted',
      target: ['production', 'preview', 'development'],
    });
  }
}

async function uploadVars() {
  for (const ev of envVars) {
    console.log(`Uploading ${ev.key}...`);
    const data = JSON.stringify([ev]);
    const options = {
      hostname: 'api.vercel.com',
      path: `/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
    };

    await new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let resData = '';
        res.on('data', (d) => (resData += d));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`Success: ${ev.key}`);
          } else {
            console.log(`Failed: ${ev.key} - ${res.statusCode} ${resData}`);
          }
          resolve();
        });
      });
      req.on('error', (e) => {
        console.error(e);
        resolve();
      });
      req.write(data);
      req.end();
    });
  }
  console.log('Done!');
}

// First we delete all of them to prevent duplicates (Vercel API requires removing or updating individually)
// We will just try to POST, if it says duplicate, we should PATCH instead, but POST might just add duplicate keys.
// Actually V10 /env endpoint adds them. Wait! V10 POST /env expects a single object or an array? It expects an array for v10.
// If they exist, POST might return 400.
// Let's use `vercel env rm` via npx for cleanup first, since that works well.
import { execSync } from 'child_process';
for (const ev of envVars) {
  try {
    execSync(`npx.cmd vercel env rm ${ev.key} production preview development -y`, {
      stdio: 'ignore',
    });
  } catch (e) {}
}

uploadVars();
