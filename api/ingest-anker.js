import Client from 'ssh2-sftp-client';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const machines = [
  { id: '2024', host: '46.21.223.18', port: 5522, username: 'HLZ_Share', password: '2!=-M7Jg6u9#y8' },
  { id: '2025', host: '46.21.223.18', port: 6622, username: 'HLZ_Share', password: '2!=-M7Jg6u9#y8' }
];

const COLOR_MAP = {
  '01': 'Bezbarwny', '02': 'Brązowy', '03': 'Zielony', '04': 'Niebieski', '05': 'Inny', '99': 'Metal'
};

const MAX_FILES_PER_RUN = 50;

function parseTs(ts) {
  if (!ts || ts.length < 14) return null;
  return `${ts.slice(0,4)}-${ts.slice(4,6)}-${ts.slice(6,8)}T${ts.slice(8,10)}:${ts.slice(10,12)}:${ts.slice(12,14)}Z`;
}
function toSecs(t) {
  if (!t) return 0;
  const p = t.split(':');
  return p.length === 3 ? +p[0]*3600 + +p[1]*60 + +p[2] : 0;
}

async function ingestMachine(machine, eanMap) {
  const sftp = new Client();
  const log = { machineId: machine.id, processed: 0, skipped: 0, errors: [] };

  try {
    await sftp.connect({ host: machine.host, port: machine.port, username: machine.username, password: machine.password, timeout: 20000 });

    const files = await sftp.list('/Out');
    const readyFiles = files.filter(f => f.name.endsWith('.ready')).slice(0, MAX_FILES_PER_RUN);
    log.skipped = Math.max(0, files.filter(f => f.name.endsWith('.ready')).length - MAX_FILES_PER_RUN);

    const batchesToInsert = [];

    for (const readyFile of readyFiles) {
      const base = readyFile.name.replace('.ready', '');
      try {
        const [batchBuf, slsBuf] = await Promise.all([
          sftp.get(`/Out/${base}.batch`),
          sftp.get(`/Out/${base}.sls`)
        ]);

        const posLine = batchBuf.toString().split('\n').find(l => l.startsWith('POS;'));
        if (!posLine) continue;

        const p = posLine.split(';');
        const batchNum = `${p[2] || p[1]}@${base}`;
        const totalCount = parseInt(p[12]) || 0;

        // Breakdown calculation
        const breakdown = { PET: 0, ALU: 0, PET_Colors: {} };
        const slsLines = slsBuf.toString().split('\n').filter(l => l.startsWith('POS;'));
        slsLines.forEach(l => {
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

        batchesToInsert.push({
          machine_id: machine.id,
          batch_number: batchNum,
          start_time: parseTs(p[4]),
          total_count: totalCount,
          total_weight: totalCount * 0.022,
          processing_time_seconds: toSecs(p[16]),
          material_breakdown: breakdown,
          raw_content: posLine
        });

      } catch (e) { log.errors.push(`${base}: ${e.message}`); }
    }

    if (batchesToInsert.length > 0) {
      const { data, error } = await supabase.from('anker_batches').upsert(batchesToInsert, { onConflict: 'batch_number' });
      if (error) throw error;
      log.processed = batchesToInsert.length;

      // Move files
      for (const readyFile of readyFiles) {
        const base = readyFile.name.replace('.ready', '');
        for (const ext of ['.batch', '.sls', '.ready']) {
          try { await sftp.rename(`/Out/${base}${ext}`, `/Processed/${base}${ext}`); } catch (_) {}
        }
      }
    }
  } catch (e) { log.errors.push(`Błąd: ${e.message}`); }
  finally { try { await sftp.end(); } catch (_) {} }
  return log;
}

export default async function handler(req, res) {
  const sftp = new Client();
  let eanMap = {};
  try {
    await sftp.connect(machines[0]);
    const buf = await sftp.get('/In/pricat.txt');
    buf.toString().split('\n').forEach(l => {
      if(l.startsWith('POS;')){
        const p = l.split(';');
        eanMap[p[1]] = { mat: p[11], col: p[12] };
      }
    });
    await sftp.end();
  } catch(e) { console.error('Pricat fail:', e); }

  const results = await Promise.all(machines.map(m => ingestMachine(m, eanMap)));
  res.status(200).json({ success: true, results });
}
