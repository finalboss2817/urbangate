
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
    <div className="p-6 md:p-12 max-w-7xl mx-auto font-inter bg-slate-50 min-h-screen">
      <header className="flex justify-between items-center mb-12">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Super Admin</h1>
          <p className="text-slate-500 font-bold text-sm uppercase tracking-[0.2em] mt-2">Global Infrastructure Control</p>
        </div>
        <button onClick={onLogout} className="px-8 py-4 text-xs font-black uppercase tracking-widest text-red-600 bg-white border border-red-50 shadow-sm rounded-2xl hover:bg-red-50 transition-all">
          Logout Session
        </button>
      </header>

      <div className="mb-10">
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className={`px-10 py-5 ${isAdding ? 'bg-slate-200 text-slate-600' : 'bg-indigo-600 text-white'} text-sm font-black uppercase tracking-widest rounded-2xl shadow-xl transition-all active:scale-95`}
        >
          {isAdding ? 'Cancel Action' : '+ Register New Building'}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleAddBuilding} className="bg-white p-10 rounded-[3rem] shadow-2xl mb-12 grid md:grid-cols-2 gap-8 border border-slate-100 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="space-y-3">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Building Identity</label>
            <input required className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-lg" placeholder="Building Name" value={newBuilding.name} onChange={e => setNewBuilding({...newBuilding, name: e.target.value})} />
          </div>
          <div className="space-y-3">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Physical Location</label>
            <input required className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-lg" placeholder="Street Address" value={newBuilding.address} onChange={e => setNewBuilding({...newBuilding, address: e.target.value})} />
          </div>
          <div className="space-y-3">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Resident Access Key</label>
            <input required className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-mono font-bold text-lg tracking-widest" placeholder="Code" value={newBuilding.resident_code} onChange={e => setNewBuilding({...newBuilding, resident_code: e.target.value})} />
          </div>
          <div className="space-y-3">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Admin Access Key</label>
            <input required className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-mono font-bold text-lg tracking-widest" placeholder="Code" value={newBuilding.admin_code} onChange={e => setNewBuilding({...newBuilding, admin_code: e.target.value})} />
          </div>
          <div className="space-y-3">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Security Access Key</label>
            <input required className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-mono font-bold text-lg tracking-widest" placeholder="Code" value={newBuilding.security_code} onChange={e => setNewBuilding({...newBuilding, security_code: e.target.value})} />
          </div>
          <div className="md:col-span-2 pt-4">
            <button type="submit" className="w-full py-6 bg-emerald-600 text-white font-black text-sm uppercase tracking-[0.2em] rounded-[2rem] shadow-2xl hover:bg-emerald-700 transition-all">Provision Infrastructure</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-6 opacity-30">
          <div className="w-14 h-14 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-black uppercase tracking-widest">Querying Building Ledger...</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {buildings.map(b => (
            <div key={b.id} className="bg-white p-10 rounded-[3rem] shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center border border-slate-100 group hover:shadow-xl transition-all">
              <div className="flex-1">
                <h3 className="text-2xl font-black text-slate-900 tracking-tight group-hover:text-indigo-600 transition-colors">{b.name}</h3>
                <p className="text-slate-500 font-medium text-lg mt-1">{b.address}</p>
                <div className="flex flex-wrap gap-4 mt-6">
                  <div className="bg-slate-50 px-5 py-3 rounded-xl border border-slate-100">
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-1">Resident</span>
                    <span className="font-mono font-bold text-sm text-indigo-900 tracking-wider">{b.resident_code}</span>
                  </div>
                  <div className="bg-slate-50 px-5 py-3 rounded-xl border border-slate-100">
                    <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest block mb-1">Admin</span>
                    <span className="font-mono font-bold text-sm text-purple-900 tracking-wider">{b.admin_code}</span>
                  </div>
                  <div className="bg-slate-50 px-5 py-3 rounded-xl border border-slate-100">
                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest block mb-1">Security</span>
                    <span className="font-mono font-bold text-sm text-emerald-900 tracking-wider">{b.security_code}</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => deleteBuilding(b.id)}
                className="mt-8 md:mt-0 p-4 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-sm"
              >
                Terminate Account
              </button>
            </div>
          ))}
          {buildings.length === 0 && (
            <div className="text-center py-32 bg-white rounded-[4rem] border-4 border-dashed border-slate-100">
              <p className="text-slate-400 font-black uppercase tracking-[0.5em] text-sm italic">Infrastructure Ledger Empty</p>
            </div>
          )}
        </div>
      )}
      <footer className="mt-24 text-center text-slate-300 text-xs font-black uppercase tracking-[1em] opacity-40">UrbanGate Super Command v5.0.0</footer>
    </div>
  );
};

export default SuperAdminDashboard;
