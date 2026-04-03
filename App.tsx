
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
    console.log('App: Fetching profile for:', userId);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('App: Profile fetch error:', error);
        if (error.code === '42P17') {
          throw new Error('Database Error: Infinite recursion in RLS policies. Run the fix SQL script in your Supabase editor.');
        }
        throw new Error(`Sync Error: ${error.message}`);
      }
      
      if (!data) {
        console.warn('App: No profile found for user');
        setProfile(null);
        await supabase.auth.signOut();
      } else {
        console.log('App: Profile synchronized:', data.role);
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
    console.log('App: Initializing Auth...');
    
    // Single source of truth for Auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('App: Auth Event:', event);
      setSession(session);
      
      if (session) {
        // Only fetch profile if we don't have it or if the user changed
        if (!profile || profile.id !== session.user.id) {
          fetchProfile(session.user.id);
        } else {
          setLoading(false);
        }
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchProfile, profile]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-6 animate-fade-in">
      <div className="relative">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-200 border-t-slate-900"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2 h-2 bg-slate-900 rounded-full"></div>
        </div>
      </div>
      <div className="text-center space-y-2">
        <p className="label-caps animate-pulse">Synchronizing Identity</p>
        <p className="text-[10px] text-slate-400 font-medium">This may take a moment on slow connections</p>
      </div>
      <button 
        onClick={() => window.location.reload()}
        className="mt-4 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors"
      >
        Tap to Refresh
      </button>
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

  const handleLogout = async () => {
    console.log('App: Logging out...');
    setLoading(true);
    try {
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
      // Use a standard reload to clear memory without breaking the connection
      window.location.reload();
    } catch (err) {
      console.error('App: Logout error:', err);
      window.location.reload();
    }
  };

  const renderDashboard = () => {
    switch (profile.role) {
      case UserRole.SUPER_ADMIN: return <SuperAdminDashboard onLogout={handleLogout} />;
      case UserRole.BUILDING_ADMIN: return <BuildingAdminDashboard buildingId={profile.building_id!} onLogout={handleLogout} />;
      case UserRole.RESIDENT: return <ResidentDashboard profile={profile} onLogout={handleLogout} />;
      case UserRole.SECURITY: return <SecurityDashboard buildingId={profile.building_id!} onLogout={handleLogout} />;
      default: return <Login onLoginSuccess={fetchProfile} />;
    }
  };

  return <div className="min-h-screen">{renderDashboard()}</div>;
};

export default App;
