
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

  const refreshData = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    const { data } = await supabase
      .from('visitors')
      .select('*')
      .eq('building_id', buildingId)
      .order('created_at', { ascending: false });
    
    if (data) setVisitors(data);
    if (!isSilent) setLoading(false);
  };

  useEffect(() => {
    refreshData();
    
    // Subscribe to ALL changes in the visitors table for this building
    const channel = supabase
      .channel(`security_node_${buildingId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'visitors',
        filter: `building_id=eq.${buildingId}`
      }, (payload) => {
        console.log('Change detected:', payload);
        if (payload.eventType === 'INSERT') {
          setVisitors(prev => [payload.new as Visitor, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as Visitor;
          setVisitors(prev => prev.map(v => v.id === updated.id ? updated : v));
        } else if (payload.eventType === 'DELETE') {
          setVisitors(prev => prev.filter(v => v.id !== payload.old.id));
        } else {
          refreshData(true);
        }
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(channel); 
    };
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
    <div className="bg-slate-50 min-h-screen font-sans antialiased animate-fade-in">
      <header className="bg-slate-900 px-4 sm:px-8 py-4 sm:py-6 flex justify-between items-center shadow-2xl sticky top-0 z-50">
        <div className="flex items-center gap-3 sm:gap-5">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/10 rounded-xl sm:rounded-2xl flex items-center justify-center text-xl sm:text-2xl backdrop-blur-sm border border-white/10">🛡️</div>
          <div>
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-white uppercase leading-none">Security Core</h1>
            <p className="text-[8px] sm:text-[9px] text-white/40 font-black tracking-widest uppercase mt-1 sm:mt-1.5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
              Terminal Active
            </p>
          </div>
        </div>
        <button onClick={onLogout} className="btn-danger py-2 px-4 sm:py-3 sm:px-6">
          <span className="hidden sm:inline">Sign Out</span>
          <span className="sm:hidden">Exit</span>
          <span className="text-lg">→</span>
        </button>
      </header>

      <nav className="p-1.5 sm:p-2 flex gap-2 max-w-2xl mx-auto mt-6 sm:mt-10 bg-white rounded-2xl sm:rounded-[2.5rem] border border-slate-200 shadow-sm sticky top-20 sm:top-24 z-40 mx-3 sm:mx-auto overflow-x-auto snap-x snap-mandatory touch-pan-x pb-2">
        {[
          { id: 'scan', label: 'Pass', icon: '🎫' },
          { id: 'request', label: 'Alert', icon: '🔊' },
          { id: 'list', label: 'Logs', icon: '🗒️' }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveView(tab.id as any)}
            className={`flex-shrink-0 min-w-[90px] sm:min-w-[110px] flex-1 py-3.5 sm:py-4 rounded-xl sm:rounded-[2rem] font-black transition-all duration-300 flex items-center justify-center gap-2 sm:gap-3 snap-center ${activeView === tab.id ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
          >
            <span className="text-base sm:text-lg">{tab.icon}</span>
            <span className="text-[9px] sm:text-[10px] uppercase tracking-widest">{tab.label}</span>
          </button>
        ))}
      </nav>

      <main className="p-4 sm:p-8 max-w-3xl mx-auto pb-20">
        {feedback && (
          <div className={`mb-6 sm:mb-8 p-4 sm:p-6 rounded-2xl sm:rounded-3xl text-center font-black text-[9px] sm:text-[10px] uppercase tracking-widest animate-in fade-in zoom-in duration-300 border-2 shadow-sm ${feedback.type === 'success' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : feedback.type === 'info' ? 'bg-slate-900 text-white border-slate-900' : 'bg-red-50 text-red-600 border-red-100'}`}>
            {feedback.message}
          </div>
        )}

        {activeView === 'scan' && (
          <div className="card-modern p-8 sm:p-12 rounded-[2.5rem] sm:rounded-[4rem] text-center">
            <p className="label-caps mb-8 sm:mb-10">Manual Code Entry</p>
            <form onSubmit={handleVerifyCode} className="space-y-8 sm:space-y-10">
              <div className="relative">
                <input type="text" placeholder="000000" maxLength={6} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl sm:rounded-[2.5rem] text-center py-8 sm:py-12 text-4xl sm:text-6xl font-mono font-black tracking-[0.4em] sm:tracking-[0.6em] focus:border-slate-900 focus:bg-white outline-none text-slate-900 shadow-inner transition-all" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
                <div className="absolute inset-x-0 -bottom-3 flex justify-center">
                  <span className="bg-white px-3 sm:px-4 text-[8px] sm:text-[9px] font-black text-slate-300 uppercase tracking-widest">6-Digit Passcode</span>
                </div>
              </div>
              <button type="submit" disabled={verifying} className="btn-primary w-full py-5 sm:py-6 text-sm">
                {verifying ? 'Verifying...' : 'Validate Invite'}
              </button>
            </form>
          </div>
        )}

        {activeView === 'request' && (
          <form onSubmit={handleRequestEntry} className="card-modern p-6 sm:p-10 rounded-[2.5rem] sm:rounded-[4rem] space-y-6 sm:space-y-8">
            <div className="flex justify-between items-center mb-2 sm:mb-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-50 rounded-xl sm:rounded-2xl flex items-center justify-center text-lg sm:text-xl">🔊</div>
                <h2 className="heading-lg text-lg sm:text-xl tracking-tight">Dispatch Intercom</h2>
              </div>
              {residentProfile && (
                <div className={`px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-widest border transition-all ${residentProfile.is_verified ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                  {residentProfile.is_verified ? 'Verified' : 'Unverified'}
                </div>
              )}
            </div>
            
            <div className="space-y-4 sm:space-y-5">
              <div className="grid grid-cols-2 gap-4 sm:gap-5">
                <div className="space-y-2">
                  <label className="label-caps ml-4">Wing</label>
                  <input required placeholder="e.g. A" className="input-modern uppercase" value={requestForm.wing} onChange={e => setRequestForm({...requestForm, wing: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="label-caps ml-4">Flat Number</label>
                  <input required placeholder="e.g. 101" className="input-modern" value={requestForm.flatNumber} onChange={e => setRequestForm({...requestForm, flatNumber: e.target.value})} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="label-caps ml-4">Guest Name</label>
                <input required placeholder="Full Name" className="input-modern" value={requestForm.name} onChange={e => setRequestForm({...requestForm, name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label className="label-caps ml-4">Purpose</label>
                <input required placeholder="e.g. Delivery, Guest" className="input-modern" value={requestForm.purpose} onChange={e => setRequestForm({...requestForm, purpose: e.target.value})} />
              </div>
            </div>
            
            <div className="pt-2 sm:pt-4">
              <button type="submit" disabled={verifying || !residentProfile?.is_verified} className={`btn-primary w-full py-5 sm:py-6 text-sm ${!residentProfile?.is_verified ? 'opacity-30 grayscale' : ''}`}>
                {verifying ? 'Transmitting...' : 'Send Telegram Alert'}
              </button>
              {!residentProfile && requestForm.flatNumber && (
                <p className="text-[9px] sm:text-[10px] text-red-500 font-black uppercase tracking-widest text-center mt-4 sm:mt-6 animate-pulse">Unit not found in directory</p>
              )}
            </div>
          </form>
        )}

        {activeView === 'list' && (
          <div className="space-y-6">
            <div className="relative mb-6 sm:mb-8">
              <input type="text" placeholder="Search visitor logs..." className="input-modern pl-14 sm:pl-16" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              <span className="absolute left-5 sm:left-6 top-1/2 -translate-y-1/2 text-lg sm:text-xl opacity-30">🔍</span>
            </div>
            <div className="space-y-4">
              {visitors.filter(v => v.name.toLowerCase().includes(searchQuery.toLowerCase())).map(v => (
                <div key={v.id} className="card-modern p-4 sm:p-6 rounded-2xl sm:rounded-[2.5rem] flex items-center gap-4 sm:gap-6 group hover:translate-x-1 transition-all">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 bg-slate-50 rounded-xl sm:rounded-2xl flex items-center justify-center text-xl sm:text-2xl shadow-inner border border-slate-100">
                    {v.status === 'ENTERED' ? '✅' : v.status === 'EXITED' ? '⬅️' : '⏳'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs sm:text-sm font-black uppercase tracking-tight text-slate-900 truncate">{v.name}</h3>
                    <p className="label-caps opacity-60 mt-1 sm:mt-1.5 text-[8px] sm:text-[9px] truncate">Unit {v.flat_number} • {v.purpose}</p>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3">
                    {v.status === 'ENTERED' ? (
                      <button onClick={() => handleExit(v.id)} className="btn-danger py-2 px-3 sm:px-5 rounded-lg sm:rounded-xl text-[8px] sm:text-[9px]">Checkout</button>
                    ) : (
                      <div className={`px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-widest border transition-all ${v.status === 'WAITING_APPROVAL' ? 'bg-slate-900 text-white border-slate-900 animate-pulse' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                        {v.status === 'WAITING_APPROVAL' ? 'Pending' : v.status}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {visitors.length === 0 && (
                <div className="py-24 sm:py-40 text-center bg-white rounded-[3rem] sm:rounded-[4rem] border-2 border-dashed border-slate-200">
                  <div className="text-4xl sm:text-5xl mb-4 sm:mb-6 grayscale opacity-30">🗒️</div>
                  <p className="label-caps tracking-[0.4em] px-6">No visitor records found</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default SecurityDashboard;
