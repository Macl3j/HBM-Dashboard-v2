require('dotenv').config();
const Client = require('ssh2-sftp-client');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Supabase Setup
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// Machine Configurations
const machines = [
  {
    id: '2024',
    host: '46.21.223.18',
    port: 5522,
    username: 'HLZ_Share',
    password: '2!=-M7Jg6u9#y8'
  },
  {
    id: '2025',
    host: '46.21.223.18',
    port: 6622,
    username: 'HLZ_Share',
    password: '2!=-M7Jg6u9#y8'
  }
];

async function ingestMachineData(machine) {
  const sftp = new Client();
  console.log(`Connecting to Machine ${machine.id}...`);
  
  try {
    await sftp.connect({
      host: machine.host,
      port: machine.port,
      username: machine.username,
      password: machine.password
    });

    const remoteDir = '/Out';
    const processedDir = '/Processed';

    // Ensure Processed directory exists
    try {
      await sftp.mkdir(processedDir, true);
    } catch (e) {
      // Ignore if exists
    }

    const files = await sftp.list(remoteDir);
    const readyFiles = files.filter(f => f.name.endsWith('.ready'));

    console.log(`Found ${readyFiles.length} ready batches on Machine ${machine.id}`);

    for (const readyFile of readyFiles) {
      const batchBase = readyFile.name.replace('.ready', '');
      const batchFile = `${batchBase}.batch`;
      const slsFile = `${batchBase}.sls`;

      console.log(`Processing batch: ${batchBase}`);

      // Download content
      const batchBuffer = await sftp.get(`${remoteDir}/${batchFile}`);
      const slsBuffer = await sftp.get(`${remoteDir}/${slsFile}`);

      const batchContent = batchBuffer.toString();
      const slsContent = slsBuffer.toString();

      // Parse Batch Summary
      // POS;040000007623331;202410199;zmiana1;2026051507190312;72;0;0;0;1;0;;73;73;2026051507201416;0;00:01:11;0;5790001396978;20260514;;0;0;0;36.00;False
      const batchLines = batchContent.split('\n');
      const posLine = batchLines.find(l => l.startsWith('POS;'));
      
      if (!posLine) {
        console.warn(`No POS line in ${batchFile}, skipping.`);
        continue;
      }

      const parts = posLine.split(';');
      const batchData = {
        machine_id: machine.id,
        batch_number: parts[1],
        shift_name: parts[3],
        start_time: parseAnkerTimestamp(parts[4]),
        end_time: parseAnkerTimestamp(parts[14]),
        total_count: parseInt(parts[5]),
        total_weight: parseFloat(parts[23]),
        processing_time_seconds: timeToSeconds(parts[16]),
        raw_content: posLine
      };

      // Upload Batch
      const { data: insertedBatch, error: batchError } = await supabase
        .from('anker_batches')
        .upsert(batchData, { onConflict: 'batch_number' })
        .select()
        .single();

      if (batchError) {
        console.error(`Error inserting batch ${batchBase}:`, batchError);
        continue;
      }

      // Parse SLS (Individual items)
      const slsLines = slsContent.split('\n');
      const items = slsLines
        .filter(l => l.startsWith('POS;'))
        .map(l => {
          const p = l.split(';');
          return {
            batch_id: insertedBatch.id,
            ean_code: p[3],
            material_code: p[11],
            volume_liters: parseFloat(p[10]),
            scanned_at: parseAnkerTimestamp(p[4]),
            raw_line: l
          };
        });

      // Upload Items in chunks
      const chunkSize = 100;
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const { error: itemError } = await supabase
          .from('anker_item_logs')
          .insert(chunk);
        
        if (itemError) {
          console.error(`Error inserting items for batch ${batchBase}:`, itemError);
        }
      }

      // Move files to Processed
      console.log(`Archiving batch ${batchBase}...`);
      await sftp.rename(`${remoteDir}/${batchFile}`, `${processedDir}/${batchFile}`);
      await sftp.rename(`${remoteDir}/${slsFile}`, `${processedDir}/${slsFile}`);
      await sftp.rename(`${remoteDir}/${readyFile.name}`, `${processedDir}/${readyFile.name}`);
      
      // Also nls if exists
      const nlsFile = `${batchBase}.nls`;
      const hasNls = files.some(f => f.name === nlsFile);
      if (hasNls) {
        await sftp.rename(`${remoteDir}/${nlsFile}`, `${processedDir}/${nlsFile}`);
      }
    }

  } catch (err) {
    console.error(`Error on Machine ${machine.id}:`, err);
  } finally {
    await sftp.end();
  }
}

function parseAnkerTimestamp(ts) {
  if (!ts || ts.length < 14) return null;
  // Format: YYYYMMDDHHMMSSXX -> 2026051507190312
  const year = ts.substring(0, 4);
  const month = ts.substring(4, 6);
  const day = ts.substring(6, 8);
  const hour = ts.substring(8, 10);
  const min = ts.substring(10, 12);
  const sec = ts.substring(12, 14);
  return `${year}-${month}-${day}T${hour}:${min}:${sec}Z`;
}

function timeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  if (parts.length !== 3) return 0;
  return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
}

async function run() {
  for (const machine of machines) {
    await ingestMachineData(machine);
  }
  console.log('Ingestion completed.');
}

run();
