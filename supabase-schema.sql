-- ==========================================
-- ЖеТуб - SQL скрипт для Supabase
-- ==========================================

-- 1. Таблица пользователей (profiles)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  avatar TEXT,
  subscribers BIGINT DEFAULT 0,
  description TEXT DEFAULT '',
  joined_date TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Таблица видео
CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  author_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  views BIGINT DEFAULT 0,
  likes BIGINT DEFAULT 0,
  dislikes BIGINT DEFAULT 0,
  upload_date TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Таблица подписок
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  channel_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(subscriber_id, channel_id)
);

-- 4. Таблица реакций (лайки/дизлайки)
CREATE TABLE IF NOT EXISTS video_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  reaction_type TEXT CHECK (reaction_type IN ('like', 'dislike')) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(video_id, user_id)
);

-- 5. Таблица комментариев
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE NOT NULL,
  author_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  likes BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Таблица истории просмотров
CREATE TABLE IF NOT EXISTS watch_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE NOT NULL,
  watched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, video_id)
);

-- ==========================================
-- RLS (Row Level Security) Policies
-- ==========================================

-- Profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Videos
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public videos are viewable by everyone"
  ON videos FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own videos"
  ON videos FOR INSERT
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update own videos"
  ON videos FOR UPDATE
  USING (auth.uid() = author_id);

CREATE POLICY "Users can delete own videos"
  ON videos FOR DELETE
  USING (auth.uid() = author_id);

-- Subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public subscriptions are viewable by everyone"
  ON subscriptions FOR SELECT
  USING (true);

CREATE POLICY "Users can manage own subscriptions"
  ON subscriptions FOR ALL
  USING (auth.uid() = subscriber_id);

-- Video reactions
ALTER TABLE video_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public reactions are viewable by everyone"
  ON video_reactions FOR SELECT
  USING (true);

CREATE POLICY "Users can manage own reactions"
  ON video_reactions FOR ALL
  USING (auth.uid() = user_id);

-- Comments
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public comments are viewable by everyone"
  ON comments FOR SELECT
  USING (true);

CREATE POLICY "Users can insert comments"
  ON comments FOR INSERT
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update own comments"
  ON comments FOR UPDATE
  USING (auth.uid() = author_id);

CREATE POLICY "Users can delete own comments"
  ON comments FOR DELETE
  USING (auth.uid() = author_id);

-- Watch history
ALTER TABLE watch_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own watch history"
  ON watch_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own watch history"
  ON watch_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own watch history"
  ON watch_history FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own watch history"
  ON watch_history FOR DELETE
  USING (auth.uid() = user_id);

-- ==========================================
-- Functions & Triggers
-- ==========================================

-- Функция для создания профиля при регистрации
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email, avatar, subscribers, description, joined_date)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'username',
    NEW.email,
    NEW.raw_user_meta_data->>'avatar',
    0,
    COALESCE(NEW.raw_user_meta_data->>'description', ''),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Триггер на создание профиля
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Функция для обновления счетчика лайков
CREATE OR REPLACE FUNCTION public.update_video_likes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE videos SET 
      likes = (SELECT COUNT(*) FROM video_reactions WHERE video_id = NEW.video_id AND reaction_type = 'like'),
      dislikes = (SELECT COUNT(*) FROM video_reactions WHERE video_id = NEW.video_id AND reaction_type = 'dislike')
    WHERE id = NEW.video_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE videos SET 
      likes = (SELECT COUNT(*) FROM video_reactions WHERE video_id = OLD.video_id AND reaction_type = 'like'),
      dislikes = (SELECT COUNT(*) FROM video_reactions WHERE video_id = OLD.video_id AND reaction_type = 'dislike')
    WHERE id = OLD.video_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Триггер на обновление лайков
DROP TRIGGER IF EXISTS on_video_reaction_change ON video_reactions;
CREATE TRIGGER on_video_reaction_change
  AFTER INSERT OR DELETE ON video_reactions
  FOR EACH ROW EXECUTE FUNCTION public.update_video_likes();

-- Функция для обновления счетчика подписчиков
CREATE OR REPLACE FUNCTION public.update_subscriber_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET subscribers = subscribers + 1 WHERE id = NEW.channel_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET subscribers = GREATEST(0, subscribers - 1) WHERE id = OLD.channel_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Триггер на обновление подписчиков
DROP TRIGGER IF EXISTS on_subscription_change ON subscriptions;
CREATE TRIGGER on_subscription_change
  AFTER INSERT OR DELETE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_subscriber_count();

-- Функция для увеличения счетчика просмотров
CREATE OR REPLACE FUNCTION public.increment_views(video_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE videos SET views = views + 1 WHERE id = video_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- Supabase Storage Buckets
-- ==========================================

-- Создаем бакеты для файлов
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('thumbnails', 'thumbnails', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

-- Policies для storage
CREATE POLICY "Public videos are viewable by everyone"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'videos');

CREATE POLICY "Users can upload videos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own videos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Public thumbnails are viewable by everyone"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'thumbnails');

CREATE POLICY "Users can upload thumbnails"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own thumbnails"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Public avatars are viewable by everyone"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own avatars"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ==========================================
-- Индексы для производительности
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_videos_author ON videos(author_id);
CREATE INDEX IF NOT EXISTS idx_videos_upload_date ON videos(upload_date DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_subscriber ON subscriptions(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_channel ON subscriptions(channel_id);
CREATE INDEX IF NOT EXISTS idx_video_reactions_video ON video_reactions(video_id);
CREATE INDEX IF NOT EXISTS idx_video_reactions_user ON video_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_video ON comments(video_id);
CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author_id);
CREATE INDEX IF NOT EXISTS idx_watch_history_user ON watch_history(user_id);
CREATE INDEX IF NOT EXISTS idx_watch_history_video ON watch_history(video_id);
