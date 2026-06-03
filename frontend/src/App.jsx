import { useState, useEffect, createContext, useContext, useRef } from 'react'
import { Routes, Route, Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase, getCurrentUser } from './lib/supabase'
import { HomeIcon, ShortsIcon, TrendingIcon, ChannelIcon, SubscriptionsIcon, HistoryIcon, LibraryIcon, UploadIcon, SearchIcon, SettingsIcon, LogoutIcon, ThumbUpIcon, ThumbDownIcon, DeleteIcon, VideoIcon, CameraIcon, UserIcon, LikeIcon } from './lib/icons.jsx'

// Auth Context
const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [subscriptions, setSubscriptions] = useState([])

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    const user = await getCurrentUser()
    if (user) {
      setUser({
        id: user.id,
        username: user.user_metadata?.username || user.email,
        avatar: user.user_metadata?.avatar,
        email: user.email
      })
      fetchSubscriptions()
    }
    setLoading(false)
  }

  const fetchSubscriptions = async () => {
    const user = await getCurrentUser()
    if (!user) return
    try {
      const { data } = await supabase
        .from('subscriptions')
        .select(`
          channel_id,
          profiles:profiles!subscriptions_channel_id_fkey (
            id,
            username,
            avatar,
            subscribers
          )
        `)
        .eq('subscriber_id', user.id)
      
      if (data) {
        setSubscriptions(data.map(s => s.profiles))
      }
    } catch (e) {
      console.error('Error fetching subscriptions:', e)
    }
  }

  const login = async (username, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: username, // Используем email как логин
      password
    })
    if (error) throw new Error(error.message)
    
    setUser({
      id: data.user.id,
      username: data.user.user_metadata?.username || data.user.email,
      avatar: data.user.user_metadata?.avatar,
      email: data.user.email
    })
    fetchSubscriptions()
    return data
  }

  const register = async (username, email, password, avatar) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          avatar: avatar?.name || null
        }
      }
    })
    if (error) throw new Error(error.message)
    
    // Если есть аватар, загружаем его
    if (avatar && data.user) {
      const fileExt = avatar.name.split('.').pop()
      const fileName = `${data.user.id}-${Date.now()}.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, avatar)
      
      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName)
        await supabase.from('profiles').update({ avatar: publicUrl }).eq('id', data.user.id)
      }
    }
    
    setUser({
      id: data.user.id,
      username,
      avatar: null,
      email
    })
    return data
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setSubscriptions([])
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading, subscriptions, fetchSubscriptions }}>
      {children}
    </AuthContext.Provider>
  )
}

// Sidebar
function Sidebar() {
  const { user, subscriptions } = useAuth()
  const navigate = useNavigate()

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <Link to="/" className="sidebar-item">
          <span className="sidebar-item-icon"><HomeIcon /></span>
          <span className="sidebar-item-text">Главная</span>
        </Link>
        <Link to="/shorts" className="sidebar-item">
          <span className="sidebar-item-icon"><ShortsIcon /></span>
          <span className="sidebar-item-text">Shorts</span>
        </Link>
        <Link to="/trending" className="sidebar-item">
          <span className="sidebar-item-icon"><TrendingIcon /></span>
          <span className="sidebar-item-text">Тренды</span>
        </Link>
      </div>

      {user && (
        <div className="sidebar-section">
          <div className="sidebar-title">Моя библиотека</div>
          <Link to={`/channel/${user.id}`} className="sidebar-item">
            <span className="sidebar-item-icon"><ChannelIcon /></span>
            <span className="sidebar-item-text">Мой канал</span>
          </Link>
          <Link to="/subscriptions" className="sidebar-item">
            <span className="sidebar-item-icon"><SubscriptionsIcon /></span>
            <span className="sidebar-item-text">Подписки</span>
          </Link>
          <Link to="/history" className="sidebar-item">
            <span className="sidebar-item-icon"><HistoryIcon /></span>
            <span className="sidebar-item-text">История</span>
          </Link>
          <Link to="/liked" className="sidebar-item">
            <span className="sidebar-item-icon"><LikeIcon /></span>
            <span className="sidebar-item-text">Понравившиеся</span>
          </Link>
          <Link to="/library" className="sidebar-item">
            <span className="sidebar-item-icon"><LibraryIcon /></span>
            <span className="sidebar-item-text">Моя библиотека</span>
          </Link>
        </div>
      )}

      {user && (
        <div className="sidebar-section">
          <div className="sidebar-title">Загрузить</div>
          <Link to="/upload" className="sidebar-item" style={{ background: 'rgba(255, 0, 0, 0.1)', border: '1px solid rgba(255, 0, 0, 0.3)' }}>
            <span className="sidebar-item-icon"><UploadIcon /></span>
            <span className="sidebar-item-text">Загрузить видео</span>
          </Link>
        </div>
      )}

      {subscriptions.length > 0 && (
        <div className="sidebar-section">
          <div className="sidebar-title">Подписки</div>
          {subscriptions.map(sub => (
            <Link key={sub.id} to={`/channel/${sub.id}`} className="sidebar-channel">
              <div className="sidebar-channel-avatar">
                {sub.avatar ? <img src={sub.avatar} alt="" /> : sub.username.charAt(0).toUpperCase()}
              </div>
              <span className="sidebar-channel-name">{sub.username}</span>
            </Link>
          ))}
        </div>
      )}
    </aside>
  )
}

// Header
function Header() {
  const { user, logout, subscriptions } = useAuth()
  const [searchQuery, setSearchQuery] = useState('')
  const navigate = useNavigate()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)

  const handleSearch = (e) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  return (
    <>
      <header className="header">
        <button className="menu-toggle" onClick={() => setShowMobileMenu(true)}>
          <span></span>
          <span></span>
          <span></span>
        </button>
        
        <Link to="/" className="logo">
          <div className="logo-icon">▶</div>
          <span>ЖеТуб</span>
        </Link>

        <form className="search-container" onSubmit={handleSearch}>
          <input
            type="text"
            className="search-input"
            placeholder="Поиск видео и каналов..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button type="submit" className="search-btn"><SearchIcon /></button>
        </form>

        <div className="header-actions">
          <Link to="/upload" className="upload-btn">
            <UploadIcon />
          </Link>

          {user ? (
            <div className="user-menu-container">
              <button className="user-avatar-btn" onClick={() => setShowUserMenu(!showUserMenu)}>
                {user.avatar ? (
                  <img src={user.avatar} alt="" className="user-avatar-img" />
                ) : (
                  <div className="user-avatar-placeholder">{user.username.charAt(0).toUpperCase()}</div>
                )}
              </button>
              {showUserMenu && (
                <div className="user-dropdown">
                  <Link to={`/channel/${user.id}`} className="dropdown-item" onClick={() => setShowUserMenu(false)}>
                    <ChannelIcon /> Мой канал
                  </Link>
                  <Link to="/subscriptions" className="dropdown-item" onClick={() => setShowUserMenu(false)}>
                    <SubscriptionsIcon /> Подписки
                  </Link>
                  <Link to="/settings" className="dropdown-item" onClick={() => setShowUserMenu(false)}>
                    <SettingsIcon /> Настройки
                  </Link>
                  <button className="dropdown-item" onClick={() => { logout(); setShowUserMenu(false) }}>
                    <LogoutIcon /> Выйти
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="auth-buttons">
              <Link to="/login" className="auth-btn">Войти</Link>
              <Link to="/register" className="auth-btn primary">Регистрация</Link>
            </div>
          )}
        </div>
      </header>

      {/* Mobile Sidebar */}
      {showMobileMenu && (
        <>
          <div className="mobile-sidebar-overlay active" onClick={() => setShowMobileMenu(false)}></div>
          <div className={`mobile-sidebar ${showMobileMenu ? 'open' : ''}`}>
            <div className="sidebar-section">
              <a href="/" className="sidebar-item" onClick={() => setShowMobileMenu(false)}>
                <span className="sidebar-item-icon"><HomeIcon /></span>
                <span className="sidebar-item-text">Главная</span>
              </a>
              <a href="/shorts" className="sidebar-item" onClick={() => setShowMobileMenu(false)}>
                <span className="sidebar-item-icon"><ShortsIcon /></span>
                <span className="sidebar-item-text">Shorts</span>
              </a>
              <a href="/trending" className="sidebar-item" onClick={() => setShowMobileMenu(false)}>
                <span className="sidebar-item-icon"><TrendingIcon /></span>
                <span className="sidebar-item-text">Тренды</span>
              </a>
            </div>

            {user && (
              <div className="sidebar-section">
                <div className="sidebar-title">Моя библиотека</div>
                <a href={`/channel/${user.id}`} className="sidebar-item" onClick={() => setShowMobileMenu(false)}>
                  <span className="sidebar-item-icon"><ChannelIcon /></span>
                  <span className="sidebar-item-text">Мой канал</span>
                </a>
                <a href="/subscriptions" className="sidebar-item" onClick={() => setShowMobileMenu(false)}>
                  <span className="sidebar-item-icon"><SubscriptionsIcon /></span>
                  <span className="sidebar-item-text">Подписки</span>
                </a>
                <a href="/history" className="sidebar-item" onClick={() => setShowMobileMenu(false)}>
                  <span className="sidebar-item-icon"><HistoryIcon /></span>
                  <span className="sidebar-item-text">История</span>
                </a>
                <a href="/library" className="sidebar-item" onClick={() => setShowMobileMenu(false)}>
                  <span className="sidebar-item-icon"><LibraryIcon /></span>
                  <span className="sidebar-item-text">Моя библиотека</span>
                </a>
              </div>
            )}

            {user && (
              <div className="sidebar-section">
                <div className="sidebar-title">Загрузить</div>
              <a href="/upload" className="sidebar-item" onClick={() => setShowMobileMenu(false)} style={{ background: 'rgba(255, 0, 51, 0.1)', border: '1px solid rgba(255, 0, 51, 0.3)' }}>
                <span className="sidebar-item-icon"><UploadIcon /></span>
                <span className="sidebar-item-text">Загрузить видео</span>
              </a>
              </div>
            )}

            {subscriptions && subscriptions.length > 0 && (
              <div className="sidebar-section">
                <div className="sidebar-title">Подписки</div>
                {subscriptions.map(sub => (
                  <a key={sub.id} href={`/channel/${sub.id}`} className="sidebar-channel" onClick={() => setShowMobileMenu(false)}>
                    <div className="sidebar-channel-avatar">
                      {sub.avatar ? <img src={sub.avatar} alt="" /> : sub.username.charAt(0).toUpperCase()}
                    </div>
                    <span className="sidebar-channel-name">{sub.username}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}

// Video Card
function VideoCard({ video }) {
  const formatDate = (date) => new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  const formatViews = (v) => {
    if (!v) return '0'
    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`
    if (v >= 1000) return `${(v / 1000).toFixed(1)}K`
    return v
  }

  const viewsWord = (v) => {
    if (!v || v === 0) return 'просмотров'
    if (v === 1) return 'просмотр'
    if (v >= 2 && v <= 4) return 'просмотра'
    return 'просмотров'
  }

  return (
    <Link to={`/video/${video.id}`} className="video-card">
      <div className="thumbnail-container">
        {video.thumbnail_url ? <img src={video.thumbnail_url} alt={video.title} className="thumbnail" /> : <div className="thumbnail-placeholder"><VideoIcon /></div>}
      </div>
      <div className="video-info">
        <h3 className="video-title">{video.title}</h3>
        <div className="video-meta">
          <Link to={`/channel/${video.author_id}`} className="video-author-link" onClick={e => e.stopPropagation()}>
            {video.author_name || video.author_id}
          </Link>
          <span className="video-dot">•</span>
          <span>{formatViews(video.views)} {viewsWord(video.views)}</span>
          <span className="video-dot">•</span>
          <span>{formatDate(video.upload_date)}</span>
        </div>
      </div>
    </Link>
  )
}

