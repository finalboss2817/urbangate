
import React, { useState, useEffect, useCallback } from 'react';
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

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        if (error.code === '42P17') {
          throw new Error('Database Error: Infinite recursion in RLS policies. Run the fix SQL script in your Supabase editor.');
        }
        throw new Error(`Sync Error: ${error.message}`);
      }
      
      if (!data) {
        setProfile(null);
        await supabase.auth.signOut();
      } else {
        setProfile(data);
      }
    } catch (err: any) {
      console.error('Identity sync fail:', err);
      setInitError(err.message || 'Identity Sync Error. Ensure Database SQL is applied.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setLoading(false);
    }).catch(() => setLoading(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-4 font-inter">
      <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent"></div>
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Synchronizing Identity</p>
    </div>
  );

  if (initError) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-10 text-center font-inter">
      <div className="w-16 h-16 bg-red-100 text-red-500 rounded-2xl flex items-center justify-center text-2xl mb-6">⚠️</div>
      <h2 className="text-xl font-black text-slate-900 mb-2">System Sync Error</h2>
      <p className="text-slate-500 text-sm max-w-xs mx-auto mb-8 leading-relaxed font-medium">{initError}</p>
      <div className="space-y-3">
        <button onClick={() => window.location.reload()} className="w-full px-10 py-4 bg-indigo-600 text-white font-black rounded-xl text-[10px] uppercase tracking-widest shadow-xl">Retry Sync</button>
        <button onClick={() => supabase.auth.signOut()} className="w-full px-10 py-4 bg-white text-slate-400 border border-slate-200 font-black rounded-xl text-[10px] uppercase tracking-widest">Logout</button>
      </div>
    </div>
  );

  if (!session || !profile) {
    return <Login onLoginSuccess={fetchProfile} />;
  }

  // Verification Gate: Approved residents pass, new ones wait here.
  if (profile.role === UserRole.RESIDENT && !profile.is_verified) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center font-inter">
        <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center shadow-2xl mb-8 animate-pulse text-3xl">⏳</div>
        <h1 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">Access Pending</h1>
        <p className="text-slate-500 max-w-md leading-relaxed mb-10 font-medium">
          Welcome, <span className="text-indigo-600 font-bold">{profile.full_name}</span>. Your registration for <b>Unit {profile.wing}-{profile.flat_number}</b> is pending verification. 
          Please contact your building administrator to approve your unit access.
        </p>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mb-10 w-full max-w-sm text-left">
          <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-4">Identity Details</p>
          <div className="space-y-2 text-xs">
             <div className="flex justify-between"><span className="text-slate-400">Unit:</span> <span className="font-bold">{profile.wing}-{profile.flat_number}</span></div>
             <div className="flex justify-between"><span className="text-slate-400">Mobile:</span> <span className="font-bold">{profile.phone_number}</span></div>
          </div>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-red-500 transition-colors">Sign Out & Exit</button>
      </div>
    );
  }

  const renderDashboard = () => {
    switch (profile.role) {
      case UserRole.SUPER_ADMIN: return <SuperAdminDashboard onLogout={() => supabase.auth.signOut()} />;
      case UserRole.BUILDING_ADMIN: return <BuildingAdminDashboard buildingId={profile.building_id!} onLogout={() => supabase.auth.signOut()} />;
      case UserRole.RESIDENT: return <ResidentDashboard profile={profile} onLogout={() => supabase.auth.signOut()} />;
      case UserRole.SECURITY: return <SecurityDashboard buildingId={profile.building_id!} onLogout={() => supabase.auth.signOut()} />;
      default: return <Login onLoginSuccess={fetchProfile} />;
    }
  };

  return <div className="min-h-screen">{renderDashboard()}</div>;
};

export default App;
