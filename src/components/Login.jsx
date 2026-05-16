import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Lock, Mail, Loader2 } from 'lucide-react';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="glass w-full max-w-md p-10 rounded-3xl shadow-2xl">
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center font-bold text-2xl shadow-lg shadow-blue-500/30 mb-6">H</div>
          <h1 className="text-3xl font-extrabold tracking-tight">HBM <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500 uppercase">Open-Book</span></h1>
          <p className="text-slate-400 mt-2">Zaloguj się, aby uzyskać dostęp do raportów</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-900/50 border border-white/10 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:border-blue-500 transition"
                placeholder="twoj@email.pl"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Hasło</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900/50 border border-white/10 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:border-blue-500 transition"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm font-semibold">
              {error}
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-4 rounded-2xl font-bold transition shadow-lg shadow-blue-500/20 flex items-center justify-center space-x-2"
          >
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <span>Zaloguj się</span>}
          </button>
        </form>

        <p className="text-center text-slate-600 text-xs mt-10 uppercase tracking-widest">
          Autoryzowany dostęp dla PSK & HBM
        </p>
      </div>
    </div>
  );
}