// Comments
function Comments({ videoId }) {
  const { user } = useAuth()
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchComments()
  }, [videoId])

  const fetchComments = async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('comments')
        .select(`
          *,
          profiles:profiles!comments_author_id_fkey (
            username,
            avatar
          )
        `)
        .eq('video_id', videoId)
        .order('created_at', { ascending: false })
      
      if (data) {
        setComments(data.map(c => ({
          ...c,
          authorName: c.profiles?.username || 'Unknown',
          authorAvatar: c.profiles?.avatar
        })))
      }
    } catch (e) {
      console.error('Error fetching comments:', e)
    }
    setLoading(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!newComment.trim() || !user) return

    try {
      const { data, error } = await supabase
        .from('comments')
        .insert({
          video_id: videoId,
          author_id: user.id,
          text: newComment.trim()
        })
        .select()
        .single()
      
      if (data && !error) {
        setComments([data, ...comments])
        setNewComment('')
      }
    } catch (e) {
      console.error('Error adding comment:', e)
    }
  }

  const handleDelete = async (commentId) => {
    try {
      await supabase.from('comments').delete().eq('id', commentId)
      setComments(comments.filter(c => c.id !== commentId))
    } catch (e) {
      console.error('Error deleting comment:', e)
    }
  }

  const formatDate = (date) => {
    const d = new Date(date)
    const now = new Date()
    const diff = now - d
    if (diff < 60000) return 'только что'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} мин назад`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч назад`
    return d.toLocaleDateString('ru-RU')
  }

  return (
    <div className="comments-section">
      <h3 className="comments-header">Комментарии ({comments.length})</h3>

      {user && (
        <form className="comment-form" onSubmit={handleSubmit}>
          <input
            type="text"
            className="comment-input"
            placeholder="Написать комментарий..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
          />
          <button type="submit" className="comment-submit" disabled={!newComment.trim()}>Отправить</button>
        </form>
      )}

      {!user && <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>Войдите, чтобы комментировать</p>}

      <div className="comments-list">
        {comments.map(comment => (
          <div key={comment.id} className="comment">
            <div className="comment-avatar">
              {comment.authorAvatar ? <img src={comment.authorAvatar} alt="" /> : comment.authorName.charAt(0).toUpperCase()}
            </div>
            <div className="comment-content">
              <div className="comment-header">
                <span className="comment-author">{comment.authorName}</span>
                <span className="comment-date">{formatDate(comment.created_at || comment.date)}</span>
              </div>
              <p className="comment-text">{comment.text}</p>
              {user && user.id === comment.author_id && (
                <button className="comment-action comment-delete" onClick={() => handleDelete(comment.id)}>Удалить</button>
              )}
            </div>
          </div>
        ))}
        {comments.length === 0 && !loading && (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>Комментариев пока нет. Будь первым!</p>
        )}
      </div>
    </div>
  )
}

