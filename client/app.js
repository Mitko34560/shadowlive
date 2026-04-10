const STORAGE_KEY = 'shadowlive-current-user';

const STATIC_CLANS = [
  { icon: '🦎', name: 'Lizard Core', members: '0' },
  { icon: '🤡', name: 'Pixel Circus', members: '0' },
  { icon: '🍌', name: 'Banana Raid', members: '0' },
  { icon: '🍅', name: 'Red Pulse', members: '0' },
  { icon: '👾', name: 'Void Arcade', members: '0' },
  { icon: '💀', name: 'Skull House', members: '0' },
  { icon: '😎', name: 'Cool Face', members: '0' },
  { icon: '👀', name: 'Night Watch', members: '0' }
];

const FALLBACK_TAGS = [
  { tag: '#арт', count: 21900 },
  { tag: '#мем', count: 14400 },
  { tag: '#shadowlive', count: 12600 },
  { tag: '#нощ', count: 9800 },
  { tag: '#чат', count: 7600 },
  { tag: '#рейд', count: 6100 }
];

const state = {
  currentUser: null,
  profile: null,
  users: [],
  friends: [],
  posts: [],
  allMessages: [],
  activePage: 'feed',
  feedTab: 'foryou',
  profileTab: 'posts',
  searchQuery: '',
  chatUserId: null,
  chatMessages: [],
  chatOpen: false,
  expandedComments: {}
};

const elements = {
  authView: document.getElementById('authView'),
  appView: document.getElementById('appView'),
  loginForm: document.getElementById('loginForm'),
  registerForm: document.getElementById('registerForm'),
  forgotPasswordBtn: document.getElementById('forgotPasswordBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  sidebarNav: document.getElementById('sidebarNav'),
  pageHeader: document.getElementById('pageHeader'),
  mainContent: document.getElementById('mainContent'),
  chatModal: document.getElementById('chatModal'),
  chatHeader: document.getElementById('chatHeader'),
  chatMessages: document.getElementById('chatMessages'),
  messageForm: document.getElementById('messageForm'),
  messageInput: document.getElementById('messageInput'),
  toast: document.getElementById('toast')
};

let toastTimer = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || '';
  }

  return new Intl.DateTimeFormat('bg-BG', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function formatRelativeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || '';
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) {
    return 'сега';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} мин.`;
  }

  if (diffHours < 24) {
    return `${diffHours} ч.`;
  }

  if (diffDays < 7) {
    return `${diffDays} д.`;
  }

  return new Intl.DateTimeFormat('bg-BG', {
    day: 'numeric',
    month: 'short'
  }).format(date);
}

function formatMonthYear(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || '';
  }

  return new Intl.DateTimeFormat('bg-BG', {
    month: 'long',
    year: 'numeric'
  }).format(date);
}

function formatCompactCount(count) {
  const value = Number(count) || 0;
  if (value >= 1000) {
    const compact = value >= 10000 ? (value / 1000).toFixed(0) : (value / 1000).toFixed(1);
    return `${compact}K`;
  }

  return String(value);
}

function formatPostCountLabel(count) {
  const value = Number(count) || 0;
  return `${formatCompactCount(value)} поста`;
}

function avatarMarkup(user, size = 'medium') {
  const initials = (user?.username || '?').slice(0, 2).toUpperCase();
  return `<div class="avatar ${size}">${escapeHtml(initials)}</div>`;
}

function isVerified(user) {
  return Number(user?.id) === 1;
}

function saveSession(user) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

function loadSession() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

async function request(url, options = {}) {
  const config = {
    method: 'GET',
    ...options,
    headers: {
      ...(options.headers || {})
    }
  };

  if (options.body !== undefined) {
    config.headers['Content-Type'] = 'application/json';
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, config);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Възникна грешка при заявката.');
  }

  return data;
}

function showToast(message, type = 'success') {
  elements.toast.textContent = message;
  elements.toast.className = `toast ${type === 'error' ? 'error' : ''}`.trim();
  elements.toast.classList.remove('hidden');

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastTimer = setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, 2500);
}

function getUserById(userId) {
  if (!userId) {
    return null;
  }

  if (state.currentUser?.id === userId) {
    return state.currentUser;
  }

  return [...state.users, ...state.friends].find((user) => user.id === userId) || null;
}

function getOtherUsers() {
  return state.users.filter((user) => user.id !== state.currentUser?.id);
}

function getFriendIds() {
  return new Set(state.friends.map((friend) => friend.id));
}

function getPostsByCurrentUser() {
  return state.posts.filter((post) => post.userId === state.currentUser?.id);
}

function getLikedPosts() {
  return state.posts.filter((post) => post.likedByCurrentUser);
}

function getFeedPosts() {
  const friendIds = getFriendIds();

  if (state.feedTab === 'clans') {
    return state.posts.filter((post) => friendIds.has(post.userId));
  }

  if (state.feedTab === 'subscriptions') {
    return getLikedPosts();
  }

  return state.posts;
}

function getTrendingTags() {
  const counts = new Map();

  state.posts.forEach((post) => {
    const matches = post.content.match(/#[\w\u0400-\u04FF-]+/g) || [];
    matches.forEach((tag) => {
      const key = tag.toLowerCase();
      const current = counts.get(key) || { tag: key, count: 0 };
      current.count += 1;
      counts.set(key, current);
    });
  });

  const tags = Array.from(counts.values()).map((item) => ({
    tag: item.tag,
    count: item.count > 50 ? item.count : item.count * 3700
  }));

  FALLBACK_TAGS.forEach((item) => {
    if (!counts.has(item.tag.toLowerCase())) {
      tags.push(item);
    }
  });

  return tags
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 6);
}

function getSearchResults() {
  const query = state.searchQuery.trim().toLowerCase();
  if (!query) {
    return null;
  }

  const users = getOtherUsers().filter((user) => {
    const haystack = `${user.username} ${user.bio || ''}`.toLowerCase();
    return haystack.includes(query);
  });

  const posts = state.posts.filter((post) => {
    const haystack = `${post.content} ${post.author?.username || ''}`.toLowerCase();
    return haystack.includes(query);
  });

  const tags = getTrendingTags().filter((tag) => {
    const normalized = tag.tag.toLowerCase();
    return normalized.includes(query) || normalized.includes(`#${query.replace(/^#/, '')}`);
  });

  return { users, posts, tags };
}

