import fs from 'fs';
import { execSync } from 'child_process';

const content = fs.readFileSync('Planning/apikeys.txt', 'utf8');
const lines = content.split(/\r?\n/);

for (const line of lines) {
  const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (match) {
    const key = match[1];
    let value = match[2].trim();
    if (key.startsWith('VERCEL_')) continue;

    console.log(`Adding ${key}...`);
    try {
      execSync(`vercel env rm ${key} production -y`, { stdio: 'ignore' });
    } catch (e) {}

    fs.writeFileSync('val.tmp', value);

    try {
      execSync(`cmd.exe /c "vercel env add ${key} production < val.tmp"`, {
        stdio: 'inherit',
        env: process.env,
      });
    } catch (e) {
      console.error(`Failed to add ${key}`);
    }
  }
}
try {
  fs.unlinkSync('val.tmp');
} catch (e) {}
console.log('Done!');
