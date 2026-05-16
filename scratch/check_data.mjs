import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: './.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: batches } = await supabase
    .from('anker_batches')
    .select('*')
    .order('start_time', { ascending: false })
    .limit(50);

  console.log('--- Analiza Próbki Danych ---');
  let zeroTime = 0;
  let ultraHighSpeed = 0;
  let totalItems = 0;

  batches.forEach(b => {
    totalItems += b.total_count;
    const itemsPerMin = b.processing_time_seconds > 0 ? (b.total_count / (b.processing_time_seconds / 60)) : 0;
    
    if (b.processing_time_seconds === 0) zeroTime++;
    if (itemsPerMin > 60) ultraHighSpeed++; // More than 1 bottle per second is very fast for manual feed

    console.log(`Partia ${b.batch_number.substring(0,10)}... | Sztuk: ${b.total_count} | Czas: ${b.processing_time_seconds}s | Wydajność: ${itemsPerMin.toFixed(1)}/min`);
  });

  console.log('\n--- Wnioski ---');
  console.log(`Średnia sztuk w partii: ${totalItems / batches.length}`);
  console.log(`Partie z czasem 0s: ${zeroTime} (prawdopodobnie błąd odczytu czasu z pliku .batch)`);
  console.log(`Partie "super-szybkie" (>60/min): ${ultraHighSpeed}`);
}

check();
