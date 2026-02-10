
import React, { useState, useEffect } from 'react';
import { UserRole, Profile } from './types';
import { supabase } from './lib/supabase';
import SuperAdminDashboard from './components/SuperAdminDashboard';
import BuildingAdminDashboard from './components/BuildingAdminDashboard';
import ResidentDashboard from './components/ResidentDashboard';
import SecurityDashboard from './components/SecurityDashboard';
import Login from './components/Login';

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      
      // If session exists but profile is gone (dummy data deleted), 
      // we must log out to clear the stale session.
      if (!data) {
        setProfile(null);
        await supabase.auth.signOut();
      } else {
        setProfile(data);
      }
    } catch (err: any) {
      console.error('Error fetching profile:', err);
      setInitError('Profile sync failed. Please refresh or try logging out.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    }).catch(err => {
      console.error('Session check failed:', err);
      setInitError('Connection to security server failed.');
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-4">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
      <p className="text-xs font-black uppercase tracking-widest text-slate-400">Loading System...</p>
    </div>
  );

  if (initError) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-red-50 p-6 text-center">
      <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center text-3xl shadow-xl mb-6">⚠️</div>
      <h2 className="text-xl font-black text-red-600 uppercase tracking-tight mb-2">System Error</h2>
      <p className="text-slate-600 max-w-xs mb-8 font-medium">{initError}</p>
      <button 
        onClick={() => window.location.reload()}
        className="px-8 py-4 bg-red-600 text-white font-black rounded-2xl text-xs uppercase tracking-widest shadow-xl shadow-red-100"
      >
        Re-Initialize System
      </button>
    </div>
  );

  if (!session || !profile) {
    return <Login onLoginSuccess={(userId) => fetchProfile(userId)} />;
  }

  const renderDashboard = () => {
    try {
      switch (profile.role) {
        case UserRole.SUPER_ADMIN:
          return <SuperAdminDashboard onLogout={() => supabase.auth.signOut()} />;
        case UserRole.BUILDING_ADMIN:
          if (!profile.building_id) return <Login onLoginSuccess={fetchProfile} />;
          return <BuildingAdminDashboard buildingId={profile.building_id} onLogout={() => supabase.auth.signOut()} />;
        case UserRole.RESIDENT:
          if (!profile.building_id) return <Login onLoginSuccess={fetchProfile} />;
          return <ResidentDashboard 
            buildingId={profile.building_id} 
            flatNumber={profile.flat_number || 'N/A'} 
            name={profile.full_name || 'Resident'} 
            onLogout={() => supabase.auth.signOut()} 
          />;
        case UserRole.SECURITY:
          if (!profile.building_id) return <Login onLoginSuccess={fetchProfile} />;
          return <SecurityDashboard buildingId={profile.building_id} onLogout={() => supabase.auth.signOut()} />;
        default:
          return <Login onLoginSuccess={fetchProfile} />;
      }
    } catch (err) {
      console.error('Dashboard render failed:', err);
      return <div className="p-20 text-center font-black">Dashboard Load Error. Please relog.</div>;
    }
  };

  return (
    <div className="min-h-screen">
      {renderDashboard()}
    </div>
  );
};

export default App;
