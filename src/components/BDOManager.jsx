import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Database, Package, Plus, ArrowRight, Trash2, CheckCircle2, LayoutDashboard, TrendingUp, Users, AlertTriangle, FileText, Scale, MessageSquare, Globe, ShieldCheck, Edit2 } from 'lucide-react';

export default function BDOManager({ onBack }) {
  const [activeTab, setActiveTab] = useState('bales');
  const [kpos, setKpos] = useState([]);
  const [bales, setBales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showNewBale, setShowNewBale] = useState(false);
  const [editingBale, setEditingBale] = useState(null);
  const [selectedBales, setSelectedBales] = useState([]);
  const [bdoConfig, setBdoConfig] = useState({ 
    client_id: '', 
    client_secret: '', 
    eup_id: '',
    default_receiver_id: '',
    default_carrier_id: ''
  });
  const [currentTime, setCurrentTime] = useState(new Date());

  const getCurrentShift = () => {
    const hour = currentTime.getHours();
    if (hour >= 6 && hour < 14) return 1;
    if (hour >= 14 && hour < 22) return 2;
    return 3;
  };

  const [leaders, setLeaders] = useState([
    { name: 'Radosław', team: ['Mariia Krasko', 'Boiko Vasyl', 'LIUDMYLA DENYSIUK', 'ANNA SAVCHUK', 'Vladyslav Sych', 'Anastasiia Didukh', 'Kristina Vanhela', 'Tokarchuk Kateryna', 'Svitlana Arkanova', 'Smyrnova Iryna', 'Lysenko Oleh'] },
    { name: 'Uladzislau', team: ['Kamil Karaś', 'Dymchenko Olena', 'Havryliuk Valentyna', 'Kolevatova Valentyna', 'Kozlovskyi Denys', 'Velyka Anna', 'Smyl Krzysztof', 'Krysryna Fus', 'Krasnobryzhnyi Artem'] },
    { name: 'MARCIN ŚWIDERSKI', team: [] },
    { name: 'ŁUKASZ NOWAK', team: [] }
  ]);

  const [baleData, setBaleData] = useState({
    waste_type: 'PET',
    color: 'Biały',
    weight: '',
    shift_number: getCurrentShift(),
    leader_name: 'Radosław',
    notes: ''
  });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: balesData } = await supabase.from('bdo_bales').select('*').order('created_at', { ascending: false });
      setBales(balesData || []);

      if (activeTab === 'kpo') {
        const { data: kposData } = await supabase.from('bdo_kpo').select('*').order('created_at', { ascending: false });
        setKpos(kposData || []);
      } else if (activeTab === 'config') {
        const { data: configData } = await supabase.from('bdo_config').select('*').eq('is_active', true).maybeSingle();
        if (configData) setBdoConfig(configData);
      }
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const handleAddBale = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { notes, ...dataToInsert } = baleData;
    const { error } = await supabase.from('bdo_bales').insert([
      { 
        ...dataToInsert, 
        weight: parseFloat(baleData.weight) || 0, 
        shift_number: parseInt(baleData.shift_number),
        created_at: new Date().toISOString()
      }
    ]);
    if (!error) {
      setBaleData({ ...baleData, weight: '', notes: '' });
      setShowNewBale(false);
      fetchData();
    }
    setLoading(false);
  };

  const handleUpdateBale = async (id, updates) => {
    setLoading(true);
    const { error } = await supabase.from('bdo_bales').update(updates).eq('id', id);
    if (error) {
      alert(`Błąd podczas zapisu: ${error.message}`);
    } else {
      setEditingBale(null);
      fetchData();
    }
    setLoading(false);
  };

  const createLocalKpo = async (kpoData, ids) => {
    setLoading(true);
    try {
      const localKpoNumber = `SZKIC-${Date.now()}`;
      const { data: newKpo, error: insertError } = await supabase.from('bdo_kpo').insert([{
        kpo_number: localKpoNumber,
        waste_code: kpoData.WasteCodeId === 245 ? '15 01 02' : '15 01 04',
        waste_mass: kpoData.WasteMass,
        sender_name: 'PSK',
        receiver_name: bdoConfig.default_receiver_id || 'Odbiorca',
        status: 'SZKIC',
        created_at: new Date().toISOString()
      }]).select().single();

      if (insertError) throw insertError;

      await supabase.from('bdo_bales').update({ kpo_id: newKpo.id }).in('id', ids);

      alert('Zapisano KPO lokalnie w Rejestrze KPO. Możesz wysłać dokument do BDO w zakładce Rejestr KPO.');
      setSelectedBales([]);
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Błąd tworzenia KPO: ' + err.message);
    }
    setLoading(false);
  };

  const sendToBdoApi = async (kpo) => {
    setLoading(true);
    try {
      if (!bdoConfig.eup_id) {
        throw new Error('Brak numeru EupId w konfiguracji! Pobierz go z portalu BDO.');
      }

      const kpoPayload = {
        WasteMass: kpo.waste_mass,
        WasteCodeId: kpo.waste_code === '15 01 02' ? 245 : 247,
        PlannedTransportTime: new Date(Date.now() + 3600000).toISOString(),
        AdditionalInfo: `HBM OpenBook KPO lokalne`,
        VehicleRegNumber: 'TEST-BDO'
      };

      const { data, error } = await supabase.functions.invoke('bdo-integration', {
        body: { 
          action: 'create_planned_kpo',
          config: bdoConfig,
          payload: kpoPayload
        }
      });

      if (error) throw error;
      
      const { error: updateError } = await supabase.from('bdo_kpo')
        .update({
          kpo_number: data.KpoNumber,
          bdo_id: data.KpoId,
          status: 'SENT_TO_BDO'
        })
        .eq('id', kpo.id);

      if (updateError) throw updateError;

      alert('SUKCES! KPO zarejestrowane w systemie BDO (Środowisko TESTOWE). Numer: ' + data.KpoNumber);
      fetchData();
    } catch (err) {
      console.error('BDO API Error:', err);
      alert('Błąd API BDO: ' + err.message);
    }
    setLoading(false);
  };

  const generateKpoFromBales = async () => {
    if (selectedBales.length === 0) return;
    
    const selectedData = bales.filter(b => selectedBales.includes(b.id));
    const totalWeightKg = selectedData.reduce((sum, b) => sum + parseFloat(b.weight), 0);
    const totalWeightMg = (totalWeightKg / 1000).toFixed(4);
    const wasteType = selectedData[0].waste_type;
    
    const wasteCodeId = wasteType === 'PET' ? 245 : 247; 

    const kpoPayload = {
      WasteMass: parseFloat(totalWeightMg),
      WasteCodeId: wasteCodeId,
      PlannedTransportTime: new Date(Date.now() + 3600000).toISOString(),
      AdditionalInfo: `HBM OpenBook: ${selectedBales.length} belek ${wasteType}`,
      VehicleRegNumber: 'TEST-BDO'
    };

    if (window.confirm(`Czy utworzyć lokalny dokument KPO w rejestrze?\nMasa: ${totalWeightMg} Mg\nTyp: ${wasteType}`)) {
      await createLocalKpo(kpoPayload, selectedBales);
    }
  };

  const toggleBaleSelection = (bale) => {
    if (bale.weight === 0) {
      setEditingBale(bale);
      return;
    }
    setSelectedBales(prev => 
      prev.includes(bale.id) ? prev.filter(b => b !== bale.id) : [...prev, bale.id]
    );
  };

  const generateKpoForCategory = async (type, color) => {
    const selectedData = bales.filter(b => {
      if (b.kpo_id || b.weight === 0) return false;
      const bType = (b.waste_type || '').toUpperCase();
      const targetType = (type || '').toUpperCase();
      if (bType !== targetType) return false;
      if (!color) return true;
      const bColor = (b.color || '').toLowerCase().trim().replace(/ł/g, 'l').replace(/,/g, '');
      const targetColor = color.toLowerCase().trim().replace(/ł/g, 'l').replace(/,/g, '');
      return bColor === targetColor;
    });

    if (selectedData.length === 0) {
      alert("Brak doważonych belek dla tej kategorii!");
      return;
    }

    const totalWeightKg = selectedData.reduce((sum, b) => sum + parseFloat(b.weight), 0);
    const totalWeightMg = (totalWeightKg / 1000).toFixed(4);
    const wasteType = selectedData[0].waste_type;
    const wasteCodeId = wasteType === 'PET' ? 245 : 247; 

    const kpoPayload = {
      WasteMass: parseFloat(totalWeightMg),
      WasteCodeId: wasteCodeId,
      PlannedTransportTime: new Date(Date.now() + 3600000).toISOString(),
      AdditionalInfo: `HBM OpenBook: ${selectedData.length} belek ${wasteType} ${color || ''}`,
      VehicleRegNumber: 'TEST-BDO'
    };

    if (window.confirm(`Czy utworzyć lokalny dokument KPO dla kategorii: ${type} ${color || ''}?\n\nIlość belek: ${selectedData.length}\nŁączna masa: ${totalWeightMg} Mg`)) {
      const ids = selectedData.map(b => b.id);
      await createLocalKpo(kpoPayload, ids);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white p-4 md:p-8 font-sans pb-24">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-500/20 rounded-xl">
               <Globe className="text-blue-400 w-8 h-8 animate-pulse" />
            </div>
            <div>
              <h1 className="text-3xl font-black bg-gradient-to-r from-blue-400 to-emerald-500 bg-clip-text text-transparent uppercase tracking-tighter">
                BDO Connect
              </h1>
              <div className="flex items-center space-x-2 mt-0.5">
                <span className="text-[10px] bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded-full font-black border border-yellow-500/20 uppercase tracking-widest">Środowisko Testowe</span>
                <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">v1.2 Stable</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-4">
           <button onClick={onBack} className="px-6 py-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 font-bold text-sm transition-all">Powrót do Menu</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 bg-white/5 p-1.5 rounded-2xl w-fit mb-8 border border-white/10 shadow-xl backdrop-blur-md">
        <TabBtn active={activeTab === 'bales'} onClick={() => setActiveTab('bales')} icon={<Package size={14}/>} label="Magazyn Belek" />
        <TabBtn active={activeTab === 'kpo'} onClick={() => setActiveTab('kpo')} icon={<ArrowRight size={14}/>} label="Rejestr KPO" />
        <TabBtn active={activeTab === 'report'} onClick={() => setActiveTab('report')} icon={<FileText size={14}/>} label="Raport Tygodniowy" />
        <TabBtn active={activeTab === 'config'} onClick={() => setActiveTab('config')} icon={<ShieldCheck size={14}/>} label="Ustawienia API" />
      </div>

      {/* Main Content Area */}
      <div className="bg-white/5 border border-white/10 rounded-[3rem] overflow-hidden backdrop-blur-2xl shadow-2xl min-h-[600px]">
        {activeTab === 'bales' && (
          <div className="p-8">
            <div className="flex justify-between items-center mb-10">
              <div>
                 <h3 className="text-2xl font-black uppercase tracking-tighter">Stan Magazynowy</h3>
                 <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Zaznacz doważone belki, aby wygenerować KPO</p>
              </div>
              <div className="flex space-x-3">
                {selectedBales.length > 0 && (
                  <button 
                    onClick={generateKpoFromBales}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase shadow-2xl shadow-blue-600/40 flex items-center transform active:scale-95 transition-all"
                  >
                    <FileText size={16} className="mr-3" /> UTWÓRZ KPO Z {selectedBales.length} BELEK
                  </button>
                )}
                <button onClick={() => setShowNewBale(true)} className="bg-emerald-500 hover:bg-emerald-400 text-black px-6 py-4 rounded-2xl font-black text-xs uppercase flex items-center transition-all shadow-xl shadow-emerald-500/20">
                  <Plus size={16} className="mr-2" /> Dodaj Produkcję
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {bales.filter(b => !b.kpo_id).map(b => (
                <BaleCard 
                  key={b.id} 
                  bale={b} 
                  isSelected={selectedBales.includes(b.id)} 
                  onClick={() => toggleBaleSelection(b)} 
                  onEdit={() => setEditingBale(b)}
                />
              ))}
            </div>
          </div>
        )}

        {activeTab === 'config' && <ConfigView config={bdoConfig} setConfig={setBdoConfig} onSave={fetchData} />}
        {activeTab === 'kpo' && <KpoView kpos={kpos} onSendToBdo={sendToBdoApi} />}
        {activeTab === 'report' && <WeeklyReportView bales={bales} onGenerateKpo={generateKpoForCategory} />}
      </div>

      {/* Modals */}
      {showNewBale && <NewBaleModal baleData={baleData} setBaleData={setBaleData} leaders={leaders} onClose={() => setShowNewBale(false)} onSubmit={handleAddBale} />}
      {editingBale && <WeightEditModal bale={editingBale} onSave={handleUpdateBale} onClose={() => setEditingBale(null)} />}
    </div>
  );
}

