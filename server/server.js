const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_DIR = path.join(__dirname, '..', 'client');
const DATA_DIR = path.join(__dirname, 'data');

const FILES = {
  users: path.join(DATA_DIR, 'users.json'),
  posts: path.join(DATA_DIR, 'posts.json'),
  comments: path.join(DATA_DIR, 'comments.json'),
  messages: path.join(DATA_DIR, 'messages.json'),
  friends: path.join(DATA_DIR, 'friends.json'),
  likes: path.join(DATA_DIR, 'likes.json')
};

const DEFAULT_DATA = {
  users: [],
  posts: [],
  comments: [],
  messages: [],
  friends: [],
  likes: []
};

function ensureDataFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  Object.entries(FILES).forEach(([key, filePath]) => {
    if (!fs.existsSync(filePath)) {
      writeData(filePath, DEFAULT_DATA[key]);
    }
  });
}

function readData(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    throw new Error(`Unable to read ${path.basename(filePath)}: ${error.message}`);
  }
}

function writeData(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function loadCollection(name) {
  return readData(FILES[name]);
}

function saveCollection(name, data) {
  writeData(FILES[name], data);
}

function loadAllCollections() {
  return Object.keys(FILES).reduce((collections, key) => {
    collections[key] = loadCollection(key);
    return collections;
  }, {});
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  const { password, ...safeUser } = user;
  return safeUser;
}

function fallbackUser(id = 0) {
  return {
    id,
    username: 'unknown',
    avatar: '',
    bio: '',
    createdAt: null
  };
}

function nextId(items) {
  return items.reduce((maxId, item) => Math.max(maxId, Number(item.id) || 0), 0) + 1;
}

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function buildDefaultEmail(username) {
  const localPart = normalizeUsername(username).replace(/[^a-z0-9._-]+/g, '');
  return (localPart || 'user') + '@shadowlive.local';
}

function backfillUserEmails() {
  const users = loadCollection('users');
  let changed = false;

  users.forEach((user) => {
    if (!user.email) {
      user.email = buildDefaultEmail(user.username);
      changed = true;
    }
  });

  if (changed) {
    saveCollection('users', users);
  }
}

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function sortByNewest(items) {
  return [...items].sort((a, b) => {
    const dateDifference = new Date(b.createdAt) - new Date(a.createdAt);
    return dateDifference || (b.id - a.id);
  });
}

function sortByOldest(items) {
  return [...items].sort((a, b) => {
    const dateDifference = new Date(a.createdAt) - new Date(b.createdAt);
    return dateDifference || (a.id - b.id);
  });
}

function getUserById(users, userId) {
  return users.find((user) => user.id === userId);
}

function getFriendIds(friends, userId) {
  return friends
    .filter((friendship) => Array.isArray(friendship.userIds) && friendship.userIds.includes(userId))
    .map((friendship) => friendship.userIds.find((id) => id !== userId))
    .filter(Boolean);
}

function areFriends(friends, userId, friendId) {
  return friends.some(
    (friendship) =>
      Array.isArray(friendship.userIds) &&
      friendship.userIds.includes(userId) &&
      friendship.userIds.includes(friendId)
  );
}

function buildCommentResponse(comment, users) {
  return {
    ...comment,
    user: sanitizeUser(getUserById(users, comment.userId)) || fallbackUser(comment.userId)
  };
}

function buildPostResponse(post, collections, currentUserId = null) {
  const author = sanitizeUser(getUserById(collections.users, post.userId)) || fallbackUser(post.userId);
  const postLikes = collections.likes.filter((like) => like.postId === post.id);
  const postComments = sortByOldest(
    collections.comments.filter((comment) => comment.postId === post.id)
  ).map((comment) => buildCommentResponse(comment, collections.users));

  return {
    ...post,
    author,
    likeCount: postLikes.length,
    commentCount: postComments.length,
    likedByCurrentUser: Boolean(
      currentUserId && postLikes.some((like) => like.userId === currentUserId)
    ),
    comments: postComments
  };
}

function buildProfileResponse(userId, collections) {
  const user = getUserById(collections.users, userId);

  if (!user) {
    return null;
  }

  const userPosts = collections.posts.filter((post) => post.userId === userId);
  const postIds = new Set(userPosts.map((post) => post.id));
  const likesReceived = collections.likes.filter((like) => postIds.has(like.postId)).length;
  const commentsReceived = collections.comments.filter((comment) => postIds.has(comment.postId)).length;

  return {
    user: sanitizeUser(user),
    stats: {
      posts: userPosts.length,
      friends: getFriendIds(collections.friends, userId).length,
      likesReceived,
      commentsReceived
    },
    recentPosts: sortByNewest(userPosts)
      .slice(0, 3)
      .map((post) => buildPostResponse(post, collections, userId))
  };
}

function buildConversation(userId, chatWith, collections) {
  return sortByOldest(
    collections.messages.filter(
      (message) =>
        (message.fromUserId === userId && message.toUserId === chatWith) ||
        (message.fromUserId === chatWith && message.toUserId === userId)
    )
  ).map((message) => ({
    ...message,
    fromUser: sanitizeUser(getUserById(collections.users, message.fromUserId)) || fallbackUser(message.fromUserId),
    toUser: sanitizeUser(getUserById(collections.users, message.toUserId)) || fallbackUser(message.toUserId)
  }));
}

function requireUser(users, userId) {
  const user = getUserById(users, userId);
  if (!user) {
    return { error: 'Потребителят не беше намерен.' };
  }

  return { user };
}

ensureDataFiles();
backfillUserEmails();

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.static(CLIENT_DIR));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ShadowLive', time: new Date().toISOString() });
});

