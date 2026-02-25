
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Visitor, Profile } from '../types';

interface Props {
  buildingId: string;
  onLogout: () => void;
}

const SecurityDashboard: React.FC<Props> = ({ buildingId, onLogout }) => {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'scan' | 'list' | 'request'>('scan');
  const [inviteCode, setInviteCode] = useState('');
  const [requestForm, setRequestForm] = useState({ name: '', phone: '', wing: '', flatNumber: '', purpose: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
  
  const [residentProfile, setResidentProfile] = useState<Profile | null>(null);

  const refreshData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('visitors')
      .select('*')
      .eq('building_id', buildingId)
      .order('created_at', { ascending: false });
    
    if (data) setVisitors(data);
    setLoading(false);
  };

  useEffect(() => {
    refreshData();
    const channel = supabase
      .channel('security_realtime')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'visitors',
        filter: `building_id=eq.${buildingId}`
      }, () => refreshData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [buildingId]);

  useEffect(() => {
    const checkResident = async () => {
      const flat = requestForm.flatNumber.trim();
      const wing = requestForm.wing.trim().toUpperCase();
      
      if (flat.length >= 1) {
        let query = supabase
          .from('profiles')
          .select('*')
          .eq('building_id', buildingId)
          .eq('flat_number', flat);
        
        // If wing is provided, filter by it to be precise
        if (wing) {
          query = query.eq('wing', wing);
        }
        
        const { data, error } = await query.maybeSingle();
        
        if (error) {
          console.error('Lookup error:', error);
          setResidentProfile(null);
        } else {
          setResidentProfile(data || null);
        }
      } else {
        setResidentProfile(null);
      }
    };
    const timer = setTimeout(checkResident, 400);
    return () => clearTimeout(timer);
  }, [requestForm.flatNumber, requestForm.wing, buildingId]);

  const showFeedback = (type: 'success' | 'error' | 'info', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode || verifying) return;
    setVerifying(true);
    try {
      const { data } = await supabase
        .from('visitors')
        .select('*')
        .eq('building_id', buildingId)
        .eq('invite_code', inviteCode.trim())
        .eq('status', 'PENDING')
        .maybeSingle();

      if (!data) {
        showFeedback('error', 'INVALID OR EXPIRED PASS');
      } else {
        await supabase.from('visitors').update({ status: 'ENTERED', check_in_at: new Date().toISOString() }).eq('id', data.id);
        setInviteCode('');
        showFeedback('success', `ACCESS GRANTED: ${data.name.toUpperCase()}`);
        setActiveView('list');
      }
    } catch (err) {
      showFeedback('error', 'SYSTEM ERROR');
    } finally {
      setVerifying(false);
    }
  };

  const handleRequestEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!residentProfile || !residentProfile.is_verified) {
      showFeedback('error', 'RESIDENT NOT VERIFIED BY ADMIN');
      return;
    }
    setVerifying(true);
    try {
      const { data: visitorData, error } = await supabase.from('visitors').insert({
        name: requestForm.name.trim(),
        phone: requestForm.phone.trim(),
        flat_number: requestForm.flatNumber.trim(),
        purpose: requestForm.purpose.trim(),
        building_id: buildingId,
        type: 'WALK_IN',
        status: 'WAITING_APPROVAL'
      }).select().single();

      if (error) throw error;

      // Explicitly trigger the Edge Function for Telegram/Push notifications
      try {
        await supabase.functions.invoke('send-push', {
          body: { record: visitorData }
        });
      } catch (fnErr) {
        console.warn('Edge function trigger failed, relying on DB trigger:', fnErr);
      }
      
      showFeedback('info', `PINGING TELEGRAM FOR UNIT ${requestForm.flatNumber}`);
      setRequestForm({ name: '', phone: '', wing: '', flatNumber: '', purpose: '' });
      setActiveView('list');
    } catch (err: any) {
      showFeedback('error', 'INTERCOM FAILURE');
    } finally {
      setVerifying(false);
    }
  };

  const handleExit = async (id: string) => {
    await supabase.from('visitors').update({ status: 'EXITED', check_out_at: new Date().toISOString() }).eq('id', id);
    showFeedback('success', 'VISITOR EXITED');
    refreshData();
  };

  return (
    <div className="bg-[#0b0f19] min-h-screen text-slate-100 font-inter antialiased">
      <header className="bg-indigo-600 px-8 py-6 flex justify-between items-center shadow-2xl border-b border-white/10">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-xl">🛡️</div>
          <div>
            <h1 className="text-xl font-black tracking-tight uppercase leading-none">Security Core</h1>
            <p className="text-[9px] text-white/60 font-black tracking-widest uppercase mt-1">Terminal Active</p>
          </div>
        </div>
        <button onClick={onLogout} className="px-4 py-2 bg-black/20 hover:bg-black/40 text-[9px] font-black uppercase tracking-widest rounded-lg border border-white/5 transition-all">Logout</button>
      </header>

      <nav className="p-4 flex gap-2 max-w-4xl mx-auto mt-6 bg-slate-900/60 rounded-[2rem] border border-white/5">
        {[
          { id: 'scan', label: 'Pass', icon: '🎫' },
          { id: 'request', label: 'Alert', icon: '🔊' },
          { id: 'list', label: 'Logs', icon: '🗒️' }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveView(tab.id as any)}
            className={`flex-1 py-4 rounded-[1.5rem] font-black transition-all flex items-center justify-center gap-3 ${activeView === tab.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-800'}`}
          >
            <span className="text-lg">{tab.icon}</span>
            <span className="text-[10px] uppercase tracking-widest">{tab.label}</span>
          </button>
        ))}
      </nav>

      <main className="p-6 max-w-2xl mx-auto">
        {feedback && (
          <div className={`mb-6 p-5 rounded-2xl text-center font-black text-[10px] uppercase tracking-widest animate-in fade-in zoom-in duration-300 border-2 ${feedback.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : feedback.type === 'info' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
            {feedback.message}
          </div>
        )}

        {activeView === 'scan' && (
          <div className="bg-slate-900/80 p-10 rounded-[3rem] border border-white/10 text-center shadow-2xl">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 mb-8">Manual Code Entry</p>
            <form onSubmit={handleVerifyCode} className="space-y-8">
              <input type="text" placeholder="000000" maxLength={6} className="w-full bg-black/40 border-2 border-slate-700 rounded-2xl text-center py-10 text-5xl font-mono font-black tracking-[0.5em] focus:border-indigo-500 outline-none text-white shadow-inner" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
              <button type="submit" disabled={verifying} className="w-full py-6 bg-indigo-600 hover:bg-indigo-500 text-sm font-black rounded-2xl shadow-xl uppercase tracking-widest transition-all">
                {verifying ? 'Verifying...' : 'Validate Invite'}
              </button>
            </form>
          </div>
        )}

        {activeView === 'request' && (
          <form onSubmit={handleRequestEntry} className="bg-slate-900/80 p-8 rounded-[3rem] border border-white/10 space-y-6 shadow-2xl">
            <div className="flex justify-between items-start">
              <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Dispatch Intercom</h2>
              {residentProfile && (
                <div className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-tighter border ${residentProfile.is_verified ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                  {residentProfile.is_verified ? 'Resident Verified' : 'Resident Unverified'}
                </div>
              )}
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input required placeholder="Wing" className="bg-black/40 p-4 rounded-xl border border-white/10 focus:border-indigo-500 outline-none text-sm font-bold uppercase" value={requestForm.wing} onChange={e => setRequestForm({...requestForm, wing: e.target.value})} />
                <input required placeholder="Flat #" className="bg-black/40 p-4 rounded-xl border border-white/10 focus:border-indigo-500 outline-none text-sm font-bold" value={requestForm.flatNumber} onChange={e => setRequestForm({...requestForm, flatNumber: e.target.value})} />
              </div>
              <input required placeholder="Guest Full Name" className="w-full bg-black/40 p-4 rounded-xl border border-white/10 focus:border-indigo-500 outline-none text-sm font-bold" value={requestForm.name} onChange={e => setRequestForm({...requestForm, name: e.target.value})} />
              <input required placeholder="Reason for Visit" className="w-full bg-black/40 p-4 rounded-xl border border-white/10 focus:border-indigo-500 outline-none text-sm font-bold" value={requestForm.purpose} onChange={e => setRequestForm({...requestForm, purpose: e.target.value})} />
            </div>
            
            <button type="submit" disabled={verifying || !residentProfile?.is_verified} className={`w-full py-6 font-black rounded-2xl uppercase tracking-widest text-[11px] shadow-lg transition-all ${residentProfile?.is_verified ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
              {verifying ? 'Transmitting...' : 'Send Telegram Alert'}
            </button>
            {!residentProfile && requestForm.flatNumber && <p className="text-[9px] text-red-400 font-black uppercase tracking-widest text-center mt-2">Unit not found in directory</p>}
          </form>
        )}

        {activeView === 'list' && (
          <div className="space-y-4">
            <div className="relative mb-6">
              <input type="text" placeholder="Search visitors..." className="w-full bg-slate-900/60 border border-white/10 p-4 rounded-2xl outline-none text-xs font-medium focus:border-indigo-500 transition-all pl-12 shadow-inner" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              <span className="absolute left-4 top-4 opacity-40">🔍</span>
            </div>
            {visitors.filter(v => v.name.toLowerCase().includes(searchQuery.toLowerCase())).map(v => (
              <div key={v.id} className="bg-slate-900/60 p-5 rounded-[2rem] border border-white/5 flex items-center gap-5 group hover:bg-slate-800/80 transition-all">
                <div className="w-12 h-12 bg-black/40 rounded-2xl flex items-center justify-center text-lg shadow-inner">
                  {v.status === 'ENTERED' ? '✅' : v.status === 'EXITED' ? '⬅️' : '⏳'}
                </div>
                <div className="flex-1">
                  <h3 className="text-xs font-black uppercase tracking-tight">{v.name}</h3>
                  <p className="text-slate-500 text-[9px] font-bold uppercase tracking-widest mt-1">Unit {v.flat_number} • {v.purpose}</p>
                </div>
                {v.status === 'ENTERED' ? (
                  <button onClick={() => handleExit(v.id)} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-[8px] font-black uppercase tracking-widest rounded-lg shadow-lg active:scale-95 transition-all">Checkout</button>
                ) : (
                  <div className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border ${v.status === 'WAITING_APPROVAL' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 animate-pulse' : 'bg-slate-800 text-slate-500 border-white/5'}`}>{v.status === 'WAITING_APPROVAL' ? 'Pending' : v.status}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default SecurityDashboard;
