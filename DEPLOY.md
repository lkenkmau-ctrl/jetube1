# 🚀 Деплой ЖеТуб на Netlify + Supabase

Это руководство по деплою приложения ЖеТуб на статический хостинг Netlify с использованием Supabase как бэкенда.

## 📋 Что вам понадобится

1. **GitHub аккаунт** (для деплоя)
2. **Netlify аккаунт** (бесплатно)
3. **Supabase аккаунт** (бесплатный тариф включает 500MB БД, 1GB хранилища, 50K MAU)

---

## 📝 Шаг 1: Настройка Supabase

### 1.1 Создайте проект в Supabase

1. Перейдите на https://supabase.com
2. Нажмите **"Start your project"**
3. Создайте новый проект (или выберите существующий)
4. Запомните:
   - **Project URL** (например: `https://xxxxxxxxxxxxx.supabase.co`)
   - **anon/public key** (из Settings → API)

### 1.2 Настройте базу данных

1. В Supabase Dashboard перейдите в **SQL Editor**
2. Скопируйте содержимое файла `supabase-schema.sql`
3. Вставьте и выполните (Run)

Это создаст:
- Таблицы: `profiles`, `videos`, `subscriptions`, `video_reactions`, `comments`
- Storage бакеты: `videos`, `thumbnails`, `avatars`
- RLS политики безопасности
- Триггеры для автоматического обновления счетчиков

### 1.3 Настройте аутентификацию

1. Перейдите в **Authentication → Providers**
2. Убедитесь, что **Email** включен
3. (Опционально) Включите Google/GitHub провайдеры

---

## 📝 Шаг 2: Настройка фронтенда

### 2.1 Обновите переменные окружения

Откройте файл `frontend/.env` и замените значения:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2.2 Установите зависимости

```bash
cd frontend
npm install
```

### 2.3 Протестируйте локально

```bash
npm run dev
```

---

## 📝 Шаг 3: Миграция данных (если нужно)

Если у вас есть данные в `backend/database.json`, которые нужно перенести:

### 3.1 Получите Service Role Key

1. В Supabase Dashboard: **Settings → API**
2. Скопируйте **service_role key** (секретный!)

### 3.2 Запустите миграцию

Откройте `migrate-to-supabase.js` и замените:
- `SUPABASE_URL` на ваш URL
- `SUPABASE_SERVICE_KEY` на service role key

Затем запустите:

```bash
node migrate-to-supabase.js
```

⚠️ **Важно:** После миграции пользователям нужно будет сбросить пароль через "Forgot password", так как хэши паролей не совместимы.

---

## 📝 Шаг 4: Деплой на Netlify

### 4.1 Подготовьте репозиторий

1. Создайте GitHub репозиторий (если нет)
2. Закоммитьте все файлы:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 4.2 Создайте сайт на Netlify

1. Перейдите на https://app.netlify.com
2. Нажмите **"Add new site" → "Import an existing project"**
3. Выберите **GitHub** и авторизуйтесь
4. Выберите ваш репозиторий

### 4.3 Настройте сборку

В настройках сборки укажите:

| Поле | Значение |
|------|----------|
| **Base directory** | `frontend` |
| **Build command** | `npm run build` |
| **Publish directory** | `dist` |

### 4.4 Добавьте переменные окружения

В Netlify Dashboard: **Site settings → Environment variables**

Добавьте:
- `VITE_SUPABASE_URL` = `https://your-project.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = `your-anon-key`

### 4.5 Задеплойте

Нажмите **"Deploy site"**

Netlify автоматически:
1. Установит зависимости (`npm install`)
2. Запустит сборку (`npm run build`)
3. Опубликует файлы из `dist/`

---

## 📝 Шаг 5: Настройка домена (опционально)

### 5.1 Бесплатный домен Netlify

Ваш сайт будет доступен по адресу:
```
https://your-site-name.netlify.app
```

### 5.2 Собственный домен

1. В Netlify: **Domain settings → Add custom domain**
2. Введите ваш домен
3. Настройте DNS записи у регистратора домена

---

## 🔧 Структура файлов

```
python supermarket/
├── netlify.toml              # Конфигурация Netlify
├── supabase-schema.sql       # SQL схема для Supabase
├── migrate-to-supabase.js    # Скрипт миграции данных
├── frontend/
│   ├── .env                  # Переменные окружения (заполните!)
│   ├── .env.example          # Пример переменных
│   ├── src/
│   │   ├── App.jsx           # Основное приложение (обновлено для Supabase)
│   │   └── lib/
│   │       └── supabase.js   # Supabase клиент
│   └── public/
│       └── _redirects        # Роутинг для SPA
└── backend/                  # Больше не нужен для деплоя
    ├── server.js
    └── database.json
```

---

## ⚠️ Важные замечания

### Файлы и хранилище

- **Видео, аватарки, обложки** теперь загружаются в Supabase Storage
- Старые файлы из `backend/uploads/` нужно загрузить вручную или через скрипт
- URL файлов будут вида: `https://project.supabase.co/storage/v1/object/public/videos/filename.mp4`

### Аутентификация

- Supabase использует email как основной идентификатор
- Старые пароли не совместимы (использовался SHA-256, а Supabase использует bcrypt)
- Пользователям нужно будет восстановить пароль

### API вызовы

Все API вызовы теперь используют Supabase клиент:

```javascript
// Было:
const res = await fetch('/api/videos')
const data = await res.json()

// Стало:
const { data } = await supabase.from('videos').select('*')
```

---

## 🐛 Решение проблем

### Ошибка CORS при загрузке файлов

Убедитесь, что в Supabase Storage настроены правильные RLS политики (см. `supabase-schema.sql`)

### Видео не воспроизводится

Проверьте, что:
1. Файл загружен в бакет `videos`
2. Бакет публичный (политика "Public videos are viewable by everyone")
3. URL видео правильный (полный URL, а не относительный путь)

### Пользователь не может войти

1. Проверьте, что email подтвержден
2. Убедитесь, что профиль создан в таблице `profiles`
3. При необходимости сбросьте пароль через Supabase Dashboard

---

## 📊 Мониторинг

### Netlify Analytics

- Логи деплоя: **Deploys → [последний деплой]**
- Логи функций: **Functions → Logs**

### Supabase Logs

- Database logs: **Settings → Database → Logs**
- Auth logs: **Authentication → Logs**
- Storage logs: **Storage → Logs**

---

## 💰 Тарифы

### Netlify (Free)
- 100 GB bandwidth/month
- 300 build minutes/month
- Неограниченное количество сайтов

### Supabase (Free)
- 500 MB database
- 1 GB file storage
- 50,000 monthly active users
- 2 GB bandwidth

---

## 📞 Поддержка

Если возникли проблемы:
1. Проверьте логи в Netlify и Supabase
2. Убедитесь, что переменные окружения настроены правильно
3. Проверьте RLS политики в Supabase

---

## ✅ Чеклист перед деплоем

- [ ] Supabase проект создан
- [ ] SQL схема выполнена
- [ ] Переменные `.env` заполнены
- [ ] Локальная сборка работает (`npm run build`)
- [ ] Репозиторий на GitHub создан
- [ ] Netlify сайт создан
- [ ] Переменные окружения добавлены в Netlify
- [ ] Первый деплой успешен

---

**Удачи с деплоем! 🎉**
