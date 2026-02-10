
import React, { useState, useEffect, useRef } from 'react';
import { UserRole, Building } from '../types';
import { supabase } from '../lib/supabase';

interface LoginProps {
  onLoginSuccess: (userId: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [view, setView] = useState<'portal' | 'admin'>('portal');
  const [role, setRole] = useState<UserRole>(UserRole.RESIDENT);
  
  // Building Search State
  const [buildingSearch, setBuildingSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Portal Fields
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [fullName, setFullName] = useState('');
  const [flatNumber, setFlatNumber] = useState('');
  const [accessCode, setAccessCode] = useState('');

  // Management Fields
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingBuildings, setFetchingBuildings] = useState(true);

  const fetchBuildings = async () => {
    setFetchingBuildings(true);
    try {
      const { data, error } = await supabase.from('buildings').select('*').order('name');
      if (error) throw error;
      if (data) setBuildings(data);
    } catch (err: any) {
      console.error('Fetch error:', err);
      setError('Could not load buildings. Check RLS policies.');
    } finally {
      setFetchingBuildings(false);
    }
  };

  useEffect(() => {
    fetchBuildings();

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredBuildings = buildings.filter(b => 
    b.name.toLowerCase().includes(buildingSearch.toLowerCase())
  );

  const handlePortalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!selectedBuilding) {
      setError('Please select your building.');
      return;
    }
    setLoading(true);

    try {
      let isCodeValid = false;
      if (role === UserRole.RESIDENT && accessCode === selectedBuilding.resident_code) isCodeValid = true;
      if (role === UserRole.SECURITY && accessCode === selectedBuilding.security_code) isCodeValid = true;
      if (role === UserRole.BUILDING_ADMIN && accessCode === selectedBuilding.admin_code) isCodeValid = true;

      if (!isCodeValid) {
        throw new Error(`Invalid access code for ${selectedBuilding.name}.`);
      }

      const normalizedName = fullName.trim().toLowerCase().replace(/\s+/g, '');
      const normalizedFlat = (flatNumber || 'staff').trim().toLowerCase().replace(/\s+/g, '');
      const identifier = `${selectedBuilding.id}_${role}_${normalizedFlat}_${normalizedName}`;
      
      const internalEmail = `${identifier}@urbangate.internal`.substring(0, 100); 
      const internalPassword = `auth_${accessCode}_${selectedBuilding.id}`.substring(0, 20);

      let { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: internalEmail,
        password: internalPassword,
      });

      if (authError) {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: internalEmail,
          password: internalPassword,
        });
        if (signUpError) throw signUpError;
        authData = signUpData;
      }

      if (!authData.user) throw new Error('Authentication failed.');

      const { error: profileError } = await supabase.from('profiles').upsert({
        id: authData.user.id,
        role,
        building_id: selectedBuilding.id,
        full_name: fullName.trim(),
        flat_number: role === UserRole.RESIDENT ? flatNumber.trim() : null,
      });

      if (profileError) throw profileError;
      onLoginSuccess(authData.user.id);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const MASTER_EMAIL = 'trivedimanish2803@gmail.com';
    const MASTER_PASS = 'abc123';

