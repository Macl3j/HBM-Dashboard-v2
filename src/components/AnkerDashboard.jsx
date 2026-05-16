import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  Activity, Package, BarChart3, Clock, Cpu, CheckCircle2,
  Zap, TrendingUp, LayoutDashboard, Database, ArrowRight,
  RefreshCw, List, X, ChevronLeft, ChevronRight
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';

const AnkerDashboard = ({ onBack }) => {
  const [batches, setBatches] = useState([]);
  const [stats, setStats] = useState({
    totalItems: 0,
    totalWeight: 0,
    activeMachines: 0,
    itemsPerMin: 0,
    itemsPerShift: 0,
    bagsPerShift: 0
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [materialStats, setMaterialStats] = useState({ materials: [], colors: [] });
  const [showHistory, setShowHistory] = useState(false);
  const [allBatches, setAllBatches] = useState([]);
  const [histPage, setHistPage] = useState(0);
  const PAGE_SIZE = 15;

  // NEW FILTER STATES
  const [filterMachine, setFilterMachine] = useState('all');
  const [filterPeriod, setFilterPeriod] = useState('all');
  const [filterShift, setFilterShift] = useState('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  useEffect(() => {
    fetchData();
    const sub = supabase.channel('anker-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'anker_batches' }, fetchData)
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [filterMachine, filterPeriod, filterShift, filterStartDate, filterEndDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      let query = supabase.from('anker_batches');
      // Filtry... (te same co wcześniej)
      if (filterMachine !== 'all') query = query.eq('machine_id', filterMachine);
      if (filterShift !== 'all') query = query.eq('shift_name', filterShift);
      const now = new Date();
      if (filterPeriod === 'today') query = query.gte('start_time', new Date(now.setHours(0,0,0,0)).toISOString());
      else if (filterPeriod === 'week') query = query.gte('start_time', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString());
      else if (filterPeriod === 'month') query = query.gte('start_time', new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString());

      // 1. POBIERAMY TYLKO LICZBY DLA TOTALI (WSZYSTKIE 20k - TO JEST LEKKIE)
      const { data: globalStats } = await query
        .select('total_count, total_weight, processing_time_seconds, machine_id')
        .limit(20000);

      const totalItems = (globalStats || []).reduce((acc, b) => acc + (Number(b.total_count) || 0), 0);
      const totalWeightTons = (globalStats || []).reduce((acc, b) => acc + (Number(b.total_weight) || 0), 0) / 1000;
      const activeMachinesCount = new Set((globalStats || []).map(b => b.machine_id)).size;
      const totalSeconds = (globalStats || []).reduce((acc, b) => acc + (Number(b.processing_time_seconds) || 0), 0);
      const itemsPerMinRaw = totalSeconds > 0 ? (totalItems / (totalSeconds / 60)) : 0;
      const estimatedShifts = Math.max(1, (globalStats || []).length / 25);

      setStats({
        totalItems,
        totalWeight: totalWeightTons.toFixed(2),
        activeMachines: activeMachinesCount,
        itemsPerMin: itemsPerMinRaw.toFixed(1),
        itemsPerShift: Math.round(totalItems / estimatedShifts),
        bagsPerShift: ((globalStats || []).length / estimatedShifts).toFixed(1)
      });

      // 2. POBIERAMY DANE DO WYKRESÓW (LIMIT 2000 - BEZPIECZNE DLA PRZEGLĄDARKI)
      const { data: chartData } = await query
        .select('material_breakdown')
        .order('start_time', { ascending: false })
        .limit(2000);

      const materialData = { PET: 0, ALU: 0 };
      const colorData = {};
      (chartData || []).forEach(b => {
        if (b.material_breakdown) {
          materialData.PET += (Number(b.material_breakdown.PET) || 0);
          materialData.ALU += (Number(b.material_breakdown.ALU) || 0);
          if (b.material_breakdown.PET_Colors) {
            Object.entries(b.material_breakdown.PET_Colors).forEach(([color, count]) => {
              colorData[color] = (colorData[color] || 0) + Number(count);
            });
          }
        }
      });

      setMaterialStats({
        materials: [
          { name: 'PET', value: materialData.PET, color: '#3b82f6' },
          { name: 'ALU', value: materialData.ALU, color: '#fbbf24' }
        ].filter(m => m.value > 0),
        colors: Object.entries(colorData).map(([name, value]) => ({ name, value, color: name==='Bezbarwny'?'#e2e8f0':name==='Niebieski'?'#60a5fa':name==='Zielony'?'#34d399':'#94a3b8' })).sort((a,b)=>b.value-a.value)
      });

      // 3. OSTATNIE 15 DO LISTY
      setBatches((globalStats || []).slice(0, 15));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchHistory = async () => {
    const { data } = await supabase.from('anker_batches')
      .select('*')
      .order('start_time', { ascending: false })
      .limit(20000);
    setAllBatches(data || []);
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/ingest-anker');
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch (_) {
        setSyncResult({ ok: false, msg: `Błąd serwera (${res.status}): ${text.substring(0, 80)}...` });
        return;
      }
      if (!res.ok) {
        setSyncResult({ ok: false, msg: json.error || `HTTP ${res.status}` });
      } else {
        const total = (json.results || []).reduce((a, r) => a + (r.processed || 0), 0);
        setSyncResult({ ok: true, total });
        if (total > 0) fetchData();
      }
    } catch (e) {
      setSyncResult({ ok: false, msg: e.message });
    } finally {
      setSyncing(false);
    }
  };

  const openHistory = () => { fetchHistory(); setShowHistory(true); setHistPage(0); };

  const histPages = Math.ceil(allBatches.length / PAGE_SIZE);
  const histSlice = allBatches.slice(histPage * PAGE_SIZE, (histPage + 1) * PAGE_SIZE);

  const fmtTime = (ts) => {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleString('pl-PL', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    } catch(e) { return '—'; }
  };
  const fmtDur = (secs) => { if (!secs) return '—'; const m = Math.floor(secs/60); const s = secs%60; return `${m}m ${s}s`; };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 animate-fade-in">
      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-[2rem] w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-8 border-b border-white/5">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tighter">Historia Partii</h2>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{allBatches.length} rekordów łącznie</p>
              </div>
              <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-white/5 rounded-xl transition">
                <X size={20} />
              </button>
            </div>
            <div className="overflow-auto flex-1">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-slate-900">
                  <tr className="border-b border-white/5 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <th className="py-4 pl-8">Maszyna</th>
                    <th className="py-4">Partia #</th>
                    <th className="py-4">Zmiana</th>
                    <th className="py-4">Start</th>
                    <th className="py-4">Czas</th>
                    <th className="py-4 text-right pr-8">Sztuki</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {histSlice.length === 0 ? (
                    <tr><td colSpan="6" className="py-20 text-center text-slate-600 font-bold uppercase tracking-widest">Brak danych w historii</td></tr>
                  ) : histSlice.map(b => (
                    <tr key={b.id} className="hover:bg-white/[0.02] transition">
                      <td className="py-3 pl-8">
                        <span className={`text-[10px] font-black px-2 py-1 rounded-md ${b.machine_id === '2024' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'}`}>
                          HLZ {b.machine_id}
                        </span>
                      </td>
                      <td className="py-3 text-xs text-slate-400 font-mono">{b.batch_number}</td>
                      <td className="py-3 text-xs text-slate-300 uppercase">{b.shift_name || '—'}</td>
                      <td className="py-3 text-xs text-slate-400">{fmtTime(b.start_time)}</td>
                      <td className="py-3 text-xs text-slate-500">{fmtDur(b.processing_time_seconds)}</td>
                      <td className="py-3 pr-8 text-right font-black text-white">{(b.total_count || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {histPages > 1 && (
              <div className="flex justify-between items-center p-6 border-t border-white/5">
                <button onClick={() => setHistPage(p => Math.max(0, p-1))} disabled={histPage === 0} className="p-2 hover:bg-white/5 rounded-lg disabled:opacity-30 transition">
                  <ChevronLeft size={18} />
                </button>
                <span className="text-xs text-slate-500 font-bold">Strona {histPage+1} z {histPages}</span>
                <button onClick={() => setHistPage(p => Math.min(histPages-1, p+1))} disabled={histPage === histPages-1} className="p-2 hover:bg-white/5 rounded-lg disabled:opacity-30 transition">
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div className="p-8">
        <div className="flex justify-between items-center mb-10">
          <div className="flex items-center space-x-4">
            <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-xl transition text-slate-500 hover:text-white">
              <LayoutDashboard size={24} />
            </button>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-3">
                ANKER <span className="text-blue-500">MACHINE CENTER</span>
                <div className="flex items-center px-2 py-0.5 bg-blue-500/10 text-blue-500 text-[10px] rounded-full border border-blue-500/20">
                  <Activity size={10} className="mr-1 animate-pulse" /> LIVE
                </div>
              </h1>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">HLZ 2024 & 2025 Real-time Performance</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {syncResult && (
              <span className={`text-[10px] font-black px-3 py-1.5 rounded-lg ${syncResult.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {syncResult.ok ? `✓ Pobrano ${syncResult.total} partii` : `✗ ${syncResult.msg}`}
              </span>
            )}
            <button onClick={handleSync} disabled={syncing}
              className="glass px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-600/20 hover:border-blue-500/30 transition flex items-center gap-2 border border-white/5 disabled:opacity-50">
              <RefreshCw size={14} className={`text-blue-500 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Pobieranie...' : 'Pobierz z maszyn'}
            </button>
            <button onClick={openHistory}
              className="glass px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white/5 transition flex items-center gap-2 border border-white/5">
              <List size={14} className="text-slate-400" /> Historia
            </button>
          </div>
        </div>

        {/* Filters Panel */}
        <div className="flex flex-wrap gap-4 mb-8 p-6 bg-white/5 rounded-[2rem] border border-white/5 backdrop-blur-md">
          {/* Machine Filter */}
          <div className="flex items-center gap-2 pr-6 border-r border-white/10">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-2">Maszyna:</span>
            {['all', '2024', '2025'].map(m => (
              <button
                key={m}
                onClick={() => setFilterMachine(m)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${filterMachine === m ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}
              >
                {m === 'all' ? 'Wszystkie' : `HLZ ${m}`}
              </button>
            ))}
          </div>

          {/* Period Filter */}
          <div className="flex items-center gap-2 px-6 border-r border-white/10">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-2">Okres:</span>
            {[
              { id: 'today', label: 'Dziś' },
              { id: 'week', label: '7 Dni' },
              { id: 'month', label: 'Miesiąc' },
              { id: 'all', label: 'Zawsze' },
              { id: 'custom', label: 'Zakres' }
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setFilterPeriod(p.id)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${filterPeriod === p.id ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}
              >
                {p.label}
              </button>
            ))}

            {filterPeriod === 'custom' && (
              <div className="flex items-center gap-2 ml-4 animate-fade-in">
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="bg-slate-800 border border-white/10 rounded-lg px-2 py-1 text-[10px] font-bold text-white focus:outline-none focus:border-blue-500 transition"
                />
                <span className="text-slate-500 text-[10px] font-black">—</span>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="bg-slate-800 border border-white/10 rounded-lg px-2 py-1 text-[10px] font-bold text-white focus:outline-none focus:border-blue-500 transition"
                />
              </div>
            )}
          </div>

          {/* Shift Filter */}
          <div className="flex items-center gap-2 pl-6">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-2">Zmiana:</span>
            {[
              { id: 'all', label: 'Wszystkie' },
              { id: 'Zmiana I (06-14)', label: 'I' },
              { id: 'Zmiana II (14-22)', label: 'II' },
              { id: 'Zmiana III (22-06)', label: 'III' }
            ].map(s => (
              <button
                key={s.id}
                onClick={() => setFilterShift(s.id)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${filterShift === s.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard title="Łącznie Sztuk" value={stats.totalItems} icon={<Package className="w-6 h-6" />} color="blue" />
          <StatCard title="Szacowana Masa (BDO)" value={`${stats.totalWeight.toFixed(2)} t`} icon={<Database className="w-6 h-6" />} color="green" raw />
          <StatCard title="Sztuk / Minuta" value={stats.itemsPerMin} icon={<Zap className="w-6 h-6" />} color="indigo" />
          <StatCard title="Sztuk / Zmiana (7h)" value={stats.itemsPerShift} icon={<TrendingUp className="w-6 h-6" />} color="slate" />
          <StatCard title="Worki / Zmiana (7h)" value={stats.bagsPerShift} icon={<Package className="w-6 h-6" />} color="blue" />
          <StatCard title="Aktywne Maszyny" value={stats.activeMachines} icon={<Activity className="w-6 h-6" />} color="green" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Material Breakdown Chart */}
              <div className="bg-[#1e293b]/50 backdrop-blur-xl border border-white/10 p-6 rounded-3xl">
                <h3 className="text-lg font-semibold mb-6">Udział Materiałów</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={materialStats.materials}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {materialStats.materials.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Color Breakdown Chart */}
              <div className="bg-[#1e293b]/50 backdrop-blur-xl border border-white/10 p-6 rounded-3xl">
                <h3 className="text-lg font-semibold mb-6">Kolory PET</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={materialStats.colors}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {materialStats.colors.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* Recent batches */}
          <div className="glass p-8 rounded-[2rem] border border-white/5 flex flex-col" style={{ maxHeight: '500px' }}>
            <h3 className="text-lg font-black uppercase tracking-tighter mb-6">Ostatnie Partie</h3>
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {batches.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-30 py-12">
                  <Database size={40} className="mb-4" />
                  <p className="text-xs font-bold uppercase tracking-widest">Brak danych.<br/>Kliknij "Pobierz z maszyn"</p>
                </div>
              ) : batches.map(b => (
                <div key={b.id} className="p-4 bg-white/5 rounded-xl border border-white/5 hover:border-blue-500/30 transition-all">
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-[10px] font-black ${b.machine_id === '2024' ? 'text-blue-500' : 'text-purple-400'}`}>HLZ {b.machine_id}</span>
                    <span className="text-[9px] text-slate-500">{fmtTime(b.start_time)}</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <p className="text-[10px] text-slate-500 uppercase">{b.shift_name || 'Zmiana A'} • {fmtDur(b.processing_time_seconds)}</p>
                    <div className="text-right">
                      <p className="text-xl font-black text-white leading-none">{(b.total_count || 0).toLocaleString()}</p>
                      <p className="text-[9px] text-slate-500 font-bold uppercase">SZTUK</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={openHistory} className="mt-4 w-full py-3 bg-blue-600/10 hover:bg-blue-600/20 text-blue-500 rounded-xl text-[10px] font-black uppercase tracking-widest transition flex items-center justify-center gap-2">
              Pełna historia <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon, color, raw }) => {
  const colors = {
    blue: 'from-blue-600 to-blue-700',
    green: 'from-emerald-600 to-emerald-700',
    indigo: 'from-indigo-600 to-indigo-700',
    slate: 'from-slate-800 to-slate-900'
  };
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${colors[color]} p-6 rounded-[2rem] shadow-xl border border-white/5 hover:-translate-y-1 transition-all duration-300`}>
      <div className="p-3 bg-white/10 rounded-2xl text-white inline-block mb-4">{icon}</div>
      <p className="text-[10px] text-white/50 font-black uppercase tracking-[0.2em] mb-1">{title}</p>
      <h3 className="text-3xl font-black text-white tracking-tighter">
        {raw ? value : (typeof value === 'number' ? value.toLocaleString() : value)}
      </h3>
    </div>
  );
};

export default AnkerDashboard;
