# 📥 Настройка Cloudinary для ЖеТуб

## Шаг 1: Регистрация

1. Перейдите на https://cloudinary.com
2. Нажмите **Sign Up Free**
3. Зарегистрируйтесь через Google/GitHub или email

## Шаг 2: Получите данные

После регистрации:

1. В Dashboard скопируйте:
   - **Cloud Name** (например: `dxxxxx`)
   - **API Key**
   - **API Secret**

2. Создайте Upload Preset:
   - Settings → Upload
   - Прокрутите до **Upload presets**
   - Нажмите **Add upload preset**
   - Name: `jetube_videos`
   - Signing Mode: **Unsigned**
   - Folder: `jetube/videos`
   - Сохраните

## Шаг 3: Настройте .env

Откройте `frontend/.env` и заполните:

```env
VITE_CLOUDINARY_CLOUD_NAME=ваш_cloud_name
VITE_CLOUDINARY_UPLOAD_PRESET=jetube_videos
```

## Шаг 4: Обновите код

Cloudinary будет использоваться для видео и изображений.

## Лимиты бесплатного тарифа

- ✅ 25GB хранилище
- ✅ 25GB трафик/мес
- ✅ 25,000 операций/мес
- ✅ Видео до 10 минут
- ✅ Форматы: MP4, WebM, MOV, AVI и др.

## Преимущества

- 🎬 Авто-сжатие видео
- 🎨 Трансформация на лету (размеры, качество)
- ⚡ CDN по всему миру
- 📱 Адаптивная доставка

---

**Готово!**
