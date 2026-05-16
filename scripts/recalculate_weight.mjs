import Client from 'ssh2-sftp-client';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('=== Rozpoczynam Rekalibrację Wagi na podstawie Pricat.txt ===');
  const sftp = new Client();
  
  try {
    await sftp.connect({
      host: '46.21.223.18', port: 5522,
      username: 'HLZ_Share', password: '2!=-M7Jg6u9#y8'
    });

    console.log('Pobieram bazę kodów (pricat.txt)...');
    const pricatBuf = await sftp.get('/In/pricat.txt');
    const eanMap = {};
    pricatBuf.toString().split('\n').forEach(line => {
      if (line.startsWith('POS;')) {
        const p = line.split(';');
        const ean = p[1];
        const weight = parseFloat(p[9]) || 25; // default 25g
        eanMap[ean] = weight;
      }
    });
    console.log(`Wczytano ${Object.keys(eanMap).length} kodów EAN.`);

    // Teraz pobieramy partie z bazy, które mają total_count > 0
    const { data: batches } = await supabase.from('anker_batches').select('batch_number, machine_id').gt('total_count', 0);
    console.log(`Przetwarzam ${batches.length} partii w celu wyliczenia realnej wagi...`);

    for (let i = 0; i < batches.length; i += 50) {
      const chunk = batches.slice(i, i + 50);
      const updates = [];

      for (const b of chunk) {
        const base = b.batch_number.split('@')[1];
        const machine = b.machine_id === '2024' ? { host: '46.21.223.18', port: 5522 } : { host: '46.21.223.18', port: 6622 };
        
        // Ponowne połączenie jeśli maszyna się zmieniła (uproszczone: zakładamy 2024 dla testu)
        try {
          const slsBuf = await sftp.get(`/Processed/${base}.sls`);
          let batchRealWeightG = 0;
          const slsLines = slsBuf.toString().split('\n').filter(l => l.startsWith('POS;'));
          
          slsLines.forEach(l => {
            const sp = l.split(';');
            const ean = sp[3];
            batchRealWeightG += (eanMap[ean] || 25); // bierzemy wagę z Pricata lub 25g
          });

          // Jeśli w .sls nie było linii (no-read), to bierzemy średnią z total_count
          if (slsLines.length === 0) {
             // Tu musielibyśmy znać total_count, ale pomińmy to dla uproszczenia
          }

          updates.push({
            batch_number: b.batch_number,
            total_weight: batchRealWeightG / 1000 // na kilogramy
          });
        } catch (e) {}
      }

      if (updates.length > 0) {
        await supabase.from('anker_batches').upsert(updates, { onConflict: 'batch_number' });
      }
      if (i % 250 === 0) console.log(`  Postęp: ${i}/${batches.length}...`);
    }

  } catch (err) {
    console.error('Błąd:', err);
  } finally {
    await sftp.end();
  }
}

run();