function getNotifications() {
  const items = [];

  getPostsByCurrentUser().forEach((post) => {
    post.comments
      .filter((comment) => comment.userId !== state.currentUser.id)
      .forEach((comment) => {
        items.push({
          id: `comment-${comment.id}`,
          icon: '💬',
          title: `${comment.user.username} коментира твой пост`,
          body: comment.content,
          createdAt: comment.createdAt
        });
      });
  });

  state.allMessages
    .filter((message) => message.toUserId === state.currentUser.id)
    .forEach((message) => {
      items.push({
        id: `message-${message.id}`,
        icon: '✉',
        title: `Ново съобщение от ${message.fromUser.username}`,
        body: message.content,
        createdAt: message.createdAt
      });
    });

  return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function computeViews(post) {
  return post.likeCount * 7 + post.commentCount * 13 + post.id * 5 + 8;
}

function setAppMode(isAuthenticated) {
  elements.authView.classList.toggle('hidden', isAuthenticated);
  elements.appView.classList.toggle('hidden', !isAuthenticated);
}

function showAuthMode(mode) {
  const isRegister = mode === 'register';
  elements.loginForm.classList.toggle('hidden', isRegister);
  elements.registerForm.classList.toggle('hidden', !isRegister);
  elements.loginForm.classList.toggle('auth-form-active', !isRegister);
  elements.registerForm.classList.toggle('auth-form-active', isRegister);
}

function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (!input) {
    return;
  }

  input.type = input.type === 'password' ? 'text' : 'password';
}

function renderSidebarNav() {
  elements.sidebarNav.querySelectorAll('[data-page]').forEach((button) => {
    button.classList.toggle('active', button.dataset.page === state.activePage);
  });
}