// Home
function Home() {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchVideos()
  }, [])

  const fetchVideos = async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('videos')
        .select(`
          *,
          profiles:profiles!videos_author_id_fkey (
            username,
            avatar
          )
        `)
        .order('upload_date', { ascending: false })
      
      if (data) {
        setVideos(data.map(v => ({
          ...v,
          author_name: v.profiles?.username || 'Unknown',
          author_id: v.author_id
        })))
      }
    } catch (e) {
      console.error('Error fetching videos:', e)
    }
    setLoading(false)
  }

  if (loading) return <div className="main-content"><div className="loading"><div className="spinner"></div></div></div>

  return (
    <div className="main-content">
      {videos.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><CameraIcon /></div>
            <h2 className="empty-title">Видео не найдены</h2>
          <p className="empty-text">Загрузите первое видео!</p>
          <Link to="/upload" className="upload-btn" style={{ marginTop: '20px', display: 'inline-flex' }}>Загрузить видео</Link>
        </div>
      ) : (
        <div className="video-grid">{videos.map(video => <VideoCard key={video.id} video={video} />)}</div>
      )}
    </div>
  )
}

// Search
function Search() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  const [activeTab, setActiveTab] = useState('all')
  const [videos, setVideos] = useState([])
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (query) search()
  }, [query])

  const search = async () => {
    setLoading(true)
    try {
      // Поиск видео
      const { data: videosData } = await supabase
        .from('videos')
        .select(`
          *,
          profiles:profiles!videos_author_id_fkey (
            username,
            avatar
          )
        `)
        .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
      
      // Поиск каналов
      const { data: channelsData } = await supabase
        .from('profiles')
        .select('*')
        .or(`username.ilike.%${query}%,description.ilike.%${query}%`)
      
      if (videosData) setVideos(videosData.map(v => ({ ...v, author_name: v.profiles?.username })))
      if (channelsData) setChannels(channelsData)
    } catch (e) {
      console.error('Error searching:', e)
    }
    setLoading(false)
  }

  const formatSubs = (n) => {
    if (!n) return '0 подписчиков'
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M подписчиков`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K подписчиков`
    return `${n} подписчиков`
  }

  if (loading) return <div className="main-content"><div className="loading"><div className="spinner"></div></div></div>

  return (
    <div className="main-content">
      <div className="search-result-header">
        <h1 className="search-result-title">Результаты по "{query}"</h1>
        <p className="search-result-subtitle">{videos.filter(v => v.type !== 'shorts').length} видео • {videos.filter(v => v.type === 'shorts').length} shorts • {channels.length} каналов</p>
      </div>

      <div className="search-tabs">
        <button className={`search-tab ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>Все</button>
        <button className={`search-tab ${activeTab === 'videos' ? 'active' : ''}`} onClick={() => setActiveTab('videos')}>Видео</button>
        <button className={`search-tab ${activeTab === 'shorts' ? 'active' : ''}`} onClick={() => setActiveTab('shorts')}>Shorts</button>
        <button className={`search-tab ${activeTab === 'channels' ? 'active' : ''}`} onClick={() => setActiveTab('channels')}>Каналы</button>
      </div>

      {(activeTab === 'all' || activeTab === 'videos') && (
        <div className="video-grid" style={{ marginTop: channels.length > 0 ? '24px' : 0 }}>
          {videos.filter(v => activeTab === 'videos' ? v.type !== 'shorts' : true).map(video => <VideoCard key={video.id} video={video} />)}
        </div>
      )}

      {(activeTab === 'all' || activeTab === 'shorts') && (
        <div className="video-grid" style={{ marginTop: '24px' }}>
          {videos.filter(v => v.type === 'shorts').map(video => <VideoCard key={video.id} video={video} />)}
        </div>
      )}

      {(activeTab === 'all' || activeTab === 'channels') && channels.length > 0 && (
        <div className="search-channels-section">
          <h3 style={{ marginBottom: '16px', fontSize: '18px' }}>Каналы</h3>
          {channels.map(channel => (
            <Link key={channel.id} to={`/channel/${channel.id}`} className="search-channel-card">
              <div className="search-channel-avatar">
                {channel.avatar ? <img src={channel.avatar} alt="" /> : channel.username.charAt(0).toUpperCase()}
              </div>
              <div className="search-channel-info">
                <h3>{channel.username}</h3>
                <p>{formatSubs(channel.subscribers)} • {channel.description || 'Нет описания'}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {videos.length === 0 && channels.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon"><SearchIcon /></div>
          <h2 className="empty-title">Ничего не найдено</h2>
          <p className="empty-text">Попробуйте другой запрос</p>
        </div>
      )}
    </div>
  )
}

// Custom Video Player
function CustomVideoPlayer({ videoId, videoUrl }) {
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [showVolume, setShowVolume] = useState(false)
  const [buffered, setBuffered] = useState(0)
  const [showControls, setShowControls] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const hideTimeoutRef = useRef(null)

  const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

  const formatTime = (s) => {
    if (!s || isNaN(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const togglePlay = () => {
    const video = videoRef.current
    if (video.paused) {
      video.play()
    } else {
      video.pause()
    }
  }

  const handleTimeUpdate = () => {
    const video = videoRef.current
    setCurrentTime(video.currentTime)
    if (video.buffered.length > 0) {
      setBuffered(video.buffered.end(video.buffered.length - 1))
    }
  }

  const handleLoadedMetadata = () => {
    setDuration(videoRef.current.duration)
  }

  const handleSeek = (e) => {
    const video = videoRef.current
    const rect = e.currentTarget.getBoundingClientRect()
    const percent = (e.clientX - rect.left) / rect.width
    video.currentTime = percent * duration
  }

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value)
    setVolume(val)
    videoRef.current.volume = val
  }

  const toggleMute = () => {
    const video = videoRef.current
    if (volume > 0) {
      video.volume = 0
      setVolume(0)
    } else {
      video.volume = 1
      setVolume(1)
    }
  }

  const toggleFullscreen = () => {
    const container = containerRef.current
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      container.requestFullscreen()
    }
  }

  const handleSpeedChange = (speed) => {
    setPlaybackSpeed(speed)
    videoRef.current.playbackRate = speed
    setShowSettings(false)
  }

  const handleMouseMove = () => {
    setShowControls(true)
    clearTimeout(hideTimeoutRef.current)
    hideTimeoutRef.current = setTimeout(() => {
      if (playing) setShowControls(false)
    }, 3000)
  }

  const handleVideoEnd = () => {
    setPlaying(false)
    setShowControls(true)
  }

  return (
    <div
      className="custom-player"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => playing && setShowControls(false)}
    >
      <video
        ref={videoRef}
        className="video-element"
        src={videoUrl}
        onClick={togglePlay}
        crossOrigin="anonymous"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleVideoEnd}
        preload="metadata"
      />

      {!playing && (
        <button className="play-overlay" onClick={togglePlay}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </button>
      )}

      <div className={`player-controls ${showControls ? 'visible' : ''}`}>
        <div className="player-progress-container" onClick={handleSeek}>
          <div className="player-progress-buffered" style={{ width: `${(buffered / duration) * 100}%` }}></div>
          <div className="player-progress-bar" style={{ width: `${(currentTime / duration) * 100}%` }}></div>
          <div className="player-progress-thumb" style={{ left: `${(currentTime / duration) * 100}%` }}></div>
        </div>

        <div className="player-buttons">
          <div className="player-left-controls">
            <button className="player-btn" onClick={togglePlay}>
              {playing ? (
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>

            <div className="volume-container" onMouseEnter={() => setShowVolume(true)} onMouseLeave={() => setShowVolume(false)}>
              <button className="player-btn" onClick={toggleMute}>
                {volume === 0 ? (
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
                ) : volume < 0.5 ? (
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                )}
              </button>
              {showVolume && (
                <div className="volume-slider-container">
                  <input type="range" min="0" max="1" step="0.1" value={volume} onChange={handleVolumeChange} className="volume-slider" />
                </div>
              )}
            </div>

            <span className="player-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
          </div>

          <div className="player-right-controls">
            <div className="player-settings-wrap">
              <button className="player-btn" onClick={() => setShowSettings(!showSettings)}>
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
              </button>
              {showSettings && (
                <div className="player-settings-menu">
                  <div className="settings-section">
                    <div className="settings-title">Скорость</div>
                    <div className="speed-options">
                      {speeds.map(speed => (
                        <button
                          key={speed}
                          className={`speed-option ${playbackSpeed === speed ? 'active' : ''}`}
                          onClick={() => handleSpeedChange(speed)}
                        >
                          {speed}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button className="player-btn" onClick={toggleFullscreen}>
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Video Page
function VideoPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [video, setVideo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [userReaction, setUserReaction] = useState(null)

  useEffect(() => {
    fetchVideo()
  }, [id])

  const fetchVideo = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('videos')
        .select(`
          *,
          profiles:profiles!videos_author_id_fkey (
            username,
            avatar
          )
        `)
        .eq('id', id)
        .single()
      
      if (data && !error) {
        setVideo({
          ...data,
          author_name: data.profiles?.username,
          author_avatar: data.profiles?.avatar,
          author_id: data.author_id
        })
        
        // Increment view count
        await supabase.rpc('increment_views', { video_id: id })

        // Save to watch history
        if (user) {
          await supabase.from('watch_history').upsert(
            { user_id: user.id, video_id: id, watched_at: new Date().toISOString() },
            { onConflict: 'user_id,video_id' }
          )
        }
        
        // Get user reaction
        if (user) {
          const { data: reaction } = await supabase
            .from('video_reactions')
            .select('reaction_type')
            .eq('video_id', id)
            .eq('user_id', user.id)
            .maybeSingle()
          if (reaction) setUserReaction(reaction.reaction_type)
          else setUserReaction(null)
        }
      }
    } catch (e) {
      console.error('Error fetching video:', e)
    }
    setLoading(false)
  }

  const handleReaction = async (type) => {
    if (!user) return
    
    try {
      if (userReaction === type) {
        await supabase.from('video_reactions').delete().eq('video_id', id).eq('user_id', user.id)
        setUserReaction(null)
      } else {
        if (userReaction) {
          await supabase.from('video_reactions').delete().eq('video_id', id).eq('user_id', user.id)
        }
        await supabase.from('video_reactions').insert({ video_id: id, user_id: user.id, reaction_type: type })
        setUserReaction(type)
      }

      setVideo(prev => {
        if (!prev) return prev
        let likes = prev.likes || 0
        let dislikes = prev.dislikes || 0
        if (userReaction === 'like') likes--
        if (userReaction === 'dislike') dislikes--
        if (userReaction !== type) {
          if (type === 'like') likes++
          if (type === 'dislike') dislikes++
        }
        return { ...prev, likes, dislikes }
      })
    } catch (e) {
      console.error('Error reacting:', e)
    }
  }

  const handleDelete = async () => {
    try {
      // Delete video file from storage
      if (video.video_url) {
        const path = video.video_url.split('/').pop()
        await supabase.storage.from('videos').remove([path])
      }
      if (video.thumbnail_url) {
        const path = video.thumbnail_url.split('/').pop()
        await supabase.storage.from('thumbnails').remove([path])
      }
      
      // Delete from database
      await supabase.from('videos').delete().eq('id', id)
      window.location.href = '/'
    } catch (e) {
      console.error('Error deleting video:', e)
    }
  }

  if (loading) return <div className="main-content"><div className="loading"><div className="spinner"></div></div></div>
  if (!video) return <div className="main-content"><div className="empty-state"><h2>Видео не найдено</h2></div></div>

  const formatViews = (v) => {
    if (!v) return '0'
    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`
    if (v >= 1000) return `${(v / 1000).toFixed(1)}K`
    return v
  }

  const viewsWord = (v) => {
    if (!v || v === 0) return 'просмотров'
    if (v === 1) return 'просмотр'
    if (v >= 2 && v <= 4) return 'просмотра'
    return 'просмотров'
  }

  const formatDate = (date) => new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="main-content video-page">
      <div className="video-player-container">
        <CustomVideoPlayer videoId={video.id} videoUrl={video.video_url} />
      </div>

      <div className="video-details">
        <h1 className="video-detail-title">{video.title}</h1>
        <div className="video-detail-meta">
          <span>{formatViews(video.views)} {viewsWord(video.views)}</span>
          <span className="video-dot">•</span>
          <span>{formatDate(video.upload_date)}</span>
        </div>

        <div className="video-actions">
          <div className="reaction-buttons">
            <button
              className={`reaction-btn ${userReaction === 'like' ? 'active' : ''}`}
              onClick={() => handleReaction('like')}
            >
              <ThumbUpIcon /> {video.likes || 0}
            </button>
            <button
              className={`reaction-btn ${userReaction === 'dislike' ? 'active' : ''}`}
              onClick={() => handleReaction('dislike')}
            >
              <ThumbDownIcon /> {video.dislikes || 0}
            </button>
          </div>

          {user && user.id === video.author_id && (
            <button className="delete-video-btn" onClick={() => setShowDeleteModal(true)}>
              <DeleteIcon /> Удалить
            </button>
          )}
        </div>

        <div className="video-description">
          <p>{video.description || 'Нет описания'}</p>
        </div>

        <div className="video-author">
          <Link to={`/channel/${video.author_id}`} className="video-author-link">
            {video.author_avatar ? <img src={video.author_avatar} alt="" className="video-author-avatar" /> : <div className="video-author-placeholder">{(video.author_name || '?').charAt(0).toUpperCase()}</div>}
            <span className="video-author-name">{video.author_name}</span>
          </Link>
        </div>
      </div>

      <Comments videoId={video.id} />

      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Удалить видео?</h3>
            <p>Это действие нельзя отменить.</p>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setShowDeleteModal(false)}>Отмена</button>
              <button className="modal-delete" onClick={handleDelete}>Удалить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Проверка длительности видео
function getVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src)
      resolve(video.duration)
    }
    video.onerror = () => {
      URL.revokeObjectURL(video.src)
      reject(new Error('Не удалось прочитать видео'))
    }
    video.src = URL.createObjectURL(file)
  })
}

// Upload Page
function UploadPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [videoFile, setVideoFile] = useState(null)
  const [thumbnailFile, setThumbnailFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [videoType, setVideoType] = useState('video')
  const videoInputRef = useRef(null)
  const thumbnailInputRef = useRef(null)

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!videoFile || !user) return

    setUploading(true)
    try {
      if (videoType === 'shorts') {
        const duration = await getVideoDuration(videoFile)
        if (duration > 120) {
          setUploading(false)
          return alert('Длительность Shorts не должна превышать 2 минуты')
        }
      }

      const MAX_SIZE = videoType === 'shorts' ? 100 * 1024 * 1024 : 50 * 1024 * 1024
      if (videoFile.size > MAX_SIZE) {
        throw new Error(videoType === 'shorts' ? 'Размер shorts не должен превышать 100MB' : 'Размер видео не должен превышать 50MB')
      }

      const videoExt = videoFile.name.split('.').pop()
      const videoName = `${user.id}-${Date.now()}.${videoExt}`

      // Upload video to Supabase Storage
      const { data: videoData, error: videoError } = await supabase.storage
        .from('videos')
        .upload(videoName, videoFile, {
          cacheControl: '3600',
          upsert: false
        })

      if (videoError) throw videoError

      setProgress(30)

      // Get public URL
      const { data: { publicUrl: videoUrl } } = supabase.storage
        .from('videos')
        .getPublicUrl(videoName)

      // Upload thumbnail if provided
      let thumbnailUrl = null
      if (thumbnailFile) {
        const thumbExt = thumbnailFile.name.split('.').pop()
        const thumbName = `${user.id}-${Date.now()}.${thumbExt}`

        const { error: thumbError } = await supabase.storage
          .from('thumbnails')
          .upload(thumbName, thumbnailFile)

        if (!thumbError) {
          const { data: { publicUrl } } = supabase.storage
            .from('thumbnails')
            .getPublicUrl(thumbName)
          thumbnailUrl = publicUrl
        }
      }

      setProgress(60)

      // Create video record in Supabase
      const { data: videoDataDb, error: insertError } = await supabase
        .from('videos')
        .insert({
          title,
          description,
          author_id: user.id,
          video_url: videoUrl,
          thumbnail_url: thumbnailUrl,
          type: videoType
        })
        .select()
        .single()

      if (insertError) throw insertError

      setProgress(100)
      if (videoType === 'shorts') {
        navigate('/shorts')
      } else {
        navigate(`/video/${videoDataDb.id}`)
      }
    } catch (error) {
      console.error('Upload error:', error)
      alert('Ошибка загрузки: ' + error.message)
    }
    setUploading(false)
  }

  if (!user) {
    return (
      <div className="main-content">
        <div className="empty-state">
          <h2>Войдите для загрузки видео</h2>
          <Link to="/login" className="auth-btn primary">Войти</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="main-content">
      <div className="upload-page">
        <h1>Загрузка</h1>
        <form className="upload-form" onSubmit={handleUpload}>
          <div className="upload-type-toggle">
            <button
              type="button"
              className={`upload-type-btn ${videoType === 'video' ? 'active' : ''}`}
              onClick={() => setVideoType('video')}
            >
              Видео
            </button>
            <button
              type="button"
              className={`upload-type-btn ${videoType === 'shorts' ? 'active' : ''}`}
              onClick={() => setVideoType('shorts')}
            >
              Shorts
            </button>
          </div>

          <div className="form-group">
            <label>Видео</label>
            <div
              className="file-dropzone"
              onClick={() => videoInputRef.current?.click()}
            >
              {videoFile ? (
                <div className="file-selected">{videoFile.name}</div>
              ) : (
                <div className="file-placeholder">Нажмите или перетащите видео</div>
              )}
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                onChange={(e) => setVideoFile(e.target.files[0])}
                hidden
              />
            </div>
          </div>

          <div className="form-group">
            <label>Обложка (необязательно)</label>
            <div
              className="file-dropzone"
              onClick={() => thumbnailInputRef.current?.click()}
            >
              {thumbnailFile ? (
                <img src={URL.createObjectURL(thumbnailFile)} alt="" className="thumbnail-preview" />
              ) : (
                <div className="file-placeholder">Нажмите для выбора</div>
              )}
              <input
                ref={thumbnailInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => setThumbnailFile(e.target.files[0])}
                hidden
              />
            </div>
          </div>

          <div className="form-group">
            <label>Название</label>
            <input
              type="text"
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Название видео"
            />
          </div>

          <div className="form-group">
            <label>Описание</label>
            <textarea
              className="form-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Опишите ваше видео..."
              rows={4}
            />
          </div>

          <button type="submit" className="upload-submit-btn" disabled={uploading || !videoFile}>
            {uploading ? `Загрузка... ${Math.round(progress)}%` : `Опубликовать ${videoType === 'shorts' ? 'Shorts' : 'видео'}`}
          </button>
        </form>
      </div>
    </div>
  )
}

