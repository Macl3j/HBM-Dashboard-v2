import Client from 'ssh2-sftp-client';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const machines = [
  { id: '2024', host: '46.21.223.18', port: 5522 },
  { id: '2025', host: '46.21.223.18', port: 6622 }
];

const COLOR_MAP = {
  '01': 'Bezbarwny', '02': 'Brązowy', '03': 'Zielony', '04': 'Niebieski', '05': 'Inny', '99': 'Metal'
};

function getShift(isoDate) {
  if (!isoDate) return 'Nieokreślona';
  const hour = new Date(isoDate).getUTCHours();
  if (hour >= 6 && hour < 14) return 'Zmiana I (06-14)';
  if (hour >= 14 && hour < 22) return 'Zmiana II (14-22)';
  return 'Zmiana III (22-06)';
}

async function processMachine(machine) {
  const sftp = new Client();
  console.log(`\n[${machine.id}] Łączenie z portem ${machine.port}...`);
  
  try {
    await sftp.connect({ 
      host: machine.host, 
      port: machine.port, 
      username: 'HLZ_Share', 
      password: '2!=-M7Jg6u9#y8',
      retries: 3
    });

    // Pobierz mapę EANów (pricat)
    const pricatBuf = await sftp.get('/In/pricat.txt').catch(() => null);
    const eanMap = {};
    if (pricatBuf) {
      pricatBuf.toString().split('\n').forEach(l => {
        if (l.startsWith('POS;')) {
          const p = l.split(';');
          eanMap[p[1]] = { mat: p[11], col: p[12] };
        }
      });
    }

    const outFiles = (await sftp.list('/Out').catch(() => [])).map(f => ({ ...f, path: '/Out' }));
    const procFiles = (await sftp.list('/Processed').catch(() => [])).map(f => ({ ...f, path: '/Processed' }));
    
    const allReadyFiles = [...outFiles, ...procFiles].filter(f => f.name.endsWith('.ready'));
    console.log(`[${machine.id}] Znaleziono ${allReadyFiles.length} partii do przetworzenia.`);

    let processedCount = 0;
    
    for (let i = 0; i < allReadyFiles.length; i += 100) {
      const chunk = allReadyFiles.slice(i, i + 100);
      const updates = [];

      for (const f of chunk) {
        const base = f.name.replace('.ready', '');
        const parts = base.split('-');
        const seal = parts.length > 1 ? parts[1] : 'UNKNOWN';

        try {
          const batchBuf = await sftp.get(`${f.path}/${base}.batch`);
          const lines = batchBuf.toString().split('\n');
          const posLine = lines.find(l => l.startsWith('POS;'));
          if (!posLine) continue;

          const p = posLine.split(';');
          const totalCount = parseInt(p[12]) || 0;
          const refundableCount = parseInt(p[5]) || 0;
          const depositAmount = parseFloat(p[24]) || 0.0;
          const startTime = parseTs(p[4]);

          if (totalCount === 0) continue;

          const slsBuf = await sftp.get(`${f.path}/${base}.sls`).catch(() => null);
          const breakdown = { PET: 0, ALU: 0, PET_Colors: {} };
          
          if (slsBuf) {
            slsBuf.toString().split('\n').filter(l => l.startsWith('POS;')).forEach(l => {
              const sp = l.split(';');
              const info = eanMap[sp[3]];
              if (info) {
                if (info.mat === '01') {
                  breakdown.PET++;
                  const colorName = COLOR_MAP[info.col] || 'Inny';
                  breakdown.PET_Colors[colorName] = (breakdown.PET_Colors[colorName] || 0) + 1;
                } else if (info.mat === '41') {
                  breakdown.ALU++;
                }
              }
            });
          }

          updates.push({
            machine_id: machine.id,
            batch_number: `${seal}@${base}`,
            shift_name: getShift(startTime),
            total_count: totalCount,
            total_weight: totalCount * 0.022,
            processing_time_seconds: toSecs(p[16]),
            material_breakdown: breakdown,
            raw_content: posLine,
            start_time: startTime,
            accepted_count: refundableCount,
            deposit_amount: depositAmount
          });
        } catch (e) {
          // Ignoruj błędy pojedynczych plików
        }
      }

      if (updates.length > 0) {
        const { error } = await supabase.from('anker_batches').upsert(updates, { onConflict: 'batch_number' });
        if (error) console.error(`\n[${machine.id}] Błąd Supabase:`, error.message);
        processedCount += updates.length;
        process.stdout.write(`\r  Postęp [${machine.id}]: ${processedCount} / ${allReadyFiles.length}`);
      }
    }
  } catch (err) {
    console.error(`[${machine.id}] Błąd krytyczny:`, err.message);
  } finally {
    await sftp.end();
  }
}

async function run() {
  console.log('=== Anker Ingestor v3.0: High Capacity Mode ===');
  for (const m of machines) {
    await processMachine(m);
  }
  console.log(`\n\n=== IMPORT ZAKOŃCZONY ===`);
}

function parseTs(s) {
  if (!s || s.length < 14) return null;
  return `${s.substring(0,4)}-${s.substring(4,6)}-${s.substring(6,8)}T${s.substring(8,10)}:${s.substring(10,12)}:${s.substring(12,14)}Z`;
}
function toSecs(t) {
  if (!t) return 0;
  const p = t.split(':');
  return p.length === 3 ? +p[0]*3600 + +p[1]*60 + +p[2] : 0;
}

run();
