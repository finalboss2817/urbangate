
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Notice, Amenity, Booking, Profile, Achievement } from '../types';

interface Props {
  buildingId: string;
  onLogout: () => void;
}

const BuildingAdminDashboard: React.FC<Props> = ({ buildingId, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'notices' | 'amenities' | 'bookings' | 'residents' | 'achievements'>('notices');
  const [notices, setNotices] = useState<Notice[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [residents, setResidents] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [newNotice, setNewNotice] = useState({ title: '', content: '' });
  const [newAchievement, setNewAchievement] = useState({ title: '', content: '', image_url: '' });
  const [newAmenity, setNewAmenity] = useState({ name: '', description: '', capacity: 10, openTime: '06:00', closeTime: '22:00' });

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [noticesRes, achievementsRes, amenitiesRes, bookingsRes, residentsRes] = await Promise.all([
        supabase.from('notices').select('*').eq('building_id', buildingId).order('created_at', { ascending: false }),
        supabase.from('achievements').select('*').eq('building_id', buildingId).order('created_at', { ascending: false }),
        supabase.from('amenities').select('*').eq('building_id', buildingId),
        supabase.from('bookings').select('*').eq('building_id', buildingId).order('date', { ascending: false }),
        supabase.from('profiles').select('*').eq('building_id', buildingId).eq('role', 'RESIDENT').order('is_verified', { ascending: true })
      ]);

      if (noticesRes.data) setNotices(noticesRes.data);
      if (achievementsRes.data) setAchievements(achievementsRes.data);
      if (amenitiesRes.data) setAmenities(amenitiesRes.data);
      if (bookingsRes.data) setBookings(bookingsRes.data);
      if (residentsRes.data) setResidents(residentsRes.data);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    const channel = supabase
      .channel('admin_hub_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `building_id=eq.${buildingId}` }, () => fetchData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'achievements', filter: `building_id=eq.${buildingId}` }, () => fetchData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notices', filter: `building_id=eq.${buildingId}` }, () => fetchData(true))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [buildingId]);

  const handleVerifyResident = async (id: string, isVerified: boolean) => {
    const { error } = await supabase.from('profiles').update({ is_verified: isVerified }).eq('id', id);
    if (error) alert(error.message);
    else fetchData(true);
  };

  const handlePostNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return; 
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('notices').insert({ ...newNotice, building_id: buildingId });
      if (error) alert(error.message);
      else { fetchData(true); setNewNotice({ title: '', content: '' }); }
    } finally { setIsSubmitting(false); }
  };

  const handlePostAchievement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('achievements').insert({
        ...newAchievement,
        building_id: buildingId
      });
      if (error) alert(error.message);
      else {
        fetchData(true);
        setNewAchievement({ title: '', content: '', image_url: '' });
      }
    } finally { setIsSubmitting(false); }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert("File too large (Max 2MB)"); return; }
    const reader = new FileReader();
    reader.onloadend = () => setNewAchievement(prev => ({ ...prev, image_url: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const handleDeleteNotice = async (id: string) => {
    if (!confirm('Permanently delete notice?')) return;
    const { error } = await supabase.from('notices').delete().eq('id', id);
    if (error) alert(error.message); else fetchData(true);
  };

  const handleDeleteAchievement = async (id: string) => {
    if (!confirm('Permanently delete this achievement?')) return;
    const { error } = await supabase.from('achievements').delete().eq('id', id);
    if (error) alert(error.message); else fetchData(true);
  };

  const handleAddAmenity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('amenities').insert({ ...newAmenity, building_id: buildingId });
      if (error) alert(error.message);
      else { fetchData(true); setNewAmenity({ name: '', description: '', capacity: 10, openTime: '06:00', closeTime: '22:00' }); }
    } finally { setIsSubmitting(false); }
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto font-inter bg-slate-50 min-h-screen">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Management</h1>
          <p className="text-slate-500 font-bold text-xs uppercase tracking-[0.2em] mt-2">UrbanGate Control Suite</p>
        </div>
        <button onClick={onLogout} className="px-6 py-3 text-xs font-black uppercase tracking-widest text-red-500 bg-white border border-red-50 shadow-sm rounded-xl hover:bg-red-50 transition-all">
          Logout
        </button>
      </header>

      <nav className="flex bg-white p-2 rounded-2xl shadow-sm border border-slate-200 mb-10 w-full overflow-x-auto gap-2 no-scrollbar">
        {(['notices', 'achievements', 'amenities', 'bookings', 'residents'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-shrink-0 px-8 py-3.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === tab ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
          >
            {tab === 'residents' && residents.filter(r => !r.is_verified).length > 0 && (
              <span className="mr-2 bg-red-500 text-white px-1.5 py-0.5 rounded-full text-[8px]">{residents.filter(r => !r.is_verified).length}</span>
            )}
            {tab}
          </button>
        ))}
      </nav>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4 opacity-20">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-black uppercase tracking-widest">Querying Cloud Hub...</p>
        </div>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-400">
          {activeTab === 'achievements' && (
            <div className="grid md:grid-cols-3 gap-12">
              <div className="md:col-span-1">
                <h2 className="text-xl font-black text-slate-800 mb-8 tracking-tight">Post Achievement</h2>
                <form onSubmit={handlePostAchievement} className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
                  <input required className="w-full p-5 bg-slate-50 border border-slate-100 rounded-xl outline-none font-bold text-base" value={newAchievement.title} onChange={e => setNewAchievement({...newAchievement, title: e.target.value})} placeholder="Achievement Title" />
                  <textarea required rows={4} className="w-full p-5 bg-slate-50 border border-slate-100 rounded-xl outline-none font-medium text-base leading-relaxed" value={newAchievement.content} onChange={e => setNewAchievement({...newAchievement, content: e.target.value})} placeholder="Describe the success..." />
                  
                  <div className="space-y-3">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Attach Media</label>
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-all bg-slate-50/50 overflow-hidden relative">
                      {newAchievement.image_url ? (
                        <img src={newAchievement.image_url} className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        <div className="text-center">
                          <span className="text-2xl mb-1 block">🖼️</span>
                          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Add Photo</span>
                        </div>
                      )}
                      <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                    </label>
                  </div>

                  <button type="submit" disabled={isSubmitting} className={`w-full py-5 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-lg transition-all ${isSubmitting ? 'bg-slate-300' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                    {isSubmitting ? 'Publishing...' : 'Publish to Wall'}
                  </button>
                </form>
              </div>
              <div className="md:col-span-2 grid gap-6">
                {achievements.map(a => (
                  <div key={a.id} className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col md:flex-row group relative animate-in slide-in-from-right-2">
                    {a.image_url && (
                      <div className="md:w-64 h-48 md:h-auto overflow-hidden">
                        <img src={a.image_url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      </div>
                    )}
                    <div className="flex-1 p-8">
                      <button onClick={() => handleDeleteAchievement(a.id)} className="absolute top-8 right-8 p-3 bg-red-50 text-red-500 rounded-2xl opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white">🗑️</button>
                      <h3 className="font-black text-xl text-slate-900 mb-3">{a.title}</h3>
                      <p className="text-slate-600 leading-relaxed text-sm mb-4">{a.content}</p>
                      <p className="text-[8px] font-black uppercase text-slate-300 tracking-[0.2em]">Posted {new Date(a.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'residents' && (
            <div className="space-y-8">
              <div className="bg-indigo-600 p-8 rounded-[3rem] text-white shadow-xl flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="text-center md:text-left">
                  <h2 className="text-2xl font-black tracking-tight">Identity Verification</h2>
                  <p className="text-indigo-100 text-[10px] font-black uppercase tracking-widest mt-1 opacity-80">Resident Onboarding Queue</p>
                </div>
                <div className="flex gap-4">
                  <div className="bg-white/10 px-6 py-3 rounded-2xl border border-white/10">
                    <span className="text-[8px] font-black uppercase block tracking-widest mb-1 opacity-60">Verified</span>
                    <span className="text-xl font-black">{residents.filter(r => r.is_verified).length}</span>
                  </div>
                  <div className="bg-red-500 px-6 py-3 rounded-2xl border border-red-400 shadow-lg">
                    <span className="text-[8px] font-black uppercase block tracking-widest mb-1">Pending</span>
                    <span className="text-xl font-black">{residents.filter(r => !r.is_verified).length}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-[2.5rem] shadow-sm overflow-hidden border border-slate-100">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50 border-b border-slate-100">
                    <tr>
                      <th className="px-8 py-6 text-xs font-black text-slate-400 uppercase tracking-widest">Occupant</th>
                      <th className="px-8 py-6 text-xs font-black text-slate-400 uppercase tracking-widest">Unit</th>
                      <th className="px-8 py-6 text-xs font-black text-slate-400 uppercase tracking-widest">Mobile</th>
                      <th className="px-8 py-6 text-xs font-black text-slate-400 uppercase tracking-widest">Status</th>
                      <th className="px-8 py-6 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {residents.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-6">
                           <p className="font-black text-slate-900">{r.full_name}</p>
                           <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">ID: {r.id.slice(0, 8)}</p>
                        </td>
                        <td className="px-8 py-6">
                          <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-black">{r.wing}-{r.flat_number}</span>
                        </td>
                        <td className="px-8 py-6 font-mono text-xs font-bold text-slate-500">{r.phone_number}</td>
                        <td className="px-8 py-6">
                          <span className={`text-[8px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${r.is_verified ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                            {r.is_verified ? 'Verified' : 'Pending'}
                          </span>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <button 
                            onClick={() => handleVerifyResident(r.id, !r.is_verified)}
                            className={`px-5 py-2 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all shadow-sm ${r.is_verified ? 'bg-red-50 text-red-500 hover:bg-red-500 hover:text-white' : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-100'}`}
                          >
                            {r.is_verified ? 'Revoke Access' : 'Approve Unit'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'notices' && (
            <div className="grid md:grid-cols-3 gap-12">
              <div className="md:col-span-1">
                <h2 className="text-xl font-black text-slate-800 mb-8 tracking-tight">Post Notice</h2>
                <form onSubmit={handlePostNotice} className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
                  <input required className="w-full p-5 bg-slate-50 border border-slate-100 rounded-xl outline-none font-bold text-base" value={newNotice.title} onChange={e => setNewNotice({...newNotice, title: e.target.value})} placeholder="Title" />
                  <textarea required rows={5} className="w-full p-5 bg-slate-50 border border-slate-100 rounded-xl outline-none font-medium text-base leading-relaxed" value={newNotice.content} onChange={e => setNewNotice({...newNotice, content: e.target.value})} placeholder="Write details..." />
                  <button type="submit" disabled={isSubmitting} className={`w-full py-5 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-lg transition-all ${isSubmitting ? 'bg-slate-300' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                    {isSubmitting ? 'Broadcasting...' : 'Broadcast'}
                  </button>
                </form>
              </div>
              <div className="md:col-span-2 space-y-6">
                {notices.map(n => (
                  <div key={n.id} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 relative group animate-in slide-in-from-right-2">
                    <button 
                      onClick={() => handleDeleteNotice(n.id)} 
                      className="absolute top-8 right-8 p-3 bg-red-50 text-red-500 rounded-2xl opacity-40 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all shadow-sm"
                    >
                      🗑️
                    </button>
                    <h3 className="font-black text-xl text-slate-900 mb-4 pr-12">{n.title}</h3>
                    <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{n.content}</p>
                    <p className="text-[8px] font-black uppercase text-slate-300 tracking-[0.2em] mt-6">Posted {new Date(n.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'amenities' && (
            <div className="grid md:grid-cols-3 gap-12">
              <div className="md:col-span-1">
                <h2 className="text-xl font-black text-slate-800 mb-8 tracking-tight">Add Amenity</h2>
                <form onSubmit={handleAddAmenity} className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
                  <input required className="w-full p-5 bg-slate-50 border border-slate-100 rounded-xl outline-none font-bold text-base" value={newAmenity.name} onChange={e => setNewAmenity({...newAmenity, name: e.target.value})} placeholder="Name" />
                  <input type="number" required className="w-full p-5 bg-slate-50 border border-slate-100 rounded-xl outline-none font-bold text-base" value={newAmenity.capacity} onChange={e => setNewAmenity({...newAmenity, capacity: parseInt(e.target.value)})} />
                  <div className="grid grid-cols-2 gap-4">
                    <input type="time" required className="w-full p-5 bg-slate-50 border border-slate-100 rounded-xl outline-none font-bold text-base" value={newAmenity.openTime} onChange={e => setNewAmenity({...newAmenity, openTime: e.target.value})} />
                    <input type="time" required className="w-full p-5 bg-slate-50 border border-slate-100 rounded-xl outline-none font-bold text-base" value={newAmenity.closeTime} onChange={e => setNewAmenity({...newAmenity, closeTime: e.target.value})} />
                  </div>
                  <button type="submit" disabled={isSubmitting} className={`w-full py-5 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-lg transition-all ${isSubmitting ? 'bg-slate-300' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                    {isSubmitting ? 'Saving...' : 'Save Facility'}
                  </button>
                </form>
              </div>
              <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
                {amenities.map(a => (
                  <div key={a.id} className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 group relative">
                    <button onClick={() => alert('Delete logic disabled for demo safety')} className="absolute top-6 right-6 p-2 bg-red-50 text-red-500 rounded-xl opacity-0 group-hover:opacity-100 transition-all shadow-sm">🗑️</button>
                    <h3 className="font-black text-xl text-slate-900 mb-4">{a.name}</h3>
                    <div className="space-y-2 text-xs font-bold text-slate-500">
                      <p>Capacity: {a.capacity} People</p>
                      <p>Hours: {a.open_time} - {a.close_time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'bookings' && (
            <div className="bg-white rounded-[2.5rem] shadow-sm overflow-hidden border border-slate-100">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr>
                    <th className="px-10 py-6 text-xs font-black text-slate-400 uppercase tracking-widest">Facility</th>
                    <th className="px-10 py-6 text-xs font-black text-slate-400 uppercase tracking-widest">Resident</th>
                    <th className="px-10 py-6 text-xs font-black text-slate-400 uppercase tracking-widest">Unit</th>
                    <th className="px-10 py-6 text-xs font-black text-slate-400 uppercase tracking-widest">Slot</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bookings.map(b => (
                    <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-10 py-8 font-black text-slate-900">{amenities.find(a => a.id === b.amenity_id)?.name}</td>
                      <td className="px-10 py-8 font-medium text-slate-600">{b.resident_name}</td>
                      <td className="px-10 py-8 font-black text-indigo-600">{b.flat_number}</td>
                      <td className="px-10 py-8 font-bold text-slate-900">{b.date} • {b.start_time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BuildingAdminDashboard;
