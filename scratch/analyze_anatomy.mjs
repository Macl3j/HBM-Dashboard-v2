import Client from 'ssh2-sftp-client';
import { config } from 'dotenv';
config();

const sftp = new Client();

async function run() {
  await sftp.connect({ host: '46.21.223.18', port: 5522, username: 'HLZ_Share', password: '2!=-M7Jg6u9#y8' });
  const files = await sftp.list('/Processed');
  const samples = files.filter(f => f.name.endsWith('.batch')).slice(0, 20);

  for (const f of samples) {
    const base = f.name.replace('.batch', '');
    const b = await sftp.get('/Processed/' + f.name);
    const sls = await sftp.get('/Processed/' + base + '.sls').catch(() => null);
    
    const lines = b.toString().split('\n');
    const pos = lines.find(l => l.startsWith('POS;'));
    if (!pos) continue;
    
    const p = pos.split(';');
    const slsLines = sls ? sls.toString().split('\n').filter(l => l.startsWith('POS;')) : [];
    
    console.log(`File: ${base}`);
    console.log(`  p[5] (Count?): ${p[5]}`);
    console.log(`  p[10] (Mat?): ${p[10]}`);
    console.log(`  p[12] (Count?): ${p[12]}`);
    console.log(`  p[13] (Weight?): ${p[13]}`);
    console.log(`  SLS Count: ${slsLines.length}`);
    console.log('-------------------');
  }
  await sftp.end();
}

run();
