-- ============================================
-- Исправление Supabase Storage для ЖеТуб
-- ============================================

-- 1. Удаляем старые бакеты и создаём новые
DELETE FROM storage.buckets WHERE id IN ('videos', 'thumbnails', 'avatars');

INSERT INTO storage.buckets (id, name, public) 
VALUES 
  ('videos', 'videos', true),
  ('thumbnails', 'thumbnails', true),
  ('avatars', 'avatars', true);

-- 2. Включаем RLS
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Удаляем старые политики
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON storage.objects;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON storage.objects;

-- 4. Создаём новые политики для videos
CREATE POLICY "Public Read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'videos');

CREATE POLICY "Authenticated Upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'videos' 
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "User Delete Own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'videos' 
    AND auth.role() = 'authenticated'
  );

-- 5. Политики для thumbnails
CREATE POLICY "Public Read Thumbnails"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'thumbnails');

CREATE POLICY "Authenticated Upload Thumbnails"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'thumbnails' 
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "User Delete Own Thumbnails"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'thumbnails' 
    AND auth.role() = 'authenticated'
  );

-- 6. Политики для avatars
CREATE POLICY "Public Read Avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated Upload Avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' 
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "User Delete Own Avatars"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars' 
    AND auth.role() = 'authenticated'
  );

-- 7. Проверяем что бакеты публичные
UPDATE storage.buckets SET public = true WHERE id IN ('videos', 'thumbnails', 'avatars');
