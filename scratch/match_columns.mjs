import Client from 'ssh2-sftp-client';
import { config } from 'dotenv';
config();

const sftp = new Client();

async function run() {
  await sftp.connect({ host: '46.21.223.18', port: 5522, username: 'HLZ_Share', password: '2!=-M7Jg6u9#y8' });
  const files = await sftp.list('/Processed');
  const batches = files.filter(f => f.name.endsWith('.batch')).slice(0, 100);

  for (const f of batches) {
    try {
      const b = await sftp.get('/Processed/' + f.name);
      const sls = await sftp.get('/Processed/' + f.name.replace('.batch', '.sls')).catch(() => null);
      
      const pos = b.toString().split('\n').find(l => l.startsWith('POS;'));
      if (!pos) continue;
      
      const slsCount = sls ? sls.toString().split('\n').filter(l => l.startsWith('POS;')).length : 0;
      if (slsCount > 10) { // Tylko sensowne partie
        const p = pos.split(';');
        // Szukamy gdzie w 'p' jest liczba slsCount
        const matchingIndices = [];
        p.forEach((val, idx) => {
          if (parseInt(val) === slsCount) matchingIndices.push(idx);
        });
        
        console.log(`SLS: ${slsCount} | POS Matches: ${matchingIndices.join(',')} | Raw: ${pos}`);
      }
    } catch (e) {}
  }
  await sftp.end();
}

run();
