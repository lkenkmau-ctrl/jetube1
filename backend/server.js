const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const app = express();
const PORT = 5000;

// Session storage (in-memory for simplicity)
const sessions = {};

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const videosDir = path.join(uploadsDir, 'videos');
const thumbnailsDir = path.join(__dirname, 'uploads', 'thumbnails');
const avatarsDir = path.join(uploadsDir, 'avatars');

[uploadsDir, videosDir, thumbnailsDir, avatarsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Database file
const dbPath = path.join(__dirname, 'database.json');

function loadDatabase() {
  if (!fs.existsSync(dbPath)) {
    const initialData = { 
      users: [], 
      videos: [],
      subscriptions: [],
      comments: []
    };
    fs.writeFileSync(dbPath, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
}

function saveDatabase(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

// Helper: get current user from session
function getCurrentUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !sessions[token]) return null;
  return sessions[token].user;
}

// Helper: hash password
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'video') {
      cb(null, videosDir);
    } else if (file.fieldname === 'thumbnail') {
      cb(null, thumbnailsDir);
    } else if (file.fieldname === 'avatar') {
      cb(null, avatarsDir);
    } else {
      cb(null, uploadsDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

// ============ AUTH ROUTES ============

// Register
app.post('/api/auth/register', upload.single('avatar'), (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }
    
    const db = loadDatabase();
    
    // Check if user exists
    if (db.users.find(u => u.username === username)) {
      return res.status(400).json({ error: 'Имя пользователя занято' });
    }
    if (db.users.find(u => u.email === email)) {
      return res.status(400).json({ error: 'Email уже используется' });
    }
    
    const user = {
      id: uuidv4(),
      username,
      email,
      passwordHash: hashPassword(password),
      avatar: req.file ? req.file.filename : null,
      subscribers: 0,
      description: '',
      joinedDate: new Date().toISOString()
    };
    
    db.users.push(user);
    saveDatabase(db);
    
    // Create session
    const token = uuidv4();
    sessions[token] = { user: { id: user.id, username: user.username, avatar: user.avatar } };
    
    res.json({ 
      success: true, 
      token, 
      user: { id: user.id, username: user.username, avatar: user.avatar } 
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

// Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Введите логин и пароль' });
    }
    
    const db = loadDatabase();
    const user = db.users.find(u => u.username === username && u.passwordHash === hashPassword(password));
    
    if (!user) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    
    // Create session
    const token = uuidv4();
    sessions[token] = { user: { id: user.id, username: user.username, avatar: user.avatar } };
    
    res.json({ 
      success: true, 
      token, 
      user: { id: user.id, username: user.username, avatar: user.avatar } 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token && sessions[token]) {
    delete sessions[token];
  }
  res.json({ success: true });
});

// Get current user
app.get('/api/auth/me', (req, res) => {
  const user = getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Не авторизован' });
  }
  res.json({ user });
});

// ============ USER ROUTES ============

// Get user profile
app.get('/api/users/:id', (req, res) => {
  const db = loadDatabase();
  const user = db.users.find(u => u.id === req.params.id);
  
  if (!user) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  
  const currentUser = getCurrentUser(req);
  const isSubscribed = currentUser 
    ? db.subscriptions.some(s => s.subscriberId === currentUser.id && s.channelId === user.id)
    : false;
  
  const userVideos = db.videos.filter(v => v.authorId === user.id);
  
  res.json({
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    description: user.description,
    subscribers: user.subscribers,
    joinedDate: user.joinedDate,
    isSubscribed,
    videos: userVideos.length
  });
});

// Update profile
app.put('/api/users/profile', upload.single('avatar'), (req, res) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'Не авторизован' });
  }
  
  const { description } = req.body;
  const db = loadDatabase();
  const userIndex = db.users.findIndex(u => u.id === currentUser.id);
  
  if (userIndex === -1) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  
  if (description !== undefined) {
    db.users[userIndex].description = description;
  }
  if (req.file) {
    db.users[userIndex].avatar = req.file.filename;
    currentUser.avatar = req.file.filename;
  }
  
  saveDatabase(db);
  
  res.json({ 
    success: true, 
    user: { 
      id: db.users[userIndex].id, 
      username: db.users[userIndex].username, 
      avatar: db.users[userIndex].avatar,
      description: db.users[userIndex].description
    } 
  });
});

