
import React, { useState, useEffect } from 'react';
import { Building } from '../types';
// Import supabase for data persistence
import { supabase } from '../lib/supabase';

interface Props {
  onLogout: () => void;
}

const SuperAdminDashboard: React.FC<Props> = ({ onLogout }) => {
  // Use local state for buildings, initialized as an empty array
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

  // Fetch buildings from Supabase on component mount
  const fetchBuildings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('buildings')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching buildings:', error);
    } else if (data) {
      setBuildings(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBuildings();
  }, []);

  const handleAddBuilding = async (e: React.FormEvent) => {
    e.preventDefault();
    // Persist new building to Supabase
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
    if (confirm('Are you sure you want to delete this building account?')) {
      // Remove building from Supabase
      const { error } = await supabase.from('buildings').delete().eq('id', id);
      if (error) {
        alert('Error deleting building: ' + error.message);
      } else {
        await fetchBuildings();
      }
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Super Admin</h1>
          <p className="text-slate-500">Manage all building accounts</p>
        </div>
        <button onClick={onLogout} className="px-4 py-2 text-sm text-red-600 border border-red-600 rounded-lg hover:bg-red-50 transition-colors">
          Logout
        </button>
      </div>

      <div className="mb-6">
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow hover:bg-indigo-700 transition-all"
        >
          {isAdding ? 'Cancel' : '+ New Building'}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleAddBuilding} className="bg-white p-6 rounded-xl shadow-lg mb-8 grid md:grid-cols-2 gap-4 border border-slate-100">
          <div>
            <label className="block text-sm font-medium mb-1">Building Name</label>
            <input required className="w-full p-2 border rounded" value={newBuilding.name} onChange={e => setNewBuilding({...newBuilding, name: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Address</label>
            <input required className="w-full p-2 border rounded" value={newBuilding.address} onChange={e => setNewBuilding({...newBuilding, address: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Resident Code (Password)</label>
            <input required className="w-full p-2 border rounded" value={newBuilding.resident_code} onChange={e => setNewBuilding({...newBuilding, resident_code: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Admin Code</label>
            <input required className="w-full p-2 border rounded" value={newBuilding.admin_code} onChange={e => setNewBuilding({...newBuilding, admin_code: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Security Code</label>
            <input required className="w-full p-2 border rounded" value={newBuilding.security_code} onChange={e => setNewBuilding({...newBuilding, security_code: e.target.value})} />
          </div>
          <div className="md:col-span-2">
            <button type="submit" className="w-full py-2 bg-green-600 text-white font-bold rounded">Create Building Account</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-20 text-slate-400">Loading buildings...</div>
      ) : (
        <div className="grid gap-4">
          {buildings.map(b => (
            <div key={b.id} className="bg-white p-6 rounded-xl shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center border border-slate-100">
              <div>
                <h3 className="text-xl font-bold text-slate-800">{b.name}</h3>
                <p className="text-slate-500">{b.address}</p>
                <div className="flex gap-4 mt-2 text-xs font-mono bg-slate-50 p-2 rounded">
                  <span className="text-indigo-600">RES: {b.resident_code}</span>
                  <span className="text-purple-600">ADM: {b.admin_code}</span>
                  <span className="text-emerald-600">SEC: {b.security_code}</span>
                </div>
              </div>
              <button 
                onClick={() => deleteBuilding(b.id)}
                className="mt-4 md:mt-0 text-red-500 hover:underline"
              >
                Delete
              </button>
            </div>
          ))}
          {buildings.length === 0 && (
            <div className="text-center py-20 text-slate-400 italic">
              No buildings registered yet. Create one to get started.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SuperAdminDashboard;
