import https from 'https';

const TOKEN = 'vcp_7sJ1Jljbo40NwD2hAS0sG8GYErS4WygpmKEalx9MNiPg2QG48X0wgOZb';
const DEPLOYMENT_ID = 'dpl_CRtU4SPTN4m7fWwSuj9zzc3kNGuj';
const TEAM_ID = 'team_tamas-szalays-projects'; // Actually Vercel API uses teamId which is typically req'd but maybe slug works in some endpoints, let's omit or just try.

const options = {
  hostname: 'api.vercel.com',
  path: `/v2/deployments/${DEPLOYMENT_ID}/events?direction=backward&limit=100`,
  method: 'GET',
  headers: {
    Authorization: `Bearer ${TOKEN}`,
  },
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => (data += chunk));
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log(JSON.stringify(json, null, 2));
    } catch (e) {
      console.log('Raw data:', data);
    }
  });
});

req.on('error', (e) => console.error(e));
req.end();