function renderPageHeader() {
  if (state.activePage === 'feed') {
    elements.pageHeader.className = 'page-header';
    elements.pageHeader.innerHTML = `
      <div class="segmented-tabs">
        <button class="segmented-button ${state.feedTab === 'foryou' ? 'active' : ''}" data-feed-tab="foryou" type="button">За вас</button>
        <button class="segmented-button ${state.feedTab === 'clans' ? 'active' : ''}" data-feed-tab="clans" type="button">Лента кланове</button>
        <button class="segmented-button ${state.feedTab === 'subscriptions' ? 'active' : ''}" data-feed-tab="subscriptions" type="button">Абонаменти</button>
      </div>
    `;
    return;
  }

  if (state.activePage === 'profile') {
    elements.pageHeader.className = 'page-header header-collapsed';
    elements.pageHeader.innerHTML = '';
    return;
  }

  const headers = {
    search: {
      title: 'Търсене',
      description: 'Търси хора, постове и популярни хаштагове.'
    },
    event: {
      title: 'Ивент',
      description: 'Организирай нощната сесия и отвори чата към екипа.'
    },
    notifications: {
      title: 'Известия',
      description: 'Всички нови съобщения и коментари на едно място.'
    }
  };

  const current = headers[state.activePage];
  elements.pageHeader.className = 'page-header';
  elements.pageHeader.innerHTML = `
    <div class="page-title">
      <h1>${escapeHtml(current.title)}</h1>
      <p>${escapeHtml(current.description)}</p>
    </div>
  `;
}
function renderComposer() {
  return `
    <article class="surface composer-card">
      <form id="postForm" class="composer-form">
        <div class="composer-top">
          ${avatarMarkup(state.currentUser, 'medium')}
          <textarea
            id="postContent"
            class="composer-input"
            rows="3"
            maxlength="600"
            placeholder="Какво ново?"
            required
          ></textarea>
        </div>

        <div class="composer-bottom">
          <div class="composer-tools" aria-hidden="true">
            <button class="tool-ghost" type="button">⌁</button>
            <button class="tool-ghost" type="button">☺</button>
            <button class="tool-ghost" type="button">◔</button>
            <button class="tool-ghost" type="button">≋</button>
          </div>
          <button class="primary-button" type="submit">Опубликувай</button>
        </div>
      </form>
    </article>
  `;
}

function renderCommentPanel(post) {
  const comments = post.comments.length
    ? `
        <div class="comment-list">
          ${post.comments
            .map(
              (comment) => `
                <div class="comment-item">
                  ${avatarMarkup(comment.user, 'small')}
                  <div class="comment-body">
                    <div class="comment-author">
                      <strong>${escapeHtml(comment.user.username)}</strong>
                      <span class="comment-time">${formatRelativeDate(comment.createdAt)}</span>
                    </div>
                    <p class="post-text">${escapeHtml(comment.content)}</p>
                  </div>
                </div>
              `
            )
            .join('')}
        </div>
      `
    : '<div class="inline-empty">Няма коментари. Бъди първият.</div>';

  return `
    <div class="comment-panel">
      ${comments}
      <form class="comment-form" data-post-id="${post.id}">
        <textarea class="comment-input" rows="2" maxlength="300" placeholder="Напиши коментар" required></textarea>
        <button class="comment-submit" type="submit">Коментар</button>
      </form>
    </div>
  `;
}

function renderPostCard(post) {
  const ownPost = post.userId === state.currentUser.id;
  const commentsOpen = Boolean(state.expandedComments[post.id]);

  return `
    <article class="surface post-card">
      <div class="post-top">
        <div class="post-author">
          ${avatarMarkup(post.author, 'medium')}
          <div class="author-block">
            <div class="author-name-row">
              <span class="author-name">${escapeHtml(post.author.username)}</span>
              ${isVerified(post.author) ? '<span class="verified-badge">✓</span>' : ''}
            </div>
            <div class="author-meta">${formatRelativeDate(post.createdAt)}</div>
          </div>
        </div>
        ${
          ownPost
            ? `<button class="ghost-icon" type="button" data-action="delete-post" data-post-id="${post.id}">×</button>`
            : '<span class="ghost-icon">⋯</span>'
        }
      </div>

      <p class="post-text">${escapeHtml(post.content)}</p>

      <div class="post-metrics">
        <button class="metric-button ${post.likedByCurrentUser ? 'liked' : ''}" type="button" data-action="toggle-like" data-post-id="${post.id}">
          <span>♡</span>
          <span>${post.likeCount}</span>
        </button>
        <button class="metric-button" type="button" data-action="toggle-comments" data-post-id="${post.id}">
          <span>💬</span>
          <span>${post.commentCount}</span>
        </button>
        ${
          !ownPost
            ? `<button class="metric-button" type="button" data-action="open-chat" data-user-id="${post.author.id}">
                <span>✉</span>
                <span>Чат</span>
              </button>`
            : ''
        }
        <div class="metric-view">
          <span>◔</span>
          <span>${computeViews(post)}</span>
        </div>
      </div>

      ${commentsOpen ? renderCommentPanel(post) : ''}
    </article>
  `;
}

