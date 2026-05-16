import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';
import { Upload, FileCode, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, ArrowLeft, Trash2, Database, List, ShieldAlert, Globe, Search, Edit3, Zap } from 'lucide-react';

export default function Admin({ onBack }) {
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState('2026-04');
  const [dbStats, setDbStats] = useState({ invoices: 0, budget: 0 });
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [budgetCategories, setBudgetCategories] = useState([]);
  const [budgetStatus, setBudgetStatus] = useState(null);
  const [xmlStatus, setXmlStatus] = useState(null);
  const [payrollStatus, setPayrollStatus] = useState(null);
  const [manualEntry, setManualEntry] = useState({ provider: '', description: '', amount: '', type: 'PROGNOZA' });
  const [manualStatus, setManualStatus] = useState(null);

  const [ankerEntry, setAnkerEntry] = useState({ 
    shift_date: new Date().toISOString().split('T')[0], 
    shift_type: 'I Zmiana', 
    machine_id: '2024', 
    leader_name: '', 
    bags_count: '', 
    bottles_count: '' 
  });
  const [ankerStatus, setAnkerStatus] = useState(null);

  useEffect(() => {
    fetchStats();
  }, [month]);

  const fetchStats = async () => {
    try {
      const { data: report } = await supabase.from('opex_reports').select('*').eq('month', month).single();
      if (report) {
        const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('report_id', report.id);
        const { data: invs } = await supabase.from('invoices').select('*').eq('report_id', report.id).order('created_at', { ascending: false });
        setDbStats({ invoices: count || 0, budget: report.budget_total || 0 });
        setRecentInvoices(invs || []);
        // Załaduj kategorie z budget_items
        const items = report.budget_items || {};
        // Pokaż wszystkie kategorie, które mają etykietę (nawet jeśli budżet na ten miesiąc to 0)
        const cats = Object.keys(items).sort();
        setBudgetCategories(cats);
      } else {
        setDbStats({ invoices: 0, budget: 0 });
        setRecentInvoices([]);
        setBudgetCategories([]);
      }
    } catch (err) { console.error(err); }
  };

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setBudgetStatus({ type: 'info', message: 'Analizowanie pliku...' });
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const workbook = XLSX.read(evt.target.result, { type: 'array' });
            // Szukamy najlepszego arkusza: priorytet "3 zmiany", potem OPEX, potem Budget
            const sheetNames = workbook.SheetNames;
            const targetSheetName = sheetNames.find(n => n.includes('3 zmiany')) || 
                                    sheetNames.find(n => n.toUpperCase().includes('ZMIANY')) ||
                                    sheetNames.find(n => n.toUpperCase().includes('OPEX')) || 
                                    sheetNames.find(n => n.toUpperCase().includes('BUD')) ||
                                    sheetNames[0];
            
            const sheet = workbook.Sheets[targetSheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            resolve({ rows, sheetName: targetSheetName });
          } catch (err) { reject(err); }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });

      const { rows, sheetName } = data;
      const monthIdx = parseInt(month.split('-')[1]) - 1; // 0-11
      let budgetItems = {};
      let totalBudget = 0;

      rows.forEach(row => {
        // Próbujemy znaleźć label w kolumnie 0, 1 lub 2
        const label = String(row[0] || row[1] || row[2] || '').trim();
        
        // Sprawdzamy czy wiersz ma jakiekolwiek dane liczbowe
        const hasNumbers = row.some(v => {
          if (typeof v === 'number' && v !== 0) return true;
          if (typeof v === 'string') {
            const clean = v.replace(/\s/g, '').replace(',', '.');
            return clean.length > 0 && !isNaN(parseFloat(clean)) && parseFloat(clean) !== 0;
          }
          return false;
        });
        
        if (label && label.length > 2 && hasNumbers) {
          // Próbujemy znaleźć wartość dla miesiąca. 
          // Szukamy w kolumnach 1-15 (miesiące zwykle są po etykiecie)
          let val = 0;
          // Jeśli label był w kolumnie 0, szukamy w monthIdx + 1
          // Jeśli w kolumnie 1, szukamy w monthIdx + 2 itd.
          // Najbezpieczniej: bierzemy pierwszą sensowną liczbę w okolicach kolumny miesiąca
          const possibleCols = [monthIdx + 1, monthIdx + 2, monthIdx + 3, monthIdx + 4];
          for (let col of possibleCols) {
            let v = row[col];
            if (typeof v === 'string') v = parseFloat(v.replace(/\s/g, '').replace(',', '.'));
            if (typeof v === 'number' && !isNaN(v) && v !== 0) {
              val = v;
              break;
            }
          }
          
          if (val !== 0) {
            budgetItems[label] = val;
            if (label.toUpperCase().includes('OPEX CENA PSK') || label.toUpperCase().includes('TOTAL OPEX PSK')) totalBudget = val;
          }
        }
      });

      if (Object.keys(budgetItems).length === 0) {
        throw new Error(`Nie znaleziono kategorii w arkuszu "${sheetName}". Upewnij się, że dane są w tabeli.`);
      }

      // Pobieramy istniejące statystyki, aby ich nie nadpisać zerami
      const { data: existing } = await supabase.from('opex_reports').select('actual_total, ksef_total, payroll_total').eq('month', month).single();
      
      const { error: upsertErr } = await supabase.from('opex_reports').upsert({ 
        month, 
        budget_total: totalBudget || 0, 
        budget_items: budgetItems,
        actual_total: existing?.actual_total || 0, 
        ksef_total: existing?.ksef_total || 0, 
        payroll_total: existing?.payroll_total || budgetItems["Wynagrodzenie RAZEM"] || budgetItems["Wynagrodzenie RAZEM (z upr. na czołówki)"] || budgetItems["1. Koszty Personelu i Pracy"] || 0,
        fee_percentage: 12 
      }, { onConflict: 'month' });

      if (upsertErr) throw upsertErr;

      // Wymuś przeliczenie sum po wgraniu budżetu, na wypadek gdyby payroll_total się zmienił
      const { data: newReport } = await supabase.from('opex_reports').select('id, payroll_total').eq('month', month).single();
      if (newReport) await updateTotals(newReport.id, newReport.payroll_total);

      const catNames = Object.keys(budgetItems);
      const sample = catNames.slice(0, 3).join(', ');
      setBudgetStatus({ 
        type: 'success', 
        message: `Wczytano arkusz "${sheetName}" (${catNames.length} pozycji). Przykłady: ${sample}...` 
      });
      fetchStats();
    } catch (err) { 
      setBudgetStatus({ type: 'error', message: `Błąd: ${err.message || JSON.stringify(err)}` }); 
      console.error(err);
    } finally { setLoading(false); }
  };

  const handleXmlUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    setLoading(true);
    setXmlStatus(null);
    try {
      let { data: report } = await supabase.from('opex_reports').select('id, payroll_total').eq('month', month).single();
      if (!report) {
        const { data: newReport, error: createErr } = await supabase
          .from('opex_reports')
          .insert([{ month, budget_total: 0, actual_total: 0, ksef_total: 0, payroll_total: 0, fee_percentage: 12, budget_items: {} }])
          .select().single();
        if (createErr) throw createErr;
        report = newReport;
      }

      let loaded = 0;
      const errors = [];

      for (const file of files) {
        try {
          const text = await file.text();
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(text, 'text/xml');
          const getTag = (name) => {
            const byNS = xmlDoc.getElementsByTagNameNS('*', name);
            if (byNS && byNS.length > 0) return byNS[0].textContent.trim();
            const byName = xmlDoc.getElementsByTagName(name);
            if (byName && byName.length > 0) return byName[0].textContent.trim();
            return null;
          };

          const amountStr = getTag('P_15') || getTag('KwotaBrutto') || '0';
          const nazwaEls = xmlDoc.getElementsByTagNameNS('*', 'Nazwa');
          const provider = (nazwaEls && nazwaEls.length > 0 ? nazwaEls[0].textContent.trim() : null)
            || getTag('PelnaNazwa') || file.name;
          const parsedAmount = parseFloat(String(amountStr).replace(',', '.').replace(/\s/g, '')) || 0;

          const { error: upsertErr } = await supabase.from('invoices').upsert({
            id: `${month}_${file.name.replace('.xml', '')}`,
            provider: provider.replace(/\r\n|\n/g, ' '),
            amount: parsedAmount,
            xml_content: text,
            report_id: report.id
          });

          if (upsertErr) errors.push(`${file.name}: ${upsertErr.message}`);
          else loaded++;
        } catch (fileErr) {
          errors.push(`${file.name}: ${fileErr.message}`);
        }
      }

      await updateTotals(report.id, report.payroll_total);
      fetchStats();

      if (errors.length > 0) {
        setXmlStatus({ type: 'error', message: `Wgrano ${loaded}/${files.length}. Błędy: ${errors.join(' | ')}` });
      } else {
        setXmlStatus({ type: 'success', message: `Wgrano ${files.length} faktur poprawnie.` });
      }
    } catch (err) {
      setXmlStatus({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleAddAnkerStats = async () => {
    // Walidacja wymaga wszystkich pól
    if (!ankerEntry.shift_date || !ankerEntry.shift_type || !ankerEntry.machine_id) {
      setAnkerStatus({ type: 'error', message: 'Uzupełnij wszystkie pola formularza.' });
      return;
    }
    setLoading(true);
    setAnkerStatus({ type: 'loading', message: 'Zapisywanie statystyk...' });
    try {
      // Upewnij się, że istnieje raport dla wybranego miesiąca
      let { data: report } = await supabase.from('opex_reports').select('id').eq('month', month).single();
      if (!report) {
        const { data: newReport, error: createErr } = await supabase
          .from('opex_reports')
          .insert([{ month, budget_total: 0, actual_total: 0, ksef_total: 0, payroll_total: 0, fee_percentage: 12, budget_items: {} }])
          .select()
          .single();
        if (createErr) throw createErr;
        report = newReport;
      }
      const { error: err } = await supabase.from('anker_stats').insert({
        shift_date: ankerEntry.shift_date,
        shift_type: ankerEntry.shift_type,
        machine_id: ankerEntry.machine_id,
        leader_name: ankerEntry.leader_name,
        bags_count: parseInt(ankerEntry.bags_count) || 0,
        bottles_count: parseInt(ankerEntry.bottles_count) || 0,
      });
      if (err) throw err;
      setAnkerStatus({ type: 'success', message: 'Statystyki Anker zapisane.' });
      // Reset formularza
      setAnkerEntry({
        shift_date: new Date().toISOString().split('T')[0],
        shift_type: 'I Zmiana',
        machine_id: '2024',
        leader_name: '',
        bags_count: '',
        bottles_count: '',
      });
      // odśwież dane w dashboardzie
      fetchStats();
    } catch (e) {
      setAnkerStatus({ type: 'error', message: e.message || 'Nie udało się zapisać.' });
      console.error(e);
    } finally {
      setLoading(false);
    }
  };


  const updateTotals = async (reportId, payroll) => {
    const { data: allInvs } = await supabase.from('invoices').select('amount').eq('report_id', reportId);
    const totalInv = allInvs.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);
    await supabase.from('opex_reports').update({ actual_total: totalInv + (payroll || 0), ksef_total: totalInv }).eq('id', reportId);
  };

  const updatePayroll = async (val) => {
    const amount = parseFloat(val) || 0;
    try {
      const { data: report } = await supabase.from('opex_reports').select('id').eq('month', month).single();
      if (report) {
        await supabase.from('opex_reports').update({ payroll_total: amount }).eq('id', report.id);
        await updateTotals(report.id, amount);
        setPayrollStatus({ type: 'success', message: 'Zapisano payroll i przeliczono sumy.' });
        fetchStats();
      }
    } catch (err) { setPayrollStatus({ type: 'error', message: err.message }); }
  };

  const updateInvoiceAmount = async (id, val) => {
    const amount = parseFloat(String(val).replace(',', '.'));
    if (isNaN(amount)) return;
    try {
      await supabase.from('invoices').update({ amount }).eq('id', id);
      const { data: report } = await supabase.from('opex_reports').select('id, payroll_total').eq('month', month).single();
      if (report) await updateTotals(report.id, report.payroll_total);
      fetchStats();
    } catch (err) { console.error(err); }
  };

  const updateInvoiceDescription = async (id, val) => {
    try {
      await supabase.from('invoices').update({ description: val }).eq('id', id);
      setRecentInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, description: val } : inv));
    } catch (err) { console.error(err); }
  };

  const updateBudgetLine = async (id, budgetLine) => {
    try {
      await supabase.from('invoices').update({ budget_line: budgetLine }).eq('id', id);
      setRecentInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, budget_line: budgetLine } : inv));
    } catch (err) { console.error(err); }
  };

  const deleteInvoice = async (id) => {
    try {
      await supabase.from('invoices').delete().eq('id', id);
      const { data: report } = await supabase.from('opex_reports').select('id, payroll_total').eq('month', month).single();
      if (report) await updateTotals(report.id, report.payroll_total);
      fetchStats();
    } catch (err) { console.error(err); }
  };

  const handleAddManualEntry = async () => {
    if (!manualEntry.provider || !manualEntry.amount) {
      setManualStatus({ type: 'error', message: 'Wpisz nazwę i kwotę.' });
      return;
    }
    setLoading(true);
    setManualStatus({ type: 'info', message: 'Dodawanie wpisu...' });
    try {
      let { data: report } = await supabase.from('opex_reports').select('id, payroll_total').eq('month', month).single();
      if (!report) {
        const { data: newReport, error: createErr } = await supabase
          .from('opex_reports')
          .insert([{ month, budget_total: 0, actual_total: 0, ksef_total: 0, payroll_total: 0, fee_percentage: 12, budget_items: {} }])
          .select().single();
        if (createErr) throw createErr;
        report = newReport;
      }

      const amount = parseFloat(String(manualEntry.amount).replace(',', '.'));
      if (isNaN(amount)) throw new Error("Nieprawidłowa kwota");

      const newId = `${month}_MANUAL_${Date.now()}`;
      const { error: insErr } = await supabase.from('invoices').insert({
        id: newId,
        provider: `[${manualEntry.type}] ${manualEntry.provider}`,
        description: manualEntry.description,
        amount: amount,
        report_id: report.id
      });

      if (insErr) throw insErr;

      await updateTotals(report.id, report.payroll_total);
      setManualStatus({ type: 'success', message: 'Dodano wpis ręczny.' });
      setManualEntry({ provider: '', description: '', amount: '', type: 'PROGNOZA' });
      fetchStats();
    } catch (err) {
      setManualStatus({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto animate-fade-in min-h-screen">
      <header className="flex justify-between items-center mb-8">
        <button onClick={onBack} className="flex items-center text-slate-400 hover:text-white transition font-bold"><ArrowLeft className="mr-2 w-4 h-4" /> Powrót</button>
        <div className="flex items-center space-x-4">
           <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="bg-slate-900 border border-white/10 rounded-xl px-4 py-2 font-bold text-blue-400 outline-none" />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
             <div className="glass p-8 rounded-3xl">
                <h2 className="text-xl font-black mb-6 uppercase tracking-tighter">1. Budżet Szczegółowy</h2>
                <UploadBox title="Wgraj Pełny Excel" color="blue" onUpload={handleExcelUpload} accept=".xlsx, .xls" />
                {budgetStatus && (
                   <div className={`mt-6 p-4 rounded-xl text-xs font-bold border ${budgetStatus.type === 'success' ? 'bg-green-500/10 text-green-400 border-green-500/20' : budgetStatus.type === 'info' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                      {budgetStatus.message}
                   </div>
                )}
             </div>

             <div className="glass p-8 rounded-3xl">
                <h2 className="text-xl font-black mb-6 uppercase tracking-tighter">2. Faktury KSeF (Temp)</h2>
                <UploadBox title="Wgraj XML-e (Temp / Media / Inne)" color="purple" onUpload={handleXmlUpload} accept=".xml" multiple />
                {xmlStatus && (
                   <div className={`mt-6 p-4 rounded-xl text-xs font-bold border ${xmlStatus.type === 'success' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                      {xmlStatus.message}
                   </div>
                )}
             </div>

             <div className="glass p-8 rounded-3xl border-orange-500/20 bg-orange-500/5">
                <h2 className="text-xl font-black mb-6 uppercase tracking-tighter text-orange-400">3. Payroll CORE (4 os.)</h2>
                <div className="flex space-x-2">
                   <input 
                      type="number" 
                      placeholder="Kwota netto + ZUS..."
                      className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 font-bold text-orange-400 w-full outline-none focus:border-orange-500"
                      onChange={(e) => updatePayroll(e.target.value)}
                   />
                   <button className="bg-orange-600 px-4 rounded-xl font-bold text-xs">ZAPISZ</button>
                </div>
                 <p className="text-[9px] text-slate-500 mt-3 italic">* Tu wpisz łączny koszt wynagrodzeń 4 osób z Core Teamu.</p>
                 {payrollStatus && (
                   <div className={`mt-3 p-2 rounded-lg text-[10px] font-bold border ${payrollStatus.type === 'success' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                      {payrollStatus.message}
                   </div>
                 )}
              </div>

              <div className="glass p-8 rounded-3xl border-blue-500/20 bg-blue-500/5">
                <h2 className="text-xl font-black mb-6 uppercase tracking-tighter text-blue-400">4. Wpis Ręczny</h2>
                <div className="space-y-3">
                  <input 
                    type="text" 
                    placeholder="Nazwa opłaty (np. Energia, Czynsz)..."
                    className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 font-bold text-slate-300 w-full outline-none focus:border-blue-500"
                    value={manualEntry.provider}
                    onChange={(e) => setManualEntry({...manualEntry, provider: e.target.value})}
                  />
                  <input 
                    type="text" 
                    placeholder="Krótki opis (opcjonalnie)..."
                    className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 font-bold text-slate-400 w-full outline-none focus:border-blue-500 text-sm"
                    value={manualEntry.description}
                    onChange={(e) => setManualEntry({...manualEntry, description: e.target.value})}
                  />
                  <div className="flex space-x-2">
                    <input 
                      type="number" 
                      placeholder="Kwota brutto..."
                      className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 font-bold text-blue-400 w-full outline-none focus:border-blue-500"
                      value={manualEntry.amount}
                      onChange={(e) => setManualEntry({...manualEntry, amount: e.target.value})}
                    />
                    <select 
                      className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 font-bold text-slate-300 outline-none focus:border-blue-500"
                      value={manualEntry.type}
                      onChange={(e) => setManualEntry({...manualEntry, type: e.target.value})}
                    >
                      <option value="PROGNOZA">PROGNOZA</option>
                      <option value="OPŁATA UMOWNA">OPŁATA UMOWNA</option>
                    </select>
                  </div>
                  <button onClick={handleAddManualEntry} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-xl font-bold text-xs mt-2 transition disabled:opacity-50">
                    DODAJ WPIS
                  </button>
                </div>
                {manualStatus && (
                  <div className={`mt-3 p-3 rounded-lg text-xs font-bold border ${manualStatus.type === 'success' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                    {manualStatus.message}
                  </div>
                )}
              </div>

            {/* Nowa Sekcja: Statystyki Anker */}
            <div className="glass p-8 rounded-[2rem] border border-white/5 relative overflow-hidden mt-8">
              <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 blur-3xl rounded-full"></div>
              <h3 className="text-xl font-black uppercase tracking-tighter mb-6 flex items-center">
                <Zap className="w-5 h-5 mr-3 text-green-500" /> Wprowadź Statystyki Anker
              </h3>
              
              {ankerStatus && (
                <div className={`p-4 rounded-xl mb-6 font-bold text-sm ${
                  ankerStatus.type === 'error' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 
                  ankerStatus.type === 'loading' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' : 
                  'bg-green-500/10 text-green-500 border border-green-500/20'
                }`}>
                  {ankerStatus.message}
                </div>
              )}

              <div className="space-y-4 relative z-10">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block mb-2">Data Zmiany</label>
                    <input 
                      type="date" 
                      className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 font-bold text-slate-300 w-full outline-none focus:border-green-500"
                      value={ankerEntry.shift_date}
                      onChange={(e) => setAnkerEntry({...ankerEntry, shift_date: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block mb-2">Zmiana</label>
                    <select 
                      className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 font-bold text-slate-300 w-full outline-none focus:border-green-500"
                      value={ankerEntry.shift_type}
                      onChange={(e) => setAnkerEntry({...ankerEntry, shift_type: e.target.value})}
                    >
                      <option value="I Zmiana">I Zmiana (06:00 - 14:00)</option>
                      <option value="II Zmiana">II Zmiana (14:00 - 22:00)</option>
                      <option value="III Zmiana">III Zmiana (22:00 - 06:00)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block mb-2">Maszyna</label>
                    <select 
                      className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 font-bold text-slate-300 w-full outline-none focus:border-green-500"
                      value={ankerEntry.machine_id}
                      onChange={(e) => setAnkerEntry({...ankerEntry, machine_id: e.target.value})}
                    >
                      <option value="2024">Anker 2024</option>
                      <option value="2025">Anker 2025</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block mb-2">Imię i Nazwisko Lidera</label>
                    <input 
                      type="text" 
                      placeholder="np. Jan Kowalski"
                      className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 font-bold text-slate-300 w-full outline-none focus:border-green-500"
                      value={ankerEntry.leader_name}
                      onChange={(e) => setAnkerEntry({...ankerEntry, leader_name: e.target.value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block mb-2">Ilość Worków</label>
                    <input 
                      type="number" 
                      placeholder="0"
                      className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 font-bold text-white w-full outline-none focus:border-green-500"
                      value={ankerEntry.bags_count}
                      onChange={(e) => setAnkerEntry({...ankerEntry, bags_count: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block mb-2">Ilość Butelek</label>
                    <input 
                      type="number" 
                      placeholder="0"
                      className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 font-bold text-white w-full outline-none focus:border-green-500"
                      value={ankerEntry.bottles_count}
                      onChange={(e) => setAnkerEntry({...ankerEntry, bottles_count: e.target.value})}
                    />
                  </div>
                </div>

                <button 
                  onClick={handleAddAnkerStats}
                  className="w-full bg-green-600 hover:bg-green-500 text-white font-black py-4 rounded-xl transition shadow-lg shadow-green-600/20 mt-4"
                >
                  DODAJ WYNIK DO STATYSTYK
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
             <div className="glass p-8 rounded-3xl overflow-hidden">
                <div className="flex justify-between items-center mb-6">
                   <h3 className="text-lg font-black uppercase tracking-widest text-slate-400">Zarządzanie Fakturami ({month})</h3>
                   <div className="text-right">
                      <p className="text-[10px] text-slate-500 uppercase">Suma Realizacji</p>
                      <p className="text-xl font-black text-blue-400">{(dbStats.invoices > 0 ? recentInvoices.reduce((s,i) => s + i.amount, 0) : 0).toLocaleString()} PLN</p>
                   </div>
                </div>
                
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                   {recentInvoices.map(inv => (
                     <div key={inv.id} className="flex flex-col p-4 bg-white/5 rounded-2xl border border-white/5 group hover:border-blue-500/30 transition gap-3">
                        {/* Wiersz górny: dostawca + kwota + usuń */}
                        <div className="flex items-center justify-between">
                           <div className="flex-1 min-w-0 mr-3">
                              <p className="text-xs font-black uppercase truncate">{inv.provider}</p>
                              <input 
                                type="text"
                                placeholder="Dodaj krótki opis (opcjonalnie)..."
                                defaultValue={inv.description || ''}
                                onBlur={(e) => updateInvoiceDescription(inv.id, e.target.value)}
                                className="text-[10px] text-slate-400 font-mono w-full bg-transparent border-b border-transparent hover:border-slate-700 focus:border-blue-500 outline-none transition px-1 mt-1"
                              />
                              <p className="text-[10px] text-slate-600 font-mono truncate mt-1">ID: {inv.id}</p>
                           </div>
                           <div className="flex items-center space-x-2 flex-shrink-0">
                              <div className="relative">
                                 <input 
                                   type="number" 
                                   defaultValue={inv.amount} 
                                   onBlur={(e) => updateInvoiceAmount(inv.id, e.target.value)}
                                   className="bg-slate-950 border border-white/10 rounded-lg px-3 py-1 text-right text-sm font-bold text-blue-400 w-32 focus:border-blue-500 outline-none transition"
                                 />
                                 <Edit3 className="absolute -left-6 top-1.5 w-3 h-3 text-slate-600" />
                              </div>
                              <button onClick={() => deleteInvoice(inv.id)} className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition" title="Usuń fakturę">
                                <Trash2 className="w-4 h-4" />
                              </button>
                           </div>
                        </div>
                        {/* Wiersz dolny: kategoria budżetowa */}
                        <div className="flex items-center gap-2">
                           <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Kategoria OPEX:</span>
                           <select
                             value={inv.budget_line || ''}
                             onChange={(e) => updateBudgetLine(inv.id, e.target.value)}
                             className={`flex-1 text-[10px] font-bold rounded-lg px-2 py-1.5 outline-none border transition cursor-pointer ${
                               inv.budget_line
                                 ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                                 : 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                             }`}
                           >
                             <option value="">⚠ Nie przypisano — wybierz kategorię...</option>
                             {budgetCategories.length === 0 && <option disabled>Najpierw wgraj budżet Excel</option>}
                             {budgetCategories.map(cat => (
                               <option key={cat} value={cat}>{cat}</option>
                             ))}
                           </select>
                        </div>
                     </div>
                   ))}
                   {recentInvoices.length === 0 && <p className="text-center py-20 text-slate-600 italic">Brak faktur dla tego miesiąca.</p>}
                </div>
             </div>
          </div>
      </div>
    </div>
  );
}

function UploadBox({ title, color, onUpload, accept, multiple }) {
  return (
    <div className={`p-6 bg-${color}-500/5 border border-${color}-500/10 rounded-2xl text-center`}>
      <p className="text-[10px] font-bold text-slate-500 mb-4 uppercase">{title}</p>
      <label className={`cursor-pointer bg-${color}-600 hover:bg-${color}-700 text-white px-6 py-3 rounded-xl font-bold transition inline-flex items-center text-xs`}>
        <Upload className="mr-2 w-4 h-4" /> WYBIERZ PLIK
        <input type="file" className="hidden" accept={accept} multiple={multiple} onChange={onUpload} />
      </label>
    </div>
  );
}
