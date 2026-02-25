
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
    <div className="bg-slate-50 min-h-screen font-sans antialiased animate-fade-in">
      <header className="bg-slate-900 px-4 sm:px-8 py-4 sm:py-6 flex justify-between items-center shadow-2xl sticky top-0 z-50">
        <div className="flex items-center gap-3 sm:gap-5">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/10 rounded-xl sm:rounded-2xl flex items-center justify-center text-xl sm:text-2xl backdrop-blur-sm border border-white/10">🏢</div>
          <div>
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-white uppercase leading-none">Admin Hub</h1>
            <p className="text-[8px] sm:text-[9px] text-white/40 font-black tracking-widest uppercase mt-1 sm:mt-1.5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></span>
              Management Terminal
            </p>
          </div>
        </div>
        <button onClick={onLogout} className="btn-danger py-2 px-4 sm:py-3 sm:px-6">
          <span className="hidden sm:inline">Sign Out</span>
          <span className="sm:hidden">Exit</span>
          <span className="text-lg">→</span>
        </button>
      </header>

      <div className="max-w-7xl mx-auto p-3 sm:p-8">
        <nav className="flex bg-white p-1.5 sm:p-2 rounded-2xl sm:rounded-[2.5rem] shadow-sm border border-slate-200 mb-8 sm:mb-12 w-full overflow-x-auto gap-2 sticky top-20 sm:top-24 z-40 snap-x snap-mandatory touch-pan-x pb-2">
          {(['notices', 'achievements', 'amenities', 'bookings', 'residents'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-shrink-0 min-w-[100px] sm:min-w-[120px] snap-center px-4 py-3.5 sm:py-4 text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-xl sm:rounded-[2rem] transition-all duration-300 flex items-center justify-center gap-2 sm:gap-3 ${activeTab === tab ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
            >
              {tab === 'residents' && residents.filter(r => !r.is_verified).length > 0 && (
                <span className="w-4 h-4 sm:w-5 sm:h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[7px] sm:text-[8px] animate-bounce">{residents.filter(r => !r.is_verified).length}</span>
              )}
              {tab}
            </button>
          ))}
        </nav>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-40 gap-6 opacity-20">
            <div className="w-16 h-16 border-4 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
            <p className="label-caps tracking-[0.4em]">Querying Cloud Hub...</p>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {activeTab === 'achievements' && (
              <div className="grid lg:grid-cols-3 gap-8 sm:gap-12">
                <div className="lg:col-span-1">
                  <form onSubmit={handlePostAchievement} className="card-modern p-6 sm:p-10 rounded-[2.5rem] sm:rounded-[3.5rem] space-y-6 sm:space-y-8 lg:sticky lg:top-40">
                    <div className="flex items-center gap-3 sm:gap-4 mb-2">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-900 text-white rounded-xl sm:rounded-2xl flex items-center justify-center text-lg sm:text-xl">✨</div>
                      <h2 className="heading-lg text-lg sm:text-xl tracking-tight">Post Update</h2>
                    </div>
                    <div className="space-y-4 sm:space-y-5">
                      <div className="space-y-2">
                        <label className="label-caps ml-4">Title</label>
                        <input required className="input-modern" value={newAchievement.title} onChange={e => setNewAchievement({...newAchievement, title: e.target.value})} placeholder="Achievement Title" />
                      </div>
                      <div className="space-y-2">
                        <label className="label-caps ml-4">Content</label>
                        <textarea required rows={4} className="input-modern py-4 sm:py-5 leading-relaxed" value={newAchievement.content} onChange={e => setNewAchievement({...newAchievement, content: e.target.value})} placeholder="Describe the success..." />
                      </div>
                      <div className="space-y-2">
                        <label className="label-caps ml-4">Attach Media</label>
                        <label className="flex flex-col items-center justify-center w-full h-32 sm:h-40 border-2 border-dashed border-slate-200 rounded-2xl sm:rounded-3xl cursor-pointer hover:bg-slate-50 transition-all bg-slate-50/50 overflow-hidden relative group">
                          {newAchievement.image_url ? (
                            <img src={newAchievement.image_url} className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-110" />
                          ) : (
                            <div className="text-center">
                              <span className="text-2xl sm:text-3xl mb-2 block">🖼️</span>
                              <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-slate-400">Add Photo</span>
                            </div>
                          )}
                          <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                        </label>
                      </div>
                    </div>
                    <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-4 sm:py-5">
                      {isSubmitting ? 'Publishing...' : 'Publish to Wall'}
                    </button>
                  </form>
                </div>
                <div className="lg:col-span-2 space-y-6 sm:space-y-8">
                  {achievements.map(a => (
                    <div key={a.id} className="card-modern rounded-[2.5rem] sm:rounded-[3.5rem] overflow-hidden flex flex-col sm:flex-row group relative animate-in slide-in-from-right-4">
                      {a.image_url && (
                        <div className="sm:w-64 md:w-72 h-48 sm:h-auto overflow-hidden shrink-0">
                          <img src={a.image_url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                        </div>
                      )}
                      <div className="flex-1 p-6 sm:p-10">
                        <button onClick={() => handleDeleteAchievement(a.id)} className="absolute top-4 right-4 sm:top-8 sm:right-8 p-3 sm:p-4 bg-red-50 text-red-500 rounded-xl sm:rounded-2xl opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white shadow-sm">🗑️</button>
                        <h3 className="font-black text-xl sm:text-2xl text-slate-900 mb-3 sm:mb-4 tracking-tight">{a.title}</h3>
                        <p className="text-slate-500 leading-relaxed text-xs sm:text-sm mb-6 sm:mb-8">{a.content}</p>
                        <div className="flex items-center justify-between pt-4 sm:pt-6 border-t border-slate-100">
                          <p className="label-caps opacity-40 text-[8px] sm:text-[10px]">Posted {new Date(a.created_at).toLocaleDateString()}</p>
                          <span className="text-[8px] sm:text-[10px] font-black text-emerald-500 bg-emerald-50 px-3 sm:px-4 py-1 sm:py-1.5 rounded-full border border-emerald-100 uppercase tracking-widest">Community Post</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {achievements.length === 0 && (
                    <div className="py-24 sm:py-40 text-center bg-white rounded-[3rem] sm:rounded-[4rem] border-2 border-dashed border-slate-200">
                      <div className="text-4xl sm:text-5xl mb-4 sm:mb-6 grayscale opacity-30">✨</div>
                      <p className="label-caps tracking-[0.4em] px-6">No achievements posted yet</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'residents' && (
              <div className="space-y-6 sm:space-y-10">
                <div className="bg-slate-900 p-6 sm:p-12 rounded-[2.5rem] sm:rounded-[4rem] text-white shadow-2xl flex flex-col md:flex-row justify-between items-center gap-6 sm:gap-10 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-48 sm:w-64 h-48 sm:h-64 bg-white/5 rounded-full -mr-24 sm:-mr-32 -mt-24 sm:-mt-32 blur-3xl"></div>
                  <div className="text-center md:text-left relative z-10">
                    <h2 className="text-2xl sm:text-3xl font-black tracking-tight">Identity Verification</h2>
                    <p className="text-white/40 label-caps mt-2 sm:mt-3 text-[8px] sm:text-[10px]">Resident Onboarding Queue</p>
                  </div>
                  <div className="flex gap-4 sm:gap-6 relative z-10 w-full md:w-auto">
                    <div className="flex-1 md:flex-none bg-white/5 px-4 sm:px-8 py-3 sm:py-5 rounded-2xl sm:rounded-3xl border border-white/10 backdrop-blur-md text-center">
                      <span className="label-caps text-white/40 block mb-1 sm:mb-2 text-[7px] sm:text-[8px]">Verified</span>
                      <span className="text-xl sm:text-3xl font-black">{residents.filter(r => r.is_verified).length}</span>
                    </div>
                    <div className="flex-1 md:flex-none bg-red-500 px-4 sm:px-8 py-3 sm:py-5 rounded-2xl sm:rounded-3xl border border-red-400 shadow-2xl text-center">
                      <span className="label-caps text-white/60 block mb-1 sm:mb-2 text-[7px] sm:text-[8px]">Pending</span>
                      <span className="text-xl sm:text-3xl font-black">{residents.filter(r => !r.is_verified).length}</span>
                    </div>
                  </div>
                </div>

                <div className="card-modern rounded-[2rem] sm:rounded-[4rem] overflow-hidden">
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                      <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-100">
                          <th className="px-6 sm:px-10 py-6 sm:py-8 label-caps text-slate-400 text-[8px] sm:text-[10px]">Occupant</th>
                          <th className="px-6 sm:px-10 py-6 sm:py-8 label-caps text-slate-400 text-[8px] sm:text-[10px]">Unit</th>
                          <th className="px-6 sm:px-10 py-6 sm:py-8 label-caps text-slate-400 text-[8px] sm:text-[10px]">Mobile</th>
                          <th className="px-6 sm:px-10 py-6 sm:py-8 label-caps text-slate-400 text-[8px] sm:text-[10px]">Status</th>
                          <th className="px-6 sm:px-10 py-6 sm:py-8 text-right label-caps text-slate-400 text-[8px] sm:text-[10px]">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {residents.map(r => (
                          <tr key={r.id} className="hover:bg-slate-50/30 transition-colors group">
                            <td className="px-6 sm:px-10 py-6 sm:py-8">
                               <p className="font-black text-slate-900 text-base sm:text-lg tracking-tight">{r.full_name}</p>
                               <p className="text-[8px] sm:text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 sm:mt-1.5">ID: {r.id.slice(0, 8)}</p>
                            </td>
                            <td className="px-6 sm:px-10 py-6 sm:py-8">
                              <span className="px-3 sm:px-4 py-1.5 sm:py-2 bg-slate-100 text-slate-900 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black border border-slate-200">{r.wing}-{r.flat_number}</span>
                            </td>
                            <td className="px-6 sm:px-10 py-6 sm:py-8 font-mono text-xs sm:text-sm font-bold text-slate-500">{r.phone_number}</td>
                            <td className="px-6 sm:px-10 py-6 sm:py-8">
                              <span className={`text-[8px] sm:text-[9px] font-black uppercase tracking-widest px-3 sm:px-4 py-1 sm:py-1.5 rounded-full border transition-all ${r.is_verified ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                                {r.is_verified ? 'Verified' : 'Pending'}
                              </span>
                            </td>
                            <td className="px-6 sm:px-10 py-6 sm:py-8 text-right">
                              <button 
                                onClick={() => handleVerifyResident(r.id, !r.is_verified)}
                                className={`px-4 sm:px-6 py-2 sm:py-3 text-[8px] sm:text-[10px] font-black uppercase tracking-widest rounded-xl sm:rounded-2xl transition-all shadow-sm ${r.is_verified ? 'btn-danger border-none bg-red-50 text-red-500 hover:bg-red-500 hover:text-white' : 'btn-primary border-none bg-emerald-500 text-white hover:bg-emerald-600'}`}
                              >
                                {r.is_verified ? 'Revoke' : 'Approve'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'notices' && (
              <div className="grid lg:grid-cols-3 gap-8 sm:gap-12">
                <div className="lg:col-span-1">
                  <form onSubmit={handlePostNotice} className="card-modern p-6 sm:p-10 rounded-[2.5rem] sm:rounded-[3.5rem] space-y-6 sm:space-y-8 lg:sticky lg:top-40">
                    <div className="flex items-center gap-3 sm:gap-4 mb-2">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-900 text-white rounded-xl sm:rounded-2xl flex items-center justify-center text-lg sm:text-xl">📢</div>
                      <h2 className="heading-lg text-lg sm:text-xl tracking-tight">Post Notice</h2>
                    </div>
                    <div className="space-y-4 sm:space-y-5">
                      <div className="space-y-2">
                        <label className="label-caps ml-4">Title</label>
                        <input required className="input-modern" value={newNotice.title} onChange={e => setNewNotice({...newNotice, title: e.target.value})} placeholder="Notice Heading" />
                      </div>
                      <div className="space-y-2">
                        <label className="label-caps ml-4">Content</label>
                        <textarea required rows={6} className="input-modern py-4 sm:py-5 leading-relaxed" value={newNotice.content} onChange={e => setNewNotice({...newNotice, content: e.target.value})} placeholder="Write details..." />
                      </div>
                    </div>
                    <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-4 sm:py-5">
                      {isSubmitting ? 'Broadcasting...' : 'Broadcast Alert'}
                    </button>
                  </form>
                </div>
                <div className="lg:col-span-2 space-y-6 sm:space-y-8">
                  {notices.map(n => (
                    <div key={n.id} className="card-modern p-6 sm:p-10 rounded-[2.5rem] sm:rounded-[3.5rem] relative group animate-in slide-in-from-right-4">
                      <button 
                        onClick={() => handleDeleteNotice(n.id)} 
                        className="absolute top-4 right-4 sm:top-8 sm:right-8 p-3 sm:p-4 bg-red-50 text-red-500 rounded-xl sm:rounded-2xl opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all shadow-sm"
                      >
                        🗑️
                      </button>
                      <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-slate-50 rounded-lg sm:rounded-xl flex items-center justify-center text-base sm:text-lg shadow-inner border border-slate-100">📌</div>
                        <h3 className="font-black text-xl sm:text-2xl text-slate-900 tracking-tight pr-10 sm:pr-12">{n.title}</h3>
                      </div>
                      <p className="text-slate-500 leading-relaxed whitespace-pre-wrap text-sm sm:text-base">{n.content}</p>
                      <div className="mt-8 sm:mt-10 pt-4 sm:pt-6 border-t border-slate-100 flex items-center justify-between">
                        <p className="label-caps opacity-40 text-[8px] sm:text-[10px]">Posted {new Date(n.created_at).toLocaleDateString()}</p>
                        <span className="text-[8px] sm:text-[10px] font-black text-slate-400 bg-slate-50 px-3 sm:px-4 py-1 sm:py-1.5 rounded-full border border-slate-100 uppercase tracking-widest">Official</span>
                      </div>
                    </div>
                  ))}
                  {notices.length === 0 && (
                    <div className="py-24 sm:py-40 text-center bg-white rounded-[3rem] sm:rounded-[4rem] border-2 border-dashed border-slate-200">
                      <div className="text-4xl sm:text-5xl mb-4 sm:mb-6 grayscale opacity-30">📢</div>
                      <p className="label-caps tracking-[0.4em] px-6">No active notices</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'amenities' && (
              <div className="grid lg:grid-cols-3 gap-8 sm:gap-12">
                <div className="lg:col-span-1">
                  <form onSubmit={handleAddAmenity} className="card-modern p-6 sm:p-10 rounded-[2.5rem] sm:rounded-[3.5rem] space-y-6 sm:space-y-8 lg:sticky lg:top-40">
                    <div className="flex items-center gap-3 sm:gap-4 mb-2">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-900 text-white rounded-xl sm:rounded-2xl flex items-center justify-center text-lg sm:text-xl">✨</div>
                      <h2 className="heading-lg text-lg sm:text-xl tracking-tight">Add Amenity</h2>
                    </div>
                    <div className="space-y-4 sm:space-y-5">
                      <div className="space-y-2">
                        <label className="label-caps ml-4">Facility Name</label>
                        <input required className="input-modern" value={newAmenity.name} onChange={e => setNewAmenity({...newAmenity, name: e.target.value})} placeholder="e.g. Swimming Pool" />
                      </div>
                      <div className="space-y-2">
                        <label className="label-caps ml-4">Capacity</label>
                        <input type="number" required className="input-modern" value={newAmenity.capacity} onChange={e => setNewAmenity({...newAmenity, capacity: parseInt(e.target.value)})} />
                      </div>
                      <div className="grid grid-cols-2 gap-4 sm:gap-5">
                        <div className="space-y-2">
                          <label className="label-caps ml-4">Open</label>
                          <input type="time" required className="input-modern" value={newAmenity.openTime} onChange={e => setNewAmenity({...newAmenity, openTime: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                          <label className="label-caps ml-4">Close</label>
                          <input type="time" required className="input-modern" value={newAmenity.closeTime} onChange={e => setNewAmenity({...newAmenity, closeTime: e.target.value})} />
                        </div>
                      </div>
                    </div>
                    <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-4 sm:py-5">
                      {isSubmitting ? 'Saving...' : 'Save Facility'}
                    </button>
                  </form>
                </div>
                <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                  {amenities.map(a => (
                    <div key={a.id} className="card-modern p-6 sm:p-10 rounded-[2.5rem] sm:rounded-[3.5rem] group relative hover:translate-y-[-4px] transition-all">
                      <button onClick={() => alert('Delete logic disabled for demo safety')} className="absolute top-4 right-4 sm:top-8 sm:right-8 p-3 sm:p-4 bg-red-50 text-red-500 rounded-xl sm:rounded-2xl opacity-0 group-hover:opacity-100 transition-all shadow-sm">🗑️</button>
                      <div className="w-12 h-12 sm:w-14 sm:h-14 bg-slate-900 text-white rounded-xl sm:rounded-2xl flex items-center justify-center text-xl sm:text-2xl mb-6 sm:mb-8 shadow-xl">🏢</div>
                      <h3 className="font-black text-xl sm:text-2xl text-slate-900 mb-4 sm:mb-6 tracking-tight">{a.name}</h3>
                      <div className="space-y-3 sm:space-y-4">
                        <div className="flex justify-between items-center py-2 sm:py-3 border-b border-slate-50">
                          <span className="label-caps opacity-40 text-[8px] sm:text-[10px]">Capacity</span>
                          <span className="font-black text-slate-900 text-xs sm:text-sm">{a.capacity} People</span>
                        </div>
                        <div className="flex justify-between items-center py-2 sm:py-3">
                          <span className="label-caps opacity-40 text-[8px] sm:text-[10px]">Hours</span>
                          <span className="font-black text-slate-900 text-xs sm:text-sm">{a.open_time} - {a.close_time}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {amenities.length === 0 && (
                    <div className="col-span-full py-24 sm:py-40 text-center bg-white rounded-[3rem] sm:rounded-[4rem] border-2 border-dashed border-slate-200">
                      <div className="text-4xl sm:text-5xl mb-4 sm:mb-6 grayscale opacity-30">🏢</div>
                      <p className="label-caps tracking-[0.4em] px-6">No facilities registered</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'bookings' && (
              <div className="card-modern rounded-[2rem] sm:rounded-[4rem] overflow-hidden">
                <div className="overflow-x-auto show-scrollbar">
                  <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-100">
                        <th className="px-6 sm:px-10 py-6 sm:py-8 label-caps text-slate-400 text-[8px] sm:text-[10px]">Facility</th>
                        <th className="px-6 sm:px-10 py-6 sm:py-8 label-caps text-slate-400 text-[8px] sm:text-[10px]">Resident</th>
                        <th className="px-6 sm:px-10 py-6 sm:py-8 label-caps text-slate-400 text-[8px] sm:text-[10px]">Unit</th>
                        <th className="px-6 sm:px-10 py-6 sm:py-8 label-caps text-slate-400 text-[8px] sm:text-[10px]">Slot</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {bookings.map(b => (
                        <tr key={b.id} className="hover:bg-slate-50/30 transition-colors">
                          <td className="px-6 sm:px-10 py-6 sm:py-10">
                            <div className="flex items-center gap-3 sm:gap-4">
                              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-slate-900 text-white rounded-lg sm:rounded-xl flex items-center justify-center text-base sm:text-lg shadow-lg">📅</div>
                              <span className="font-black text-slate-900 text-base sm:text-lg tracking-tight">{amenities.find(a => a.id === b.amenity_id)?.name}</span>
                            </div>
                          </td>
                          <td className="px-6 sm:px-10 py-6 sm:py-10 font-bold text-slate-600 text-sm sm:text-base">{b.resident_name}</td>
                          <td className="px-6 sm:px-10 py-6 sm:py-10">
                            <span className="px-3 sm:px-4 py-1.5 sm:py-2 bg-slate-100 text-slate-900 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black border border-slate-200">{b.flat_number}</span>
                          </td>
                          <td className="px-6 sm:px-10 py-6 sm:py-10 font-black text-slate-900 text-sm sm:text-base">{b.date} • {b.start_time}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {bookings.length === 0 && (
                    <div className="py-24 sm:py-40 text-center">
                      <div className="text-4xl sm:text-5xl mb-4 sm:mb-6 grayscale opacity-30">📅</div>
                      <p className="label-caps tracking-[0.4em] px-6">No active bookings</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BuildingAdminDashboard;
