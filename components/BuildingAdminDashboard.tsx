
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Notice, Amenity, Booking } from '../types';

interface Props {
  buildingId: string;
  onLogout: () => void;
}

const BuildingAdminDashboard: React.FC<Props> = ({ buildingId, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'notices' | 'amenities' | 'bookings'>('notices');
  const [notices, setNotices] = useState<Notice[]>([]);
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const [newNotice, setNewNotice] = useState({ title: '', content: '' });
  const [newAmenity, setNewAmenity] = useState({ name: '', description: '', capacity: 10, openTime: '06:00', closeTime: '22:00' });

  const fetchData = async () => {
    setLoading(true);
    const [noticesRes, amenitiesRes, bookingsRes] = await Promise.all([
      supabase.from('notices').select('*').eq('building_id', buildingId).order('created_at', { ascending: false }),
      supabase.from('amenities').select('*').eq('building_id', buildingId),
      supabase.from('bookings').select('*').eq('building_id', buildingId).order('date', { ascending: false })
    ]);

    if (noticesRes.data) setNotices(noticesRes.data);
    if (amenitiesRes.data) setAmenities(amenitiesRes.data);
    if (bookingsRes.data) setBookings(bookingsRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [buildingId]);

  const handlePostNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('notices').insert({
      title: newNotice.title,
      content: newNotice.content,
      building_id: buildingId
    });

    if (error) {
      alert('Error: ' + error.message);
    } else {
      fetchData();
      setNewNotice({ title: '', content: '' });
    }
  };

  const handleDeleteNotice = async (id: string) => {
    if (!confirm('Permanently delete this announcement?')) return;
    const { error } = await supabase.from('notices').delete().eq('id', id);
    if (error) alert(error.message);
    else fetchData();
  };

  const handleAddAmenity = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('amenities').insert({
      name: newAmenity.name,
      description: newAmenity.description,
      capacity: newAmenity.capacity,
      open_time: newAmenity.openTime,
      close_time: newAmenity.closeTime,
      building_id: buildingId
    });

    if (error) {
      alert('Error: ' + error.message);
    } else {
      fetchData();
      setNewAmenity({ name: '', description: '', capacity: 10, openTime: '06:00', closeTime: '22:00' });
    }
  };

  const handleDeleteAmenity = async (id: string) => {
    if (!confirm('Deleting this facility will also cancel all associated bookings. Proceed?')) return;
    const { error } = await supabase.from('amenities').delete().eq('id', id);
    if (error) alert(error.message);
    else fetchData();
  };

  const handleDeleteBooking = async (id: string) => {
    if (!confirm('Remove this booking record?')) return;
    const { error } = await supabase.from('bookings').delete().eq('id', id);
    if (error) alert(error.message);
    else fetchData();
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto font-inter bg-slate-50 min-h-screen">
      <header className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Admin Console</h1>
          <p className="text-slate-500 font-bold text-xs uppercase tracking-[0.2em] mt-2">Operational Control Center</p>
        </div>
        <button onClick={onLogout} className="px-6 py-3 text-xs font-black uppercase tracking-widest text-red-500 bg-white border border-red-50 shadow-sm rounded-xl hover:bg-red-50 transition-all">
          Logout
        </button>
      </header>

      <div className="flex bg-white p-2 rounded-2xl shadow-sm border border-slate-200 mb-10 w-fit">
        {(['notices', 'amenities', 'bookings'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-10 py-3.5 text-sm font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === tab ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4 opacity-20">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-black uppercase tracking-widest">Updating Control Panel...</p>
        </div>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-400">
          {activeTab === 'notices' && (
            <div className="grid md:grid-cols-3 gap-12">
              <div className="md:col-span-1">
                <h2 className="text-xl font-black text-slate-800 mb-8 tracking-tight">Post Announcement</h2>
                <form onSubmit={handlePostNotice} className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Subject</label>
                    <input required className="w-full p-5 bg-slate-50 border border-slate-100 rounded-xl outline-none font-bold text-base" value={newNotice.title} onChange={e => setNewNotice({...newNotice, title: e.target.value})} placeholder="Title of notice" />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Message Body</label>
                    <textarea required rows={5} className="w-full p-5 bg-slate-50 border border-slate-100 rounded-xl outline-none font-medium text-base leading-relaxed" value={newNotice.content} onChange={e => setNewNotice({...newNotice, content: e.target.value})} placeholder="Write details here..." />
                  </div>
                  <button type="submit" className="w-full py-5 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-lg hover:bg-indigo-700 transition-all">Publish Live</button>
                </form>
              </div>
              <div className="md:col-span-2">
                <h2 className="text-xl font-black text-slate-800 mb-8 tracking-tight">Active Broadcasts</h2>
                <div className="space-y-6">
                  {notices.map(n => (
                    <div key={n.id} className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-100 relative group">
                      <button 
                        onClick={() => handleDeleteNotice(n.id)}
                        className="absolute top-10 right-10 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-2 bg-slate-50 rounded-lg"
                        title="Delete Notice"
                      >
                        🗑️
                      </button>
                      <div className="flex justify-between items-start mb-6 pr-12">
                        <h3 className="font-black text-2xl text-slate-900 tracking-tight">{n.title}</h3>
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">{new Date(n.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="text-slate-600 font-medium text-lg leading-relaxed whitespace-pre-wrap">{n.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'amenities' && (
            <div className="grid md:grid-cols-3 gap-12">
              <div className="md:col-span-1">
                <h2 className="text-xl font-black text-slate-800 mb-8 tracking-tight">Configure Amenity</h2>
                <form onSubmit={handleAddAmenity} className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Facility Name</label>
                    <input required className="w-full p-5 bg-slate-50 border border-slate-100 rounded-xl outline-none font-bold text-base" value={newAmenity.name} onChange={e => setNewAmenity({...newAmenity, name: e.target.value})} placeholder="Gym, Pool, Lounge..." />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Max Capacity</label>
                    <input type="number" required className="w-full p-5 bg-slate-50 border border-slate-100 rounded-xl outline-none font-bold text-base" value={newAmenity.capacity} onChange={e => setNewAmenity({...newAmenity, capacity: parseInt(e.target.value)})} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Opens</label>
                      <input type="time" required className="w-full p-5 bg-slate-50 border border-slate-100 rounded-xl outline-none font-bold text-base" value={newAmenity.openTime} onChange={e => setNewAmenity({...newAmenity, openTime: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Closes</label>
                      <input type="time" required className="w-full p-5 bg-slate-50 border border-slate-100 rounded-xl outline-none font-bold text-base" value={newAmenity.closeTime} onChange={e => setNewAmenity({...newAmenity, closeTime: e.target.value})} />
                    </div>
                  </div>
                  <button type="submit" className="w-full py-5 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-lg transition-all">Enable Facility</button>
                </form>
              </div>
              <div className="md:col-span-2">
                <h2 className="text-xl font-black text-slate-800 mb-8 tracking-tight">Registered Facilities</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {amenities.map(a => (
                    <div key={a.id} className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-100 group relative">
                      <button 
                        onClick={() => handleDeleteAmenity(a.id)}
                        className="absolute top-6 right-6 p-2.5 bg-red-50 text-red-500 rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white shadow-sm"
                      >
                        🗑️
                      </button>
                      <h3 className="font-black text-2xl text-slate-900 tracking-tight group-hover:text-indigo-600 transition-colors">{a.name}</h3>
                      <div className="mt-6 flex flex-col gap-3">
                        <div className="flex justify-between items-center bg-slate-50 px-5 py-3 rounded-xl">
                          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Daily Hours</span>
                          <span className="text-sm font-black text-slate-900">{a.open_time} - {a.close_time}</span>
                        </div>
                        <div className="flex justify-between items-center bg-slate-50 px-5 py-3 rounded-xl">
                          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Limit</span>
                          <span className="text-sm font-black text-slate-900">{a.capacity} People</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'bookings' && (
            <div>
              <h2 className="text-xl font-black text-slate-800 mb-8 tracking-tight">Unified Reservation Ledger</h2>
              <div className="bg-white rounded-[2.5rem] shadow-sm overflow-hidden border border-slate-100">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50 border-b border-slate-100">
                    <tr>
                      <th className="px-10 py-6 text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Facility</th>
                      <th className="px-10 py-6 text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Resident</th>
                      <th className="px-10 py-6 text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Unit</th>
                      <th className="px-10 py-6 text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Date</th>
                      <th className="px-10 py-6 text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Duration</th>
                      <th className="px-10 py-6 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bookings.map(b => (
                      <tr key={b.id} className="hover:bg-indigo-50/30 transition-colors group">
                        <td className="px-10 py-8 text-base font-black text-slate-900">{amenities.find(a => a.id === b.amenity_id)?.name}</td>
                        <td className="px-10 py-8 text-base font-medium text-slate-600">{b.resident_name}</td>
                        <td className="px-10 py-8 text-base font-black text-indigo-600">{b.flat_number}</td>
                        <td className="px-10 py-8 text-base font-medium text-slate-600">{new Date(b.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                        <td className="px-10 py-8 text-base font-black text-slate-900">{b.start_time} - {b.end_time}</td>
                        <td className="px-10 py-8 text-center">
                          <button 
                            onClick={() => handleDeleteBooking(b.id)}
                            className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-red-500 hover:bg-white rounded-lg transition-all shadow-sm"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                    {bookings.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-10 py-24 text-center text-slate-300 font-black uppercase text-sm tracking-widest">No activity recorded</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BuildingAdminDashboard;
