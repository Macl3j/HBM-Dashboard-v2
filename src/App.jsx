import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Admin from './components/Admin';
import BDOManager from './components/BDOManager';
import AnkerDashboard from './components/AnkerDashboard';

function App() {
  const [session, setSession] = useState(null);
  const [view, setView] = useState('dashboard'); // 'dashboard', 'admin', 'bdo', or 'anker'

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="App">
      {!session ? (
        <Login />
      ) : (
        <>
          {view === 'admin' ? (
            <Admin onBack={() => setView('dashboard')} />
          ) : view === 'bdo' ? (
            <BDOManager onBack={() => setView('dashboard')} />
          ) : view === 'anker' ? (
            <AnkerDashboard onBack={() => setView('dashboard')} />
          ) : (
            <Dashboard 
              user={session.user} 
              onAdminClick={() => setView('admin')} 
              onBdoClick={() => setView('bdo')}
              onAnkerClick={() => setView('anker')}
            />
          )}
        </>
      )}
    </div>
  );
}

export default App;