// Channel Page
function ChannelPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [channel, setChannel] = useState(null)
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [isSubscribed, setIsSubscribed] = useState(false)

  useEffect(() => {
    fetchChannel()
  }, [id])

  const fetchChannel = async () => {
    setLoading(true)
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single()
      
      const { data: videosData } = await supabase
        .from('videos')
        .select('*')
        .eq('author_id', id)
        .order('upload_date', { ascending: false })
      
      setChannel(profile)
      setVideos(videosData || [])
      
      // Check subscription
      if (user) {
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('subscriber_id', user.id)
          .eq('channel_id', id)
          .single()
        setIsSubscribed(!!sub)
      }
    } catch (e) {
      console.error('Error fetching channel:', e)
    }
    setLoading(false)
  }

  const handleSubscribe = async () => {
    if (!user) return
    
    try {
      if (isSubscribed) {
        await supabase.from('subscriptions').delete().eq('subscriber_id', user.id).eq('channel_id', id)
        setIsSubscribed(false)
      } else {
        await supabase.from('subscriptions').insert({ subscriber_id: user.id, channel_id: id })
        setIsSubscribed(true)
      }
      fetchChannel()
    } catch (e) {
      console.error('Error subscribing:', e)
    }
  }

  if (loading) return <div className="main-content"><div className="loading"><div className="spinner"></div></div></div>
  if (!channel) return <div className="main-content"><div className="empty-state"><h2>Канал не найден</h2></div></div>

  const formatSubs = (n) => {
    if (!n) return '0'
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return n
  }

  const subsWord = (n) => {
    if (!n || n === 0) return 'подписчиков'
    if (n === 1) return 'подписчик'
    if (n >= 2 && n <= 4) return 'подписчика'
    return 'подписчиков'
  }

  return (
    <div className="main-content channel-page">
      <div className="channel-header">
        <div className="channel-avatar">
          {channel.avatar ? <img src={channel.avatar} alt="" /> : <div className="channel-avatar-placeholder">{channel.username?.charAt(0).toUpperCase() || '?'}</div>}
        </div>
        <div className="channel-info">
          <h1 className="channel-name">{channel.username}</h1>
          <p className="channel-subs">{formatSubs(channel.subscribers)} {subsWord(channel.subscribers)}</p>
          {user && user.id !== id && (
            <button className={`subscribe-btn ${isSubscribed ? 'subscribed' : ''}`} onClick={handleSubscribe}>
              {isSubscribed ? 'Отписаться' : 'Подписаться'}
            </button>
          )}
        </div>
      </div>

      <div className="channel-description">
        <p>{channel.description || 'Нет описания'}</p>
      </div>

      <div className="channel-videos">
        <h2>Видео</h2>
        {videos.length > 0 ? (
          <div className="video-grid">{videos.map(video => <VideoCard key={video.id} video={video} />)}</div>
        ) : (
          <div className="empty-state">
            <p>Видео пока нет</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Login Page
function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      navigate('/')
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div className="main-content">
      <div className="auth-page">
        <div className="auth-card">
          <h2 className="auth-title">Вход</h2>
          <p className="auth-subtitle">Войдите для продолжения</p>
          <form className="auth-form" onSubmit={handleSubmit}>
            {error && <div className="error-message">{error}</div>}
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Пароль</label>
              <input
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>
          <p className="auth-switch">
            Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

// Register Page
function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [avatar, setAvatar] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const avatarInputRef = useRef(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register(username, email, password, avatar)
      navigate('/')
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div className="main-content">
      <div className="auth-page">
        <div className="auth-card">
          <h2 className="auth-title">Регистрация</h2>
          <p className="auth-subtitle">Создайте аккаунт для начала</p>
          <form className="auth-form" onSubmit={handleSubmit}>
            {error && <div className="error-message">{error}</div>}
            <div className="form-group">
              <label className="form-label">Имя пользователя</label>
              <input
                type="text"
                className="form-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Пароль</label>
              <input
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Аватар (необязательно)</label>
              <div className="file-dropzone" onClick={() => avatarInputRef.current?.click()}>
                {avatar ? (
                  <img src={URL.createObjectURL(avatar)} alt="" className="avatar-preview" />
                ) : (
                  <div className="file-placeholder">Нажмите для выбора</div>
                )}
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => setAvatar(e.target.files[0])}
                  hidden
                />
              </div>
            </div>
            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? 'Регистрация...' : 'Зарегистрироваться'}
            </button>
          </form>
          <p className="auth-switch">
            Уже есть аккаунт? <Link to="/login">Войти</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

// Shorts Page (TikTok-like vertical player)
function ShortsPage() {
  const [shorts, setShorts] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [playing, setPlaying] = useState(true)
  const [showControls, setShowControls] = useState(false)
  const [videoError, setVideoError] = useState(false)
  const [userReaction, setUserReaction] = useState(null)
  const { user } = useAuth()
  const playerRef = useRef(null)
  const hideTimer = useRef(null)

  useEffect(() => {
    fetchShorts()
  }, [])

  useEffect(() => {
    if (current) fetchUserReaction()
  }, [currentIndex, shorts.length])

  useEffect(() => {
    const player = playerRef.current
    if (!player || !shorts.length) return
    setVideoError(false)
    player.load()
    player.muted = true
    player.play().then(() => {
      setPlaying(true)
    }).catch(() => {
      setPlaying(false)
      setShowControls(true)
    })
    setShowControls(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setShowControls(false), 2000)
  }, [currentIndex, shorts.length])

  const fetchUserReaction = async () => {
    if (!user || !current) { setUserReaction(null); return }
    const { data } = await supabase
      .from('video_reactions')
      .select('reaction_type')
      .eq('video_id', current.id)
      .eq('user_id', user.id)
      .maybeSingle()
    setUserReaction(data?.reaction_type || null)
  }

  const fetchShorts = async () => {
    setLoading(true)
    try {
      let data

      const { data: typed, error } = await supabase
        .from('videos')
        .select('*, profiles:profiles!videos_author_id_fkey (username, avatar)')
        .eq('type', 'shorts')
        .order('upload_date', { ascending: false })

      if (!error && typed?.length) {
        data = typed
      } else {
        const { data: all } = await supabase
          .from('videos')
          .select('*, profiles:profiles!videos_author_id_fkey (username, avatar)')
          .order('upload_date', { ascending: false })
          .limit(20)
        data = all
      }

      if (data) {
        setShorts(data.map(v => ({
          ...v,
          author_name: v.profiles?.username,
          author_avatar: v.profiles?.avatar
        })))
      }
    } catch (e) {
      console.error('Error fetching shorts:', e)
    }
    setLoading(false)
  }

  const refreshShorts = async () => {
    try {
      const { data } = await supabase
        .from('videos')
        .select('*')
        .in('id', shorts.map(s => s.id))
      if (data) {
        setShorts(prev => prev.map(v => {
          const updated = data.find(d => d.id === v.id)
          return updated ? { ...v, likes: updated.likes, dislikes: updated.dislikes } : v
        }))
      }
    } catch (e) {
      console.error('Error refreshing shorts:', e)
    }
  }

  const current = shorts[currentIndex]

  const goNext = () => {
    if (currentIndex < shorts.length - 1) setCurrentIndex(prev => prev + 1)
  }

  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex(prev => prev - 1)
  }

  const togglePlay = () => {
    const v = playerRef.current
    if (!v) return
    if (v.paused) {
      v.play().then(() => setPlaying(true)).catch(() => {})
    } else {
      v.pause()
      setPlaying(false)
    }
  }

  const handleVideoTap = () => {
    togglePlay()
    setShowControls(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      if (playing) setShowControls(false)
    }, 3000)
  }

  const handleVideoError = () => {
    setVideoError(true)
    setPlaying(false)
  }

  const handleLike = async () => {
    if (!user || !current) return
    try {
      if (userReaction === 'like') {
        await supabase.from('video_reactions').delete().eq('video_id', current.id).eq('user_id', user.id)
        setUserReaction(null)
      } else {
        if (userReaction === 'dislike') {
          await supabase.from('video_reactions').delete().eq('video_id', current.id).eq('user_id', user.id)
        }
        await supabase.from('video_reactions').insert({ video_id: current.id, user_id: user.id, reaction_type: 'like' })
        setUserReaction('like')
      }
      refreshShorts()
    } catch (e) {
      console.error('Like error:', e)
    }
  }

  const handleDislike = async () => {
    if (!user || !current) return
    try {
      if (userReaction === 'dislike') {
        await supabase.from('video_reactions').delete().eq('video_id', current.id).eq('user_id', user.id)
        setUserReaction(null)
      } else {
        if (userReaction === 'like') {
          await supabase.from('video_reactions').delete().eq('video_id', current.id).eq('user_id', user.id)
        }
        await supabase.from('video_reactions').insert({ video_id: current.id, user_id: user.id, reaction_type: 'dislike' })
        setUserReaction('dislike')
      }
      refreshShorts()
    } catch (e) {
      console.error('Dislike error:', e)
    }
  }

  const handleShare = () => {
    const url = `${window.location.origin}/shorts`
    if (navigator.share) {
      navigator.share({ title: current?.title || '', url })
    } else {
      navigator.clipboard.writeText(url)
      alert('Ссылка скопирована!')
    }
  }

  const handleDeleteShort = async () => {
    if (!user || !current || user.id !== current.author_id) return
    try {
      if (current.video_url) {
        const path = current.video_url.split('/').pop()
        await supabase.storage.from('videos').remove([path])
      }
      await supabase.from('videos').delete().eq('id', current.id)
      const updated = shorts.filter((_, i) => i !== currentIndex)
      setShorts(updated)
      if (currentIndex >= updated.length && currentIndex > 0) {
        setCurrentIndex(prev => prev - 1)
      }
    } catch (e) {
      console.error('Delete error:', e)
    }
  }

  if (loading) return <div className="main-content"><div className="loading"><div className="spinner"></div></div></div>

  if (shorts.length === 0) {
    return (
      <div className="main-content">
        <div className="empty-state">
          <div className="empty-icon"><VideoIcon /></div>
          <h2 className="empty-title">Shorts пока нет</h2>
          <p className="empty-text">Загрузите первое короткое видео!</p>
        </div>
      </div>
    )
  }

  return (
    <div className="main-content shorts-page">
      <div className="shorts-player-container">
        <div className="shorts-view" onClick={handleVideoTap}>
          <div className="shorts-clip">
            <video
              ref={playerRef}
              key={current.id}
              className="shorts-video"
              src={current.video_url}
              loop
              muted
              playsInline
              onError={handleVideoError}
            />
          </div>

          {videoError && (
            <div className="shorts-error">
              <p>Не удалось загрузить видео</p>
            </div>
          )}

          {!playing && !videoError && (
            <button className="shorts-play-overlay" onClick={(e) => { e.stopPropagation(); togglePlay() }}>
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
          )}

          <div className={`shorts-controls ${showControls || !playing ? 'visible' : ''}`}>
            <div className="shorts-progress-bar">
              <div className="shorts-progress-fill" style={{ width: '30%' }}></div>
            </div>
            <div className="shorts-controls-bottom">
              <button className="shorts-nav-arrow" onClick={(e) => { e.stopPropagation(); goPrev() }} disabled={currentIndex === 0}>
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
              </button>
              <span className="shorts-counter">{currentIndex + 1}/{shorts.length}</span>
              <button className="shorts-nav-arrow" onClick={(e) => { e.stopPropagation(); goNext() }} disabled={currentIndex >= shorts.length - 1}>
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
              </button>
            </div>
          </div>

          <div className="shorts-actions">
            <button className={`shorts-action-btn ${userReaction === 'like' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); handleLike() }}>
              <ThumbUpIcon />
              <span>{current.likes || 0}</span>
            </button>
            <button className={`shorts-action-btn ${userReaction === 'dislike' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); handleDislike() }}>
              <ThumbDownIcon />
              <span>{current.dislikes || 0}</span>
            </button>
            <button className="shorts-action-btn" onClick={(e) => { e.stopPropagation(); handleShare() }}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
              <span>Поделиться</span>
            </button>
            {user && current.author_id === user.id && (
              <button className="shorts-action-btn shorts-delete-btn" onClick={(e) => { e.stopPropagation(); if (confirm('Удалить это видео?')) handleDeleteShort() }}>
                <DeleteIcon />
                <span>Удалить</span>
              </button>
            )}
          </div>

          <div className="shorts-overlay-bottom">
            <div className="shorts-info">
              <Link to={`/channel/${current.author_id}`} className="shorts-author" onClick={e => e.stopPropagation()}>
                {current.author_avatar ? (
                  <img src={current.author_avatar} alt="" className="shorts-author-avatar" />
                ) : (
                  <div className="shorts-author-placeholder">{(current.author_name || '?').charAt(0).toUpperCase()}</div>
                )}
                <span className="shorts-author-name">{current.author_name}</span>
              </Link>
              <h3 className="shorts-title">{current.title}</h3>
              <p className="shorts-description">{current.description}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TrendingPage() {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTrending()
  }, [])

  const fetchTrending = async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('videos')
        .select('*, profiles:profiles!videos_author_id_fkey (username, avatar)')
        .eq('type', 'video')
        .order('views', { ascending: false })
        .limit(50)

      if (data) {
        setVideos(data.map(v => ({
          ...v,
          author_name: v.profiles?.username,
          author_id: v.author_id
        })))
      }
    } catch (e) {
      console.error('Error fetching trending:', e)
    }
    setLoading(false)
  }

  if (loading) return <div className="main-content"><div className="loading"><div className="spinner"></div></div></div>

  return (
    <div className="main-content">
      <div className="trending-header">
        <h1 className="trending-title">В тренде</h1>
        <p className="trending-subtitle">Популярные видео</p>
      </div>
      {videos.length > 0 ? (
        <div className="video-grid">{videos.map(video => <VideoCard key={video.id} video={video} />)}</div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon"><VideoIcon /></div>
          <h2 className="empty-title">Популярных видео пока нет</h2>
          <p className="empty-text">Загрузите видео и наберите просмотры!</p>
        </div>
      )}
    </div>
  )
}

