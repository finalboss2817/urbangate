
-- 1. Ensure the messages table exists with all required columns
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

-- 2. Create Achievements Table
CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID REFERENCES buildings(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. CRITICAL: Set Replica Identity to FULL for Realtime
ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER TABLE achievements REPLICA IDENTITY FULL;

-- 4. Ensure the supabase_realtime publication includes our tables
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;

    -- Add messages
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messages') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE messages;
    END IF;

    -- Add achievements
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'achievements') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE achievements;
    END IF;
END $$;

-- 5. Enable RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;

-- 6. Achievement Policies
-- Anyone in the building can view achievements
DROP POLICY IF EXISTS "achievements_view_policy" ON achievements;
CREATE POLICY "achievements_view_policy" ON achievements FOR SELECT USING (
  building_id IN (SELECT building_id FROM profiles WHERE id = auth.uid())
);

-- Only Admins can manage achievements
DROP POLICY IF EXISTS "achievements_admin_policy" ON achievements;
CREATE POLICY "achievements_admin_policy" ON achievements FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('BUILDING_ADMIN', 'SUPER_ADMIN')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('BUILDING_ADMIN', 'SUPER_ADMIN')
  )
);

-- 7. Message Policies (Unified Visibility)
DROP POLICY IF EXISTS "messages_view_policy" ON messages;
CREATE POLICY "messages_view_policy" ON messages FOR SELECT USING (
  (recipient_id IS NULL AND building_id IN (SELECT building_id FROM profiles WHERE id = auth.uid()))
  OR (recipient_id = auth.uid())
  OR (profile_id = auth.uid())
);

DROP POLICY IF EXISTS "messages_insert_policy" ON messages;
CREATE POLICY "messages_insert_policy" ON messages FOR INSERT WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS "messages_delete_policy" ON messages;
CREATE POLICY "messages_delete_policy" ON messages FOR DELETE USING (auth.uid() = profile_id);
