// Миграция данных из database.json в Supabase
// Запустите этот скрипт один раз после настройки Supabase

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Замените на ваши данные из Supabase Dashboard
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co'
const SUPABASE_SERVICE_KEY = 'YOUR_SERVICE_ROLE_KEY' // Используйте service role key для миграции

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Загружаем данные из database.json
const dbPath = path.join(__dirname, '..', 'backend', 'database.json')
const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'))

async function migrate() {
  console.log('🚀 Начало миграции...')
  
  // 1. Миграция пользователей
  console.log('📦 Миграция пользователей...')
  for (const user of db.users) {
    // Создаем auth.users через admin API
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: user.email,
      password: 'TEMP_PASSWORD_123', // Пользователям нужно будет сбросить пароль
      user_metadata: {
        username: user.username,
        avatar: user.avatar,
        description: user.description,
        old_id: user.id
      },
      email_confirm: true
    })
    
    if (authError) {
      console.error(`Ошибка создания пользователя ${user.username}:`, authError.message)
      continue
    }
    
    // Обновляем профиль
    await supabase.from('profiles').update({
      username: user.username,
      avatar: user.avatar,
      description: user.description,
      subscribers: user.subscribers,
      joined_date: user.joinedDate
    }).eq('id', authData.user.id)
    
    console.log(`✅ Пользователь ${user.username} migrated`)
  }
  
  // 2. Миграция видео
  console.log('📦 Миграция видео...')
  for (const video of db.videos) {
    // Находим нового author_id по old_id
    const { data: author } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', video.authorName)
      .single()
    
    if (!author) {
      console.error(`Не найден автор для видео "${video.title}"`)
      continue
    }
    
    await supabase.from('videos').insert({
      title: video.title,
      description: video.description,
      author_id: author.id,
      video_url: `/api/stream/${video.id}`, // Нужно будет обновить после миграции файлов
      thumbnail_url: video.thumbnailFilename ? `/uploads/thumbnails/${video.thumbnailFilename}` : null,
      views: video.views,
      likes: video.likes,
      dislikes: video.dislikes,
      upload_date: video.uploadDate
    })
    
    console.log(`✅ Видео "${video.title}" migrated`)
  }
  
  // 3. Миграция подписок
  console.log('📦 Миграция подписок...')
  for (const sub of db.subscriptions) {
    // Находим новых user_id по username
    const { data: subscriber } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('username', db.users.find(u => u.id === sub.subscriberId)?.username)
      .single()
    
    const { data: channel } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('username', db.users.find(u => u.id === sub.channelId)?.username)
      .single()
    
    if (subscriber && channel) {
      await supabase.from('subscriptions').insert({
        subscriber_id: subscriber.id,
        channel_id: channel.id,
        created_at: sub.date
      })
      console.log(`✅ Подписка ${subscriber.username} -> ${channel.username} migrated`)
    }
  }
  
  // 4. Миграция комментариев
  console.log('📦 Миграция комментариев...')
  for (const comment of db.comments) {
    const { data: author } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', comment.authorName)
      .single()
    
    if (author) {
      await supabase.from('comments').insert({
        video_id: comment.videoId,
        author_id: author.id,
        text: comment.text,
        likes: comment.likes,
        created_at: comment.date
      })
      console.log(`✅ Комментарий от ${comment.authorName} migrated`)
    }
  }
  
  console.log('✅ Миграция завершена!')
  console.log('⚠️ Важно: Пользователям нужно сбросить пароль через "Forgot password"')
}

migrate().catch(console.error)