function renderPosts(posts, emptyMessage) {
  if (!posts.length) {
    return `<article class="surface post-card"><div class="empty-panel">${escapeHtml(emptyMessage)}</div></article>`;
  }

  return `<div class="post-list">${posts.map((post) => renderPostCard(post)).join('')}</div>`;
}

function renderFeedPage() {
  const messages = {
    foryou: 'Все още няма постове в общата лента.',
    clans: 'Тук ще се появят постовете на приятелите ти.',
    subscriptions: 'Харесай няколко поста, за да ги виждаш тук.'
  };

  return `
    <div class="page-stack">
      ${renderComposer()}
      ${renderPosts(getFeedPosts(), messages[state.feedTab])}
    </div>
  `;
}

function renderSearchResultsSection() {
  const results = getSearchResults();
  if (!results) {
    return '';
  }

  const sections = [];

  if (results.users.length) {
    sections.push(`
      <div class="result-section">
        <h2 class="panel-title">Профили</h2>
        <div class="result-list">
          ${results.users
            .map(
              (user) => `
                <div class="result-row">
                  <div class="result-main">
                    <div class="post-author">
                      ${avatarMarkup(user, 'small')}
                      <div>
                        <strong>${escapeHtml(user.username)}</strong>
                        <div class="result-subtext">${escapeHtml(user.bio || 'Без описание')}</div>
                      </div>
                    </div>
                  </div>
                  <div class="result-actions">
                    <button class="ghost-button" type="button" data-action="toggle-friend" data-user-id="${user.id}">
                      ${user.isFriend ? 'Премахни' : 'Добави'} приятел
                    </button>
                    <button class="primary-button" type="button" data-action="open-chat" data-user-id="${user.id}">Чат</button>
                  </div>
                </div>
              `
            )
            .join('')}
        </div>
      </div>
    `);
  }

  if (results.posts.length) {
    sections.push(`
      <div class="result-section">
        <h2 class="panel-title">Постове</h2>
        <div class="result-list">
          ${results.posts
            .slice(0, 6)
            .map(
              (post) => `
                <div class="result-row">
                  <div class="result-main">
                    <strong>${escapeHtml(post.author.username)}</strong>
                    <p class="result-post">${escapeHtml(post.content)}</p>
                    <div class="result-subtext">${formatDate(post.createdAt)}</div>
                  </div>
                  <div class="result-actions">
                    ${
                      post.author.id !== state.currentUser.id
                        ? `<button class="ghost-button" type="button" data-action="open-chat" data-user-id="${post.author.id}">Пиши</button>`
                        : ''
                    }
                    <button class="ghost-button" type="button" data-action="open-feed-post" data-post-id="${post.id}">Отвори пост</button>
                  </div>
                </div>
              `
            )
            .join('')}
        </div>
      </div>
    `);
  }

  if (results.tags.length) {
    sections.push(`
      <div class="result-section">
        <h2 class="panel-title">Хаштагове</h2>
        <div class="result-list">
          ${results.tags
            .map(
              (tag) => `
                <div class="result-row">
                  <div class="result-main">
                    <strong>${escapeHtml(tag.tag)}</strong>
                    <div class="result-subtext">${formatPostCountLabel(tag.count)}</div>
                  </div>
                </div>
              `
            )
            .join('')}
        </div>
      </div>
    `);
  }

  if (!sections.length) {
    return `
      <article class="surface result-panel">
        <div class="empty-panel">Няма резултати за „${escapeHtml(state.searchQuery)}“.</div>
      </article>
    `;
  }

  return `
    <article class="surface result-panel">
      <h2 class="panel-title">Резултати</h2>
      ${sections.join('')}
    </article>
  `;
}
function renderSearchPage() {
  const trendingTags = getTrendingTags();

  return `
    <div class="page-stack">
      <article class="surface search-panel search-box">
        <div class="search-input-shell">
          <span class="search-icon">⌕</span>
          <input id="searchInput" class="search-input" type="text" value="${escapeHtml(state.searchQuery)}" placeholder="Търси хора и хаштагове" />
        </div>
      </article>

      <div id="searchDynamic">${renderSearchResultsSection()}</div>

      <article class="surface search-panel">
        <h2 class="panel-title">Топ кланове</h2>
        <div class="clan-grid">
          ${STATIC_CLANS.map(
            (clan) => `
              <div class="clan-pill">
                <span class="clan-icon">${clan.icon}</span>
                <span>${clan.members}</span>
              </div>
            `
          ).join('')}
        </div>
      </article>

      <article class="surface search-panel">
        <h2 class="panel-title">Популярни хаштагове</h2>
        <div class="tag-rank-list">
          ${trendingTags
            .map(
              (tag, index) => `
                <div class="tag-rank-item">
                  <div class="tag-index">${index + 1}</div>
                  <div class="tag-meta">
                    <strong>${escapeHtml(tag.tag)}</strong>
                    <span>${formatPostCountLabel(tag.count)}</span>
                  </div>
                </div>
              `
            )
            .join('')}
        </div>
      </article>
    </div>
  `;
}

