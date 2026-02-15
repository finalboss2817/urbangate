
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
  const [showSecurityModal, setShowSecurityModal] = useState(false);

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
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('phone_number, is_verified')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (role === UserRole.RESIDENT && existingProfile && existingProfile.phone_number) {
        const normalizedInput = phoneNumber.trim();
        const normalizedStored = existingProfile.phone_number.trim();

        if (normalizedStored !== normalizedInput) {
          // SECURITY VIOLATION: Phone Mismatch
          await supabase.auth.signOut();
          setShowSecurityModal(true);
          setLoading(false);
          return;
        }
      }

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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 font-inter relative">
      {/* Identity Conflict Modal */}
      {showSecurityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-sm w-full p-10 text-center border border-slate-100 animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-red-100 text-red-600 rounded-3xl flex items-center justify-center text-3xl mx-auto mb-6 shadow-sm">⚠️</div>
            <h2 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">Identity Mismatch</h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-8 font-medium">
              The phone number you entered is <span className="text-red-600 font-bold underline decoration-2">incorrect</span> for this unit.
              <br/><br/>
              To protect the resident, we have blocked this access attempt. Please use the original mobile number registered with this flat.
            </p>
            <button 
              onClick={() => setShowSecurityModal(false)}
              className="w-full py-5 bg-slate-900 text-white font-black rounded-2xl uppercase tracking-widest text-[10px] shadow-lg hover:bg-slate-800 transition-all"
            >
              Understand & Retry
            </button>
          </div>
        </div>
      )}

      <div className="mb-10 text-center">
        <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl mx-auto mb-6 text-3xl">🏢</div>
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">UrbanGate</h1>
        <p className="text-slate-400 font-bold uppercase text-[9px] tracking-[0.3em] mt-2">Zero Trust Access Control</p>
      </div>

      <div className="w-full max-w-md">
        <div className="flex bg-white p-2 rounded-2xl border border-slate-200 mb-8">
          <button onClick={() => setView('portal')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${view === 'portal' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400'}`}>Standard Access</button>
          <button onClick={() => setView('admin')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${view === 'admin' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400'}`}>Master Admin</button>
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-sm p-10 border border-slate-100">
          {view === 'portal' ? (
            <form onSubmit={handlePortalLogin} className="space-y-5">
              <div className="flex gap-2 mb-6">
                {[
                  { id: UserRole.RESIDENT, label: 'Resident', icon: '🏠' },
                  { id: UserRole.SECURITY, label: 'Guard', icon: '🛡️' },
                  { id: UserRole.BUILDING_ADMIN, label: 'Admin', icon: '💼' }
                ].map(r => (
                  <button key={r.id} type="button" onClick={() => setRole(r.id)} className={`flex-1 py-4 rounded-2xl border-2 transition-all text-center ${role === r.id ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'border-slate-50 text-slate-400'}`}>
                    <div className="text-xl mb-1">{r.icon}</div>
                    <div className="text-[8px] font-black uppercase">{r.label}</div>
                  </button>
                ))}
              </div>

              <input required placeholder="Building Name" className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-xl font-bold" value={buildingName} onChange={(e) => setBuildingName(e.target.value)} />
              <input required placeholder="Full Name" className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-xl font-bold" value={fullName} onChange={(e) => setFullName(e.target.value)} />

              {role === UserRole.RESIDENT && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <input required placeholder="Wing" className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-xl font-bold uppercase" value={wing} onChange={(e) => setWing(e.target.value)} />
                    <input required placeholder="Flat #" className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-xl font-bold" value={flatNumber} onChange={(e) => setFlatNumber(e.target.value)} />
                  </div>
                  <input required type="tel" placeholder="Registered Mobile Number" className="w-full px-6 py-4 bg-indigo-50 border border-indigo-100 rounded-xl font-bold" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
                </>
              )}
              
              <input type="password" required placeholder="Access Key" className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-xl font-mono tracking-widest font-black" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} />

              {error && (
                <div className="p-4 bg-red-50 text-red-500 text-[10px] font-black uppercase text-center border border-red-100 rounded-xl leading-relaxed">
                  ⚠️ {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="w-full py-5 bg-indigo-600 text-white font-black rounded-2xl uppercase tracking-widest text-[10px] shadow-lg active:scale-95 transition-all">
                {loading ? 'Validating Identity...' : 'Secure Login'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleAdminLogin} className="space-y-6">
              <input type="email" required placeholder="Master Email" className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-xl font-bold" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
              <input type="password" required placeholder="Master Password" className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-xl font-bold" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} />
              <button type="submit" disabled={loading} className="w-full py-5 bg-slate-900 text-white font-black rounded-2xl uppercase tracking-widest text-[10px] shadow-lg">Login to Core</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
