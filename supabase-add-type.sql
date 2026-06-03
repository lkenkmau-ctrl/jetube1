-- Добавляем поле type в таблицу videos
ALTER TABLE videos ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'video' CHECK (type IN ('video', 'shorts'));

-- Индекс для быстрого поиска shorts
CREATE INDEX IF NOT EXISTS idx_videos_type ON videos(type);
