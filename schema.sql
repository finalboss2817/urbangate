
-- UrbanGate Database Schema & Security Configuration

-- 1. Tables Definition
CREATE TABLE IF NOT EXISTS buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  resident_code TEXT NOT NULL,
  admin_code TEXT NOT NULL,
  security_code TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  building_id UUID REFERENCES buildings(id) ON DELETE SET NULL,
  full_name TEXT,
  wing TEXT,
  flat_number TEXT,
  phone_number TEXT,
  telegram_chat_id TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS amenities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID REFERENCES buildings(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  capacity INTEGER DEFAULT 10,
  open_time TEXT,
  close_time TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID REFERENCES buildings(id) ON DELETE CASCADE NOT NULL,
  amenity_id UUID REFERENCES amenities(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  resident_name TEXT NOT NULL,
  flat_number TEXT NOT NULL,
  date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID REFERENCES buildings(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID REFERENCES buildings(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID REFERENCES buildings(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  purpose TEXT NOT NULL,
  flat_number TEXT NOT NULL,
  type TEXT NOT NULL, -- 'PRE_APPROVED' | 'WALK_IN'
  status TEXT NOT NULL, -- 'PENDING' | 'WAITING_APPROVAL' | 'ENTERED' | 'EXITED' | 'REJECTED'
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  invite_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID REFERENCES buildings(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  recipient_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  content TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Realtime Configuration
ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER TABLE achievements REPLICA IDENTITY FULL;
ALTER TABLE notices REPLICA IDENTITY FULL;
ALTER TABLE visitors REPLICA IDENTITY FULL;
ALTER TABLE profiles REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
    
    -- Add tables to publication
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE messages, achievements, notices, visitors, profiles;
    EXCEPTION WHEN others THEN
        -- Table might already be in publication
    END;
END $$;

-- 3. Security Helper Functions (SECURITY DEFINER to break recursion)
CREATE OR REPLACE FUNCTION get_auth_role() 
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_auth_building() 
RETURNS UUID AS $$
  SELECT building_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_auth_verified() 
RETURNS BOOLEAN AS $$
  SELECT is_verified FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- 4. RLS Enablement
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies

-- 5.1 Buildings: Publicly readable for login/signup lookup
DROP POLICY IF EXISTS "buildings_read_policy" ON buildings;
CREATE POLICY "buildings_read_policy" ON buildings FOR SELECT USING (true);

-- 5.2 Profiles: Fixes sign-up and recursion
DROP POLICY IF EXISTS "profiles_self_manage" ON profiles;
CREATE POLICY "profiles_self_manage" ON profiles 
FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_admin_view" ON profiles;
CREATE POLICY "profiles_admin_view" ON profiles FOR SELECT USING (
  get_auth_role() IN ('BUILDING_ADMIN', 'SUPER_ADMIN')
);

DROP POLICY IF EXISTS "profiles_resident_view" ON profiles;
CREATE POLICY "profiles_resident_view" ON profiles FOR SELECT USING (
  building_id = get_auth_building() AND is_verified = true
);

-- 5.3 Amenities
DROP POLICY IF EXISTS "amenities_read" ON amenities;
CREATE POLICY "amenities_read" ON amenities FOR SELECT USING (
  building_id = get_auth_building()
);

DROP POLICY IF EXISTS "amenities_admin" ON amenities;
CREATE POLICY "amenities_admin" ON amenities FOR ALL USING (
  get_auth_role() IN ('BUILDING_ADMIN', 'SUPER_ADMIN')
);

-- 5.4 Bookings
DROP POLICY IF EXISTS "bookings_self" ON bookings;
CREATE POLICY "bookings_self" ON bookings FOR ALL USING (
  profile_id = auth.uid()
) WITH CHECK (
  profile_id = auth.uid()
);

DROP POLICY IF EXISTS "bookings_admin" ON bookings;
CREATE POLICY "bookings_admin" ON bookings FOR SELECT USING (
  get_auth_role() IN ('BUILDING_ADMIN', 'SUPER_ADMIN')
);

-- 5.5 Notices
DROP POLICY IF EXISTS "notices_read" ON notices;
CREATE POLICY "notices_read" ON notices FOR SELECT USING (
  building_id = get_auth_building()
);

DROP POLICY IF EXISTS "notices_admin" ON notices;
CREATE POLICY "notices_admin" ON notices FOR ALL USING (
  get_auth_role() IN ('BUILDING_ADMIN', 'SUPER_ADMIN')
);

-- 5.6 Achievements
DROP POLICY IF EXISTS "achievements_read" ON achievements;
CREATE POLICY "achievements_read" ON achievements FOR SELECT USING (
  building_id = get_auth_building()
);

DROP POLICY IF EXISTS "achievements_admin" ON achievements;
CREATE POLICY "achievements_admin" ON achievements FOR ALL USING (
  get_auth_role() IN ('BUILDING_ADMIN', 'SUPER_ADMIN')
);

-- 5.7 Visitors
DROP POLICY IF EXISTS "visitors_resident" ON visitors;
CREATE POLICY "visitors_resident" ON visitors FOR ALL USING (
  building_id = get_auth_building() AND (
    flat_number = (SELECT flat_number FROM profiles WHERE id = auth.uid())
    OR get_auth_role() IN ('SECURITY', 'BUILDING_ADMIN')
  )
);

-- 5.8 Messages
DROP POLICY IF EXISTS "messages_access" ON messages;
CREATE POLICY "messages_access" ON messages FOR ALL USING (
  profile_id = auth.uid() 
  OR recipient_id = auth.uid()
  OR (recipient_id IS NULL AND building_id = get_auth_building())
);