function renderEventPage() {
  const focusUser = state.friends[0] || getOtherUsers()[0] || null;
  const recentMessages = [...state.allMessages]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 6);

  return `
    <div class="page-stack">
      <article class="surface event-hero">
        <span class="event-eyebrow">✺ live session</span>
        <h2 class="event-title">Night Raid Control</h2>
        <p class="event-copy">
          Събери екипа, отвори личните разговори и синхронизирай следващия рейд директно през локалния JSON-powered social hub.
        </p>

        <div class="event-stats">
          <div class="event-stat">${state.friends.length} приятели</div>
          <div class="event-stat">${state.posts.length} поста</div>
          <div class="event-stat">${state.allMessages.length} съобщения</div>
        </div>

        <div class="result-actions" style="margin-top: 24px;">
          <button class="ghost-button" type="button" data-action="refresh-app">Обнови</button>
          ${
            focusUser
              ? `<button class="primary-button" type="button" data-action="open-chat" data-user-id="${focusUser.id}">Отвори чат</button>`
              : ''
          }
        </div>
      </article>

      <div class="event-grid">
        <article class="surface search-panel">
          <h2 class="panel-title">Екип</h2>
          <p class="panel-subtitle">Приятелите ти и най-бързият достъп до разговор.</p>
          <div class="event-list">
            ${
              state.friends.length
                ? state.friends
                    .map(
                      (friend) => `
                        <div class="event-user-row">
                          <div class="post-author">
                            ${avatarMarkup(friend, 'small')}
                            <div>
                              <strong>${escapeHtml(friend.username)}</strong>
                              <div class="result-subtext">${escapeHtml(friend.bio || 'Няма описание')}</div>
                            </div>
                          </div>
                          <button class="ghost-button" type="button" data-action="open-chat" data-user-id="${friend.id}">Чат</button>
                        </div>
                      `
                    )
                    .join('')
                : '<div class="empty-panel">Добави приятели, за да организираш екип.</div>'
            }
          </div>
        </article>

        <article class="surface search-panel">
          <h2 class="panel-title">Последни съобщения</h2>
          <p class="panel-subtitle">Най-новата активност от личните разговори.</p>
          <div class="event-list">
            ${
              recentMessages.length
                ? recentMessages
                    .map((message) => {
                      const partner = message.fromUserId === state.currentUser.id ? message.toUser : message.fromUser;
                      return `
                        <div class="event-message-row">
                          <div class="event-side-icon">✉</div>
                          <div>
                            <strong>${escapeHtml(partner.username)}</strong>
                            <div class="result-post">${escapeHtml(message.content)}</div>
                            <div class="result-subtext">${formatRelativeDate(message.createdAt)}</div>
                          </div>
                        </div>
                      `;
                    })
                    .join('')
                : '<div class="empty-panel">Все още няма активни съобщения.</div>'
            }
          </div>
        </article>
      </div>
    </div>
  `;
}

function renderNotificationsPage() {
  const notifications = getNotifications();

  if (!notifications.length) {
    return `
      <article class="surface notification-panel">
        <div class="empty-panel">Няма известия</div>
      </article>
    `;
  }

  return `
    <article class="surface notification-panel">
      <div class="notification-list">
        ${notifications
          .map(
            (item) => `
              <div class="notification-item">
                <div class="notification-icon">${item.icon}</div>
                <div class="notification-copy">
                  <strong>${escapeHtml(item.title)}</strong>
                  <p>${escapeHtml(item.body)}</p>
                  <div class="notification-time">${formatRelativeDate(item.createdAt)}</div>
                </div>
              </div>
            `
          )
          .join('')}
      </div>
    </article>
  `;
}