function ConfigView({ config, setConfig, onSave }) {
  const saveConfig = async () => {
    const { error } = await supabase.from('bdo_config').upsert([{ 
      ...config, 
      is_active: true,
      updated_at: new Date().toISOString()
    }]);
    if (!error) {
      alert('Konfiguracja BDO zapisana pomyślnie!');
      onSave();
    }
  };

  return (
    <div className="p-16 max-w-3xl mx-auto">
      <div className="bg-white/[0.03] border border-white/10 p-12 rounded-[3.5rem] shadow-2xl">
        <h3 className="text-2xl font-black uppercase tracking-tighter mb-10 flex items-center">
          <ShieldCheck className="mr-4 text-emerald-500" /> Parametry Integracji
        </h3>
        <div className="space-y-8">
           <InputGroup label="BDO Client ID" value={config.client_id} onChange={v => setConfig({...config, client_id: v})} type="text" />
           <InputGroup label="BDO Client Secret" value={config.client_secret} onChange={v => setConfig({...config, client_secret: v})} type="password" />
           <div className="grid grid-cols-2 gap-6">
              <InputGroup label="Twój EupId (Miejsca działalności)" value={config.eup_id} onChange={v => setConfig({...config, eup_id: v})} type="text" placeholder="UUID z portalu BDO" />
              <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-4 flex items-center">
                 <AlertTriangle size={16} className="text-blue-400 mr-3 shrink-0" />
                 <p className="text-[9px] text-blue-300 font-bold uppercase leading-tight">EupId znajdziesz w zakładce "Miejsca prowadzenia działalności" w portalu BDO.</p>
              </div>
           </div>
           
           <div className="pt-6 border-t border-white/5">
              <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-6">Domyślne ID Kontrahentów (opcjonalne)</h4>
              <div className="grid grid-cols-2 gap-6">
                 <InputGroup label="ID Odbiorcy" value={config.default_receiver_id} onChange={v => setConfig({...config, default_receiver_id: v})} type="text" />
                 <InputGroup label="ID Przewoźnika" value={config.default_carrier_id} onChange={v => setConfig({...config, default_carrier_id: v})} type="text" />
              </div>
           </div>

           <button onClick={saveConfig} className="w-full py-6 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-3xl font-black uppercase text-xs shadow-2xl shadow-blue-600/30 mt-6 hover:scale-[1.02] transition-all active:scale-95">Zapisz i Połącz z API</button>
        </div>
      </div>
    </div>
  );
}