// Subscribe/Unsubscribe
app.post('/api/users/:id/subscribe', (req, res) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'Необходимо войти' });
  }
  
  if (currentUser.id === req.params.id) {
    return res.status(400).json({ error: 'Нельзя подписаться на себя' });
  }
  
  const db = loadDatabase();
  const channel = db.users.find(u => u.id === req.params.id);
  
  if (!channel) {
    return res.status(404).json({ error: 'Канал не найден' });
  }
  
  const existingSub = db.subscriptions.find(
    s => s.subscriberId === currentUser.id && s.channelId === req.params.id
  );
  
  if (existingSub) {
    // Unsubscribe
    db.subscriptions = db.subscriptions.filter(
      s => !(s.subscriberId === currentUser.id && s.channelId === req.params.id)
    );
    channel.subscribers = Math.max(0, channel.subscribers - 1);
  } else {
    // Subscribe
    db.subscriptions.push({
      id: uuidv4(),
      subscriberId: currentUser.id,
      channelId: req.params.id,
      date: new Date().toISOString()
    });
    channel.subscribers = (channel.subscribers || 0) + 1;
  }
  
  saveDatabase(db);
  
  res.json({ 
    success: true, 
    subscribed: !existingSub,
    subscribers: channel.subscribers 
  });
});

// Get subscriptions
app.get('/api/subscriptions', (req, res) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'Необходимо войти' });
  }
  
  const db = loadDatabase();
  const subs = db.subscriptions
    .filter(s => s.subscriberId === currentUser.id)
    .map(s => {
      const channel = db.users.find(u => u.id === s.channelId);
      return channel ? {
        id: channel.id,
        username: channel.username,
        avatar: channel.avatar,
        subscribers: channel.subscribers
      } : null;
    })
    .filter(Boolean);
  
  res.json(subs);
});

// ============ VIDEO ROUTES ============

// Get all videos
app.get('/api/videos', (req, res) => {
  const db = loadDatabase();
  const searchQuery = req.query.q?.toLowerCase();
  const channelId = req.query.channelId;
  
  let videos = db.videos;
  
  if (searchQuery) {
    videos = videos.filter(v => 
      v.title.toLowerCase().includes(searchQuery) ||
      v.description?.toLowerCase().includes(searchQuery)
    );
  }
  
  if (channelId) {
    videos = videos.filter(v => v.authorId === channelId);
  }
  
  // Add author info to each video
  videos = videos.map(v => {
    const author = db.users.find(u => u.id === v.authorId);
    return {
      ...v,
      authorName: author?.username || 'Unknown',
      authorAvatar: author?.avatar || null
    };
  }).reverse();
  
  res.json(videos);
});

// Get liked videos
app.get('/api/videos/liked', (req, res) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'Необходимо войти' });
  }
  
  const db = loadDatabase();
  const likedVideos = db.videos
    .filter(v => v.likedBy && v.likedBy.includes(currentUser.id))
    .map(v => {
      const author = db.users.find(u => u.id === v.authorId);
      return {
        ...v,
        authorName: author?.username || 'Unknown',
        authorAvatar: author?.avatar || null
      };
    })
    .reverse();
  res.json(likedVideos);
});

// Get disliked videos
app.get('/api/videos/disliked', (req, res) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'Необходимо войти' });
  }
  
  const db = loadDatabase();
  const dislikedVideos = db.videos
    .filter(v => v.dislikedBy && v.dislikedBy.includes(currentUser.id))
    .map(v => {
      const author = db.users.find(u => u.id === v.authorId);
      return {
        ...v,
        authorName: author?.username || 'Unknown',
        authorAvatar: author?.avatar || null
      };
    })
    .reverse();
  res.json(dislikedVideos);
});

