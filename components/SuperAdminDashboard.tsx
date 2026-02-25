
import React, { useState, useEffect } from 'react';
import { Building } from '../types';
import { supabase } from '../lib/supabase';

interface Props {
  onLogout: () => void;
}

const SuperAdminDashboard: React.FC<Props> = ({ onLogout }) => {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newBuilding, setNewBuilding] = useState({
    name: '',
    address: '',
    resident_code: '',
    admin_code: '',
    security_code: ''
  });

  const fetchBuildings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('buildings')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      if (data) setBuildings(data);
    } catch (err: any) {
      console.error('Error fetching buildings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBuildings();
  }, []);

  const handleAddBuilding = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('buildings').insert([{
      name: newBuilding.name,
      address: newBuilding.address,
      resident_code: newBuilding.resident_code,
      admin_code: newBuilding.admin_code,
      security_code: newBuilding.security_code
    }]);

    if (error) {
      alert('Error creating building: ' + error.message);
    } else {
      await fetchBuildings();
      setIsAdding(false);
      setNewBuilding({
        name: '',
        address: '',
        resident_code: '',
        admin_code: '',
        security_code: ''
      });
    }
  };

  const deleteBuilding = async (id: string) => {
    if (confirm('Are you sure you want to delete this building account? All linked data will be lost.')) {
      const { error } = await supabase.from('buildings').delete().eq('id', id);
      if (error) {
        alert('Error deleting building: ' + error.message);
      } else {
        await fetchBuildings();
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans antialiased p-4 sm:p-8 md:p-12 animate-fade-in">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 sm:gap-8 mb-10 sm:mb-16">
          <div>
            <h1 className="heading-xl text-3xl sm:text-5xl mb-2 sm:mb-3">Super Admin</h1>
            <p className="label-caps tracking-[0.4em] opacity-40 text-[8px] sm:text-[10px]">Global Infrastructure Control</p>
          </div>
          <button onClick={onLogout} className="btn-danger w-full sm:w-auto px-6 sm:px-10 py-3 sm:py-5 text-[10px] sm:text-xs">
            Logout Session
          </button>
        </header>

        <div className="mb-8 sm:mb-12">
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className={`btn-base w-full sm:w-auto px-8 sm:px-12 py-4 sm:py-6 text-xs sm:text-sm font-black uppercase tracking-widest rounded-2xl sm:rounded-[2rem] shadow-2xl transition-all duration-300 ${isAdding ? 'bg-slate-200 text-slate-600 hover:bg-slate-300' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
          >
            {isAdding ? 'Cancel Action' : '+ Register New Building'}
          </button>
        </div>

        {isAdding && (
          <form onSubmit={handleAddBuilding} className="card-modern rounded-[2rem] sm:rounded-[4rem] p-6 sm:p-12 mb-10 sm:mb-16 grid md:grid-cols-2 gap-6 sm:gap-10 animate-in fade-in slide-in-from-top-8 duration-500">
            <div className="space-y-3 sm:space-y-4">
              <label className="label-caps ml-4 text-[8px] sm:text-[10px]">Building Identity</label>
              <input required className="input-modern" placeholder="e.g. Royal Residency" value={newBuilding.name} onChange={e => setNewBuilding({...newBuilding, name: e.target.value})} />
            </div>
            <div className="space-y-3 sm:space-y-4">
              <label className="label-caps ml-4 text-[8px] sm:text-[10px]">Physical Location</label>
              <input required className="input-modern" placeholder="e.g. 123 Main St, Mumbai" value={newBuilding.address} onChange={e => setNewBuilding({...newBuilding, address: e.target.value})} />
            </div>
            <div className="space-y-3 sm:space-y-4">
              <label className="label-caps ml-4 text-[8px] sm:text-[10px]">Resident Access Key</label>
              <input required className="input-modern font-mono tracking-widest" placeholder="RES-XXXX" value={newBuilding.resident_code} onChange={e => setNewBuilding({...newBuilding, resident_code: e.target.value})} />
            </div>
            <div className="space-y-3 sm:space-y-4">
              <label className="label-caps ml-4 text-[8px] sm:text-[10px]">Admin Access Key</label>
              <input required className="input-modern font-mono tracking-widest" placeholder="ADM-XXXX" value={newBuilding.admin_code} onChange={e => setNewBuilding({...newBuilding, admin_code: e.target.value})} />
            </div>
            <div className="space-y-3 sm:space-y-4">
              <label className="label-caps ml-4 text-[8px] sm:text-[10px]">Security Access Key</label>
              <input required className="input-modern font-mono tracking-widest" placeholder="SEC-XXXX" value={newBuilding.security_code} onChange={e => setNewBuilding({...newBuilding, security_code: e.target.value})} />
            </div>
            <div className="md:col-span-2 pt-4 sm:pt-6">
              <button type="submit" className="btn-primary w-full py-4 sm:py-6 text-xs sm:text-sm bg-emerald-600 hover:bg-emerald-700">Provision Infrastructure</button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 sm:py-40 gap-6 sm:gap-8 opacity-30">
            <div className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
            <p className="label-caps tracking-[0.4em] sm:tracking-[0.5em] text-[8px] sm:text-[10px]">Querying Building Ledger...</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:gap-8">
            {buildings.map(b => (
              <div key={b.id} className="card-modern rounded-[2rem] sm:rounded-[3.5rem] p-6 sm:p-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 sm:gap-10 group hover:scale-[1.01] transition-all duration-500">
                <div className="flex-1 w-full">
                  <h3 className="heading-lg text-2xl sm:text-3xl mb-1 sm:mb-2 group-hover:text-indigo-600 transition-colors">{b.name}</h3>
                  <p className="text-slate-500 font-medium text-base sm:text-lg opacity-70">{b.address}</p>
                  <div className="flex flex-wrap gap-3 sm:gap-4 mt-6 sm:mt-8">
                    <div className="flex-1 min-w-[120px] bg-slate-50 px-4 sm:px-6 py-3 sm:py-4 rounded-xl sm:rounded-2xl border border-slate-100 shadow-sm">
                      <span className="label-caps text-[7px] sm:text-[9px] text-indigo-500 mb-1 sm:mb-2 block">Resident</span>
                      <span className="font-mono font-black text-xs sm:text-sm text-indigo-900 tracking-widest">{b.resident_code}</span>
                    </div>
                    <div className="flex-1 min-w-[120px] bg-slate-50 px-4 sm:px-6 py-3 sm:py-4 rounded-xl sm:rounded-2xl border border-slate-100 shadow-sm">
                      <span className="label-caps text-[7px] sm:text-[9px] text-purple-500 mb-1 sm:mb-2 block">Admin</span>
                      <span className="font-mono font-black text-xs sm:text-sm text-purple-900 tracking-widest">{b.admin_code}</span>
                    </div>
                    <div className="flex-1 min-w-[120px] bg-slate-50 px-4 sm:px-6 py-3 sm:py-4 rounded-xl sm:rounded-2xl border border-slate-100 shadow-sm">
                      <span className="label-caps text-[7px] sm:text-[9px] text-emerald-500 mb-1 sm:mb-2 block">Security</span>
                      <span className="font-mono font-black text-xs sm:text-sm text-emerald-900 tracking-widest">{b.security_code}</span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => deleteBuilding(b.id)}
                  className="btn-danger w-full md:w-auto px-6 sm:px-8 py-3 sm:py-4 text-[8px] sm:text-[10px] md:opacity-0 group-hover:opacity-100 transition-all duration-300"
                >
                  Terminate Account
                </button>
              </div>
            ))}
            {buildings.length === 0 && (
              <div className="text-center py-24 sm:py-40 bg-white rounded-[2rem] sm:rounded-[4rem] border-4 border-dashed border-slate-100">
                <p className="label-caps tracking-[0.4em] sm:tracking-[0.6em] opacity-30 text-[8px] sm:text-[10px]">Infrastructure Ledger Empty</p>
              </div>
            )}
          </div>
        )}
        <footer className="mt-20 sm:mt-32 text-center">
          <p className="label-caps tracking-[0.6em] sm:tracking-[1em] opacity-20 text-[8px] sm:text-[10px]">UrbanGate Super Command v5.0.0</p>
        </footer>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