app.post('/register', (req, res) => {
  try {
    const collections = loadAllCollections();
    const username = cleanText(req.body.username, 24);
    const emailInput = cleanText(req.body.email, 120);
    const email = normalizeEmail(emailInput || buildDefaultEmail(username));
    const password = cleanText(req.body.password, 64);

    if (username.length < 3) {
      return res.status(400).json({ error: 'Потребителското име трябва да е поне 3 символа.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Въведи валиден имейл адрес.' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'Паролата трябва да е поне 4 символа.' });
    }

    const usernameTaken = collections.users.some(
      (user) => normalizeUsername(user.username) === normalizeUsername(username)
    );

    if (usernameTaken) {
      return res.status(409).json({ error: 'Това потребителско име вече съществува.' });
    }

    const emailTaken = collections.users.some(
      (user) => normalizeEmail(user.email) === email
    );

    if (emailTaken) {
      return res.status(409).json({ error: 'Този имейл вече е регистриран.' });
    }

    const newUser = {
      id: nextId(collections.users),
      username,
      email,
      password,
      avatar: '',
      bio: 'Нов играч в ShadowLive.',
      createdAt: new Date().toISOString()
    };

    collections.users.push(newUser);
    saveCollection('users', collections.users);

    return res.status(201).json({
      message: 'Регистрацията е успешна.',
      user: sanitizeUser(newUser)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/login', (req, res) => {
  try {
    const collections = loadAllCollections();
    const identifier = cleanText(req.body.username || req.body.email || req.body.identifier, 120);
    const normalizedIdentifier = normalizeUsername(identifier);
    const normalizedEmail = normalizeEmail(identifier);
    const password = cleanText(req.body.password, 64);

    const user = collections.users.find(
      (item) =>
        item.password === password &&
        (
          normalizeUsername(item.username) === normalizedIdentifier ||
          normalizeEmail(item.email) === normalizedEmail
        )
    );

    if (!user) {
      return res.status(401).json({ error: 'Невалиден имейл, потребителско име или парола.' });
    }

    return res.json({
      message: 'Входът е успешен.',
      user: sanitizeUser(user)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/logout', (req, res) => {
  res.json({ message: 'Изходът е успешен.' });
});

app.get('/users', (req, res) => {
  try {
    const collections = loadAllCollections();
    const currentUserId = parsePositiveInt(req.query.currentUserId);

    const users = collections.users
      .map((user) => {
        const safeUser = sanitizeUser(user);
        return {
          ...safeUser,
          isCurrentUser: safeUser.id === currentUserId,
          isFriend: currentUserId ? areFriends(collections.friends, currentUserId, safeUser.id) : false
        };
      })
      .sort((a, b) => {
        const friendshipDifference = Number(b.isFriend) - Number(a.isFriend);
        return friendshipDifference || a.username.localeCompare(b.username);
      });

    return res.json(users);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/profile/:id', (req, res) => {
  try {
    const userId = parsePositiveInt(req.params.id);
    if (!userId) {
      return res.status(400).json({ error: 'Невалиден идентификатор на профил.' });
    }

    const collections = loadAllCollections();
    const profile = buildProfileResponse(userId, collections);

    if (!profile) {
      return res.status(404).json({ error: 'Профилът не беше намерен.' });
    }

    return res.json(profile);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

function sendFeed(req, res) {
  try {
    const collections = loadAllCollections();
    const currentUserId = parsePositiveInt(req.query.currentUserId);

    const posts = sortByNewest(collections.posts).map((post) =>
      buildPostResponse(post, collections, currentUserId)
    );

    return res.json(posts);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

app.get('/posts', sendFeed);
app.get('/feed', sendFeed);

app.post('/posts', (req, res) => {
  try {
    const collections = loadAllCollections();
    const userId = parsePositiveInt(req.body.userId);
    const content = cleanText(req.body.content, 600);

    if (!userId) {
      return res.status(400).json({ error: 'Липсва валиден потребител.' });
    }

    if (content.length < 1) {
      return res.status(400).json({ error: 'Постът не може да бъде празен.' });
    }

    const { user, error } = requireUser(collections.users, userId);
    if (error) {
      return res.status(404).json({ error });
    }

    const newPost = {
      id: nextId(collections.posts),
      userId: user.id,
      content,
      createdAt: new Date().toISOString()
    };

    collections.posts.push(newPost);
    saveCollection('posts', collections.posts);

    return res.status(201).json({
      message: 'Постът е публикуван.',
      post: buildPostResponse(newPost, collections, userId)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/posts/:id', (req, res) => {
  try {
    const collections = loadAllCollections();
    const postId = parsePositiveInt(req.params.id);
    const userId = parsePositiveInt(req.body.userId);

    if (!postId || !userId) {
      return res.status(400).json({ error: 'Невалиден пост или потребител.' });
    }

    const post = collections.posts.find((item) => item.id === postId);
    if (!post) {
      return res.status(404).json({ error: 'Постът не беше намерен.' });
    }

    if (post.userId !== userId) {
      return res.status(403).json({ error: 'Можеш да изтриваш само свои постове.' });
    }

    collections.posts = collections.posts.filter((item) => item.id !== postId);
    collections.comments = collections.comments.filter((comment) => comment.postId !== postId);
    collections.likes = collections.likes.filter((like) => like.postId !== postId);

    saveCollection('posts', collections.posts);
    saveCollection('comments', collections.comments);
    saveCollection('likes', collections.likes);

    return res.json({ message: 'Постът беше изтрит.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/like', (req, res) => {
  try {
    const collections = loadAllCollections();
    const userId = parsePositiveInt(req.body.userId);
    const postId = parsePositiveInt(req.body.postId);

    if (!userId || !postId) {
      return res.status(400).json({ error: 'Липсва валиден пост или потребител.' });
    }

    if (!getUserById(collections.users, userId)) {
      return res.status(404).json({ error: 'Потребителят не беше намерен.' });
    }

    const post = collections.posts.find((item) => item.id === postId);
    if (!post) {
      return res.status(404).json({ error: 'Постът не беше намерен.' });
    }

    const existingLike = collections.likes.find(
      (like) => like.userId === userId && like.postId === postId
    );

    let liked = false;

    if (existingLike) {
      collections.likes = collections.likes.filter((like) => like.id !== existingLike.id);
    } else {
      liked = true;
      collections.likes.push({
        id: nextId(collections.likes),
        userId,
        postId,
        createdAt: new Date().toISOString()
      });
    }

    saveCollection('likes', collections.likes);

    return res.json({
      liked,
      likeCount: collections.likes.filter((like) => like.postId === postId).length
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/comment', (req, res) => {
  try {
    const collections = loadAllCollections();
    const userId = parsePositiveInt(req.body.userId);
    const postId = parsePositiveInt(req.body.postId);
    const content = cleanText(req.body.content, 300);

    if (!userId || !postId) {
      return res.status(400).json({ error: 'Липсва валиден пост или потребител.' });
    }

    if (content.length < 1) {
      return res.status(400).json({ error: 'Коментарът не може да бъде празен.' });
    }

    if (!getUserById(collections.users, userId)) {
      return res.status(404).json({ error: 'Потребителят не беше намерен.' });
    }

    const post = collections.posts.find((item) => item.id === postId);
    if (!post) {
      return res.status(404).json({ error: 'Постът не беше намерен.' });
    }

    const newComment = {
      id: nextId(collections.comments),
      userId,
      postId,
      content,
      createdAt: new Date().toISOString()
    };

    collections.comments.push(newComment);
    saveCollection('comments', collections.comments);

    return res.status(201).json({
      message: 'Коментарът е добавен.',
      post: buildPostResponse(post, collections, userId)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/friends/:userId', (req, res) => {
  try {
    const collections = loadAllCollections();
    const userId = parsePositiveInt(req.params.userId);

    if (!userId) {
      return res.status(400).json({ error: 'Невалиден идентификатор на потребител.' });
    }

    if (!getUserById(collections.users, userId)) {
      return res.status(404).json({ error: 'Потребителят не беше намерен.' });
    }

    const friends = getFriendIds(collections.friends, userId)
      .map((friendId) => {
        const friendUser = sanitizeUser(getUserById(collections.users, friendId)) || fallbackUser(friendId);
        const lastMessage = sortByNewest(
          collections.messages.filter(
            (message) =>
              (message.fromUserId === userId && message.toUserId === friendId) ||
              (message.fromUserId === friendId && message.toUserId === userId)
          )
        )[0] || null;

        return {
          ...friendUser,
          lastMessage
        };
      })
      .sort((a, b) => {
        const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
        const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
        return timeB - timeA || a.username.localeCompare(b.username);
      });

    return res.json(friends);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/friends', (req, res) => {
  try {
    const collections = loadAllCollections();
    const userId = parsePositiveInt(req.body.userId);
    const friendId = parsePositiveInt(req.body.friendId);

    if (!userId || !friendId || userId === friendId) {
      return res.status(400).json({ error: 'Невалидни потребители за приятелство.' });
    }

    if (!getUserById(collections.users, userId) || !getUserById(collections.users, friendId)) {
      return res.status(404).json({ error: 'Някой от потребителите не беше намерен.' });
    }

    const existingFriendship = collections.friends.find(
      (friendship) =>
        Array.isArray(friendship.userIds) &&
        friendship.userIds.includes(userId) &&
        friendship.userIds.includes(friendId)
    );

    let action = 'added';

    if (existingFriendship) {
      action = 'removed';
      collections.friends = collections.friends.filter((friendship) => friendship.id !== existingFriendship.id);
    } else {
      collections.friends.push({
        id: nextId(collections.friends),
        userIds: [userId, friendId].sort((a, b) => a - b),
        createdAt: new Date().toISOString()
      });
    }

    saveCollection('friends', collections.friends);

    return res.json({
      action,
      message: action === 'added' ? 'Приятелят е добавен.' : 'Приятелството е премахнато.'
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/messages', (req, res) => {
  try {
    const collections = loadAllCollections();
    const userId = parsePositiveInt(req.query.userId);
    const chatWith = parsePositiveInt(req.query.chatWith);

    if (!userId) {
      return res.status(400).json({ error: 'Липсва валиден потребител.' });
    }

    if (!getUserById(collections.users, userId)) {
      return res.status(404).json({ error: 'Потребителят не беше намерен.' });
    }

    if (chatWith) {
      if (!getUserById(collections.users, chatWith)) {
        return res.status(404).json({ error: 'Събеседникът не беше намерен.' });
      }

      return res.json(buildConversation(userId, chatWith, collections));
    }

    const messages = sortByOldest(
      collections.messages.filter(
        (message) => message.fromUserId === userId || message.toUserId === userId
      )
    ).map((message) => ({
      ...message,
      fromUser: sanitizeUser(getUserById(collections.users, message.fromUserId)) || fallbackUser(message.fromUserId),
      toUser: sanitizeUser(getUserById(collections.users, message.toUserId)) || fallbackUser(message.toUserId)
    }));

    return res.json(messages);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/message', (req, res) => {
  try {
    const collections = loadAllCollections();
    const fromUserId = parsePositiveInt(req.body.fromUserId);
    const toUserId = parsePositiveInt(req.body.toUserId);
    const content = cleanText(req.body.content, 500);

    if (!fromUserId || !toUserId || fromUserId === toUserId) {
      return res.status(400).json({ error: 'Невалидни участници в разговора.' });
    }

    if (content.length < 1) {
      return res.status(400).json({ error: 'Съобщението не може да бъде празно.' });
    }

    if (!getUserById(collections.users, fromUserId) || !getUserById(collections.users, toUserId)) {
      return res.status(404).json({ error: 'Някой от потребителите не беше намерен.' });
    }

    const newMessage = {
      id: nextId(collections.messages),
      fromUserId,
      toUserId,
      content,
      createdAt: new Date().toISOString()
    };

    collections.messages.push(newMessage);
    saveCollection('messages', collections.messages);

    return res.status(201).json({
      message: 'Съобщението е изпратено.',
      conversation: buildConversation(fromUserId, toUserId, collections)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'index.html'));
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Възникна вътрешна грешка в сървъра.' });
});

app.listen(PORT, () => {
  console.log(`ShadowLive is running on http://localhost:${PORT}`);
});





