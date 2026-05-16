import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, PieChart, Pie, AreaChart, Area
} from 'recharts';
import { 
  Download, Filter, Calendar, TrendingUp, DollarSign, PieChart as PieIcon, 
  ArrowUpRight, ArrowDownRight, LayoutDashboard, Database, FileText, ChevronRight,
  Target, Zap, Users, Building, Percent, Loader2
} from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const formatCurrency = (val) => {
  const num = parseFloat(val) || 0;
  return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
};

export default function Dashboard({ user, onAdminClick, onBdoClick, onAnkerClick }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState('2026-04');
  const [exporting, setExporting] = useState(false);
  const dashboardRef = useRef(null);

  useEffect(() => {
    fetchData();
  }, [month]);

  async function fetchData() {
    setLoading(true);
    try {
      // Compute the real last day of the selected month
      const [y, m] = month.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;

      const { data: report } = await supabase.from('opex_reports').select('*').eq('month', month).single();

      // Fetch anker stats - ignore errors gracefully
      const { data: ankerStats } = await supabase.from('anker_stats')
          .select('*')
          .gte('shift_date', `${month}-01`)
          .lte('shift_date', monthEnd)
          .order('shift_date', { ascending: false });

      if (report) {
        const { data: invoices } = await supabase.from('invoices').select('*').eq('report_id', report.id);
        setData({ ...report, invoices: invoices || [], ankerStats: ankerStats || [] });
      } else {
        setData({ invoices: [], ankerStats: ankerStats || [] });
      }

      const { data: hist } = await supabase.from('opex_reports').select('month, actual_total, budget_total').order('month', { ascending: true });
      setHistory(hist || []);
    } catch (err) {
      console.error('fetchData error:', err);
      // Ensure the UI renders even on total failure
      setData({ invoices: [], ankerStats: [] });
    } finally {
      setLoading(false);
    }
  }

  const exportPDF = async () => {
    try {
      setExporting(true);
      document.body.classList.add('pdf-export-active');
      await new Promise(r => setTimeout(r, 600)); 
      
      const element = dashboardRef.current;
      if (!element) throw new Error("Nie znaleziono kontenera dashboardu");

      const canvas = await html2canvas(element, { 
        scale: 1.5, 
        useCORS: true, 
        backgroundColor: '#020617',
        logging: true,
        allowTaint: true,
        ignoreElements: (el) => el.classList.contains('no-export') || el.tagName === 'NAV'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
        heightLeft -= pdfHeight;
      }

      pdf.save(`HBM-OpenBook-${month}.pdf`);
    } catch (err) {
      console.error('PDF Export Error:', err);
      alert(`Błąd exportu: ${err.message || 'Nieznany błąd'}`);
    } finally {
      document.body.classList.remove('pdf-export-active');
      setExporting(false);
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-950 text-blue-500 font-black animate-pulse">ŁADOWANIE DANYCH...</div>;

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-blue-500 selection:text-white" ref={dashboardRef}>
      {/* Top Nav */}
      <nav className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/5 px-8 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-8">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <TrendingUp className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tighter leading-none">HBM <span className="text-blue-500">OPEN-BOOK</span></h1>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Analytics Dashboard 2026</p>
            </div>
          </div>
          
          <div className="flex bg-slate-900/50 p-1 rounded-xl border border-white/5">
            <TabButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard" />
            <TabButton active={activeTab === 'analysis'} onClick={() => setActiveTab('analysis')} icon={<Target className="w-4 h-4" />} label="Analiza Szczegółowa" />
            <TabButton active={activeTab === 'anker'} onClick={onAnkerClick} icon={<Zap className="w-4 h-4" />} label="Wydajność Anker" />
            <TabButton active={activeTab === 'categories'} onClick={() => setActiveTab('categories')} icon={<FileText className="w-4 h-4" />} label="Wyjaśnienia Kategorii" />
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <button onClick={onBdoClick} className="bg-green-600 hover:bg-green-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition flex items-center shadow-lg shadow-green-600/20">
            <Database className="mr-2 w-4 h-4" /> BDO
          </button>
          <button onClick={onAdminClick} className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition flex items-center border border-white/5">
            <Building className="mr-2 w-4 h-4" /> ADMIN
          </button>
          <div className="flex items-center bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5">
            <Calendar className="w-4 h-4 text-blue-500 mr-2" />
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="bg-transparent border-none outline-none font-bold text-sm text-blue-400" />
          </div>
          <button 
            onClick={exportPDF} 
            disabled={exporting}
            className={`${exporting ? 'bg-slate-700' : 'bg-blue-600 hover:bg-blue-500'} text-white px-5 py-2.5 rounded-xl font-bold text-sm transition flex items-center shadow-lg ${exporting ? '' : 'shadow-blue-600/20'}`}
          >
            {exporting ? (
              <><Loader2 className="mr-2 w-4 h-4 animate-spin" /> GENEROWANIE...</>
            ) : (
              <><Download className="mr-2 w-4 h-4" /> EKSPORT PDF</>
            )}
          </button>
        </div>
      </nav>

      <main className="p-8 max-w-[1600px] mx-auto">
        {activeTab === 'categories' ? (
          <CategoriesContent />
        ) : activeTab === 'anker' ? (
          <AnkerStatsContent stats={data?.ankerStats || []} />
        ) : !data || !data.id ? (
          <div className="h-[60vh] flex flex-col items-center justify-center text-center">
             <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mb-6 border border-white/5">
                <Database className="w-10 h-10 text-slate-700" />
             </div>
             <h2 className="text-2xl font-black text-slate-400 mb-2 uppercase tracking-tighter">Brak danych finansowych</h2>
             <p className="text-slate-600 font-medium">Użyj panelu administratora, aby wgrać budżet i faktury. (Wydajność Anker nadal działa)</p>
          </div>
        ) : activeTab === 'dashboard' ? (
          <DashboardContent data={data} history={history} />
        ) : (
          <AnalysisContent data={data} />
        )}
      </main>

      {/* Footer / Status Bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-slate-950/90 backdrop-blur-md border-t border-white/5 px-8 py-2 flex justify-between items-center text-[10px] font-bold text-slate-500">
         <div className="flex items-center space-x-4">
            <span className="flex items-center"><div className="w-2 h-2 bg-green-500 rounded-full mr-2 shadow-sm shadow-green-500/50"></div> SYSTEM LIVE</span>
            <span className="text-slate-700">|</span>
            <span>DATA SOURCE: SUPABASE LIVE DB</span>
         </div>
         <div className="flex items-center space-x-4">
            <span>PSK PARTNER: MACIEJ WITKOWSKI</span>
            <span className="text-slate-700">|</span>
            <span className="text-blue-500 font-black">HBM ECOSYSTEM © 2026</span>
         </div>
      </footer>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center space-x-2 px-6 py-2 rounded-lg font-black text-xs transition uppercase tracking-widest ${active ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-500 hover:text-slate-300'}`}
    >
      {icon} <span>{label}</span>
    </button>
  );
}

function DashboardContent({ data, history }) {
  const budget = parseFloat(data.budget_total) || 0;
  const actual = parseFloat(data.actual_total) || 0;
  const savings = budget - actual;
  const fee = actual * (parseFloat(data.fee_percentage) / 100);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* High-Level Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Budżet Plan" value={budget} icon={<FileText className="text-white" />} color="slate" />
        <StatCard title="Realizacja" value={actual} icon={<Zap className="text-white" />} color="blue" />
        <StatCard title="Oszczędność" value={savings} icon={<Percent className="text-white" />} color="green" trend={savings > 0} />
        <StatCard title="Management Fee" value={fee} icon={<DollarSign className="text-white" />} color="indigo" subValue={`MARŻA ${data.fee_percentage}%`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Realization Chart */}
        <div className="lg:col-span-2 glass p-8 rounded-[2rem] border border-white/5">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="text-lg font-black uppercase tracking-tighter">Trend Realizacji OPEX</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Porównanie miesięczne YTD</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center"><div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div> <span className="text-[10px] font-bold">REALIZACJA</span></div>
              <div className="flex items-center"><div className="w-3 h-3 bg-slate-700 rounded-full mr-2"></div> <span className="text-[10px] font-bold">BUDŻET</span></div>
            </div>
          </div>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis dataKey="month" stroke="#475569" fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} />
                <YAxis stroke="#475569" fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} tickFormatter={(val) => `${(val/1000).toFixed(0)}k`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #ffffff10', borderRadius: '16px', fontSize: '10px', fontWeight: 'bold' }}
                  itemStyle={{ color: '#3b82f6' }}
                />
                <Area type="monotone" dataKey="actual_total" stroke="#3b82f6" strokeWidth={4} fillOpacity={1} fill="url(#colorActual)" />
                <Line type="monotone" dataKey="budget_total" stroke="#475569" strokeDasharray="5 5" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* OPEX Breakdown */}
        <div className="glass p-8 rounded-[2rem] border border-white/5">
          <h3 className="text-lg font-black uppercase tracking-tighter mb-8 text-center">Podział OPEX</h3>
          <div className="h-[300px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'KSeF Invoices', value: parseFloat(data.ksef_total) || 0 },
                    { name: 'Payroll CORE', value: parseFloat(data.payroll_total) || 0 }
                  ]}
                  cx="50%" cy="50%" innerRadius={80} outerRadius={110} paddingAngle={10} dataKey="value" stroke="none"
                >
                  <Cell fill="#3b82f6" shadow="0 0 20px #3b82f640" />
                  <Cell fill="#6366f1" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Suma</p>
              <p className="text-2xl font-black text-white leading-none">{(actual/1000).toFixed(1)}k</p>
            </div>
          </div>
          <div className="mt-8 space-y-4">
            <BreakdownRow label="Faktury (Temp/Media)" value={data.ksef_total} color="bg-blue-500" />
            <BreakdownRow label="Payroll (Core Team)" value={data.payroll_total} color="bg-indigo-500" />
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalysisContent({ data }) {
  const budgetItems = data.budget_items || {};
  const invoices = data.invoices || [];

  // Mapowanie faktur po jawnie przypisanej kategorii (budget_line)
  const lines = Object.entries(budgetItems).map(([label, budgetVal]) => {
    // Faktury przypisane do tej linii budżetowej przez użytkownika
    const lineInvoices = invoices.filter(inv => inv.budget_line === label);
    const actualVal = lineInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);

    // Payroll — specjalna obsługa: sumuje z pola payroll_total jeśli to linia wynagrodzeń
    let finalActual = actualVal;
    if (label.toLowerCase().includes('wynagrodzenie')) {
      finalActual = (parseFloat(data.payroll_total) || 0) + actualVal;
    }

    return { label, budget: budgetVal, actual: finalActual, invoiceCount: lineInvoices.length };
  }).filter(l => l.budget > 0);

  // Faktury bez przypisanej kategorii
  const unassigned = invoices.filter(inv => !inv.budget_line);

  return (
    <div className="animate-fade-in space-y-8">
      <div className="glass p-10 rounded-[2.5rem] border border-white/5">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tighter">Szczegółowa Analiza Odchyleń</h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Porównanie linii budżetowych z realnymi kosztami</p>
          </div>
          <div className="flex space-x-6 text-right">
             <div><p className="text-[9px] text-slate-500 uppercase font-black">Budżet</p><p className="text-lg font-black">{formatCurrency(data.budget_total)} PLN</p></div>
             <div><p className="text-[9px] text-slate-500 uppercase font-black">Realizacja</p><p className="text-lg font-black text-blue-500">{formatCurrency(data.actual_total)} PLN</p></div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                <th className="pb-4 pl-4">Linia Budżetowa</th>
                <th className="pb-4">Budżet</th>
                <th className="pb-4">Realizacja</th>
                <th className="pb-4 text-center">Faktury</th>
                <th className="pb-4">Wykorzystanie</th>
                <th className="pb-4 pr-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {lines.map((line, idx) => {
                const percent = line.budget > 0 ? (line.actual / line.budget) * 100 : 0;
                const isOver = percent > 100;
                return (
                  <tr key={idx} className="group hover:bg-white/[0.02] transition">
                    <td className="py-5 pl-4 font-bold text-sm uppercase tracking-tight text-slate-300">{line.label}</td>
                    <td className="py-5 font-mono text-sm">{formatCurrency(line.budget)}</td>
                    <td className="py-5 font-mono text-sm text-blue-400">{formatCurrency(line.actual)}</td>
                    <td className="py-5 text-center">
                      {line.invoiceCount > 0
                        ? <span className="text-[9px] font-black px-2 py-1 rounded-md bg-blue-500/10 text-blue-400">{line.invoiceCount} szt.</span>
                        : <span className="text-[9px] text-slate-600">—</span>
                      }
                    </td>
                    <td className="py-5 w-40">
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-1000 ${isOver ? 'bg-red-500' : 'bg-blue-500'}`} 
                          style={{ width: `${Math.min(percent, 100)}%` }}
                        ></div>
                      </div>
                    </td>
                    <td className="py-5 pr-4 text-right">
                      <span className={`text-[9px] font-black px-2 py-1 rounded-md uppercase tracking-widest ${isOver ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                        {isOver ? `+${(percent-100).toFixed(1)}%` : 'OK'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Faktury nieprzypisane do kategorii */}
      {unassigned.length > 0 && (
        <div className="glass p-8 rounded-[2rem] border border-orange-500/20 bg-orange-500/5">
          <h3 className="text-sm font-black uppercase tracking-widest text-orange-400 mb-4">
            ⚠ Faktury bez kategorii budżetowej ({unassigned.length} szt.)
          </h3>
          <p className="text-[10px] text-slate-500 mb-4">Przypisz kategorie w panelu ADMIN, aby faktury pojawiły się w analizie powyżej.</p>
          <div className="space-y-2">
            {unassigned.map(inv => (
              <div key={inv.id} className="flex justify-between items-center py-2 border-b border-white/5">
                <div className="flex flex-col min-w-0 mr-4">
                  <span className="text-xs font-bold text-slate-300 uppercase truncate">{inv.provider}</span>
                  {inv.description && <span className="text-[10px] text-slate-500 truncate">{inv.description}</span>}
                </div>
                <span className="text-xs font-mono text-orange-400 font-black whitespace-nowrap">{formatCurrency(inv.amount)} PLN</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon, color, subValue, trend }) {
  const colors = {
    blue: 'from-blue-600 to-blue-700 shadow-blue-900/20',
    green: 'from-emerald-600 to-emerald-700 shadow-emerald-900/20',
    indigo: 'from-indigo-600 to-indigo-700 shadow-indigo-900/20',
    slate: 'from-slate-800 to-slate-900 shadow-slate-950/40'
  };

  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${colors[color]} p-8 rounded-[2rem] shadow-xl border border-white/5 group hover:-translate-y-1 transition-all duration-300`}>
      <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-colors"></div>
      <div className="flex justify-between items-start mb-6">
        <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md">
          {React.cloneElement(icon, { size: 20 })}
        </div>
        {trend !== undefined && (
          <div className={`flex items-center space-x-1 px-2 py-1 rounded-lg text-[9px] font-black ${trend ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
            {trend ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            <span>{trend ? 'OSZCZĘDNOŚĆ' : 'OVER BUDGET'}</span>
          </div>
        )}
      </div>
      <p className="text-[10px] text-white/50 font-black uppercase tracking-[0.2em] mb-1">{title}</p>
      <div className="flex items-baseline space-x-2">
        <h3 className="text-3xl font-black text-white tracking-tighter">{formatCurrency(value)}</h3>
        <span className="text-xs font-bold text-white/40">PLN</span>
      </div>
      {subValue && <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mt-4">{subValue}</p>}
    </div>
  );
}

function BreakdownRow({ label, value, color }) {
  return (
    <div className="flex items-center justify-between group">
      <div className="flex items-center">
        <div className={`w-2 h-2 ${color} rounded-full mr-3 group-hover:scale-150 transition-transform`}></div>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
      </div>
      <span className="text-xs font-black text-white">{formatCurrency(value)} PLN</span>
    </div>
  );
}

function CategoriesContent() {
  const categories = [
    {
      title: "1. Koszty Personelu i Pracy (Labor & HR Costs)",
      desc: "Wszystkie koszty związane z utrzymaniem załogi centrum zliczeniowego.",
      items: [
        "Wynagrodzenia zespołu operacyjnego (pracownicy stali i tymczasowi z podziałem na zmiany)",
        "Koszty absencji i rotacji (zastępstwa urlopowe, bufor płacowy ~8%)",
        "BHP i szkolenia (odzież robocza, środki ochrony indywidualnej / PPE - rękawiczki, zatyczki, kamizelki)"
      ]
    },
    {
      title: "2. Nieruchomość i Media (Facility & Utilities)",
      desc: "Zagregowane koszty utrzymania hali bez niepotrzebnego rozbijania na poszczególne urządzenia.",
      items: [
        "Najem i obsługa nieruchomości (czynsz najmu hali, serwis obiektu, raty kaucji, podatki od nieruchomości jeśli dotyczą)",
        "Media zbiorczo (energia elektryczna ogółem – bez rozbijania na poszczególne urządzenia, gaz/ogrzewanie, woda i ścieki)",
        "Utrzymanie czystości i higieny (Pest control, specjalistyczny sprzęt czyszczący)"
      ]
    },
    {
      title: "3. Maszyny, Sprzęt i Utrzymanie Ruchu (Equipment & Maintenance)",
      desc: "Koszty związane z maszynami i ich prawidłowym funkcjonowaniem.",
      items: [
        "Najem maszyn pomocniczych (wózki widłowe / czołówki, dodatkowe belownice)",
        "Wsparcie techniczne i utrzymanie (Basic Care Support dla maszyn Anker, części zamienne, serwis urządzeń)"
      ]
    },
    {
      title: "4. Bezpośrednie Koszty Operacyjne (Operations & Consumables)",
      desc: "Koszty materiałowe bezpośrednio związane z przerobem strumienia odpadów.",
      items: [
        "Materiały eksploatacyjne (BigBagi, drut do belownicy, taśmy, plomby)",
        "Gospodarka odpadami (utylizacja balastu / odpadu nienadającego się do przetworzenia)"
      ]
    },
    {
      title: "5. Administracja, IT i Compliance (Admin & Overhead)",
      desc: "Stałe opłaty związane z funkcjonowaniem biura i wymogami prawnymi.",
      items: [
        "Bezpieczeństwo obiektu i działalności (ubezpieczenie OC, ochrona fizyczna, alarm i grupy interwencyjne)",
        "Wymogi prawne / Compliance (opłaty BDO, certyfikacje, doradztwo prawne/środowiskowe)",
        "Wsparcie IT (administracja systemami, wsparcie SLA IT, infrastruktura sieciowa)",
        "Koszty finansowe (obsługa rachunków bankowych)"
      ]
    },
    {
      title: "6. Rozliczenia Finansowe, Rezerwy i Marża (Financials & Operator Fee)",
      desc: "Sekcja wydzielająca właściwy koszt operacyjny od marż, rezerw i rozliczeń z tytułu zakupu maszyn.",
      items: [
        "Rezerwa operacyjna (np. 5% zgodnie z budżetem)",
        "Wynagrodzenie Operatora / Management Fee (12% od OPEX)",
        "Kompensata CAPEX (raty za maszyny ANKER)"
      ]
    }
  ];

  return (
    <div className="animate-fade-in space-y-8 max-w-5xl mx-auto">
      <div className="glass p-10 rounded-[2.5rem] border border-white/5">
        <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">Wyjaśnienia Nowych Kategorii Budżetowych (Cost Centers)</h2>
        <p className="text-[12px] text-slate-400 font-medium mb-8">
          Nowy standard agregacji kosztów ukrywa mikrozarządzanie i pozwala decydentom PSK skupić się na kluczowych liczbach, ułatwiając i przyspieszając proces raportowania.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {categories.map((cat, idx) => (
            <div key={idx} className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.04] transition group">
              <h3 className="text-lg font-black text-blue-400 uppercase tracking-tight mb-2 group-hover:text-blue-300 transition-colors">{cat.title}</h3>
              <p className="text-sm text-slate-300 mb-4">{cat.desc}</p>
              <ul className="space-y-3">
                {cat.items.map((item, i) => (
                  <li key={i} className="flex items-start text-xs text-slate-400">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 mr-3 flex-shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.6)]"></div>
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AnkerStatsContent({ stats }) {
  if (!stats || stats.length === 0) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-center animate-fade-in">
        <Zap className="w-16 h-16 text-slate-700 mb-4" />
        <h2 className="text-2xl font-black text-slate-400 uppercase">Brak statystyk z maszyn Anker</h2>
        <p className="text-slate-600">Dodaj wyniki dla tego miesiąca przez panel Admina.</p>
      </div>
    );
  }

  const totalBottles = stats.reduce((acc, curr) => acc + (curr.bottles_count || 0), 0);
  const totalBags = stats.reduce((acc, curr) => acc + (curr.bags_count || 0), 0);
  const avgBottles = stats.length > 0 ? totalBottles / stats.length : 0;
  
  // Obliczenia na minutę - zakładamy 7h czasu operacyjnego (420 minut)
  const shiftMinutes = 420;
  const avgBottlesPerMinute = avgBottles / shiftMinutes;

  return (
    <div className="animate-fade-in space-y-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard title="Przetworzone Butelki" value={totalBottles} icon={<Zap className="text-white" />} color="blue" subValue="W tym miesiącu" />
        <StatCard title="Zebrane Worki" value={totalBags} icon={<Database className="text-white" />} color="indigo" subValue="W tym miesiącu" />
        <StatCard title="Średnia Zmianowa" value={avgBottles} icon={<Target className="text-white" />} color="slate" subValue="Butelek na zmianę" />
        <div className="relative overflow-hidden bg-gradient-to-br from-green-600 to-green-700 p-8 rounded-[2rem] shadow-xl border border-white/5 group hover:-translate-y-1 transition-all duration-300">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/5 rounded-full blur-2xl"></div>
          <div className="flex justify-between items-start mb-6">
            <div className="p-3 bg-white/10 rounded-2xl"><Zap size={20} className="text-white" /></div>
            <div className="flex items-center px-2 py-1 rounded-lg text-[9px] font-black bg-white/20 text-white">7H PRACY / 420 MIN</div>
          </div>
          <p className="text-[10px] text-white/50 font-black uppercase tracking-[0.2em] mb-1">Prędkość Linii</p>
          <div className="flex items-baseline space-x-2">
            <h3 className="text-3xl font-black text-white tracking-tighter">{avgBottlesPerMinute.toFixed(1)}</h3>
            <span className="text-xs font-bold text-white/40">BTL / MIN</span>
          </div>
        </div>
      </div>

      {/* Tabelaryczne Zestawienie Zmian */}
      <div className="glass p-10 rounded-[2.5rem] border border-white/5">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tighter">Ranking i Historia Zmian</h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Liderzy i szczegółowe wyniki maszyn 2024 / 2025</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                <th className="pb-4 pl-4">Data i Zmiana</th>
                <th className="pb-4">Maszyna</th>
                <th className="pb-4">Lider Zmiany</th>
                <th className="pb-4 text-right">Liczba Worków</th>
                <th className="pb-4 text-right">Liczba Butelek</th>
                <th className="pb-4 pr-4 text-right">Wynik (BTL/MIN)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {stats.map((s, idx) => {
                const bpm = ((s.bottles_count || 0) / shiftMinutes).toFixed(1);
                return (
                  <tr key={s.id || idx} className="group hover:bg-white/[0.02] transition">
                    <td className="py-4 pl-4">
                      <div className="font-bold text-sm text-slate-300">{s.shift_date}</div>
                      <div className="text-[10px] text-slate-500 uppercase">{s.shift_type}</div>
                    </td>
                    <td className="py-4 font-black text-blue-400">ANKER {s.machine_id}</td>
                    <td className="py-4 text-sm text-slate-300 font-medium uppercase">{s.leader_name}</td>
                    <td className="py-4 text-right font-mono text-sm text-slate-400">{s.bags_count}</td>
                    <td className="py-4 text-right font-mono text-sm text-slate-300 font-black">{new Intl.NumberFormat('pl-PL').format(s.bottles_count)}</td>
                    <td className="py-4 pr-4 text-right">
                      <span className="text-xs font-black px-2 py-1 rounded-md bg-green-500/10 text-green-500">
                        {bpm} b/m
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
