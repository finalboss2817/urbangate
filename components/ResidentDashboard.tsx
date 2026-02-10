
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Notice, Amenity, Booking, Visitor } from '../types';

interface Props {
  buildingId: string;
  flatNumber: string;
  name: string;
  onLogout: () => void;
}

const ResidentDashboard: React.FC<Props> = ({ buildingId, flatNumber, name, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'notices' | 'amenities' | 'visitors'>('notices');
  const [notices, setNotices] = useState<Notice[]>([]);
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [allBookings, setAllBookings] = useState<Booking[]>([]); 
  const [myBookings, setMyBookings] = useState<Booking[]>([]); 
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);

  const [bookingForm, setBookingForm] = useState({ amenityId: '', date: new Date().toISOString().split('T')[0], startTime: '09:00', endTime: '10:00' });
  const [visitorForm, setVisitorForm] = useState({ name: '', phone: '', purpose: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [noticesRes, amenitiesRes, allBookingsRes, visitorsRes] = await Promise.all([
        supabase.from('notices').select('*').eq('building_id', buildingId).order('created_at', { ascending: false }),
        supabase.from('amenities').select('*').eq('building_id', buildingId),
        supabase.from('bookings').select('*').eq('building_id', buildingId).order('date', { ascending: false }),
        supabase.from('visitors').select('*').eq('building_id', buildingId).eq('flat_number', flatNumber).order('created_at', { ascending: false })
      ]);

      if (noticesRes.data) setNotices(noticesRes.data);
      if (amenitiesRes.data) setAmenities(amenitiesRes.data);
      if (allBookingsRes.data) {
        setAllBookings(allBookingsRes.data);
        setMyBookings(allBookingsRes.data.filter(b => b.flat_number === flatNumber));
      }
      if (visitorsRes.data) setVisitors(visitorsRes.data);
    } catch (err) {
      console.error('Data fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [buildingId, flatNumber]);

  const selectedAmenity = useMemo(() => 
    amenities.find(a => a.id === bookingForm.amenityId), 
    [amenities, bookingForm.amenityId]
  );

  const daySchedule = useMemo(() => {
    if (!selectedAmenity || !bookingForm.date || !selectedAmenity.open_time || !selectedAmenity.close_time) return [];
    const slots = [];
    try {
      const open = parseInt(selectedAmenity.open_time.split(':')[0]);
      const close = parseInt(selectedAmenity.close_time.split(':')[0]);
      const dayBookings = allBookings.filter(b => b.amenity_id === selectedAmenity.id && b.date === bookingForm.date);

      for (let h = open; h < close; h++) {
        const timeStr = `${h.toString().padStart(2, '0')}:00`;
        const nextTimeStr = `${(h + 1).toString().padStart(2, '0')}:00`;
        const isBooked = dayBookings.some(b => (timeStr >= b.start_time && timeStr < b.end_time) || (nextTimeStr > b.start_time && nextTimeStr <= b.end_time));
        const isMine = dayBookings.some(b => b.flat_number === flatNumber && ((timeStr >= b.start_time && timeStr < b.end_time) || (nextTimeStr > b.start_time && nextTimeStr <= b.end_time)));
        slots.push({ time: timeStr, isBooked, isMine });
      }
    } catch (e) {
      return [];
    }
    return slots;
  }, [selectedAmenity, bookingForm.date, allBookings, flatNumber]);

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (!selectedAmenity) throw new Error('Please select an amenity.');
      if (bookingForm.startTime >= bookingForm.endTime) throw new Error('Start time must be before end time.');
      if (bookingForm.startTime < selectedAmenity.open_time || bookingForm.endTime > selectedAmenity.close_time) {
        throw new Error(`Booking must be between ${selectedAmenity.open_time} and ${selectedAmenity.close_time}`);
      }
      const hasOverlap = allBookings.some(b => b.amenity_id === bookingForm.amenityId && b.date === bookingForm.date && ((bookingForm.startTime >= b.start_time && bookingForm.startTime < b.end_time) || (bookingForm.endTime > b.start_time && bookingForm.endTime <= b.end_time) || (bookingForm.startTime <= b.start_time && bookingForm.endTime >= b.end_time)));
      if (hasOverlap) throw new Error('Slot occupied.');
      
      const { data: userData } = await supabase.auth.getUser();
      const { error: bookingError } = await supabase.from('bookings').insert({ building_id: buildingId, amenity_id: bookingForm.amenityId, resident_name: name, flat_number: flatNumber, date: bookingForm.date, start_time: bookingForm.startTime, end_time: bookingForm.endTime, profile_id: userData.user?.id });
      if (bookingError) throw bookingError;
      
      setBookingForm({ ...bookingForm, startTime: '09:00', endTime: '10:00' });
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelBooking = async (id: string) => {
    if (!confirm('Cancel this reservation?')) return;
    const { error } = await supabase.from('bookings').delete().eq('id', id);
    if (error) alert(error.message);
    else fetchData();
  };

  const handleInviteVisitor = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const invite_code = Math.floor(100000 + Math.random() * 900000).toString();
      const { error: visitorError } = await supabase.from('visitors').insert({ name: visitorForm.name.trim(), phone: visitorForm.phone.trim(), purpose: visitorForm.purpose.trim(), building_id: buildingId, flat_number: flatNumber, type: 'PRE_APPROVED', status: 'PENDING', invite_code });
      if (visitorError) throw visitorError;
      setVisitorForm({ name: '', phone: '', purpose: '' });
      await fetchData();
    } catch (err: any) {
      alert('Invite Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeInvite = async (id: string) => {
    if (!confirm('Revoke this guest invitation?')) return;
    const { error } = await supabase.from('visitors').delete().eq('id', id);
    if (error) alert(error.message);
    else fetchData();
  };

  const copyToClipboard = (code: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code);
    } else {
      alert('Code: ' + code);
    }
  };

  return (
    <div className="bg-[#f8fafc] min-h-screen p-4 md:p-8 font-inter">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-indigo-600 rounded-[2.5rem] flex items-center justify-center text-4xl shadow-2xl shadow-indigo-100">🏙️</div>
            <div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tight">Welcome, {name?.split(' ')[0] || 'Resident'}</h1>
              <p className="text-slate-400 font-bold uppercase text-xs tracking-[0.3em] mt-2">Unit {flatNumber || 'N/A'}</p>
            </div>
          </div>
          <button onClick={onLogout} className="px-8 py-4 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all">
            Sign Out
          </button>
        </header>

        <nav className="flex bg-white rounded-[2.5rem] shadow-sm p-2 border border-slate-200 mb-12 sticky top-6 z-50 backdrop-blur-md">
          {(['notices', 'amenities', 'visitors'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 py-5 text-sm font-black uppercase tracking-widest rounded-[2rem] transition-all ${activeTab === tab ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-400 hover:text-slate-600'}`}>
              {tab}
            </button>
          ))}
        </nav>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-48 gap-4 opacity-20">
            <div className="w-14 h-14 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-black uppercase tracking-widest">Syncing Home Node...</p>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-400">
            {activeTab === 'notices' && (
              <div className="space-y-8">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-4">
                  <span className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center text-xl">📢</span>
                  Recent Updates
                </h2>
                <div className="grid gap-6">
                  {notices.map(n => (
                    <div key={n.id} className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 group hover:shadow-xl transition-all">
                      <div className="flex justify-between items-start mb-6">
                        <h3 className="font-black text-2xl text-slate-900 tracking-tight">{n.title}</h3>
                        <span className="text-slate-400 text-xs font-black uppercase tracking-widest">{new Date(n.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="text-slate-600 text-lg leading-relaxed font-medium whitespace-pre-wrap">{n.content}</p>
                    </div>
                  ))}
                  {notices.length === 0 && (
                    <div className="p-24 text-center text-slate-300 font-black uppercase text-sm tracking-widest bg-white rounded-[3rem] border-4 border-dashed border-slate-50">
                      No announcements posted today.
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'amenities' && (
              <div className="grid lg:grid-cols-12 gap-12">
                <div className="lg:col-span-5">
                  <h2 className="text-2xl font-black mb-8 text-slate-800 tracking-tight">Book Facility</h2>
                  <form onSubmit={handleBooking} className="bg-white p-10 rounded-[3.5rem] shadow-2xl border border-slate-50 space-y-8">
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Select Amenity</label>
                        <select required className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-base font-bold focus:border-indigo-500" value={bookingForm.amenityId} onChange={e => setBookingForm({...bookingForm, amenityId: e.target.value})}>
                          <option value="">Choose...</option>
                          {amenities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                        {selectedAmenity && (
                          <p className="text-xs font-bold text-indigo-500 mt-3 ml-1 uppercase tracking-wider">
                            Hours: {selectedAmenity.open_time} - {selectedAmenity.close_time} • Cap: {selectedAmenity.capacity}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Visit Date</label>
                        <input type="date" required className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-base font-bold" value={bookingForm.date} onChange={e => setBookingForm({...bookingForm, date: e.target.value})} min={new Date().toISOString().split('T')[0]} />
                      </div>
                      {selectedAmenity && (
                        <div className="space-y-3 py-2">
                          <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Availability Map</label>
                          <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
                            {daySchedule.map((slot, idx) => (
                              <div key={idx} className="flex flex-col items-center min-w-[48px]">
                                <div className={`w-10 h-10 rounded-xl mb-2 border-2 ${slot.isMine ? 'bg-indigo-600 border-indigo-700' : slot.isBooked ? 'bg-red-500 border-red-600' : 'bg-emerald-500 border-emerald-600'} shadow-sm`}></div>
                                <span className="text-[10px] font-black text-slate-400">{slot.time}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">From</label>
                          <input type="time" required className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-base font-bold" value={bookingForm.startTime} onChange={e => setBookingForm({...bookingForm, startTime: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">To</label>
                          <input type="time" required className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-base font-bold" value={bookingForm.endTime} onChange={e => setBookingForm({...bookingForm, endTime: e.target.value})} />
                        </div>
                      </div>
                    </div>
                    {error && <p className="p-5 bg-red-50 text-red-600 text-xs font-black uppercase text-center rounded-2xl border border-red-100 leading-relaxed">{error}</p>}
                    <button type="submit" disabled={submitting} className="w-full py-6 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-[2rem] shadow-2xl shadow-indigo-100 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-[0.2em] text-sm">
                      {submitting ? 'Authenticating...' : 'Secure Reservation'}
                    </button>
                  </form>
                </div>
                <div className="lg:col-span-7">
                  <h2 className="text-2xl font-black mb-8 text-slate-800 tracking-tight">Your Schedule</h2>
                  <div className="bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden divide-y divide-slate-100">
                    {myBookings.map(b => (
                      <div key={b.id} className="p-8 flex justify-between items-center group relative hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-6">
                          <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center font-black text-xs border border-slate-200">PASS</div>
                          <div>
                            <p className="font-black text-xl text-slate-900 tracking-tight">{amenities.find(a => a.id === b.amenity_id)?.name}</p>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                              {new Date(b.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} • {b.start_time} - {b.end_time}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <button 
                            onClick={() => handleCancelBooking(b.id)}
                            className="px-5 py-2.5 text-xs font-black text-red-400 hover:text-red-600 bg-red-50/0 hover:bg-red-50 rounded-xl uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all"
                          >
                            Cancel
                          </button>
                          <span className="px-5 py-2.5 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded-full uppercase border border-indigo-100 tracking-widest">Scheduled</span>
                        </div>
                      </div>
                    ))}
                    {myBookings.length === 0 && (
                      <div className="p-32 text-center">
                        <p className="text-slate-300 font-black text-sm uppercase tracking-widest">No active reservations.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'visitors' && (
              <div className="grid lg:grid-cols-12 gap-12">
                <div className="lg:col-span-5">
                  <h2 className="text-2xl font-black mb-8 text-slate-800 tracking-tight">New Guest Pass</h2>
                  <form onSubmit={handleInviteVisitor} className="bg-white p-10 rounded-[3.5rem] shadow-2xl border border-slate-50 space-y-6">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Guest Name</label>
                      <input required className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-base font-bold" value={visitorForm.name} onChange={e => setVisitorForm({...visitorForm, name: e.target.value})} placeholder="Full name" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Phone</label>
                      <input required className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-base font-bold" value={visitorForm.phone} onChange={e => setVisitorForm({...visitorForm, phone: e.target.value})} placeholder="+1 234 567 890" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Purpose</label>
                      <input required className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-base font-bold" value={visitorForm.purpose} onChange={e => setVisitorForm({...visitorForm, purpose: e.target.value})} placeholder="Reason for visit" />
                    </div>
                    <button type="submit" disabled={submitting} className="w-full py-6 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-[2rem] shadow-2xl transition-all active:scale-95 disabled:opacity-50 uppercase tracking-[0.2em] text-sm mt-6">
                      {submitting ? 'Generating...' : 'Issue Access Pass'}
                    </button>
                  </form>
                </div>
                <div className="lg:col-span-7">
                  <h2 className="text-2xl font-black mb-8 text-slate-800 tracking-tight">Visit History</h2>
                  <div className="space-y-6">
                    {visitors.map(v => (
                      <div key={v.id} className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 flex justify-between items-center group transition-all hover:border-indigo-200 relative">
                        {v.status === 'PENDING' && (
                          <button 
                            onClick={() => handleRevokeInvite(v.id)}
                            className="absolute top-6 right-10 text-[10px] font-black text-red-300 hover:text-red-500 uppercase tracking-[0.2em] opacity-0 group-hover:opacity-100 transition-all p-2 bg-red-50/0 hover:bg-red-50 rounded-lg"
                          >
                            Revoke Invite
                          </button>
                        )}
                        <div className="flex items-center gap-6">
                          <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center text-3xl ${v.status === 'ENTERED' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100' : 'bg-slate-50 text-slate-200'}`}>
                            {v.status === 'ENTERED' ? '👤' : '⌛'}
                          </div>
                          <div>
                            <p className="font-black text-2xl text-slate-900 tracking-tight">{v.name}</p>
                            <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mt-1">{v.purpose}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          {v.type === 'PRE_APPROVED' && v.status === 'PENDING' && (
                            <div className="mb-4">
                              <span className="text-[10px] font-black text-slate-300 uppercase block mb-2 tracking-widest">Entry Passcode</span>
                              <div className="flex items-center gap-3">
                                <p className="text-2xl font-mono font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg">{v.invite_code}</p>
                                <button onClick={() => { copyToClipboard(v.invite_code!); alert('Code Copied!'); }} className="text-indigo-300 hover:text-indigo-600 p-2 hover:bg-indigo-50 rounded-lg transition-all">📋</button>
                              </div>
                            </div>
                          )}
                          <span className={`text-[10px] font-black px-4 py-2 rounded-full uppercase tracking-widest border-2 ${v.status === 'PENDING' ? 'bg-amber-50 text-amber-600 border-amber-100' : v.status === 'ENTERED' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>{v.status}</span>
                        </div>
                      </div>
                    ))}
                    {visitors.length === 0 && (
                      <div className="p-32 text-center text-slate-300 font-black uppercase text-sm tracking-widest bg-white rounded-[3rem] border-4 border-dashed border-slate-50">
                        No traffic records.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <footer className="mt-24 mb-12 text-center text-slate-300 text-xs font-black uppercase tracking-[0.8em] opacity-40">UrbanGate Resident Interface v5.0.0</footer>
    </div>
  );
};

export default ResidentDashboard;
