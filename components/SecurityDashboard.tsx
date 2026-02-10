
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Visitor } from '../types';

interface Props {
  buildingId: string;
  onLogout: () => void;
}

const SecurityDashboard: React.FC<Props> = ({ buildingId, onLogout }) => {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'scan' | 'list' | 'walkin'>('scan');
  const [inviteCode, setInviteCode] = useState('');
  const [walkinForm, setWalkinForm] = useState({ name: '', phone: '', flatNumber: '', purpose: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const refreshData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('visitors')
      .select('*')
      .eq('building_id', buildingId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching visitors:', error);
    } else if (data) {
      setVisitors(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    refreshData();
  }, [buildingId]);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode || verifying) return;

    setVerifying(true);
    try {
      const { data, error } = await supabase
        .from('visitors')
        .select('*')
        .eq('building_id', buildingId)
        .eq('invite_code', inviteCode.trim())
        .eq('status', 'PENDING')
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        showFeedback('error', 'CODE NOT FOUND OR ALREADY USED');
      } else {
        const { error: updateError } = await supabase
          .from('visitors')
          .update({ 
            status: 'ENTERED', 
            check_in_at: new Date().toISOString() 
          })
          .eq('id', data.id);

        if (updateError) throw updateError;
        
        setInviteCode('');
        showFeedback('success', `ACCESS GRANTED: ${data.name.toUpperCase()}`);
        setActiveView('list');
        await refreshData();
      }
    } catch (err: any) {
      showFeedback('error', 'VERIFICATION FAILED: ' + err.message);
    } finally {
      setVerifying(false);
    }
  };

  const handleWalkIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    try {
      const { error } = await supabase.from('visitors').insert({
        name: walkinForm.name.trim(),
        phone: walkinForm.phone.trim(),
        flat_number: walkinForm.flatNumber.trim(),
        purpose: walkinForm.purpose.trim(),
        building_id: buildingId,
        type: 'WALK_IN',
        status: 'ENTERED',
        check_in_at: new Date().toISOString()
      });

      if (error) throw error;
      
      showFeedback('success', 'WALK-IN ENTRY RECORDED');
      setWalkinForm({ name: '', phone: '', flatNumber: '', purpose: '' });
      setActiveView('list');
      await refreshData();
    } catch (err: any) {
      showFeedback('error', 'REGISTRATION FAILED');
    } finally {
      setVerifying(false);
    }
  };

  const handleExit = async (id: string) => {
    setVerifying(true);
    try {
      const { error } = await supabase
        .from('visitors')
        .update({ 
          status: 'EXITED', 
          check_out_at: new Date().toISOString() 
        })
        .eq('id', id);

      if (error) throw error;
      showFeedback('success', 'EXIT LOGGED');
      await refreshData();
    } catch (err) {
      showFeedback('error', 'EXIT FAILED');
    } finally {
      setVerifying(false);
    }
  };

  const filteredVisitors = visitors.filter(v => 
    v.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    v.flat_number.includes(searchQuery) ||
    (v.invite_code && v.invite_code.includes(searchQuery))
  );

  return (
    <div className="bg-[#0b0f19] min-h-screen text-slate-100 font-inter antialiased pb-20">
      {/* Top Header */}
      <header className="bg-indigo-600 px-8 py-6 flex justify-between items-center shadow-2xl sticky top-0 z-50">
        <div>
          <h1 className="text-2xl font-black tracking-tighter uppercase leading-none">Security Core</h1>
          <p className="text-xs text-indigo-100 font-bold tracking-[0.4em] opacity-80 mt-2">REAL-TIME COMMAND</p>
        </div>
        <button onClick={onLogout} className="px-6 py-3 bg-black/30 hover:bg-black/50 text-xs font-black uppercase tracking-widest rounded-xl border border-white/10 transition-all">
          Sign Out
        </button>
      </header>

      {/* Main Navigation */}
      <nav className="p-4 flex gap-3 max-w-4xl mx-auto mt-8 bg-slate-900/40 rounded-[2.5rem] border border-white/5">
        {[
          { id: 'scan', label: 'Verify Pass', icon: '🔐' },
          { id: 'walkin', label: 'Manual Log', icon: '📝' },
          { id: 'list', label: 'Traffic Hub', icon: '📋' }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveView(tab.id as any)}
            className={`flex-1 py-5 rounded-[2rem] font-black transition-all flex flex-col items-center justify-center gap-2 ${activeView === tab.id ? 'bg-indigo-600 text-white shadow-xl scale-105' : 'text-slate-500 hover:bg-slate-800'}`}
          >
            <span className="text-2xl">{tab.icon}</span>
            <span className="text-xs uppercase tracking-widest">{tab.label}</span>
          </button>
        ))}
      </nav>

      <main className="p-6 max-w-2xl mx-auto mt-6">
        {feedback && (
          <div className={`mb-8 p-6 rounded-3xl text-center font-black text-sm uppercase tracking-[0.2em] animate-in slide-in-from-top-4 border-4 shadow-2xl ${feedback.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
            {feedback.message}
          </div>
        )}

        {loading && activeView === 'list' ? (
          <div className="flex flex-col items-center justify-center py-48 gap-6 opacity-30">
            <div className="w-14 h-14 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-black uppercase tracking-[0.4em]">Syncing Ledger...</p>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            {activeView === 'scan' && (
              <div className="bg-slate-900/80 p-12 rounded-[4rem] border border-white/10 shadow-2xl backdrop-blur-xl">
                <div className="text-center mb-10">
                  <h2 className="text-lg font-black uppercase tracking-[0.5em] text-indigo-400 mb-3">Authentication Node</h2>
                  <p className="text-sm text-slate-400 font-bold uppercase tracking-widest leading-relaxed">Enter 6-digit visitor passcode</p>
                </div>
                <form onSubmit={handleVerifyCode} className="space-y-10">
                  <input 
                    type="text"
                    placeholder="000000"
                    maxLength={6}
                    className="w-full bg-black/60 border-4 border-slate-800 rounded-[3rem] text-center py-14 text-7xl font-mono font-black tracking-[0.8rem] focus:border-indigo-600 outline-none transition-all placeholder:text-slate-900 text-white shadow-inner"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                  />
                  <button 
                    type="submit"
                    disabled={verifying || inviteCode.length < 1}
                    className="w-full py-8 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-xl font-black rounded-[3rem] shadow-2xl transition-all active:scale-95 uppercase tracking-[0.3em]"
                  >
                    {verifying ? 'VERIFYING...' : 'AUTHORIZE ACCESS'}
                  </button>
                </form>
              </div>
            )}

            {activeView === 'walkin' && (
              <form onSubmit={handleWalkIn} className="bg-slate-900/80 p-10 rounded-[3.5rem] border border-white/10 space-y-8 shadow-2xl">
                <h2 className="text-lg font-black text-center mb-6 uppercase tracking-[0.5em] text-emerald-400">Manual Entry Registry</h2>
                <div className="grid gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Guest Identification</label>
                    <input required className="w-full bg-black/40 p-6 rounded-2xl border border-white/5 focus:border-emerald-500 outline-none text-xl font-bold placeholder:text-slate-700" value={walkinForm.name} onChange={e => setWalkinForm({...walkinForm, name: e.target.value})} placeholder="Legal Name" />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Unit #</label>
                      <input required className="w-full bg-black/40 p-6 rounded-2xl border border-white/5 focus:border-emerald-500 outline-none text-xl font-bold placeholder:text-slate-700" value={walkinForm.flatNumber} onChange={e => setWalkinForm({...walkinForm, flatNumber: e.target.value})} placeholder="E.g. 502" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Contact</label>
                      <input required className="w-full bg-black/40 p-6 rounded-2xl border border-white/5 focus:border-emerald-500 outline-none text-xl font-bold placeholder:text-slate-700" value={walkinForm.phone} onChange={e => setWalkinForm({...walkinForm, phone: e.target.value})} placeholder="Phone #" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Reason for Entry</label>
                    <input required className="w-full bg-black/40 p-6 rounded-2xl border border-white/5 focus:border-emerald-500 outline-none text-xl font-bold placeholder:text-slate-700" value={walkinForm.purpose} onChange={e => setWalkinForm({...walkinForm, purpose: e.target.value})} placeholder="Delivery, Guest, Service..." />
                  </div>
                </div>
                <button type="submit" disabled={verifying} className="w-full py-8 bg-emerald-600 hover:bg-emerald-500 text-xl font-black rounded-[3rem] transition-all active:scale-95 mt-4 uppercase tracking-[0.3em] shadow-xl shadow-emerald-900/20">
                  {verifying ? 'PROCESSING...' : 'GRANT CLEARANCE'}
                </button>
              </form>
            )}

            {activeView === 'list' && (
              <div className="space-y-8">
                <div className="relative">
                  <input 
                    type="text"
                    placeholder="Search visitor logs..."
                    className="w-full bg-slate-900/60 border border-white/10 p-6 rounded-3xl outline-none text-lg font-medium focus:border-indigo-500 transition-all pl-16 shadow-inner placeholder:text-slate-700"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <span className="absolute left-6 top-6 text-2xl opacity-40">🔍</span>
                </div>
                
                <div className="space-y-4">
                  {filteredVisitors.map(v => (
                    <div key={v.id} className="bg-slate-900/60 p-6 rounded-[2.5rem] border border-white/5 flex items-center gap-8 group hover:bg-slate-800 transition-all">
                      <div className="flex flex-col items-center justify-center min-w-[85px] h-[85px] bg-slate-950 rounded-3xl border border-white/10 shadow-inner">
                        <span className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">UNIT</span>
                        <span className="text-2xl font-black text-white">{v.flat_number}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-black truncate text-white tracking-tight leading-tight">{v.name}</h3>
                          <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${v.type === 'WALK_IN' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
                            {v.type}
                          </span>
                        </div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-[0.1em] leading-relaxed mb-2">{v.purpose} • {v.phone}</p>
                        <div className="flex gap-5 text-xs font-black uppercase opacity-50 tracking-widest">
                          {v.check_in_at && <span>Entry: {new Date(v.check_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                          {v.check_out_at && <span>Exit: {new Date(v.check_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-3">
                        {v.status === 'ENTERED' ? (
                          <button 
                            onClick={() => handleExit(v.id)} 
                            disabled={verifying}
                            className="px-6 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-xs font-black uppercase tracking-widest rounded-xl shadow-xl shadow-red-900/40 transition-all active:scale-95"
                          >
                            Mark Exit
                          </button>
                        ) : (
                          <div className={`px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest border ${
                            v.status === 'EXITED' ? 'bg-slate-800 text-slate-500 border-white/5' : 
                            v.status === 'PENDING' ? 'bg-amber-600/10 text-amber-500 border-amber-600/30' : 
                            'bg-red-900/20 text-red-500 border-red-900/30'
                          }`}>
                            {v.status}
                          </div>
                        )}
                        {v.invite_code && <span className="text-xs font-mono text-indigo-400/60 font-black tracking-[0.2em]">ID:{v.invite_code}</span>}
                      </div>
                    </div>
                  ))}

                  {filteredVisitors.length === 0 && (
                    <div className="text-center py-32 bg-slate-900/20 rounded-[4rem] border-4 border-dashed border-white/5">
                      <p className="text-slate-700 font-black uppercase tracking-[0.6em] text-sm">No Traffic Records</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="mt-16 text-center text-slate-800 text-xs font-black uppercase tracking-[1em] opacity-30">
        URBANGATE COMMAND v5.0.0
      </footer>
    </div>
  );
};

export default SecurityDashboard;