function InputGroup({ label, value, onChange, type, placeholder }) {
  return (
    <div className="space-y-2">
      <label className="text-[9px] font-black text-gray-500 uppercase tracking-[0.2em] ml-2">{label}</label>
      <input 
        type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 font-mono text-sm outline-none focus:border-blue-500 focus:bg-white/[0.08] transition-all"
      />
    </div>
  );
}

function BaleCard({ bale, isSelected, onClick, onEdit }) {
  const isWhite = (color) => {
    const c = (color || '').toLowerCase().trim().replace(/ł/g, 'l').replace(/,/g, '');
    return c === 'bialy';
  };

  return (
    <div 
      onClick={onClick}
      className={`p-7 rounded-[3rem] border transition-all cursor-pointer relative group ${
        bale.weight === 0 ? 'bg-red-500/5 border-red-500/20 hover:border-red-500/40' :
        isSelected ? 'bg-blue-600/10 border-blue-500 scale-[0.97]' : 'bg-white/[0.03] border-white/10 hover:border-white/20 hover:bg-white/[0.05]'
      }`}
    >
      <div className="flex justify-between items-start mb-8">
        <div className={`px-3 py-1.5 rounded-xl font-black text-[10px] tracking-widest ${bale.waste_type === 'PET' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
          {bale.waste_type}
        </div>
        <div className="text-right">
           <p className="text-[8px] text-gray-500 font-black uppercase tracking-tighter">ZMIANA {bale.shift_number}</p>
           <p className="text-[9px] font-black text-gray-300 mt-0.5">{bale.leader_name}</p>
        </div>
      </div>
      
      <div className="mb-4">
        {bale.weight === 0 ? (
          <div className="flex flex-col items-center py-4 bg-red-500/10 rounded-3xl animate-pulse">
            <Scale size={24} className="text-red-500 mb-2" />
            <span className="text-[10px] font-black uppercase text-red-400 tracking-widest">Doważ Belkę</span>
          </div>
        ) : (
          <div className="flex items-baseline space-x-1">
             <h4 className="text-4xl font-black font-mono tracking-tighter">{bale.weight}</h4>
             <span className="text-[10px] font-bold text-gray-500 uppercase">kg</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/5">
         <div className="flex items-center">
            <div className={`w-2.5 h-2.5 rounded-full mr-2.5 shadow-lg ${isWhite(bale.color) ? 'bg-white shadow-white/20' : bale.color === 'Niebieski' ? 'bg-blue-500 shadow-blue-500/20' : bale.color === 'Zielony' ? 'bg-green-500 shadow-green-500/20' : 'bg-purple-500 shadow-purple-500/20'}`}></div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{(bale.color || '').replace(',', '')}</p>
         </div>
         <div className="flex items-center space-x-2">
            {bale.weight > 0 && (
              <button 
                onClick={(e) => { e.stopPropagation(); onEdit(bale); }}
                className="opacity-0 group-hover:opacity-100 p-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/30 rounded-lg transition-all"
                title="Skoryguj wagę"
              >
                <Edit2 size={14} />
              </button>
            )}
            {bale.notes && <MessageSquare size={14} className="text-gray-600" />}
         </div>
      </div>

      {isSelected && (
        <div className="absolute top-4 right-4 text-blue-500 animate-in zoom-in duration-300">
          <CheckCircle2 size={28} fill="currentColor" className="text-blue-500" />
          <CheckCircle2 size={28} className="absolute inset-0 text-white" />
        </div>
      )}
    </div>
  );
}

function WeeklyReportView({ bales, onGenerateKpo }) {
  const getStats = (type, color) => {
    if (!bales) return { count: 0, weight: 0 };
    const filtered = bales.filter(b => {
      if (b.kpo_id) return false;
      const bType = (b.waste_type || '').toUpperCase();
      const targetType = (type || '').toUpperCase();
      if (bType !== targetType) return false;
      if (!color) return true;
      
      const bColor = (b.color || '').toLowerCase().trim().replace(/ł/g, 'l').replace(/,/g, '');
      const targetColor = color.toLowerCase().trim().replace(/ł/g, 'l').replace(/,/g, '');
      return bColor === targetColor;
    });
    return {
      count: filtered.length,
      weight: (filtered.reduce((sum, b) => sum + (parseFloat(b.weight) || 0), 0) / 1000).toFixed(3)
    };
  };

  const uniqueNotes = [...new Set(bales.filter(b => b.notes).map(b => b.notes))];

  return (
    <div className="p-16 max-w-5xl mx-auto">
      <h3 className="text-3xl font-black uppercase tracking-tighter mb-12">Raport Gotowości</h3>
      <div className="space-y-4">
         <ReportRow label="Puszki ALU" stats={getStats('ALU')} onSend={() => onGenerateKpo('ALU')} />
         <ReportRow label="PET Biały" stats={getStats('PET', 'Biały')} onSend={() => onGenerateKpo('PET', 'Biały')} />
         <ReportRow label="PET Niebieski" stats={getStats('PET', 'Niebieski')} onSend={() => onGenerateKpo('PET', 'Niebieski')} />
         <ReportRow label="PET Zielony" stats={getStats('PET', 'Zielony')} onSend={() => onGenerateKpo('PET', 'Zielony')} />
         <ReportRow label="PET Mix" stats={getStats('PET', 'Mix')} onSend={() => onGenerateKpo('PET', 'Mix')} />
      </div>
      {uniqueNotes.length > 0 && (
        <div className="mt-12 p-8 bg-white/5 rounded-3xl">
           <p className="text-[10px] font-black text-gray-500 uppercase mb-4">Notatki:</p>
           {uniqueNotes.map(n => <p key={n} className="text-xs italic text-gray-400 mb-2">- {n}</p>)}
        </div>
      )}
    </div>
  );
}

function ReportRow({ label, stats, onSend }) {
  const canSend = parseFloat(stats.weight) > 0;

  return (
    <div className="flex justify-between items-center border-b border-white/5 pb-6 pt-2 hover:bg-white/[0.02] transition-colors px-4 rounded-xl group">
      <div className="flex items-center w-1/3">
        <span className="text-lg font-black uppercase text-gray-300 tracking-tighter mr-4">{label}</span>
        {canSend && (
          <button onClick={onSend} className="opacity-0 group-hover:opacity-100 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all transform hover:scale-105 active:scale-95 flex items-center shadow-lg shadow-blue-500/20">
             <Globe size={12} className="mr-1.5" /> Generuj KPO
          </button>
        )}
      </div>
      <div className="flex items-center space-x-16 w-2/3 justify-end">
        <div className="w-28">
          <p className="text-[8px] text-gray-600 font-black uppercase mb-1 tracking-widest text-right">Ilość Belek</p>
          <div className="flex items-baseline space-x-1 justify-end">
            <span className="text-3xl font-black font-mono text-white">{stats.count}</span>
            <span className="text-[10px] text-gray-600 font-bold uppercase">szt</span>
          </div>
        </div>
        <div className="w-36">
          <p className="text-[8px] text-gray-600 font-black uppercase mb-1 tracking-widest text-right">Masa Całkowita</p>
          <div className="flex items-baseline space-x-1 justify-end">
            <span className="text-3xl font-black font-mono text-blue-400">{stats.weight}</span>
            <span className="text-[10px] text-gray-600 font-bold uppercase">Mg</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpoView({ kpos, onSendToBdo }) {
  return (
    <div className="p-8">
      <table className="w-full text-left">
        <thead>
          <tr className="text-gray-600 border-b border-white/5 text-[9px] font-black uppercase tracking-widest">
            <th className="pb-6 pl-4">Nr Dokumentu BDO</th>
            <th className="pb-6">Kod</th>
            <th className="pb-6">Masa (Mg)</th>
            <th className="pb-6">Status</th>
            <th className="pb-6 pr-4 text-right">Akcje</th>
          </tr>
        </thead>
        <tbody>
          {kpos.length === 0 ? (
            <tr><td colSpan="5" className="py-20 text-center text-gray-700 font-black uppercase text-xs tracking-widest">Brak kart w rejestrze</td></tr>
          ) : kpos.map(k => (
            <tr key={k.id} className="border-b border-white/5 hover:bg-white/[0.01] group">
              <td className="py-6 pl-4 font-mono text-xs font-black text-blue-400 group-hover:text-blue-300 transition-colors">{k.kpo_number}</td>
              <td className="py-6"><span className="px-3 py-1 bg-white/5 border border-white/10 text-gray-400 rounded-lg font-black text-xs">{k.waste_code}</span></td>
              <td className="py-6 font-black font-mono">{k.waste_mass} Mg</td>
              <td className="py-6">
                <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${k.status === 'SZKIC' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'}`}>
                  {k.status}
                </span>
              </td>
              <td className="py-6 pr-4 text-right">
                {k.status === 'SZKIC' && (
                  <button 
                    onClick={() => onSendToBdo(k)} 
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center inline-flex ml-auto"
                  >
                    <Globe size={14} className="mr-2" /> Wyślij do BDO (API)
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} className={`flex items-center space-x-3 px-8 py-3.5 rounded-2xl text-[10px] font-black transition-all uppercase tracking-widest ${active ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>
      {icon} <span>{label}</span>
    </button>
  );
}

function WeightEditModal({ bale, onSave, onClose }) {
  const [weight, setWeight] = useState(bale.weight || '');
  const [notes, setNotes] = useState(bale.notes || '');

  const handleSave = () => {
    const parsedWeight = parseFloat(String(weight).replace(',', '.'));
    if (isNaN(parsedWeight) || parsedWeight <= 0) {
      alert("Proszę wpisać poprawną wagę większą od zera.");
      return;
    }
    // Tymczasowo usuwamy zapisywanie 'notes', ponieważ kolumny brakuje w Supabase
    onSave(bale.id, { weight: parsedWeight });
  };

  return (
    <div className="fixed inset-0 bg-[#000]/95 backdrop-blur-3xl flex items-center justify-center p-4 z-[100] animate-in fade-in duration-300">
      <div className="bg-[#121214] border border-white/10 p-12 rounded-[4rem] w-full max-w-xl shadow-2xl scale-in-center">
        <h3 className="text-3xl font-black uppercase tracking-tighter mb-10 text-center">
          {bale.weight > 0 ? 'Korekta Wagi' : 'Procedura Doważania'}
        </h3>
        <div className="space-y-8">
           <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-2">Waga Rzeczywista (kg)</label>
              <input type="text" autoFocus value={weight} onChange={e => setWeight(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-[2rem] p-10 text-6xl font-black font-mono text-center text-emerald-400 outline-none focus:border-emerald-500 transition-all" placeholder="0.0" />
           </div>
           <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-2">Notatki Operacyjne</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl p-6 text-sm font-bold outline-none min-h-[120px] focus:border-blue-500" placeholder="Dodaj uwagi (opcjonalnie)..." />
           </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-12">
          <button onClick={handleSave} className="bg-emerald-500 text-black font-black py-6 rounded-3xl uppercase text-xs shadow-2xl shadow-emerald-500/30 hover:bg-emerald-400 active:scale-95 transition-all">Zatwierdź Wagę</button>
          <button onClick={onClose} className="bg-white/5 text-gray-500 font-black py-6 rounded-3xl uppercase text-xs hover:bg-white/10 transition-all">Anuluj</button>
        </div>
      </div>
    </div>
  );
}

function NewBaleModal({ baleData, setBaleData, leaders, onClose, onSubmit }) {
  return (
    <div className="fixed inset-0 bg-[#000]/95 backdrop-blur-3xl flex items-center justify-center p-4 z-[100] animate-in fade-in duration-300">
      <div className="bg-[#0f0f11] border border-white/10 rounded-[4rem] w-full max-w-2xl p-14 shadow-2xl">
        <h3 className="text-4xl font-black uppercase tracking-tighter mb-10">Nowa Belka</h3>
        <form onSubmit={onSubmit} className="space-y-8">
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-3">
              <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Typ Materiału</label>
              <div className="flex p-1.5 bg-white/5 rounded-2xl">
                 {['PET', 'ALU'].map(t => (
                   <button key={t} type="button" onClick={() => setBaleData({...baleData, waste_type: t})} className={`flex-1 py-3.5 rounded-xl font-black text-xs transition-all ${baleData.waste_type === t ? 'bg-white text-black shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>{t}</button>
                 ))}
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Wariant / Kolor</label>
              <select value={baleData.color} onChange={e => setBaleData({...baleData, color: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 font-black text-xs uppercase outline-none focus:border-blue-500">
                {['Biały', 'Niebieski', 'Zielony', 'Mix'].map(c => <option key={c} value={c} className="bg-[#0f0f11]">{c}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-3">
             <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Odpowiedzialny Lider</label>
             <div className="grid grid-cols-4 gap-3">
                {leaders.map(l => (
                  <button key={l.name} type="button" onClick={() => setBaleData({...baleData, leader_name: l.name})} className={`py-3 rounded-xl text-[9px] font-black transition-all border ${baleData.leader_name === l.name ? 'bg-white text-black border-white' : 'bg-white/5 text-gray-500 border-white/5 hover:border-white/20'}`}>{l.name}</button>
                ))}
             </div>
          </div>
          <div className="space-y-3 text-center">
            <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Waga Wstępna (kg)</label>
            <input type="number" step="0.1" value={baleData.weight} onChange={e => setBaleData({...baleData, weight: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-3xl p-8 text-6xl font-black font-mono text-center text-blue-400 outline-none focus:border-blue-500" placeholder="0.0" />
          </div>
          <div className="flex space-x-5 pt-6">
            <button type="submit" className="flex-1 bg-gradient-to-r from-blue-600 to-blue-500 text-white font-black py-6 rounded-3xl text-sm uppercase shadow-2xl shadow-blue-600/30 hover:scale-[1.02] active:scale-95 transition-all">Zarejestruj Belkę</button>
            <button type="button" onClick={onClose} className="px-12 py-6 bg-white/5 rounded-3xl text-sm font-black text-gray-500 hover:bg-white/10 transition-all">Anuluj</button>
          </div>
        </form>
      </div>
    </div>
  );
}