function renderProfilePage() {
  const ownPosts = getPostsByCurrentUser();
  const likedPosts = getLikedPosts();
  const currentPosts = state.profileTab === 'posts' ? ownPosts : likedPosts;
  const stats = state.profile?.stats || { posts: 0, friends: 0, likesReceived: 0, commentsReceived: 0 };
  const user = state.profile?.user || state.currentUser;

  return `
    <div class="profile-shell">
      <article class="surface profile-banner">
        <div class="profile-cover"></div>
        <div class="profile-floating">
          <div class="profile-avatar-wrap">
            ${avatarMarkup(user, 'large')}
            <span class="online-dot"></span>
          </div>

          <div class="profile-main">
            <div class="profile-headline">
              <div class="profile-name-block">
                <div class="profile-title-row">
                  <h1 class="profile-name">${escapeHtml(user.username)}</h1>
                  ${isVerified(user) ? '<span class="verified-badge">✓</span>' : ''}
                  <span class="profile-handle">@${escapeHtml(user.username.toLowerCase())}_official</span>
                </div>
              </div>

              <div class="profile-actions">
                <div class="profile-pill">ShadowLive Club</div>
                <button class="profile-action" type="button" data-action="refresh-app">Обнови</button>
              </div>
            </div>

            <div class="profile-stats">
              <div><strong>${stats.posts}</strong> поста</div>
              <div><strong>${stats.friends}</strong> приятели</div>
              <div><strong>${likedPosts.length}</strong> харесани</div>
            </div>

            <div class="profile-meta-line">
              <span class="profile-joined">Регистрация: ${escapeHtml(formatMonthYear(user.createdAt))}</span>
            </div>

            <p class="profile-bio">${escapeHtml(user.bio || 'Няма добавено описание.')}</p>
          </div>
        </div>
      </article>

      <div class="segmented-tabs profile-tabs">
        <button class="segmented-button ${state.profileTab === 'posts' ? 'active' : ''}" data-profile-tab="posts" type="button">Постове</button>
        <button class="segmented-button ${state.profileTab === 'likes' ? 'active' : ''}" data-profile-tab="likes" type="button">Лайкове</button>
      </div>

      ${renderComposer()}
      ${renderPosts(currentPosts, state.profileTab === 'posts' ? 'Все още нямаш собствени постове.' : 'Все още няма харесани постове.')}
    </div>
  `;
}

function renderCurrentPage() {
  if (state.activePage === 'search') {
    return renderSearchPage();
  }

  if (state.activePage === 'event') {
    return renderEventPage();
  }

  if (state.activePage === 'notifications') {
    return renderNotificationsPage();
  }

  if (state.activePage === 'profile') {
    return renderProfilePage();
  }

  return renderFeedPage();
}

function renderSearchDynamic() {
  const slot = document.getElementById('searchDynamic');
  if (slot) {
    slot.innerHTML = renderSearchResultsSection();
  }
}