    try {
      let { data, error: authError } = await supabase.auth.signInWithPassword({
        email: adminEmail,
        password: adminPassword,
      });

      if (authError && adminEmail === MASTER_EMAIL && adminPassword === MASTER_PASS) {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: MASTER_EMAIL,
          password: MASTER_PASS,
        });
        if (signUpError) throw signUpError;
        data = signUpData;
        authError = null;
      }

      if (authError) throw authError;
      
      if (data.user) {
        if (adminEmail === MASTER_EMAIL) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            role: UserRole.SUPER_ADMIN,
            full_name: 'Super Admin'
          });
        }
        onLoginSuccess(data.user.id);
      }
    } catch (err: any) {
      setError(err.message || 'Invalid management credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#f0f4f8] font-inter">
      <div className="mb-10 text-center flex flex-col items-center">
        <div className="w-24 h-24 bg-indigo-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-indigo-200 mb-6 transition-transform hover:scale-105">
          <span className="text-4xl">🏢</span>
        </div>
        <h1 className="text-5xl font-black text-slate-900 tracking-tighter mb-2">UrbanGate</h1>
        <p className="text-slate-500 font-bold tracking-[0.2em] uppercase text-xs">Unified Building Ecosystem</p>
      </div>

      <div className="w-full max-w-md">
        <div className="flex bg-white p-2 rounded-[2.5rem] shadow-sm border border-slate-200 mb-8">
          <button 
            onClick={() => { setView('portal'); setError(''); }}
            className={`flex-1 py-4 text-sm font-black uppercase tracking-widest rounded-[2rem] transition-all ${view === 'portal' ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Building Portal
          </button>
          <button 
            onClick={() => { setView('admin'); setError(''); }}
            className={`flex-1 py-4 text-sm font-black uppercase tracking-widest rounded-[2rem] transition-all ${view === 'admin' ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Management
          </button>
        </div>

        <div className="bg-white rounded-[3.5rem] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.1)] p-8 md:p-12 border border-slate-100">
          {view === 'portal' ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="text-center mb-10">
                <h2 className="text-3xl font-black text-slate-800 tracking-tight">Access Portal</h2>
                <p className="text-sm text-slate-400 font-bold uppercase tracking-widest mt-2">Enter credentials to proceed</p>
              </div>

              <form onSubmit={handlePortalLogin} className="space-y-6">
                <div className="grid grid-cols-3 gap-3 mb-8">
                  {[
                    { id: UserRole.RESIDENT, label: 'Resident', icon: '🏠' },
                    { id: UserRole.SECURITY, label: 'Security', icon: '👮' },
                    { id: UserRole.BUILDING_ADMIN, label: 'Secretary', icon: '🏢' }
                  ].map(r => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRole(r.id)}
                      className={`flex flex-col items-center py-5 rounded-3xl border-2 transition-all ${role === r.id ? 'border-indigo-600 bg-indigo-50 text-indigo-600 shadow-sm' : 'border-slate-50 bg-slate-50 text-slate-400 hover:border-slate-200'}`}
                    >
                      <span className="text-2xl mb-2">{r.icon}</span>
                      <span className="text-[10px] font-black uppercase tracking-widest">{r.label}</span>
                    </button>
                  ))}
                </div>

                <div className="space-y-5">
                  <div className="relative" ref={dropdownRef}>
                    <div 
                      onClick={() => !fetchingBuildings && setIsDropdownOpen(!isDropdownOpen)}
                      className={`w-full px-6 py-5 bg-slate-50 border rounded-2xl cursor-pointer flex justify-between items-center transition-all ${selectedBuilding ? 'border-indigo-300 ring-2 ring-indigo-500/5' : 'border-slate-200'} ${fetchingBuildings ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <span className={`text-sm font-bold ${selectedBuilding ? 'text-indigo-900' : 'text-slate-500'}`}>
                        {fetchingBuildings ? 'Syncing Buildings...' : selectedBuilding ? selectedBuilding.name : 'Find your building...'}
                      </span>
                      <span className="text-slate-400">{fetchingBuildings ? '⏳' : '▼'}</span>
                    </div>

                    {isDropdownOpen && (
                      <div className="absolute z-50 w-full mt-2 bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-3 border-b border-slate-50 bg-slate-50/50 flex gap-2">
                          <input 
                            autoFocus
                            type="text"
                            placeholder="Type to search..."
                            className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none text-sm font-bold focus:ring-2 focus:ring-indigo-500/20"
                            value={buildingSearch}
                            onChange={(e) => setBuildingSearch(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="max-h-64 overflow-y-auto py-2">
                          {filteredBuildings.length > 0 ? (
                            filteredBuildings.map(b => (
                              <button
                                key={b.id}
                                type="button"
                                onClick={() => {
                                  setSelectedBuilding(b);
                                  setIsDropdownOpen(false);
                                  setBuildingSearch('');
                                  setError('');
                                }}
                                className="w-full px-6 py-4 text-left text-sm font-bold hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                              >
                                {b.name}
                              </button>
                            ))
                          ) : (
                            <div className="px-6 py-12 text-center text-xs text-slate-400 font-bold uppercase tracking-widest">
                              Building Not Found
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <input 
                    type="text"
                    required
                    placeholder="Full Name"
                    className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 outline-none text-sm font-bold"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />

                  {role === UserRole.RESIDENT && (
                    <input 
                      type="text"
                      required
                      placeholder="Flat Number (e.g. A-101)"
                      className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 outline-none text-sm font-bold"
                      value={flatNumber}
                      onChange={(e) => setFlatNumber(e.target.value)}
                    />
                  )}

                  <div className="relative group">
                    <input 
                      type="password"
                      required
                      placeholder="Access Key"
                      className="w-full px-6 py-5 bg-indigo-50 border border-indigo-100 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 outline-none text-base font-mono tracking-[0.4em] text-indigo-900 placeholder:tracking-normal placeholder:font-sans placeholder:text-sm"
                      value={accessCode}
                      onChange={(e) => setAccessCode(e.target.value)}
                    />
                    <div className="absolute right-6 top-5 text-indigo-300">🔑</div>
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-red-50 text-red-600 text-xs font-black uppercase tracking-widest rounded-2xl border border-red-100 text-center leading-relaxed">
                    {error}
                  </div>
                )}

                <button 
                  type="submit"
                  disabled={loading || !selectedBuilding}
                  className="w-full py-6 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-[2rem] shadow-2xl shadow-indigo-100 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-[0.2em] text-sm mt-8"
                >
                  {loading ? 'Authenticating...' : 'Enter Dashboard'}
                </button>
              </form>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-black text-slate-800 tracking-tight">Admin Terminal</h2>
                <p className="text-sm text-slate-400 font-bold uppercase tracking-widest mt-2">Management Authentication</p>
              </div>

              <form onSubmit={handleAdminLogin} className="space-y-8">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Email Identifier</label>
                  <input 
                    type="email"
                    required
                    placeholder="admin@urbangate.com"
                    className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-3xl focus:ring-4 focus:ring-slate-900/10 outline-none text-sm font-bold text-slate-800"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Secure Password</label>
                  <input 
                    type="password"
                    required
                    placeholder="••••••••"
                    className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-3xl focus:ring-4 focus:ring-slate-900/10 outline-none text-sm font-bold text-slate-800"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                  />
                </div>

                {error && (
                  <div className="p-4 bg-red-50 text-red-600 text-xs font-black uppercase tracking-widest rounded-2xl border border-red-100 text-center">
                    {error}
                  </div>
                )}

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full py-6 bg-slate-900 hover:bg-black text-white font-black rounded-[2.5rem] shadow-2xl shadow-slate-300 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-[0.3em] text-sm"
                >
                  {loading ? 'Granting Access...' : 'Management Login'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      <footer className="mt-16 text-slate-400 text-xs font-black uppercase tracking-[0.5em] opacity-40">
        UrbanGate Unified v5.0.0
      </footer>
    </div>
  );
};

export default Login;
