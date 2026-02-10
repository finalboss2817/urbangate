
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

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
    } else {
      setProfile(data);
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
    </div>
  );

  if (!session || !profile) {
    return <Login onLoginSuccess={(userId) => fetchProfile(userId)} />;
  }

  const renderDashboard = () => {
    switch (profile.role) {
      case UserRole.SUPER_ADMIN:
        return <SuperAdminDashboard onLogout={handleLogout} />;
      case UserRole.BUILDING_ADMIN:
        return <BuildingAdminDashboard buildingId={profile.building_id!} onLogout={handleLogout} />;
      case UserRole.RESIDENT:
        return <ResidentDashboard buildingId={profile.building_id!} flatNumber={profile.flat_number!} name={profile.full_name!} onLogout={handleLogout} />;
      case UserRole.SECURITY:
        return <SecurityDashboard buildingId={profile.building_id!} onLogout={handleLogout} />;
      default:
        return <Login onLoginSuccess={(userId) => fetchProfile(userId)} />;
    }
  };

  return (
    <div className="min-h-screen">
      {renderDashboard()}
    </div>
  );
};

export default App;