// Get single video
app.get('/api/videos/:id', (req, res) => {
  const db = loadDatabase();
  const video = db.videos.find(v => v.id === req.params.id);
  
  if (!video) {
    return res.status(404).json({ error: 'Video not found' });
  }
  
  const author = db.users.find(u => u.id === video.authorId);
  
  res.json({
    ...video,
    authorName: author?.username || 'Unknown',
    authorAvatar: author?.avatar || null,
    authorId: author?.id || null
  });
});

// Stream video
app.get('/api/stream/:id', (req, res) => {
  const db = loadDatabase();
  const video = db.videos.find(v => v.id === req.params.id);
  
  if (!video) {
    return res.status(404).json({ error: 'Video not found' });
  }
  
  const videoPath = path.join(videosDir, video.videoFilename);
  
  if (!fs.existsSync(videoPath)) {
    return res.status(404).json({ error: 'Video file not found' });
  }
  
  // Detect content type from file extension
  const ext = path.extname(video.videoFilename).toLowerCase();
  const contentTypes = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska'
  };
  const contentType = contentTypes[ext] || 'application/octet-stream';
  
  const stat = fs.statSync(videoPath);
  const fileSize = stat.size;
  const range = req.headers.range;
  
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    
    const file = fs.createReadStream(videoPath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    };
    
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    };
    res.writeHead(200, head);
    fs.createReadStream(videoPath).pipe(res);
  }
});

// Upload video (requires auth)
app.post('/api/upload', upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), (req, res) => {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Необходимо войти' });
    }
    
    const { title, description } = req.body;
    
    if (!req.files || !req.files.video) {
      return res.status(400).json({ error: 'Video file is required' });
    }
    
    const videoFile = req.files.video[0];
    const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null;
    
    const videoData = {
      id: uuidv4(),
      title: title || 'Untitled',
      description: description || '',
      authorId: currentUser.id,
      authorName: currentUser.username,
      authorAvatar: currentUser.avatar,
      videoFilename: videoFile.filename,
      thumbnailFilename: thumbnailFile ? thumbnailFile.filename : null,
      views: 0,
      likes: 0,
      dislikes: 0,
      likedBy: [],
      dislikedBy: [],
      uploadDate: new Date().toISOString()
    };
    
    const db = loadDatabase();
    db.videos.push(videoData);
    saveDatabase(db);
    
    res.json({ success: true, video: videoData });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Delete video
app.delete('/api/videos/:id', (req, res) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'Необходимо войти' });
  }
  
  const db = loadDatabase();
  const videoIndex = db.videos.findIndex(v => v.id === req.params.id);
  
  if (videoIndex === -1) {
    return res.status(404).json({ error: 'Video not found' });
  }
  
  const video = db.videos[videoIndex];
  
  if (video.authorId !== currentUser.id) {
    return res.status(403).json({ error: 'Нет доступа' });
  }
  
  // Delete files
  const videoPath = path.join(videosDir, video.videoFilename);
  if (fs.existsSync(videoPath)) {
    fs.unlinkSync(videoPath);
  }
  
  if (video.thumbnailFilename) {
    const thumbPath = path.join(thumbnailsDir, video.thumbnailFilename);
    if (fs.existsSync(thumbPath)) {
      fs.unlinkSync(thumbPath);
    }
  }
  
  db.videos.splice(videoIndex, 1);
  saveDatabase(db);
  
  res.json({ success: true });
});

// Like/Dislike video
app.post('/api/videos/:id/react', (req, res) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'Необходимо войти' });
  }
  
  const { type } = req.body;
  const db = loadDatabase();
  const video = db.videos.find(v => v.id === req.params.id);
  
  if (!video) {
    return res.status(404).json({ error: 'Video not found' });
  }
  
  video.likedBy = video.likedBy || [];
  video.dislikedBy = video.dislikedBy || [];
  
  // Remove previous reactions
  video.likedBy = video.likedBy.filter(id => id !== currentUser.id);
  video.dislikedBy = video.dislikedBy.filter(id => id !== currentUser.id);
  
  if (type === 'like' && !video.likedBy.includes(currentUser.id)) {
    video.likedBy.push(currentUser.id);
  }
  if (type === 'dislike' && !video.dislikedBy.includes(currentUser.id)) {
    video.dislikedBy.push(currentUser.id);
  }
  if (type === 'unlike') {
    // Already removed above
  }
  
  video.likes = video.likedBy.length;
  video.dislikes = video.dislikedBy.length;
  
  saveDatabase(db);
  
  const userReaction = video.likedBy.includes(currentUser.id) 
    ? 'like' 
    : video.dislikedBy.includes(currentUser.id) 
      ? 'dislike' 
      : null;
  
  res.json({ 
    likes: video.likes, 
    dislikes: video.dislikes,
    userReaction
  });
});