function HistoryPage() {
  const { user } = useAuth()
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    fetchHistory()
  }, [user])

  const fetchHistory = async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('watch_history')
        .select('*, videos:video_id (*, profiles:profiles!videos_author_id_fkey (username, avatar))')
        .eq('user_id', user.id)
        .order('watched_at', { ascending: false })

      if (data) {
        setVideos(data.map(h => ({
          ...h.videos,
          author_name: h.videos?.profiles?.username,
          author_avatar: h.videos?.profiles?.avatar,
          watched_at: h.watched_at
        })))
      }
    } catch (e) {
      console.error('Error fetching history:', e)
    }
    setLoading(false)
  }

  const clearHistory = async () => {
    if (!confirm('Очистить историю просмотров?')) return
    await supabase.from('watch_history').delete().eq('user_id', user.id)
    setVideos([])
  }

  if (loading) return <div className="main-content"><div className="loading"><div className="spinner"></div></div></div>

  return (
    <div className="main-content">
      <div className="page-header">
        <h1 className="page-title">История просмотров</h1>
        {videos.length > 0 && (
          <button className="btn btn-secondary" onClick={clearHistory} style={{ fontSize: '13px', padding: '6px 12px' }}>Очистить историю</button>
        )}
      </div>
      {videos.length > 0 ? (
        <div className="video-grid">{videos.map(video => <VideoCard key={`${video.id}-${video.watched_at}`} video={video} />)}</div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon"><HistoryIcon /></div>
          <h2 className="empty-title">История пуста</h2>
          <p className="empty-text">Начните смотреть видео — они появятся здесь</p>
        </div>
      )}
    </div>
  )
}

