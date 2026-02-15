
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Notice, Amenity, Booking, Visitor, ChatMessage, Profile, Achievement } from '../types';

interface Props {
  profile: Profile;
  onLogout: () => void;
}

const ResidentDashboard: React.FC<Props> = ({ profile, onLogout }) => {
  const buildingId = profile.building_id!;
  const flatNumber = profile.flat_number!;
  const name = profile.full_name!;

  const [activeTab, setActiveTab] = useState<'notices' | 'achievements' | 'chat' | 'amenities' | 'visitors' | 'settings'>('notices');
  const [notices, setNotices] = useState<Notice[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [myBookings, setMyBookings] = useState<Booking[]>([]); 
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [neighbors, setNeighbors] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<Visitor[]>([]);
  
  const [activeChat, setActiveChat] = useState<{ type: 'GROUP' | 'PRIVATE', id?: string, name: string }>({ type: 'GROUP', name: 'Building Group' });
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showMobileList, setShowMobileList] = useState(true);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const isFetching = useRef(false);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior });
    }
  };

  const fetchData = async (silent = false) => {
    if (isFetching.current && !silent) return;
    isFetching.current = true;
    
    if (!silent) setLoading(true);
    try {
      const [noticesRes, achievementsRes, amenitiesRes, allBookingsRes, visitorsRes, messagesRes, neighborsRes] = await Promise.all([
        supabase.from('notices').select('*').eq('building_id', buildingId).order('created_at', { ascending: false }),
        supabase.from('achievements').select('*').eq('building_id', buildingId).order('created_at', { ascending: false }),
        supabase.from('amenities').select('*').eq('building_id', buildingId),
        supabase.from('bookings').select('*').eq('building_id', buildingId).eq('profile_id', profile.id).order('date', { ascending: false }),
        supabase.from('visitors').select('*').eq('building_id', buildingId).eq('flat_number', flatNumber).order('created_at', { ascending: false }),
        supabase.from('messages').select('*').eq('building_id', buildingId).order('created_at', { ascending: true }),
        supabase.from('profiles').select('*').eq('building_id', buildingId).eq('role', 'RESIDENT').eq('is_verified', true).neq('id', profile.id)
      ]);

      if (noticesRes.data) setNotices(noticesRes.data);
      if (achievementsRes.data) setAchievements(achievementsRes.data);
      if (amenitiesRes.data) setAmenities(amenitiesRes.data);
      if (allBookingsRes.data) setMyBookings(allBookingsRes.data);
      if (visitorsRes.data) {
        setVisitors(visitorsRes.data);
        setPendingRequests(visitorsRes.data.filter(v => v.status === 'WAITING_APPROVAL'));
      }
      if (messagesRes.data) setMessages(messagesRes.data);
      if (neighborsRes.data) setNeighbors(neighborsRes.data);
    } catch (err) {
      console.error('Data sync error:', err);
    } finally {
      setLoading(false);
      isFetching.current = false;
      if (activeTab === 'chat') setTimeout(() => scrollToBottom('auto'), 100);
    }
  };

  useEffect(() => {
    fetchData();
    
    const channel = supabase
      .channel(`resident_node_${profile.id.slice(0, 5)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as ChatMessage;
        if (msg.building_id === buildingId) {
          setMessages(prev => {
            const exists = prev.some(m => m.id === msg.id);
            if (exists) return prev;
            return [...prev, msg];
          });
          if (activeTab === 'chat') setTimeout(() => scrollToBottom('smooth'), 100);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'achievements', filter: `building_id=eq.${buildingId}` }, () => fetchData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visitors', filter: `flat_number=eq.${flatNumber}` }, () => fetchData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notices', filter: `building_id=eq.${buildingId}` }, () => fetchData(true))
      .subscribe((status) => {
        setIsRealtimeActive(status === 'SUBSCRIBED');
      });
      
    return () => { supabase.removeChannel(channel); };
  }, [buildingId, flatNumber, profile.id, activeTab]);

  useEffect(() => {
    if (activeTab === 'chat') {
      scrollToBottom('auto');
    }
  }, [activeTab, activeChat.id]);

  const filteredMessages = messages.filter(m => {
    if (activeChat.type === 'GROUP') return !m.recipient_id;
    return (
      (m.profile_id === profile.id && m.recipient_id === activeChat.id) ||
      (m.profile_id === activeChat.id && m.recipient_id === profile.id)
    );
  });

  const handleSendMessage = async (e?: React.FormEvent, imageUrl?: string) => {
    if (e) e.preventDefault();
    if ((!newMessage.trim() && !imageUrl) || isSending) return;
    const content = newMessage.trim();
    setNewMessage(''); 
    setIsSending(true);
    try {
      const { error } = await supabase.from('messages').insert({
        building_id: buildingId, profile_id: profile.id, user_name: `${name} (${profile.wing}-${flatNumber})`,
        content: content || null, image_url: imageUrl || null,
        recipient_id: activeChat.type === 'PRIVATE' ? activeChat.id : null
      });
      if (error) throw error;
    } catch (err: any) { alert('Failed to send: ' + err.message); setNewMessage(content); } 
    finally { setIsSending(false); }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert("File too large (Max 2MB)"); return; }
    const reader = new FileReader();
    reader.onloadend = () => handleSendMessage(undefined, reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleDecision = async (visitorId: string, status: 'ENTERED' | 'REJECTED') => {
    await supabase.from('visitors').update({ status, check_in_at: status === 'ENTERED' ? new Date().toISOString() : null }).eq('id', visitorId);
    fetchData(true);
  };

  const [bookingForm, setBookingForm] = useState({ amenityId: '', date: new Date().toISOString().split('T')[0], startTime: '09:00', endTime: '10:00' });
  const [visitorForm, setVisitorForm] = useState({ name: '', phone: '', purpose: '' });
  const [submitting, setSubmitting] = useState(false);

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.from('bookings').insert({ ...bookingForm, building_id: buildingId, resident_name: name, flat_number: flatNumber, profile_id: profile.id, amenity_id: bookingForm.amenityId, start_time: bookingForm.startTime, end_time: bookingForm.endTime });
      if (error) throw error;
      setBookingForm({ ...bookingForm, startTime: '09:00', endTime: '10:00' });
      fetchData(true);
    } catch (err: any) { alert(err.message); } finally { setSubmitting(false); }
  };

  const handleInviteVisitor = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const invite_code = Math.floor(100000 + Math.random() * 900000).toString();
      const { error } = await supabase.from('visitors').insert({ ...visitorForm, building_id: buildingId, flat_number: flatNumber, type: 'PRE_APPROVED', status: 'PENDING', invite_code });
      if (error) throw error;
      setVisitorForm({ name: '', phone: '', purpose: '' });
      fetchData(true);
    } catch (err: any) { alert(err.message); } finally { setSubmitting(false); }
  };

  return (
    <div className="bg-slate-50 min-h-screen p-4 md:p-8 font-inter">
      <div className="max-w-7xl mx-auto h-full flex flex-col">
        {pendingRequests.length > 0 && (
          <div className="mb-6 bg-indigo-600 rounded-[2rem] p-6 text-white shadow-2xl animate-pulse border-4 border-indigo-400">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl">🔔</div>
                <div>
                  <h2 className="text-xl font-black tracking-tight">Gate Request</h2>
                  <p className="text-indigo-100 text-[8px] font-black uppercase tracking-widest mt-1">Guest Arrival</p>
                </div>
              </div>
              <div className="space-y-2 w-full md:w-auto">
                {pendingRequests.map(req => (
                  <div key={req.id} className="bg-white/10 p-4 rounded-2xl flex justify-between items-center gap-4 border border-white/10">
                    <div className="flex-1">
                      <p className="font-black text-sm">{req.name}</p>
                      <p className="text-[8px] font-black uppercase tracking-widest opacity-70">{req.purpose}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleDecision(req.id, 'REJECTED')} className="px-4 py-2 bg-red-500 hover:bg-red-400 text-[8px] font-black uppercase tracking-widest rounded-lg transition-all">Deny</button>
                      <button onClick={() => handleDecision(req.id, 'ENTERED')} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-[8px] font-black uppercase tracking-widest rounded-lg transition-all">Allow</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-2xl shadow-xl shadow-indigo-100">🏠</div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Unit {profile.wing}-{flatNumber}</h1>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-slate-400 text-[8px] font-black uppercase tracking-widest">{profile.full_name}</p>
                {isRealtimeActive && (
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                    <span className="text-[7px] font-black text-emerald-600 uppercase">Synced</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <button onClick={onLogout} className="px-5 py-2 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-red-500 transition-all">Sign Out</button>
        </header>

        <nav className="flex bg-white rounded-2xl shadow-sm p-1.5 border border-slate-200 mb-8 sticky top-4 z-40 overflow-x-auto no-scrollbar">
          {(['notices', 'achievements', 'chat', 'amenities', 'visitors', 'settings'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 min-w-[80px] py-3 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === tab ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>
              {tab}
            </button>
          ))}
        </nav>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-48 opacity-20 gap-4">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-900">Syncing Node...</p>
          </div>
        ) : (
          <div className="flex-1">
            {activeTab === 'achievements' && (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 pb-20">
                {achievements.map(a => (
                  <div key={a.id} className="bg-white rounded-[3rem] shadow-xl overflow-hidden flex flex-col border border-slate-100 group animate-in zoom-in duration-500">
                    {a.image_url && (
                      <div className="h-64 overflow-hidden relative">
                        <img src={a.image_url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                        <div className="absolute top-6 left-6 bg-white/90 backdrop-blur-md p-3 rounded-2xl shadow-xl">
                          <span className="text-xl">🏆</span>
                        </div>
                      </div>
                    )}
                    <div className="p-10 flex-1 flex flex-col">
                      <h3 className="font-black text-2xl text-slate-900 mb-4 tracking-tight leading-tight">{a.title}</h3>
                      <p className="text-slate-500 font-medium leading-relaxed flex-1">{a.content}</p>
                      <div className="mt-8 pt-6 border-t border-slate-50 flex items-center justify-between">
                         <span className="text-[8px] font-black uppercase text-slate-400 tracking-[0.2em]">{new Date(a.created_at).toLocaleDateString()}</span>
                         <span className="text-[8px] font-black uppercase text-emerald-500 tracking-widest">Community Post</span>
                      </div>
                    </div>
                  </div>
                ))}
                {achievements.length === 0 && (
                  <div className="col-span-full py-32 text-center bg-white rounded-[4rem] border-2 border-dashed border-slate-100">
                    <div className="text-4xl mb-4 grayscale">🏆</div>
                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.5em]">The Wall of Fame awaits its first post</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'chat' && (
              <div className="flex bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden h-[calc(100vh-280px)]">
                {/* Sidebar */}
                <div className={`${showMobileList ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-80 border-r border-slate-100 bg-slate-50/20 overflow-hidden transition-all`}>
                  <div className="p-6 border-b border-slate-100 bg-white shadow-sm">
                    <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-4">Channels</h3>
                    <button 
                      onClick={() => { setActiveChat({ type: 'GROUP', name: 'Building Group' }); setShowMobileList(false); }}
                      className={`w-full p-4 rounded-2xl flex items-center gap-4 transition-all ${activeChat.type === 'GROUP' ? 'bg-indigo-600 text-white shadow-xl translate-x-1' : 'bg-white hover:bg-slate-50 border border-slate-100'}`}
                    >
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${activeChat.type === 'GROUP' ? 'bg-white/20' : 'bg-indigo-100 text-indigo-600'}`}>🏢</div>
                      <div className="text-left flex-1">
                        <p className="text-xs font-black">Building Group</p>
                        <p className={`text-[8px] font-bold uppercase tracking-widest ${activeChat.type === 'GROUP' ? 'text-indigo-100/70' : 'text-slate-400'}`}>Public Hub</p>
                      </div>
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 space-y-3 no-scrollbar">
                    <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Verified Neighbors</h3>
                    {neighbors.map(n => (
                      <button 
                        key={n.id}
                        onClick={() => { setActiveChat({ type: 'PRIVATE', id: n.id, name: n.full_name || 'Neighbor' }); setShowMobileList(false); }}
                        className={`w-full p-4 rounded-2xl flex items-center gap-4 transition-all ${activeChat.id === n.id ? 'bg-indigo-600 text-white shadow-xl translate-x-1' : 'bg-white hover:bg-indigo-50 border border-slate-100'}`}
                      >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-black ${activeChat.id === n.id ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>
                          {(n.full_name || 'N').charAt(0).toUpperCase()}
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <p className="text-xs font-black truncate">{n.full_name}</p>
                          <p className={`text-[8px] font-bold uppercase tracking-widest truncate ${activeChat.id === n.id ? 'text-indigo-100/70' : 'text-slate-400'}`}>Unit {n.wing}-{n.flat_number}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chat Panel */}
                <div className={`${!showMobileList ? 'flex' : 'hidden'} md:flex flex-col flex-1 overflow-hidden relative`}>
                  <div className="bg-white border-b border-slate-100 px-8 py-5 flex justify-between items-center z-10 shadow-sm">
                    <div className="flex items-center gap-4">
                      <button onClick={() => setShowMobileList(true)} className="md:hidden p-3 bg-slate-100 rounded-xl text-slate-500 hover:text-indigo-600 active:scale-90 transition-all">←</button>
                      <div>
                        <h2 className="text-sm font-black text-slate-900 tracking-tight">{activeChat.name}</h2>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className={`w-1.5 h-1.5 ${isRealtimeActive ? 'bg-emerald-500' : 'bg-slate-300'} rounded-full animate-pulse`}></div>
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Realtime Secure Connection</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar bg-slate-50/20">
                    {filteredMessages.map((m) => {
                      const isMe = m.profile_id === profile.id;
                      return (
                        <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group animate-in slide-in-from-bottom-1 duration-300`}>
                          {!isMe && activeChat.type === 'GROUP' && (
                            <div className="flex items-center gap-2 mb-1 px-2">
                              <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">{m.user_name}</span>
                            </div>
                          )}
                          <div className="relative max-w-[85%] md:max-w-[70%]">
                            <div className={`p-4 rounded-[1.5rem] text-sm font-medium leading-relaxed shadow-sm ${isMe ? 'bg-indigo-600 text-white rounded-tr-none shadow-indigo-100' : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'}`}>
                              {m.content && <p className="whitespace-pre-wrap">{m.content}</p>}
                              {m.image_url && (
                                <img src={m.image_url} alt="Shared content" className="mt-2 rounded-xl max-h-72 w-full object-cover cursor-pointer hover:brightness-105 border border-white/5 shadow-md" onClick={() => window.open(m.image_url)} />
                              )}
                              <div className={`mt-2 text-[7px] font-black uppercase tracking-widest opacity-60 ${isMe ? 'text-right' : 'text-left'}`}>
                                {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={chatEndRef} />
                  </div>

                  <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-slate-100">
                    <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-[1.5rem] border border-slate-200 shadow-inner">
                      <label className="p-3 text-slate-400 hover:text-indigo-600 cursor-pointer transition-all hover:bg-white rounded-xl">
                        📷
                        <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                      </label>
                      <input 
                        className="flex-1 px-4 py-3 bg-transparent outline-none font-medium text-slate-700 text-sm" 
                        placeholder={activeChat.type === 'GROUP' ? "Post to building group..." : `Message ${activeChat.name}...`}
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                      />
                      <button 
                        type="submit" 
                        disabled={isSending || (!newMessage.trim())}
                        className={`p-3 w-12 h-12 rounded-xl transition-all flex items-center justify-center ${isSending || !newMessage.trim() ? 'bg-slate-200 text-slate-400' : 'bg-indigo-600 text-white shadow-lg active:scale-95'}`}
                      >
                        {isSending ? '...' : '↗️'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {activeTab === 'notices' && (
              <div className="grid gap-6">
                {notices.map(n => (
                  <div key={n.id} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
                    <div className="flex justify-between items-start mb-6">
                      <h3 className="font-black text-xl text-slate-900 tracking-tight">{n.title}</h3>
                      <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{new Date(n.created_at).toLocaleDateString()}</span>
                    </div>
                    <p className="text-slate-600 text-base leading-relaxed font-medium whitespace-pre-wrap">{n.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Other tabs remain identical */}
            {activeTab === 'amenities' && (
              <div className="grid lg:grid-cols-2 gap-8">
                <form onSubmit={handleBooking} className="bg-white p-8 rounded-[3rem] shadow-xl space-y-6">
                  <h2 className="text-xl font-black text-slate-800 tracking-tight">Facility Booking</h2>
                  <div className="space-y-4">
                    <select required className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" value={bookingForm.amenityId} onChange={e => setBookingForm({...bookingForm, amenityId: e.target.value})}>
                      <option value="">Choose Amenity...</option>
                      {amenities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <input type="date" required className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" value={bookingForm.date} onChange={e => setBookingForm({...bookingForm, date: e.target.value})} />
                    <div className="grid grid-cols-2 gap-4">
                      <input type="time" required className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" value={bookingForm.startTime} onChange={e => setBookingForm({...bookingForm, startTime: e.target.value})} />
                      <input type="time" required className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" value={bookingForm.endTime} onChange={e => setBookingForm({...bookingForm, endTime: e.target.value})} />
                    </div>
                  </div>
                  <button type="submit" disabled={submitting} className={`w-full py-5 text-white font-black rounded-2xl transition-all uppercase tracking-widest text-[10px] ${submitting ? 'bg-slate-300' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                    {submitting ? 'Processing...' : 'Reserve Now'}
                  </button>
                </form>
                <div className="bg-white rounded-[3rem] p-8 border border-slate-100 overflow-y-auto max-h-[500px] no-scrollbar">
                  <h2 className="text-xl font-black mb-6 text-slate-800 tracking-tight">Active Bookings</h2>
                  <div className="space-y-3">
                    {myBookings.map(b => (
                      <div key={b.id} className="p-5 border border-slate-100 rounded-2xl flex justify-between items-center bg-slate-50/50">
                        <div>
                          <p className="font-black text-slate-900">{amenities.find(a => a.id === b.amenity_id)?.name}</p>
                          <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mt-1">{b.date} • {b.start_time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'visitors' && (
              <div className="grid lg:grid-cols-2 gap-8">
                <form onSubmit={handleInviteVisitor} className="bg-white p-8 rounded-[3rem] shadow-xl space-y-5">
                  <h2 className="text-xl font-black text-slate-800 tracking-tight">Issue Gate Pass</h2>
                  <input required className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" value={visitorForm.name} onChange={e => setVisitorForm({...visitorForm, name: e.target.value})} placeholder="Visitor Name" />
                  <input required className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" value={visitorForm.phone} onChange={e => setVisitorForm({...visitorForm, phone: e.target.value})} placeholder="Mobile" />
                  <input required className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" value={visitorForm.purpose} onChange={e => setVisitorForm({...visitorForm, purpose: e.target.value})} placeholder="Reason" />
                  <button type="submit" disabled={submitting} className={`w-full py-5 text-white font-black rounded-2xl transition-all uppercase tracking-widest text-[10px] ${submitting ? 'bg-slate-300' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                    {submitting ? 'Generating...' : 'Issue Pre-Approved Pass'}
                  </button>
                </form>
                <div className="bg-white rounded-[3rem] p-8 border border-slate-100 overflow-y-auto max-h-[500px] no-scrollbar">
                  <h2 className="text-xl font-black mb-6 text-slate-800 tracking-tight">Visitor Log</h2>
                  <div className="space-y-3">
                    {visitors.map(v => (
                      <div key={v.id} className="p-5 border border-slate-50 rounded-2xl flex justify-between items-center">
                        <div>
                          <p className="font-black text-slate-900">{v.name}</p>
                          <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mt-1">{v.status} • {v.invite_code || 'WALK-IN'}</p>
                        </div>
                        <span className={`px-4 py-2 rounded-full text-[8px] font-black uppercase tracking-widest border ${v.status === 'ENTERED' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400'}`}>{v.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="max-w-2xl mx-auto pb-20">
                <div className="bg-white p-10 rounded-[4rem] shadow-2xl border border-slate-100 text-center relative overflow-hidden">
                  <div className="w-20 h-20 bg-indigo-50 text-indigo-500 rounded-[2rem] flex items-center justify-center text-3xl mx-auto mb-8">🛠️</div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-2">Gate Integration</h2>
                  <p className="text-slate-500 font-medium mb-10 px-4 leading-relaxed text-sm">Update your Telegram details for real-time security alerts.</p>
                  
                  <div className="space-y-6 text-left">
                    <div className="relative group">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4 mb-2">Telegram Chat ID</label>
                      <input 
                        className="w-full px-8 py-5 bg-slate-50 border border-slate-200 rounded-3xl font-mono font-bold text-indigo-600 outline-none transition-all" 
                        defaultValue={profile.telegram_chat_id} 
                        placeholder="Your Chat ID"
                        onBlur={(e) => {
                          if (e.target.value.trim()) {
                             supabase.from('profiles').update({ telegram_chat_id: e.target.value.trim() }).eq('id', profile.id).then(() => fetchData(true));
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ResidentDashboard;