// Increment view count
app.post('/api/videos/:id/view', (req, res) => {
  const db = loadDatabase();
  const video = db.videos.find(v => v.id === req.params.id);
  
  if (video) {
    video.views = (video.views || 0) + 1;
    saveDatabase(db);
  }
  
  res.json({ success: true });
});

// Get user videos
app.get('/api/users/:id/videos', (req, res) => {
  const db = loadDatabase();
  const videos = db.videos
    .filter(v => v.authorId === req.params.id)
    .reverse();
  res.json(videos);
});

// ============ COMMENTS ROUTES ============

// Get comments for video
app.get('/api/videos/:id/comments', (req, res) => {
  const db = loadDatabase();
  const comments = db.comments
    .filter(c => c.videoId === req.params.id)
    .map(c => {
      const author = db.users.find(u => u.id === c.authorId);
      return {
        ...c,
        authorName: author?.username || 'Unknown',
        authorAvatar: author?.avatar || null
      };
    })
    .reverse();
  res.json(comments);
});

// Add comment
app.post('/api/videos/:id/comments', (req, res) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'Необходимо войти' });
  }
  
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Комментарий не может быть пустым' });
  }
  
  const db = loadDatabase();
  const video = db.videos.find(v => v.id === req.params.id);
  
  if (!video) {
    return res.status(404).json({ error: 'Видео не найдено' });
  }
  
  const comment = {
    id: uuidv4(),
    videoId: req.params.id,
    authorId: currentUser.id,
    authorName: currentUser.username,
    authorAvatar: currentUser.avatar,
    text: text.trim(),
    date: new Date().toISOString(),
    likes: 0
  };
  
  db.comments.push(comment);
  saveDatabase(db);
  
  res.json({ success: true, comment });
});

// Delete comment
app.delete('/api/comments/:id', (req, res) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'Необходимо войти' });
  }
  
  const db = loadDatabase();
  const commentIndex = db.comments.findIndex(c => c.id === req.params.id);
  
  if (commentIndex === -1) {
    return res.status(404).json({ error: 'Комментарий не найден' });
  }
  
  const comment = db.comments[commentIndex];
  
  // Only author can delete
  if (comment.authorId !== currentUser.id) {
    return res.status(403).json({ error: 'Нет доступа' });
  }
  
  db.comments.splice(commentIndex, 1);
  saveDatabase(db);
  
  res.json({ success: true });
});

// ============ SEARCH ROUTES ============

// Search videos and channels
app.get('/api/search', (req, res) => {
  const query = req.query.q?.toLowerCase();
  if (!query) {
    return res.json({ videos: [], channels: [] });
  }
  
  const db = loadDatabase();
  
  // Search videos
  const videos = db.videos
    .filter(v => 
      v.title.toLowerCase().includes(query) ||
      v.description?.toLowerCase().includes(query)
    )
    .map(v => {
      const author = db.users.find(u => u.id === v.authorId);
      return {
        ...v,
        authorName: author?.username || 'Unknown',
        authorAvatar: author?.avatar || null
      };
    });
  
  // Search channels
  const channels = db.users
    .filter(u => 
      u.username.toLowerCase().includes(query) ||
      u.description?.toLowerCase().includes(query)
    )
    .map(u => ({
      id: u.id,
      username: u.username,
      avatar: u.avatar,
      description: u.description,
      subscribers: u.subscribers
    }));
  
  res.json({ videos, channels });
});

// Health check (должен быть перед статикой)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static frontend in production
const frontendDist = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`🎬 ЖеТуб сервер запущен на http://localhost:${PORT}`);
  console.log(`📡 API доступен на http://localhost:${PORT}/api`);
});