function LibraryPage() {
  const { user } = useAuth()
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    fetchVideos()
  }, [user])

  const fetchVideos = async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('videos')
        .select('*, profiles:profiles!videos_author_id_fkey (username, avatar)')
        .eq('author_id', user.id)
        .order('upload_date', { ascending: false })

      if (data) {
        setVideos(data.map(v => ({ ...v, author_name: v.profiles?.username, author_avatar: v.profiles?.avatar })))
      }
    } catch (e) {
      console.error('Error fetching library:', e)
    }
    setLoading(false)
  }

  if (loading) return <div className="main-content"><div className="loading"><div className="spinner"></div></div></div>

  return (
    <div className="main-content">
      <div className="page-header">
        <h1 className="page-title">Моя библиотека</h1>
        <Link to="/upload" className="btn btn-primary" style={{ fontSize: '13px', padding: '6px 12px', textDecoration: 'none' }}>Загрузить видео</Link>
      </div>
      {videos.length > 0 ? (
        <div className="video-grid">{videos.map(video => <VideoCard key={video.id} video={video} />)}</div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon"><LibraryIcon /></div>
          <h2 className="empty-title">Библиотека пуста</h2>
          <p className="empty-text">Загрузите своё первое видео</p>
        </div>
      )}
    </div>
  )
}