function renderChatModal() {
  const target = getUserById(state.chatUserId);

  if (!state.chatOpen || !target) {
    elements.chatModal.classList.add('hidden');
    return;
  }

  elements.chatModal.classList.remove('hidden');
  elements.chatHeader.innerHTML = `
    <div class="post-author">
      ${avatarMarkup(target, 'small')}
      <div>
        <strong>${escapeHtml(target.username)}</strong>
        <div class="chat-meta">${escapeHtml(target.bio || 'Личен разговор')}</div>
      </div>
    </div>
    <button class="ghost-button" type="button" data-action="close-chat">Затвори</button>
  `;

  if (!state.chatMessages.length) {
    elements.chatMessages.innerHTML = '<div class="empty-panel">Все още няма съобщения в този разговор.</div>';
  } else {
    elements.chatMessages.innerHTML = state.chatMessages
      .map((message) => {
        const isSelf = message.fromUserId === state.currentUser.id;
        return `
          <div class="chat-bubble-row ${isSelf ? 'self' : ''}">
            ${isSelf ? '' : avatarMarkup(message.fromUser, 'small')}
            <div class="chat-bubble">
              <p>${escapeHtml(message.content)}</p>
              <div class="chat-meta">${formatDate(message.createdAt)}</div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  requestAnimationFrame(() => {
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  });
}

function renderApp() {
  renderSidebarNav();
  renderPageHeader();
  elements.mainContent.innerHTML = renderCurrentPage();
  renderChatModal();
}
async function loadConversation() {
  if (!state.currentUser || !state.chatUserId) {
    state.chatMessages = [];
    renderChatModal();
    return;
  }

  state.chatMessages = await request(
    `/messages?userId=${state.currentUser.id}&chatWith=${state.chatUserId}`
  );
  renderChatModal();
}

async function bootstrapApp() {
  if (!state.currentUser) {
    return;
  }

  try {
    const userId = state.currentUser.id;
    const [profile, users, friends, posts, allMessages] = await Promise.all([
      request(`/profile/${userId}`),
      request(`/users?currentUserId=${userId}`),
      request(`/friends/${userId}`),
      request(`/posts?currentUserId=${userId}`),
      request(`/messages?userId=${userId}`)
    ]);

    state.profile = profile;
    state.currentUser = profile.user;
    state.users = users;
    state.friends = friends;
    state.posts = posts;
    state.allMessages = allMessages;
    saveSession(state.currentUser);

    if (state.chatOpen && state.chatUserId) {
      await loadConversation();
    }

    renderApp();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleLogin(event) {
  event.preventDefault();

  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();

  try {
    const result = await request('/login', {
      method: 'POST',
      body: { username, password }
    });

    state.currentUser = result.user;
    setAppMode(true);
    await bootstrapApp();
    elements.loginForm.reset();
    showToast('Успешен вход.');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleRegister(event) {
  event.preventDefault();

  const email = document.getElementById('registerEmail').value.trim();
  const username = document.getElementById('registerUsername').value.trim();
  const password = document.getElementById('registerPassword').value.trim();

  try {
    const result = await request('/register', {
      method: 'POST',
      body: { email, username, password }
    });

    state.currentUser = result.user;
    setAppMode(true);
    await bootstrapApp();
    elements.registerForm.reset();
    showToast('Профилът е създаден.');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleCreatePost() {
  const textarea = document.getElementById('postContent');
  if (!textarea) {
    return;
  }

  const content = textarea.value.trim();
  if (!content) {
    return;
  }

  try {
    await request('/posts', {
      method: 'POST',
      body: {
        userId: state.currentUser.id,
        content
      }
    });

    await bootstrapApp();
    showToast('Постът е публикуван.');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleDeletePost(postId) {
  const confirmed = window.confirm('Сигурен ли си, че искаш да изтриеш този пост?');
  if (!confirmed) {
    return;
  }

  try {
    await request(`/posts/${postId}`, {
      method: 'DELETE',
      body: {
        userId: state.currentUser.id
      }
    });

    delete state.expandedComments[postId];
    await bootstrapApp();
    showToast('Постът беше изтрит.');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleToggleLike(postId) {
  try {
    await request('/like', {
      method: 'POST',
      body: {
        userId: state.currentUser.id,
        postId
      }
    });

    await bootstrapApp();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleCommentSubmit(postId, content) {
  try {
    state.expandedComments[postId] = true;
    await request('/comment', {
      method: 'POST',
      body: {
        userId: state.currentUser.id,
        postId,
        content
      }
    });

    await bootstrapApp();
    showToast('Коментарът е добавен.');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleToggleFriend(userId) {
  try {
    const result = await request('/friends', {
      method: 'POST',
      body: {
        userId: state.currentUser.id,
        friendId: userId
      }
    });

    await bootstrapApp();
    showToast(result.message);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function openChatWith(userId) {
  if (!userId || userId === state.currentUser.id) {
    return;
  }

  state.chatUserId = userId;
  state.chatOpen = true;
  state.chatMessages = [];
  renderChatModal();

  try {
    await loadConversation();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function closeChat() {
  state.chatOpen = false;
  renderChatModal();
}

async function handleMessageSubmit(event) {
  event.preventDefault();

  if (!state.chatUserId) {
    showToast('Първо избери разговор.', 'error');
    return;
  }

  const content = elements.messageInput.value.trim();
  if (!content) {
    return;
  }

  try {
    await request('/message', {
      method: 'POST',
      body: {
        fromUserId: state.currentUser.id,
        toUserId: state.chatUserId,
        content
      }
    });

    elements.messageInput.value = '';
    await bootstrapApp();
    showToast('Съобщението е изпратено.');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleLogout() {
  try {
    await request('/logout', { method: 'POST' });
  } catch (error) {
    console.error(error);
  }

  state.currentUser = null;
  state.profile = null;
  state.users = [];
  state.friends = [];
  state.posts = [];
  state.allMessages = [];
  state.chatUserId = null;
  state.chatMessages = [];
  state.chatOpen = false;
  state.expandedComments = {};
  clearSession();
  closeChat();
  showAuthMode('login');
  setAppMode(false);
  showToast('Излезе от профила си.');
}
function bindEvents() {
  elements.loginForm.addEventListener('submit', handleLogin);
  elements.registerForm.addEventListener('submit', handleRegister);
  elements.logoutBtn.addEventListener('click', handleLogout);
  elements.messageForm.addEventListener('submit', handleMessageSubmit);

  elements.authView.addEventListener('click', (event) => {
    const modeButton = event.target.closest('[data-auth-mode]');
    if (modeButton) {
      showAuthMode(modeButton.dataset.authMode);
      return;
    }

    const passwordButton = event.target.closest('[data-toggle-password]');
    if (passwordButton) {
      togglePasswordVisibility(passwordButton.dataset.togglePassword);
      return;
    }

    if (event.target === elements.forgotPasswordBtn) {
      showToast('Смяната на парола не е налична в demo версията.', 'error');
    }
  });

  elements.sidebarNav.addEventListener('click', (event) => {
    const button = event.target.closest('[data-page]');
    if (!button) {
      return;
    }

    state.activePage = button.dataset.page;
    renderApp();
  });

  elements.pageHeader.addEventListener('click', (event) => {
    const button = event.target.closest('[data-feed-tab]');
    if (!button) {
      return;
    }

    state.feedTab = button.dataset.feedTab;
    renderApp();
  });

  elements.mainContent.addEventListener('click', (event) => {
    const profileTabButton = event.target.closest('[data-profile-tab]');
    if (profileTabButton) {
      state.profileTab = profileTabButton.dataset.profileTab;
      renderApp();
      return;
    }

    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) {
      return;
    }

    const action = actionTarget.dataset.action;
    const postId = Number(actionTarget.dataset.postId || 0);
    const userId = Number(actionTarget.dataset.userId || 0);

    if (action === 'toggle-like' && postId) {
      handleToggleLike(postId);
      return;
    }

    if (action === 'toggle-comments' && postId) {
      state.expandedComments[postId] = !state.expandedComments[postId];
      renderApp();
      return;
    }

    if (action === 'delete-post' && postId) {
      handleDeletePost(postId);
      return;
    }

    if (action === 'open-chat' && userId) {
      openChatWith(userId);
      return;
    }

    if (action === 'toggle-friend' && userId) {
      handleToggleFriend(userId);
      return;
    }

    if (action === 'refresh-app') {
      bootstrapApp();
    }
  });

  elements.mainContent.addEventListener('submit', (event) => {
    const form = event.target;

    if (form.id === 'postForm') {
      event.preventDefault();
      handleCreatePost();
      return;
    }

    const commentForm = form.closest('.comment-form');
    if (!commentForm) {
      return;
    }

    event.preventDefault();
    const postId = Number(commentForm.dataset.postId || 0);
    const textarea = commentForm.querySelector('textarea');
    const content = textarea?.value.trim() || '';

    if (!postId || !content) {
      return;
    }

    textarea.value = '';
    handleCommentSubmit(postId, content);
  });

  elements.mainContent.addEventListener('input', (event) => {
    if (event.target.id === 'searchInput') {
      state.searchQuery = event.target.value;
      renderSearchDynamic();
    }
  });

  elements.chatModal.addEventListener('click', (event) => {
    const actionTarget = event.target.closest('[data-action="close-chat"]');
    if (actionTarget) {
      closeChat();
    }
  });
}

function init() {
  bindEvents();
  showAuthMode('login');
  const savedUser = loadSession();

  if (savedUser) {
    state.currentUser = savedUser;
    setAppMode(true);
    bootstrapApp();
  } else {
    setAppMode(false);
  }
}

init();












