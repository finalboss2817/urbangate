
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
      .channel(`resident_node_${profile.id.slice(0, 8)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as ChatMessage;
        if (msg.building_id === buildingId) {
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        setMessages(prev => prev.filter(m => m.id !== payload.old.id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visitors', filter: `flat_number=eq.${flatNumber}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const newVisitor = payload.new as Visitor;
          setVisitors(prev => [newVisitor, ...prev]);
          if (newVisitor.status === 'WAITING_APPROVAL') {
            setPendingRequests(prev => [newVisitor, ...prev]);
          }
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as Visitor;
          setVisitors(prev => prev.map(v => v.id === updated.id ? updated : v));
          if (updated.status !== 'WAITING_APPROVAL') {
            setPendingRequests(prev => prev.filter(v => v.id !== updated.id));
          }
        } else {
          fetchData(true);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'achievements', filter: `building_id=eq.${buildingId}` }, () => fetchData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notices', filter: `building_id=eq.${buildingId}` }, () => fetchData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `profile_id=eq.${profile.id}` }, () => fetchData(true))
      .subscribe((status) => {
        setIsRealtimeActive(status === 'SUBSCRIBED');
      });
      
    return () => { supabase.removeChannel(channel); };
  }, [buildingId, flatNumber, profile.id]);

  useEffect(() => {
    if (activeTab === 'chat') {
      setTimeout(() => scrollToBottom('smooth'), 100);
    }
  }, [messages.length, activeTab]);

  useEffect(() => {
    if (activeTab === 'chat') {
      scrollToBottom('auto');
    }
  }, [activeChat.id]);

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
      // Immediate local refresh to ensure message appears even if realtime is delayed
      fetchData(true);
    } catch (err: any) { alert('Failed to send: ' + err.message); setNewMessage(content); } 
    finally { setIsSending(false); }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('Delete this message?')) return;
    try {
      const { error } = await supabase.from('messages').delete().eq('id', messageId).eq('profile_id', profile.id);
      if (error) throw error;
      // Local state update for immediate feedback
      setMessages(prev => prev.filter(m => m.id !== messageId));
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
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
    // Optimistic UI update
    setPendingRequests(prev => prev.filter(v => v.id !== visitorId));
    setVisitors(prev => prev.map(v => v.id === visitorId ? { ...v, status } : v));
    
    try {
      const { error } = await supabase.from('visitors').update({ 
        status, 
        check_in_at: status === 'ENTERED' ? new Date().toISOString() : null 
      }).eq('id', visitorId);
      
      if (error) throw error;
    } catch (err: any) {
      console.error('Decision error:', err);
      // Revert on error
      fetchData(true);
    }
  };

  const [bookingForm, setBookingForm] = useState({ amenityId: '', date: new Date().toISOString().split('T')[0], startTime: '09:00', endTime: '10:00' });
  const [visitorForm, setVisitorForm] = useState({ name: '', phone: '', purpose: '' });
  const [submitting, setSubmitting] = useState(false);

  const formatTime = (time: string) => {
    if (!time) return '';
    // Handle HH:MM:SS or HH:MM format
    const parts = time.split(':');
    const h = parseInt(parts[0]);
    const m = parts[1] || '00';
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHours = h % 12 || 12;
    return `${displayHours}:${m} ${ampm}`;
  };

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!bookingForm.amenityId) {
      alert("Please select an amenity first.");
      return;
    }
    
    // Basic validation: End time must be after start time
    if (bookingForm.startTime >= bookingForm.endTime) {
      alert("End time must be after start time.");
      return;
    }

    setSubmitting(true);
    console.log('Attempting booking:', { ...bookingForm, profileId: profile.id });
    
    try {
      // 0. Validate against Facility Operating Hours
      const selectedAmenity = amenities.find(a => a.id === bookingForm.amenityId);
      console.log('Selected amenity for validation:', selectedAmenity);
      
      if (selectedAmenity && selectedAmenity.open_time && selectedAmenity.close_time) {
        if (bookingForm.startTime < selectedAmenity.open_time || bookingForm.endTime > selectedAmenity.close_time) {
          throw new Error(`Invalid Time: This facility is only open between ${selectedAmenity.open_time} and ${selectedAmenity.close_time}.`);
        }
      }

      // 1. Check for existing overlapping bookings (Clash Detection)
      const { data: clashes, error: clashError } = await supabase
        .from('bookings')
        .select('id')
        .eq('amenity_id', bookingForm.amenityId)
        .eq('date', bookingForm.date)
        .lt('start_time', bookingForm.endTime) // Existing start is before requested end
        .gt('end_time', bookingForm.startTime); // Existing end is after requested start

      if (clashError) throw clashError;

      if (clashes && clashes.length > 0) {
        throw new Error('This slot is already reserved by another resident. Please choose a different time or date.');
      }

      // 2. Proceed with booking if no clashes
      const { error } = await supabase.from('bookings').insert({ 
        building_id: buildingId, 
        amenity_id: bookingForm.amenityId, 
        profile_id: profile.id, 
        resident_name: name || 'Resident', 
        flat_number: flatNumber, 
        date: bookingForm.date, 
        start_time: bookingForm.startTime, 
        end_time: bookingForm.endTime 
      });
      
      if (error) throw error;
      
      setBookingForm({ ...bookingForm, startTime: '09:00', endTime: '10:00' });
      await fetchData(true);
      alert('Reservation confirmed! ✨');
    } catch (err: any) { 
      console.error('Booking error:', err);
      alert(err.message || 'Failed to complete reservation. Please try again.'); 
    } finally { 
      setSubmitting(false); 
    }
  };

  const handleDeleteBooking = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this reservation?')) return;
    
    try {
      const { error } = await supabase.from('bookings').delete().eq('id', id);
      if (error) throw error;
      fetchData(true);
    } catch (err: any) {
      alert(err.message);
    }
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
    <div className="bg-slate-50 min-h-screen p-3 sm:p-6 md:p-8 animate-fade-in font-sans">
      <div className="max-w-7xl mx-auto flex flex-col">
        {pendingRequests.length > 0 && (
          <div className="mb-6 sm:mb-8 bg-slate-900 rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8 text-white shadow-2xl border border-slate-800">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
              <div className="flex items-center gap-4 sm:gap-5">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white/10 rounded-2xl flex items-center justify-center text-xl sm:text-2xl backdrop-blur-sm">🔔</div>
                <div>
                  <h2 className="text-lg sm:text-xl font-black tracking-tight">Gate Requests</h2>
                  <p className="label-caps text-white/50 mt-1">Action Required</p>
                </div>
              </div>
              <div className="space-y-3 w-full lg:w-auto min-w-0 lg:min-w-[400px]">
                {pendingRequests.map(req => (
                  <div key={req.id} className="bg-white/5 p-4 sm:p-5 rounded-2xl flex justify-between items-center gap-4 border border-white/5 hover:bg-white/10 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm sm:text-base truncate">{req.name}</p>
                      <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white/40 mt-0.5 truncate">{req.purpose}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => handleDecision(req.id, 'REJECTED')} className="px-3 py-2 sm:px-4 sm:py-2 bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white text-[9px] font-black uppercase tracking-widest rounded-xl transition-all border border-red-500/20">Deny</button>
                      <button onClick={() => handleDecision(req.id, 'ENTERED')} className="px-3 py-2 sm:px-4 sm:py-2 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-white text-[9px] font-black uppercase tracking-widest rounded-xl transition-all border border-emerald-500/20">Allow</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 sm:mb-10 gap-6">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-white rounded-2xl sm:rounded-3xl flex items-center justify-center text-2xl sm:text-3xl shadow-sm border border-slate-100">🏠</div>
            <div>
              <h1 className="heading-lg tracking-tight text-xl sm:text-2xl">Unit {profile.wing}-{flatNumber}</h1>
              <div className="flex items-center gap-3 mt-1">
                <p className="label-caps text-slate-500 text-[8px] sm:text-[10px]">{profile.full_name}</p>
                {isRealtimeActive && (
                  <div className="flex items-center gap-1.5 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                    <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest">Live</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <button onClick={onLogout} className="btn-danger w-full sm:w-auto">
            <span>Sign Out</span>
            <span className="text-lg">→</span>
          </button>
        </header>

        <div className="sticky top-2 sm:top-4 z-40 mb-8 sm:mb-10">
          <nav className="flex bg-white rounded-2xl sm:rounded-[2rem] shadow-sm p-1.5 sm:p-2 border border-slate-200 overflow-x-auto gap-2 snap-x snap-mandatory touch-pan-x pb-2">
            {(['notices', 'achievements', 'chat', 'amenities', 'visitors', 'settings'] as const).map(tab => (
              <button 
                key={tab} 
                onClick={() => setActiveTab(tab)} 
                className={`flex-shrink-0 min-w-[100px] sm:min-w-[120px] snap-center px-4 py-3.5 sm:py-4 text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-xl sm:rounded-2xl transition-all duration-300 ${activeTab === tab ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-48 opacity-20 gap-4">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-900">Syncing Node...</p>
          </div>
        ) : (
          <div className="flex-1">
            {activeTab === 'achievements' && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-10 pb-20">
                {achievements.map(a => (
                  <div key={a.id} className="card-modern overflow-hidden flex flex-col group animate-in zoom-in duration-500 rounded-[2rem] sm:rounded-[2.5rem]">
                    {a.image_url && (
                      <div className="h-56 sm:h-72 overflow-hidden relative">
                        <img src={a.image_url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent" />
                        <div className="absolute top-4 left-4 sm:top-6 sm:left-6 bg-white/95 backdrop-blur-md w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl shadow-xl flex items-center justify-center">
                          <span className="text-lg sm:text-xl">🏆</span>
                        </div>
                      </div>
                    )}
                    <div className="p-6 sm:p-10 flex-1 flex flex-col">
                      <h3 className="heading-lg text-lg sm:text-xl mb-3 sm:mb-4 leading-tight">{a.title}</h3>
                      <p className="text-slate-500 font-medium leading-relaxed flex-1 text-sm">{a.content}</p>
                      <div className="mt-8 sm:mt-10 pt-6 sm:pt-8 border-t border-slate-50 flex items-center justify-between">
                         <span className="label-caps opacity-60 text-[8px] sm:text-[10px]">{new Date(a.created_at).toLocaleDateString()}</span>
                         <span className="text-[8px] sm:text-[9px] font-black uppercase text-slate-900 tracking-widest bg-slate-50 px-3 py-1 rounded-full border border-slate-100">Community</span>
                      </div>
                    </div>
                  </div>
                ))}
                {achievements.length === 0 && (
                  <div className="col-span-full py-24 sm:py-40 text-center bg-white rounded-[3rem] sm:rounded-[4rem] border-2 border-dashed border-slate-200">
                    <div className="text-4xl sm:text-5xl mb-4 sm:mb-6 grayscale opacity-30">🏆</div>
                    <p className="label-caps tracking-[0.4em] px-6">The Wall of Fame awaits its first post</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'chat' && (
              <div className="flex bg-white rounded-[2rem] sm:rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden h-[calc(100vh-240px)] sm:h-[calc(100vh-280px)]">
                {/* Sidebar */}
                <div className={`${showMobileList ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-80 border-r border-slate-100 bg-slate-50/20 overflow-hidden transition-all`}>
                  <div className="p-4 sm:p-6 border-b border-slate-100 bg-white shadow-sm">
                    <h3 className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3 sm:mb-4">Channels</h3>
                    <button 
                      onClick={() => { setActiveChat({ type: 'GROUP', name: 'Building Group' }); setShowMobileList(false); }}
                      className={`w-full p-3 sm:p-4 rounded-xl sm:rounded-2xl flex items-center gap-3 sm:gap-4 transition-all ${activeChat.type === 'GROUP' ? 'bg-slate-900 text-white shadow-xl translate-x-1' : 'bg-white hover:bg-slate-50 border border-slate-100'}`}
                    >
                      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-lg sm:text-xl ${activeChat.type === 'GROUP' ? 'bg-white/20' : 'bg-indigo-100 text-indigo-600'}`}>🏢</div>
                      <div className="text-left flex-1">
                        <p className="text-[11px] sm:text-xs font-black">Building Group</p>
                        <p className={`text-[7px] sm:text-[8px] font-bold uppercase tracking-widest ${activeChat.type === 'GROUP' ? 'text-white/60' : 'text-slate-400'}`}>Public Hub</p>
                      </div>
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 show-scrollbar">
                    <h3 className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Verified Neighbors</h3>
                    {neighbors.map(n => (
                      <button 
                        key={n.id}
                        onClick={() => { setActiveChat({ type: 'PRIVATE', id: n.id, name: n.full_name || 'Neighbor' }); setShowMobileList(false); }}
                        className={`w-full p-3 sm:p-4 rounded-xl sm:rounded-2xl flex items-center gap-3 sm:gap-4 transition-all ${activeChat.id === n.id ? 'bg-slate-900 text-white shadow-xl translate-x-1' : 'bg-white hover:bg-slate-50 border border-slate-100'}`}
                      >
                        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-xs sm:text-sm font-black ${activeChat.id === n.id ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>
                          {(n.full_name || 'N').charAt(0).toUpperCase()}
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <p className="text-[11px] sm:text-xs font-black truncate">{n.full_name}</p>
                          <p className={`text-[7px] sm:text-[8px] font-bold uppercase tracking-widest truncate ${activeChat.id === n.id ? 'text-white/60' : 'text-slate-400'}`}>Unit {n.wing}-{n.flat_number}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chat Panel */}
                <div className={`${!showMobileList ? 'flex' : 'hidden'} md:flex flex-col flex-1 overflow-hidden relative`}>
                  <div className="bg-white border-b border-slate-100 px-4 sm:px-8 py-4 sm:py-5 flex justify-between items-center z-10 shadow-sm">
                    <div className="flex items-center gap-3 sm:gap-4">
                      <button onClick={() => setShowMobileList(true)} className="md:hidden p-2 bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 active:scale-90 transition-all">←</button>
                      <div>
                        <h2 className="text-xs sm:text-sm font-black text-slate-900 tracking-tight">{activeChat.name}</h2>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className={`w-1.5 h-1.5 ${isRealtimeActive ? 'bg-emerald-500' : 'bg-slate-300'} rounded-full animate-pulse`}></div>
                          <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-slate-400">Secure Node</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 show-scrollbar bg-slate-50/30">
                    {filteredMessages.map((m) => {
                      const isMe = m.profile_id === profile.id;
                      return (
                        <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group animate-in slide-in-from-bottom-1 duration-300`}>
                          {!isMe && activeChat.type === 'GROUP' && (
                            <div className="flex items-center gap-2 mb-1 px-2">
                              <span className="text-[8px] sm:text-[9px] font-black text-slate-500 uppercase tracking-tighter">{m.user_name}</span>
                            </div>
                          )}
                          <div className="relative max-w-[90%] sm:max-w-[80%] md:max-w-[70%]">
                            <div className={`p-3 sm:p-4 rounded-2xl sm:rounded-[1.5rem] text-sm font-medium leading-relaxed shadow-sm ${isMe ? 'bg-slate-900 text-white rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'}`}>
                              {isMe && (
                                <button 
                                  onClick={() => handleDeleteMessage(m.id)}
                                  className="absolute -left-8 top-1 p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                  title="Delete message"
                                >
                                  🗑️
                                </button>
                              )}
                              {m.content && <p className="whitespace-pre-wrap text-[13px] sm:text-sm">{m.content}</p>}
                              {m.image_url && (
                                <img src={m.image_url} alt="Shared content" className="mt-2 rounded-xl max-h-60 sm:max-h-72 w-full object-cover cursor-pointer hover:brightness-105 border border-white/5 shadow-md" onClick={() => window.open(m.image_url)} />
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

                  <form onSubmit={handleSendMessage} className="p-3 sm:p-4 bg-white border-t border-slate-100">
                    <div className="flex items-center gap-2 sm:gap-3 bg-slate-50 p-1.5 sm:p-2 rounded-2xl sm:rounded-[1.5rem] border border-slate-200 shadow-inner">
                      <label className="p-2 sm:p-3 text-slate-400 hover:text-slate-900 cursor-pointer transition-all hover:bg-white rounded-xl">
                        📷
                        <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                      </label>
                      <input 
                        className="flex-1 px-3 py-2 sm:px-4 sm:py-3 bg-transparent outline-none font-medium text-slate-700 text-sm" 
                        placeholder={activeChat.type === 'GROUP' ? "Post to group..." : `Message...`}
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                      />
                      <button 
                        type="submit" 
                        disabled={isSending || (!newMessage.trim())}
                        className={`p-2 sm:p-3 w-10 h-10 sm:w-12 sm:h-12 rounded-xl transition-all flex items-center justify-center ${isSending || !newMessage.trim() ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 text-white shadow-lg active:scale-95'}`}
                      >
                        {isSending ? '...' : '↗️'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {activeTab === 'notices' && (
              <div className="grid gap-6 sm:gap-8 max-w-4xl mx-auto pb-20">
                {notices.map(n => (
                  <div key={n.id} className="card-modern p-6 sm:p-10 rounded-[2.5rem] sm:rounded-[3rem] hover:translate-y-[-4px] transition-all">
                    <div className="flex justify-between items-start mb-6 sm:mb-8">
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-50 rounded-xl sm:rounded-2xl flex items-center justify-center text-lg sm:text-xl">📢</div>
                        <h3 className="heading-lg text-lg sm:text-xl tracking-tight">{n.title}</h3>
                      </div>
                      <span className="label-caps opacity-50 text-[8px] sm:text-[10px]">{new Date(n.created_at).toLocaleDateString()}</span>
                    </div>
                    <p className="text-slate-600 text-sm sm:text-base leading-relaxed font-medium whitespace-pre-wrap pl-0 sm:pl-16">{n.content}</p>
                  </div>
                ))}
                {notices.length === 0 && (
                  <div className="py-24 sm:py-40 text-center bg-white rounded-[3rem] sm:rounded-[4rem] border-2 border-dashed border-slate-200">
                    <div className="text-4xl sm:text-5xl mb-4 sm:mb-6 grayscale opacity-30">📢</div>
                    <p className="label-caps tracking-[0.4em] px-6">No announcements at the moment</p>
                  </div>
                )}
              </div>
            )}

            {/* Other tabs remain identical */}
            {activeTab === 'amenities' && (
              <div className="grid lg:grid-cols-2 gap-6 sm:gap-10 pb-20">
                <form onSubmit={handleBooking} className="card-modern p-6 sm:p-10 rounded-[2.5rem] sm:rounded-[3.5rem] space-y-6 sm:space-y-8">
                  <div className="flex items-center gap-3 sm:gap-4 mb-2">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-900 text-white rounded-xl sm:rounded-2xl flex items-center justify-center text-lg sm:text-xl">📅</div>
                    <h2 className="heading-lg text-lg sm:text-xl tracking-tight">Facility Booking</h2>
                  </div>
                  <div className="space-y-4 sm:space-y-5">
                    <div className="space-y-2">
                      <label className="label-caps ml-4">Select Amenity</label>
                      <select required className="input-modern" value={bookingForm.amenityId} onChange={e => setBookingForm({...bookingForm, amenityId: e.target.value})}>
                        <option value="">Choose...</option>
                        {amenities.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({formatTime(a.open_time)} - {formatTime(a.close_time)})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="label-caps ml-4">Date</label>
                      <input type="date" required className="input-modern" value={bookingForm.date} onChange={e => setBookingForm({...bookingForm, date: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="label-caps ml-4">Start</label>
                        <input type="time" required className="input-modern" value={bookingForm.startTime} onChange={e => setBookingForm({...bookingForm, startTime: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                        <label className="label-caps ml-4">End</label>
                        <input type="time" required className="input-modern" value={bookingForm.endTime} onChange={e => setBookingForm({...bookingForm, endTime: e.target.value})} />
                      </div>
                    </div>
                  </div>
                  <button type="submit" disabled={submitting} className="btn-primary w-full py-4 sm:py-5">
                    {submitting ? 'Processing...' : 'Reserve Now'}
                  </button>
                </form>
                <div className="card-modern rounded-[2.5rem] sm:rounded-[3.5rem] p-6 sm:p-10 flex flex-col">
                  <h2 className="heading-lg text-lg sm:text-xl mb-6 sm:mb-8 tracking-tight">Active Bookings</h2>
                  <div className="space-y-4 overflow-y-auto show-scrollbar flex-1">
                    {myBookings.map(b => (
                      <div key={b.id} className="p-4 sm:p-6 border border-slate-100 rounded-2xl sm:rounded-3xl flex justify-between items-center bg-slate-50/30 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3 sm:gap-4">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteBooking(b.id);
                            }}
                            className="w-8 h-8 sm:w-10 sm:h-10 bg-white text-red-500 rounded-lg sm:rounded-xl flex items-center justify-center shadow-sm border border-slate-100 hover:bg-red-50 transition-colors relative z-10"
                            title="Cancel Reservation"
                          >
                            🗑️
                          </button>
                          <div>
                            <p className="font-bold text-slate-900 text-sm sm:text-base">{amenities.find(a => a.id === b.amenity_id)?.name}</p>
                            <p className="label-caps opacity-60 mt-1 text-[8px] sm:text-[10px]">{b.date} • {formatTime(b.start_time)} - {formatTime(b.end_time)}</p>
                          </div>
                        </div>
                        <span className="text-[8px] sm:text-[10px] font-black text-emerald-500 bg-emerald-50 px-2 sm:px-3 py-1 rounded-full border border-emerald-100 uppercase tracking-widest">Confirmed</span>
                      </div>
                    ))}
                    {myBookings.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-16 sm:py-20 opacity-30">
                        <div className="text-3xl sm:text-4xl mb-4">📅</div>
                        <p className="label-caps">No active reservations</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'visitors' && (
              <div className="grid lg:grid-cols-2 gap-6 sm:gap-10 pb-20">
                <form onSubmit={handleInviteVisitor} className="card-modern p-6 sm:p-10 rounded-[2.5rem] sm:rounded-[3.5rem] space-y-6 sm:space-y-8">
                  <div className="flex items-center gap-3 sm:gap-4 mb-2">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-900 text-white rounded-xl sm:rounded-2xl flex items-center justify-center text-lg sm:text-xl">🎫</div>
                    <h2 className="heading-lg text-lg sm:text-xl tracking-tight">Issue Gate Pass</h2>
                  </div>
                  <div className="space-y-4 sm:space-y-5">
                    <div className="space-y-2">
                      <label className="label-caps ml-4">Visitor Name</label>
                      <input required className="input-modern" value={visitorForm.name} onChange={e => setVisitorForm({...visitorForm, name: e.target.value})} placeholder="Full Name" />
                    </div>
                    <div className="space-y-2">
                      <label className="label-caps ml-4">Mobile Number</label>
                      <input required className="input-modern" value={visitorForm.phone} onChange={e => setVisitorForm({...visitorForm, phone: e.target.value})} placeholder="+91 00000 00000" />
                    </div>
                    <div className="space-y-2">
                      <label className="label-caps ml-4">Purpose of Visit</label>
                      <input required className="input-modern" value={visitorForm.purpose} onChange={e => setVisitorForm({...visitorForm, purpose: e.target.value})} placeholder="e.g. Personal, Delivery" />
                    </div>
                  </div>
                  <button type="submit" disabled={submitting} className="btn-primary w-full py-4 sm:py-5">
                    {submitting ? 'Generating...' : 'Issue Pre-Approved Pass'}
                  </button>
                </form>
                <div className="card-modern rounded-[2.5rem] sm:rounded-[3.5rem] p-6 sm:p-10 flex flex-col">
                  <h2 className="heading-lg text-lg sm:text-xl mb-6 sm:mb-8 tracking-tight">Visitor Log</h2>
                  <div className="space-y-4 overflow-y-auto show-scrollbar flex-1">
                    {visitors.map(v => (
                      <div key={v.id} className="p-4 sm:p-6 border border-slate-100 rounded-2xl sm:rounded-3xl flex justify-between items-center bg-slate-50/30 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3 sm:gap-4">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white rounded-lg sm:rounded-xl flex items-center justify-center shadow-sm border border-slate-100">👤</div>
                          <div>
                            <p className="font-bold text-slate-900 text-sm sm:text-base">{v.name}</p>
                            <p className="label-caps opacity-60 mt-1 text-[8px] sm:text-[10px]">{v.status} • {v.invite_code || 'WALK-IN'}</p>
                          </div>
                        </div>
                        <span className={`px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-widest border transition-all ${v.status === 'ENTERED' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>{v.status}</span>
                      </div>
                    ))}
                    {visitors.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-16 sm:py-20 opacity-30">
                        <div className="text-3xl sm:text-4xl mb-4">👤</div>
                        <p className="label-caps">No visitor history</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="max-w-2xl mx-auto pb-20">
                <div className="card-modern p-8 sm:p-12 rounded-[3rem] sm:rounded-[4rem] relative overflow-hidden">
                  <div className="w-20 h-20 sm:w-24 sm:h-24 bg-slate-50 text-slate-900 rounded-[2rem] sm:rounded-[2.5rem] flex items-center justify-center text-3xl sm:text-4xl mx-auto mb-8 sm:mb-10 shadow-sm border border-slate-100">🤖</div>
                  <h2 className="heading-lg text-lg sm:text-xl text-center mb-3">Gate Integration</h2>
                  <p className="text-slate-500 font-medium mb-8 sm:mb-12 px-2 sm:px-4 leading-relaxed text-sm text-center">Connect your Telegram account to receive instant visitor alerts and approve entry with a single tap.</p>
                  
                  <div className="space-y-8 sm:space-y-10">
                    {/* Setup Instructions */}
                    <div className="bg-slate-50 p-6 sm:p-10 rounded-[2.5rem] sm:rounded-[3rem] border border-slate-100">
                      <h3 className="label-caps text-slate-900 mb-6 sm:mb-8 flex items-center gap-3">
                        <span className="w-6 h-6 bg-slate-900 text-white rounded-full flex items-center justify-center text-[10px]">!</span>
                        Setup Instructions
                      </h3>
                      <div className="space-y-5 sm:space-y-6">
                        {[
                          { step: 1, text: 'Open Telegram and search for @userinfobot' },
                          { step: 2, text: 'Send any message to get your "Id" (Chat ID)' },
                          { step: 3, text: 'Paste that number in the field below' },
                          { step: 4, text: 'Search for @urbangate2_bot and click "START"' }
                        ].map(item => (
                          <div key={item.step} className="flex gap-4 sm:gap-5 items-start">
                            <span className="text-xs font-black text-slate-300 mt-0.5">{item.step}.</span>
                            <p className="text-sm font-bold text-slate-600 leading-snug">{item.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="label-caps ml-4">Your Telegram Chat ID</label>
                      <input 
                        className="input-modern font-mono text-lg text-center tracking-widest" 
                        defaultValue={profile.telegram_chat_id} 
                        placeholder="e.g. 123456789"
                        onBlur={(e) => {
                          if (e.target.value.trim()) {
                             supabase.from('profiles').update({ telegram_chat_id: e.target.value.trim() }).eq('id', profile.id).then(() => fetchData(true));
                          }
                        }}
                      />
                      <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 text-center animate-pulse">Auto-saves on blur</p>
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