function LikedVideosPage() {
  const { user } = useAuth()
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    fetchLiked()
  }, [user])

  const fetchLiked = async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('video_reactions')
        .select('*, videos:video_id (*, profiles:profiles!videos_author_id_fkey (username, avatar))')
        .eq('user_id', user.id)
        .eq('reaction_type', 'like')
        .order('created_at', { ascending: false })

      if (data) {
        setVideos(data.map(r => ({
          ...r.videos,
          author_name: r.videos?.profiles?.username,
          author_avatar: r.videos?.profiles?.avatar
        })))
      }
    } catch (e) {
      console.error('Error fetching liked videos:', e)
    }
    setLoading(false)
  }

  if (loading) return <div className="main-content"><div className="loading"><div className="spinner"></div></div></div>

  return (
    <div className="main-content">
      <div className="page-header">
        <h1 className="page-title">Понравившиеся</h1>
      </div>
      {videos.length > 0 ? (
        <div className="video-grid">{videos.map(video => <VideoCard key={video.id} video={video} />)}</div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon"><LikeIcon /></div>
          <h2 className="empty-title">Нет понравившихся видео</h2>
          <p className="empty-text">Ставьте лайки — они сохранятся здесь</p>
        </div>
      )}
    </div>
  )
}

function SubscriptionsPage() {
  const { subscriptions } = useAuth()
  
  return (
    <div className="main-content">
      <h1>Подписки</h1>
      {subscriptions.length > 0 ? (
        <div className="video-grid">
          {subscriptions.map(sub => (
            <Link key={sub.id} to={`/channel/${sub.id}`} className="channel-card">
              <div className="channel-card-avatar">
                {sub.avatar ? <img src={sub.avatar} alt="" /> : sub.username.charAt(0).toUpperCase()}
              </div>
              <span>{sub.username}</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>Вы пока ни на кого не подписаны</p>
        </div>
      )}
    </div>
  )
}

function SettingsPage() {
  const { user } = useAuth()
  const [username, setUsername] = useState('')
  const [description, setDescription] = useState('')
  const [avatar, setAvatar] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const avatarInputRef = useRef(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!user) { setLoading(false); return }
    fetchProfile()
  }, [user])

  const fetchProfile = async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      if (data) {
        setUsername(data.username || '')
        setDescription(data.description || '')
        setAvatar(data.avatar || '')
      }
    } catch (e) {
      console.error('Error fetching profile:', e)
    }
    setLoading(false)
  }

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setAvatarFile(file)
    setAvatar(URL.createObjectURL(file))
  }

  const save = async () => {
    if (!username.trim()) { setMessage('Имя не может быть пустым'); return }
    setSaving(true)
    setMessage('')
    try {
      let avatarUrl = avatar || null

      if (avatarFile) {
        const ext = avatarFile.name.split('.').pop()
        const name = `${user.id}-avatar.${ext}`
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(name, avatarFile, { upsert: true })
        if (uploadError) throw uploadError
        avatarUrl = supabase.storage.from('avatars').getPublicUrl(name).data.publicUrl
      }

      const { error } = await supabase
        .from('profiles')
        .update({ username: username.trim(), description: description.trim(), avatar: avatarUrl })
        .eq('id', user.id)
      if (error) throw error

      setMessage('Настройки сохранены')
    } catch (e) {
      console.error('Error saving settings:', e)
      setMessage('Ошибка: ' + e.message)
    }
    setSaving(false)
  }

  if (loading) return <div className="main-content"><div className="loading"><div className="spinner"></div></div></div>

  if (!user) return <div className="main-content"><div className="empty-state"><p>Войдите в аккаунт</p></div></div>

  return (
    <div className="main-content">
      <div className="settings-container">
        <h1 className="page-title" style={{ marginBottom: '24px' }}>Настройки профиля</h1>

        <div className="settings-avatar-section">
          <div className="settings-avatar" onClick={() => avatarInputRef.current?.click()}>
            {avatar ? <img src={avatar} alt="" /> : <div className="settings-avatar-placeholder">{username.charAt(0).toUpperCase()}</div>}
            <div className="settings-avatar-overlay">Сменить</div>
          </div>
          <input type="file" ref={avatarInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleAvatarChange} />
        </div>

        <div className="form-group">
          <label className="form-label">Имя канала</label>
          <input className="form-input" value={username} onChange={e => setUsername(e.target.value)} placeholder="Ваше имя" />
        </div>

        <div className="form-group">
          <label className="form-label">Email</label>
          <input className="form-input" value={user.email || ''} disabled style={{ opacity: 0.6 }} />
        </div>

        <div className="form-group">
          <label className="form-label">Описание канала</label>
          <textarea className="form-textarea" value={description} onChange={e => setDescription(e.target.value)} placeholder="Расскажите о себе" />
        </div>

        {message && (
          <div className="settings-message" style={{ color: message.includes('Ошибка') ? '#ef4444' : '#22c55e', marginBottom: '16px', fontSize: '14px' }}>
            {message}
          </div>
        )}

        <button className="upload-submit-btn" onClick={save} disabled={saving}>
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>
    </div>
  )
}

// Main App
function App() {
  const { user } = useAuth()

  return (
    <div className="app">
      <Header />
      <div className="app-body">
        <Sidebar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/shorts" element={<ShortsPage />} />
          <Route path="/trending" element={<TrendingPage />} />
          <Route path="/search" element={<Search />} />
          <Route path="/video/:id" element={<VideoPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/channel/:id" element={<ChannelPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/subscriptions" element={<SubscriptionsPage />} />
          <Route path="/liked" element={<LikedVideosPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </div>
      
      {/* Mobile Bottom Navigation */}
      <nav className="mobile-nav">
        <div className="mobile-nav-items">
          <Link to="/" className="mobile-nav-item">
            <span className="mobile-nav-item-icon"><HomeIcon /></span>
            <span>Главная</span>
          </Link>
          <Link to="/shorts" className="mobile-nav-item">
            <span className="mobile-nav-item-icon"><ShortsIcon /></span>
            <span>Shorts</span>
          </Link>
          <Link to="/subscriptions" className="mobile-nav-item">
            <span className="mobile-nav-item-icon"><ChannelIcon /></span>
            <span>Подписки</span>
          </Link>
          {user ? (
            <Link to={`/channel/${user.id}`} className="mobile-nav-item">
              <span className="mobile-nav-item-icon"><UserIcon /></span>
              <span>Профиль</span>
            </Link>
          ) : (
            <Link to="/login" className="mobile-nav-item">
              <span className="mobile-nav-item-icon"><UserIcon /></span>
              <span>Войти</span>
            </Link>
          )}
        </div>
      </nav>
    </div>
  )
}

export default App
