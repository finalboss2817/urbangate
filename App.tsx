
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
    const timeout = setTimeout(() => {
      if (loading) {
        setLoading(false);
        setInitError('Identity sync timed out. Please check your connection or refresh.');
      }
    }, 15000); // 15 second timeout

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout);
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setLoading(false);
    }).catch((err) => {
      clearTimeout(timeout);
      console.error('Session fetch error:', err);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-6 animate-fade-in">
      <div className="relative">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-200 border-t-slate-900"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2 h-2 bg-slate-900 rounded-full"></div>
        </div>
      </div>
      <p className="label-caps animate-pulse">Synchronizing Identity</p>
    </div>
  );

  if (initError) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-10 text-center animate-fade-in">
      <div className="w-20 h-20 bg-red-50 text-red-500 rounded-3xl flex items-center justify-center text-3xl mb-8 shadow-sm">⚠️</div>
      <h2 className="heading-lg mb-3">System Sync Error</h2>
      <p className="text-slate-500 text-sm max-w-xs mx-auto mb-10 leading-relaxed font-medium">{initError}</p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button onClick={() => window.location.reload()} className="btn-primary w-full">Retry Sync</button>
        <button onClick={() => supabase.auth.signOut()} className="btn-secondary w-full">Logout</button>
      </div>
    </div>
  );

  if (!session || !profile) {
    return <Login onLoginSuccess={fetchProfile} />;
  }

  // Verification Gate: Approved residents pass, new ones wait here.
  if (profile.role === UserRole.RESIDENT && !profile.is_verified) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center animate-fade-in">
        <div className="w-24 h-24 bg-slate-900 rounded-[2.5rem] flex items-center justify-center shadow-2xl mb-10 animate-pulse text-4xl">⏳</div>
        <h1 className="heading-xl mb-4">Access Pending</h1>
        <p className="text-slate-500 max-w-md leading-relaxed mb-12 font-medium">
          Welcome, <span className="text-slate-900 font-bold">{profile.full_name}</span>. Your registration for <b>Unit {profile.wing}-{profile.flat_number}</b> is pending verification. 
          Please contact your building administrator to approve your unit access.
        </p>
        <div className="card-modern p-8 mb-12 w-full max-w-sm text-left">
          <p className="label-caps mb-6">Identity Details</p>
          <div className="space-y-4 text-sm">
             <div className="flex justify-between items-center"><span className="text-slate-400 font-medium">Unit:</span> <span className="font-bold text-slate-900">{profile.wing}-{profile.flat_number}</span></div>
             <div className="flex justify-between items-center"><span className="text-slate-400 font-medium">Mobile:</span> <span className="font-bold text-slate-900">{profile.phone_number}</span></div>
          </div>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="btn-ghost">Sign Out & Exit</button>
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
