
import React, { useState } from 'react';
import { UserRole } from '../types';
import { supabase } from '../lib/supabase';

interface LoginProps {
  onLoginSuccess: (userId: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [view, setView] = useState<'portal' | 'admin'>('portal');
  const [role, setRole] = useState<UserRole>(UserRole.RESIDENT);
  const [buildingName, setBuildingName] = useState('');
  const [fullName, setFullName] = useState('');
  const [wing, setWing] = useState('');
  const [flatNumber, setFlatNumber] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(() => {
    return sessionStorage.getItem('urbangate_auth_error') === 'identity_mismatch';
  });

  const handlePortalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 1. Resolve Building
      const { data: bld, error: bldErr } = await supabase
        .from('buildings')
        .select('*')
        .ilike('name', buildingName.trim())
        .maybeSingle();

      if (bldErr || !bld) throw new Error('Building not found. Please verify the name.');

      // 2. Validate Access Key
      let isCodeValid = false;
      if (role === UserRole.RESIDENT && accessCode === bld.resident_code) isCodeValid = true;
      if (role === UserRole.SECURITY && accessCode === bld.security_code) isCodeValid = true;
      if (role === UserRole.BUILDING_ADMIN && accessCode === bld.admin_code) isCodeValid = true;
      if (!isCodeValid) throw new Error(`Invalid access key for ${role} status.`);

      // 3. Create Unit-Locked Identity
      const wingId = role === UserRole.RESIDENT ? wing.trim().toUpperCase() : 'STAFF';
      const flatId = role === UserRole.RESIDENT ? flatNumber.trim() : role;
      const slotIdentifier = `${bld.id}_${wingId}_${flatId}`.toLowerCase().replace(/[^a-z0-9]/g, '');
      const internalEmail = `${slotIdentifier}@urbangate.internal`;
      const internalPassword = `auth_${accessCode}_${bld.id}`;

      // 4. Authenticate Terminal
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

      if (!authData.user) throw new Error('Terminal authentication failed.');

      // 5. CRITICAL IDENTITY LOCK CHECK
      const { data: existingProfile, error: profileFetchError } = await supabase
        .from('profiles')
        .select('phone_number, is_verified')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (profileFetchError) throw new Error(`Identity Verification Failed: ${profileFetchError.message}`);

      if (role === UserRole.RESIDENT && existingProfile && existingProfile.phone_number) {
        const normalizedInput = phoneNumber.trim();
        const normalizedStored = existingProfile.phone_number.trim();

        if (normalizedStored !== normalizedInput) {
          // SECURITY VIOLATION: Phone Mismatch
          // We persist the error state in sessionStorage because supabase.auth.signOut() 
          // will trigger a re-render in App.tsx, which unmounts/remounts this component.
          sessionStorage.setItem('urbangate_auth_error', 'identity_mismatch');
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }
      }

      // Clear any previous error if check passes
      sessionStorage.removeItem('urbangate_auth_error');

      // 6. Secure Profile Sync
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: authData.user.id,
        role,
        building_id: bld.id,
        full_name: fullName.trim(),
        wing: role === UserRole.RESIDENT ? wing.trim().toUpperCase() : null,
        flat_number: role === UserRole.RESIDENT ? flatNumber.trim() : null,
        phone_number: role === UserRole.RESIDENT ? phoneNumber.trim() : null,
        is_verified: role === UserRole.RESIDENT ? (existingProfile?.is_verified ?? false) : true,
      });

      if (profileError) {
        await supabase.auth.signOut();
        if (profileError.code === '42P17') throw new Error('System Error: Infinite recursion. Run the SQL fix in Supabase.');
        throw new Error(`Profile Sync Failed: ${profileError.message}`);
      }

      onLoginSuccess(authData.user.id);

    } catch (err: any) {
      setError(err.message || 'Access denied.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: adminEmail,
        password: adminPassword,
      });
      if (authError) throw authError;
      if (data.user) onLoginSuccess(data.user.id);
    } catch (err: any) { setError('Invalid master credentials.'); } finally { setLoading(false); }
  };

  const closeSecurityModal = () => {
    sessionStorage.removeItem('urbangate_auth_error');
    setShowSecurityModal(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8 bg-slate-50 font-sans antialiased animate-fade-in relative overflow-hidden">
      {/* Background Accents */}
      <div className="absolute top-0 left-0 w-64 sm:w-96 h-64 sm:h-96 bg-indigo-500/5 rounded-full -ml-32 sm:-ml-48 -mt-32 sm:-mt-48 blur-3xl"></div>
      <div className="absolute bottom-0 right-0 w-64 sm:w-96 h-64 sm:h-96 bg-slate-900/5 rounded-full -mr-32 sm:-mr-48 -mb-32 sm:-mb-48 blur-3xl"></div>

      {/* Identity Conflict Modal */}
      {showSecurityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] sm:rounded-[3.5rem] shadow-2xl max-w-sm w-full p-8 sm:p-12 text-center border border-slate-100 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 sm:w-24 sm:h-24 bg-red-50 text-red-600 rounded-2xl sm:rounded-[2rem] flex items-center justify-center text-3xl sm:text-4xl mx-auto mb-6 sm:mb-8 shadow-sm border border-red-100">⚠️</div>
            <h2 className="heading-lg text-xl sm:text-2xl mb-3 sm:mb-4">Identity Mismatch</h2>
            <p className="text-slate-500 text-xs sm:text-sm leading-relaxed mb-8 sm:mb-10 font-medium">
              The phone number you entered is <span className="text-red-600 font-bold underline decoration-2">incorrect</span> for this unit.
              <br/><br/>
              To protect the resident, we have blocked this access attempt. Please use the original mobile number registered with this flat.
            </p>
            <button 
              onClick={closeSecurityModal}
              className="btn-primary w-full py-4 sm:py-5 bg-slate-900 hover:bg-slate-800"
            >
              Understand & Retry
            </button>
          </div>
        </div>
      )}

      <div className="mb-8 sm:mb-12 text-center relative z-10">
        <div className="w-16 h-16 sm:w-24 sm:h-24 bg-slate-900 text-white rounded-2xl sm:rounded-[2.5rem] flex items-center justify-center shadow-2xl mx-auto mb-6 sm:mb-8 text-3xl sm:text-4xl border border-white/10">🏢</div>
        <h1 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight">UrbanGate</h1>
        <p className="label-caps tracking-[0.3em] sm:tracking-[0.4em] mt-3 sm:mt-4 opacity-40 text-[8px] sm:text-[10px]">Zero Trust Access Control</p>
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="flex bg-white p-1.5 sm:p-2 rounded-2xl sm:rounded-[2rem] border border-slate-200 mb-8 sm:mb-10 shadow-sm">
          <button onClick={() => setView('portal')} className={`flex-1 py-3 sm:py-4 text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-xl sm:rounded-[1.5rem] transition-all duration-300 ${view === 'portal' ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:text-slate-600'}`}>Portal</button>
          <button onClick={() => setView('admin')} className={`flex-1 py-3 sm:py-4 text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-xl sm:rounded-[1.5rem] transition-all duration-300 ${view === 'admin' ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:text-slate-600'}`}>Master</button>
        </div>

        <div className="card-modern rounded-[2.5rem] sm:rounded-[4rem] p-6 sm:p-12">
          {view === 'portal' ? (
            <form onSubmit={handlePortalLogin} className="space-y-5 sm:space-y-6">
              <div className="flex gap-2 sm:gap-3 mb-8 sm:mb-10">
                {[
                  { id: UserRole.RESIDENT, label: 'Resident', icon: '🏠' },
                  { id: UserRole.SECURITY, label: 'Guard', icon: '🛡️' },
                  { id: UserRole.BUILDING_ADMIN, label: 'Admin', icon: '💼' }
                ].map(r => (
                  <button key={r.id} type="button" onClick={() => setRole(r.id)} className={`flex-1 py-4 sm:py-5 rounded-2xl sm:rounded-3xl border-2 transition-all duration-300 text-center ${role === r.id ? 'border-slate-900 bg-slate-900 text-white shadow-xl' : 'border-slate-50 bg-slate-50 text-slate-400 hover:border-slate-200'}`}>
                    <div className="text-xl sm:text-2xl mb-1 sm:mb-2">{r.icon}</div>
                    <div className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest">{r.label}</div>
                  </button>
                ))}
              </div>

              <div className="space-y-3 sm:space-y-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="label-caps ml-4 text-[8px] sm:text-[10px]">Building Name</label>
                  <input required className="input-modern" value={buildingName} onChange={(e) => setBuildingName(e.target.value)} placeholder="e.g. Royal Residency" />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="label-caps ml-4 text-[8px] sm:text-[10px]">Full Name</label>
                  <input required className="input-modern" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. John Doe" />
                </div>

                {role === UserRole.RESIDENT && (
                  <>
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                      <div className="space-y-1.5 sm:space-y-2">
                        <label className="label-caps ml-4 text-[8px] sm:text-[10px]">Wing</label>
                        <input required className="input-modern uppercase" value={wing} onChange={(e) => setWing(e.target.value)} placeholder="A" />
                      </div>
                      <div className="space-y-1.5 sm:space-y-2">
                        <label className="label-caps ml-4 text-[8px] sm:text-[10px]">Flat #</label>
                        <input required className="input-modern" value={flatNumber} onChange={(e) => setFlatNumber(e.target.value)} placeholder="101" />
                      </div>
                    </div>
                    <div className="space-y-1.5 sm:space-y-2">
                      <label className="label-caps ml-4 text-[8px] sm:text-[10px]">Mobile Number</label>
                      <input required type="tel" className="input-modern" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+91 00000 00000" />
                    </div>
                  </>
                )}
                
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="label-caps ml-4 text-[8px] sm:text-[10px]">Access Key</label>
                  <input type="password" required className="input-modern font-mono tracking-[0.2em] sm:tracking-[0.3em] text-center" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} placeholder="••••••" />
                </div>
              </div>

              {error && (
                <div className="p-4 sm:p-6 bg-red-50 text-red-600 text-[9px] sm:text-[10px] font-black uppercase text-center border border-red-100 rounded-xl sm:rounded-2xl leading-relaxed animate-shake">
                  ⚠️ {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full py-4 sm:py-6 text-xs sm:text-sm mt-2 sm:mt-4">
                {loading ? 'Validating Identity...' : 'Secure Login'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleAdminLogin} className="space-y-6 sm:space-y-8">
              <div className="space-y-4 sm:space-y-5">
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="label-caps ml-4 text-[8px] sm:text-[10px]">Master Email</label>
                  <input type="email" required className="input-modern" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@urbangate.com" />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="label-caps ml-4 text-[8px] sm:text-[10px]">Master Password</label>
                  <input type="password" required className="input-modern" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="••••••••" />
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full py-4 sm:py-6 text-xs sm:text-sm bg-slate-900 hover:bg-slate-800">
                {loading ? 'Authenticating...' : 'Login to Core'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
