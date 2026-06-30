import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { enrichTarget, id, now, publicUser, readDb, writeDb } from "./db.js";

const app = express();
const PORT = process.env.PORT || 4200;
const JWT_SECRET = process.env.JWT_SECRET || "nova-dev-secret";
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: "15mb" }));

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const signToken = (user) => jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
const cleanText = (value, max = 500) => String(value || "").trim().slice(0, max);

function parseTags(caption) {
  const hashtags = [...caption.matchAll(/#([\w.]+)/g)].map((match) => match[1].toLowerCase());
  const mentions = [...caption.matchAll(/@([\w.]+)/g)].map((match) => match[1].toLowerCase());
  return { hashtags: [...new Set(hashtags)], mentions: [...new Set(mentions)] };
}

async function loadUser(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Authentication required." });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const db = await readDb();
    const user = db.users.find((candidate) => candidate.id === payload.sub);
    if (!user || user.banned) return res.status(401).json({ message: "Account unavailable." });
    req.db = db;
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Invalid session." });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin access required." });
  next();
}

function notify(db, userId, actorId, type, body) {
  if (userId === actorId) return;
  db.notifications.unshift({ id: id(), userId, actorId, type, body, read: false, createdAt: now() });
}

function profileStats(db, userId) {
  return {
    followers: db.follows.filter((follow) => follow.followingId === userId && follow.status === "accepted").length,
    following: db.follows.filter((follow) => follow.followerId === userId && follow.status === "accepted").length,
    posts: db.posts.filter((post) => post.authorId === userId).length,
    reels: db.reels.filter((reel) => reel.authorId === userId).length
  };
}

function canViewProfile(db, viewerId, profile) {
  if (!profile.isPrivate || profile.id === viewerId) return true;
  return db.follows.some((follow) => follow.followerId === viewerId && follow.followingId === profile.id && follow.status === "accepted");
}

app.get("/api/health", (req, res) => res.json({ ok: true, name: "Nova Social API" }));

app.post("/api/auth/signup", asyncRoute(async (req, res) => {
  const db = await readDb();
  const email = cleanText(req.body.email, 120).toLowerCase();
  const username = cleanText(req.body.username, 32).toLowerCase();
  const displayName = cleanText(req.body.displayName, 80) || username;
  const password = String(req.body.password || "");

  if (!email || !username || password.length < 8) return res.status(400).json({ message: "Email, username, and an 8+ character password are required." });
  if (db.users.some((user) => user.email === email || user.username === username)) return res.status(409).json({ message: "Email or username already exists." });

  const user = {
    id: id(),
    email,
    username,
    displayName,
    passwordHash: await bcrypt.hash(password, 10),
    avatar: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(displayName)}`,
    bio: "",
    website: "",
    isPrivate: false,
    verified: false,
    role: "user",
    banned: false,
    blockedUserIds: [],
    notificationSettings: { likes: true, comments: true, follows: true, mentions: true },
    createdAt: now()
  };
  db.users.push(user);
  await writeDb(db);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const db = await readDb();
  const login = cleanText(req.body.login, 120).toLowerCase();
  const user = db.users.find((candidate) => candidate.email === login || candidate.username === login);
  if (!user || user.banned || !(await bcrypt.compare(String(req.body.password || ""), user.passwordHash))) {
    return res.status(401).json({ message: "Invalid credentials." });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
}));

app.post("/api/auth/password-reset", asyncRoute(async (req, res) => {
  res.json({ message: `Password reset link queued for ${cleanText(req.body.email, 120)}.` });
}));

app.get("/api/me", loadUser, (req, res) => res.json({ user: publicUser(req.user), stats: profileStats(req.db, req.user.id) }));

app.patch("/api/me", loadUser, asyncRoute(async (req, res) => {
  const db = req.db;
  const user = db.users.find((candidate) => candidate.id === req.user.id);
  const nextUsername = req.body.username ? cleanText(req.body.username, 32).toLowerCase() : user.username;
  if (nextUsername !== user.username && db.users.some((candidate) => candidate.username === nextUsername)) {
    return res.status(409).json({ message: "Username is already taken." });
  }
  Object.assign(user, {
    username: nextUsername,
    displayName: req.body.displayName !== undefined ? cleanText(req.body.displayName, 80) : user.displayName,
    bio: req.body.bio !== undefined ? cleanText(req.body.bio, 220) : user.bio,
    website: req.body.website !== undefined ? cleanText(req.body.website, 120) : user.website,
    avatar: req.body.avatar !== undefined ? cleanText(req.body.avatar, 1000) : user.avatar,
    isPrivate: req.body.isPrivate !== undefined ? Boolean(req.body.isPrivate) : user.isPrivate,
    notificationSettings: req.body.notificationSettings || user.notificationSettings
  });
  if (req.body.password) user.passwordHash = await bcrypt.hash(String(req.body.password), 10);
  await writeDb(db);
  res.json({ user: publicUser(user), stats: profileStats(db, user.id) });
}));

app.post("/api/me/block/:userId", loadUser, asyncRoute(async (req, res) => {
  const db = req.db;
  const user = db.users.find((candidate) => candidate.id === req.user.id);
  if (!user.blockedUserIds.includes(req.params.userId)) user.blockedUserIds.push(req.params.userId);
  await writeDb(db);
  res.json({ user: publicUser(user) });
}));

app.get("/api/users/suggested", loadUser, (req, res) => {
  const followed = new Set(req.db.follows.filter((follow) => follow.followerId === req.user.id).map((follow) => follow.followingId));
  res.json(req.db.users.filter((user) => user.id !== req.user.id && !followed.has(user.id) && !user.banned).slice(0, 6).map((user) => ({ ...publicUser(user), stats: profileStats(req.db, user.id) })));
});

app.get("/api/users/:username", loadUser, (req, res) => {
  const profile = req.db.users.find((user) => user.username === req.params.username);
  if (!profile) return res.status(404).json({ message: "Profile not found." });
  const visible = canViewProfile(req.db, req.user.id, profile);
  const posts = visible ? req.db.posts.filter((post) => post.authorId === profile.id).map((post) => enrichTarget(req.db, post, req.user.id)) : [];
  const reels = visible ? req.db.reels.filter((reel) => reel.authorId === profile.id).map((reel) => enrichTarget(req.db, reel, req.user.id)) : [];
  const saved = profile.id === req.user.id ? req.db.saves.filter((save) => save.userId === req.user.id).map((save) => enrichTarget(req.db, req.db.posts.find((post) => post.id === save.targetId) || req.db.reels.find((reel) => reel.id === save.targetId), req.user.id)).filter(Boolean) : [];
  res.json({
    user: publicUser(profile),
    stats: profileStats(req.db, profile.id),
    visible,
    following: req.db.follows.some((follow) => follow.followerId === req.user.id && follow.followingId === profile.id && follow.status === "accepted"),
    requested: req.db.followRequests.some((follow) => follow.followerId === req.user.id && follow.followingId === profile.id && follow.status === "pending"),
    posts,
    reels,
    saved
  });
});

app.get("/api/feed", loadUser, (req, res) => {
  const followed = new Set(req.db.follows.filter((follow) => follow.followerId === req.user.id && follow.status === "accepted").map((follow) => follow.followingId));
  followed.add(req.user.id);
  const followedPosts = req.db.posts.filter((post) => followed.has(post.authorId));
  const suggested = req.db.posts.filter((post) => !followed.has(post.authorId));
  res.json([...followedPosts, ...suggested].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((post) => enrichTarget(req.db, post, req.user.id)));
});

app.post("/api/posts", loadUser, asyncRoute(async (req, res) => {
  const db = req.db;
  const caption = cleanText(req.body.caption, 2200);
  const tags = parseTags(caption);
  const media = Array.isArray(req.body.media) ? req.body.media.filter((item) => item?.url).slice(0, 10) : [];
  if (!media.length) return res.status(400).json({ message: "At least one image or video URL is required." });
  const post = {
    id: id(),
    authorId: req.user.id,
    type: media.length > 1 ? "carousel" : media[0].type || "image",
    media,
    caption,
    ...tags,
    taggedUserIds: req.body.taggedUserIds || [],
    location: cleanText(req.body.location, 120),
    commentPolicy: req.body.commentPolicy || "everyone",
    createdAt: now(),
    updatedAt: now()
  };
  db.posts.unshift(post);
  tags.mentions.forEach((username) => {
    const mentioned = db.users.find((user) => user.username === username);
    if (mentioned) notify(db, mentioned.id, req.user.id, "mention", "mentioned you in a post");
  });
  await writeDb(db);
  res.status(201).json(enrichTarget(db, post, req.user.id));
}));

app.patch("/api/posts/:id", loadUser, asyncRoute(async (req, res) => {
  const post = req.db.posts.find((candidate) => candidate.id === req.params.id);
  if (!post) return res.status(404).json({ message: "Post not found." });
  if (post.authorId !== req.user.id && req.user.role !== "admin") return res.status(403).json({ message: "Not allowed." });
  post.caption = cleanText(req.body.caption, 2200);
  Object.assign(post, parseTags(post.caption), { updatedAt: now() });
  await writeDb(req.db);
  res.json(enrichTarget(req.db, post, req.user.id));
}));

app.delete("/api/posts/:id", loadUser, asyncRoute(async (req, res) => {
  const post = req.db.posts.find((candidate) => candidate.id === req.params.id);
  if (!post) return res.status(404).json({ message: "Post not found." });
  if (post.authorId !== req.user.id && req.user.role !== "admin") return res.status(403).json({ message: "Not allowed." });
  req.db.posts = req.db.posts.filter((candidate) => candidate.id !== post.id);
  req.db.comments = req.db.comments.filter((comment) => comment.targetId !== post.id);
  await writeDb(req.db);
  res.json({ ok: true });
}));

app.get("/api/reels", loadUser, (req, res) => {
  res.json(req.db.reels.map((reel) => enrichTarget(req.db, reel, req.user.id)));
});

app.post("/api/reels", loadUser, asyncRoute(async (req, res) => {
  const caption = cleanText(req.body.caption, 2200);
  const reel = {
    id: id(),
    authorId: req.user.id,
    videoUrl: cleanText(req.body.videoUrl, 1000),
    caption,
    ...parseTags(caption),
    audioTitle: cleanText(req.body.audioTitle, 80) || "Original Audio",
    createdAt: now()
  };
  if (!reel.videoUrl) return res.status(400).json({ message: "Video URL is required." });
  req.db.reels.unshift(reel);
  await writeDb(req.db);
  res.status(201).json(enrichTarget(req.db, reel, req.user.id));
}));

app.get("/api/stories", loadUser, (req, res) => {
  const active = req.db.stories.filter((story) => new Date(story.expiresAt) > new Date());
  res.json(active.map((story) => ({ ...story, author: publicUser(req.db.users.find((user) => user.id === story.authorId)), viewCount: story.views.length })));
});

app.post("/api/stories", loadUser, asyncRoute(async (req, res) => {
  const story = {
    id: id(),
    authorId: req.user.id,
    media: req.body.media,
    views: [],
    createdAt: now(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  };
  req.db.stories.unshift(story);
  await writeDb(req.db);
  res.status(201).json(story);
}));

app.post("/api/stories/:id/view", loadUser, asyncRoute(async (req, res) => {
  const story = req.db.stories.find((candidate) => candidate.id === req.params.id);
  if (!story) return res.status(404).json({ message: "Story not found." });
  if (!story.views.includes(req.user.id)) story.views.push(req.user.id);
  await writeDb(req.db);
  res.json(story);
}));

app.delete("/api/stories/:id", loadUser, asyncRoute(async (req, res) => {
  const story = req.db.stories.find((candidate) => candidate.id === req.params.id);
  if (!story || (story.authorId !== req.user.id && req.user.role !== "admin")) return res.status(403).json({ message: "Not allowed." });
  req.db.stories = req.db.stories.filter((candidate) => candidate.id !== story.id);
  await writeDb(req.db);
  res.json({ ok: true });
}));

app.post("/api/:targetType/:targetId/like", loadUser, asyncRoute(async (req, res) => {
  const { targetType, targetId } = req.params;
  const existing = req.db.likes.find((like) => like.targetType === targetType && like.targetId === targetId && like.userId === req.user.id);
  if (existing) {
    req.db.likes = req.db.likes.filter((like) => like.id !== existing.id);
  } else {
    req.db.likes.push({ id: id(), targetType, targetId, userId: req.user.id, createdAt: now() });
    const target = targetType === "post" ? req.db.posts.find((post) => post.id === targetId) : req.db.reels.find((reel) => reel.id === targetId);
    if (target) notify(req.db, target.authorId, req.user.id, "like", `liked your ${targetType}`);
  }
  await writeDb(req.db);
  res.json({ liked: !existing });
}));

app.post("/api/:targetType/:targetId/save", loadUser, asyncRoute(async (req, res) => {
  const { targetType, targetId } = req.params;
  const existing = req.db.saves.find((save) => save.targetType === targetType && save.targetId === targetId && save.userId === req.user.id);
  req.db.saves = existing ? req.db.saves.filter((save) => save.id !== existing.id) : [...req.db.saves, { id: id(), targetType, targetId, userId: req.user.id, createdAt: now() }];
  await writeDb(req.db);
  res.json({ saved: !existing });
}));

app.get("/api/:targetType/:targetId/comments", loadUser, (req, res) => {
  const comments = req.db.comments.filter((comment) => comment.targetType === req.params.targetType && comment.targetId === req.params.targetId);
  res.json(comments.map((comment) => ({ ...comment, author: publicUser(req.db.users.find((user) => user.id === comment.authorId)), likeCount: comment.likedBy.length })));
});

app.post("/api/:targetType/:targetId/comments", loadUser, asyncRoute(async (req, res) => {
  const comment = {
    id: id(),
    targetType: req.params.targetType,
    targetId: req.params.targetId,
    authorId: req.user.id,
    body: cleanText(req.body.body, 500),
    parentId: req.body.parentId || null,
    likedBy: [],
    createdAt: now()
  };
  if (!comment.body) return res.status(400).json({ message: "Comment is required." });
  req.db.comments.push(comment);
  const target = comment.targetType === "post" ? req.db.posts.find((post) => post.id === comment.targetId) : req.db.reels.find((reel) => reel.id === comment.targetId);
  if (target) notify(req.db, target.authorId, req.user.id, "comment", `commented on your ${comment.targetType}`);
  await writeDb(req.db);
  res.status(201).json({ ...comment, author: publicUser(req.user), likeCount: 0 });
}));

app.delete("/api/comments/:id", loadUser, asyncRoute(async (req, res) => {
  const comment = req.db.comments.find((candidate) => candidate.id === req.params.id);
  if (!comment || (comment.authorId !== req.user.id && req.user.role !== "admin")) return res.status(403).json({ message: "Not allowed." });
  req.db.comments = req.db.comments.filter((candidate) => candidate.id !== comment.id && candidate.parentId !== comment.id);
  await writeDb(req.db);
  res.json({ ok: true });
}));

app.post("/api/comments/:id/like", loadUser, asyncRoute(async (req, res) => {
  const comment = req.db.comments.find((candidate) => candidate.id === req.params.id);
  if (!comment) return res.status(404).json({ message: "Comment not found." });
  comment.likedBy = comment.likedBy.includes(req.user.id) ? comment.likedBy.filter((userId) => userId !== req.user.id) : [...comment.likedBy, req.user.id];
  await writeDb(req.db);
  res.json({ liked: comment.likedBy.includes(req.user.id), likeCount: comment.likedBy.length });
}));

app.post("/api/users/:userId/follow", loadUser, asyncRoute(async (req, res) => {
  const target = req.db.users.find((user) => user.id === req.params.userId);
  if (!target || target.id === req.user.id) return res.status(404).json({ message: "User not found." });
  const existing = req.db.follows.find((follow) => follow.followerId === req.user.id && follow.followingId === target.id);
  if (existing) {
    req.db.follows = req.db.follows.filter((follow) => follow.id !== existing.id);
    await writeDb(req.db);
    return res.json({ following: false, requested: false });
  }
  if (target.isPrivate) {
    req.db.followRequests.push({ id: id(), followerId: req.user.id, followingId: target.id, status: "pending", createdAt: now() });
    notify(req.db, target.id, req.user.id, "follow_request", "requested to follow you");
    await writeDb(req.db);
    return res.json({ following: false, requested: true });
  }
  req.db.follows.push({ id: id(), followerId: req.user.id, followingId: target.id, status: "accepted", createdAt: now() });
  notify(req.db, target.id, req.user.id, "follow", "started following you");
  await writeDb(req.db);
  res.json({ following: true, requested: false });
}));

app.post("/api/follow-requests/:id/:action", loadUser, asyncRoute(async (req, res) => {
  const request = req.db.followRequests.find((candidate) => candidate.id === req.params.id && candidate.followingId === req.user.id);
  if (!request) return res.status(404).json({ message: "Request not found." });
  request.status = req.params.action === "accept" ? "accepted" : "declined";
  if (request.status === "accepted") req.db.follows.push({ id: id(), followerId: request.followerId, followingId: request.followingId, status: "accepted", createdAt: now() });
  await writeDb(req.db);
  res.json(request);
}));

app.get("/api/messages", loadUser, (req, res) => {
  const conversations = req.db.conversations.filter((conversation) => conversation.participantIds.includes(req.user.id));
  res.json(conversations.map((conversation) => ({
    ...conversation,
    participants: conversation.participantIds.map((userId) => publicUser(req.db.users.find((user) => user.id === userId))),
    lastMessage: req.db.messages.filter((message) => message.conversationId === conversation.id).at(-1)
  })));
});

app.post("/api/messages/start/:userId", loadUser, asyncRoute(async (req, res) => {
  let conversation = req.db.conversations.find((candidate) => candidate.participantIds.includes(req.user.id) && candidate.participantIds.includes(req.params.userId));
  if (!conversation) {
    conversation = { id: id(), participantIds: [req.user.id, req.params.userId], updatedAt: now() };
    req.db.conversations.push(conversation);
    await writeDb(req.db);
  }
  res.json(conversation);
}));

app.get("/api/messages/:conversationId", loadUser, (req, res) => {
  const conversation = req.db.conversations.find((candidate) => candidate.id === req.params.conversationId && candidate.participantIds.includes(req.user.id));
  if (!conversation) return res.status(404).json({ message: "Conversation not found." });
  res.json(req.db.messages.filter((message) => message.conversationId === conversation.id).map((message) => ({ ...message, sender: publicUser(req.db.users.find((user) => user.id === message.senderId)) })));
});

app.post("/api/messages/:conversationId", loadUser, asyncRoute(async (req, res) => {
  const conversation = req.db.conversations.find((candidate) => candidate.id === req.params.conversationId && candidate.participantIds.includes(req.user.id));
  if (!conversation) return res.status(404).json({ message: "Conversation not found." });
  const message = { id: id(), conversationId: conversation.id, senderId: req.user.id, body: cleanText(req.body.body, 1000), attachment: req.body.attachment || null, readBy: [req.user.id], createdAt: now() };
  if (!message.body && !message.attachment) return res.status(400).json({ message: "Message or attachment required." });
  req.db.messages.push(message);
  conversation.updatedAt = now();
  await writeDb(req.db);
  res.status(201).json(message);
}));

app.get("/api/search", loadUser, (req, res) => {
  const q = cleanText(req.query.q, 80).toLowerCase();
  const users = req.db.users.filter((user) => [user.username, user.displayName, user.bio].join(" ").toLowerCase().includes(q)).map(publicUser);
  const posts = req.db.posts.filter((post) => [post.caption, post.location, post.hashtags.join(" ")].join(" ").toLowerCase().includes(q)).map((post) => enrichTarget(req.db, post, req.user.id));
  const reels = req.db.reels.filter((reel) => [reel.caption, reel.hashtags.join(" ")].join(" ").toLowerCase().includes(q)).map((reel) => enrichTarget(req.db, reel, req.user.id));
  const hashtags = [...new Set([...req.db.posts, ...req.db.reels].flatMap((item) => item.hashtags))].filter((tag) => tag.includes(q.replace("#", "")));
  res.json({ users, posts, reels, hashtags });
});

app.get("/api/hashtags/:tag", loadUser, (req, res) => {
  const tag = req.params.tag.toLowerCase();
  res.json({
    posts: req.db.posts.filter((post) => post.hashtags.includes(tag)).map((post) => enrichTarget(req.db, post, req.user.id)),
    reels: req.db.reels.filter((reel) => reel.hashtags.includes(tag)).map((reel) => enrichTarget(req.db, reel, req.user.id))
  });
});

app.get("/api/notifications", loadUser, (req, res) => {
  res.json(req.db.notifications.filter((item) => item.userId === req.user.id).map((item) => ({ ...item, actor: publicUser(req.db.users.find((user) => user.id === item.actorId)) })));
});

app.post("/api/notifications/read", loadUser, asyncRoute(async (req, res) => {
  req.db.notifications.forEach((item) => {
    if (item.userId === req.user.id) item.read = true;
  });
  await writeDb(req.db);
  res.json({ ok: true });
}));

app.post("/api/verification", loadUser, asyncRoute(async (req, res) => {
  const request = {
    id: id(),
    userId: req.user.id,
    fullName: cleanText(req.body.fullName, 120),
    category: cleanText(req.body.category, 80),
    reason: cleanText(req.body.reason, 1000),
    links: cleanText(req.body.links, 1000),
    status: "pending",
    createdAt: now(),
    reviewedAt: null
  };
  req.db.verificationRequests.unshift(request);
  await writeDb(req.db);
  res.status(201).json(request);
}));

app.post("/api/reports", loadUser, asyncRoute(async (req, res) => {
  const report = {
    id: id(),
    reporterId: req.user.id,
    targetType: cleanText(req.body.targetType, 40),
    targetId: cleanText(req.body.targetId, 80),
    reason: cleanText(req.body.reason, 1000),
    status: "open",
    createdAt: now()
  };
  req.db.reports.unshift(report);
  await writeDb(req.db);
  res.status(201).json(report);
}));

app.get("/api/admin/stats", loadUser, requireAdmin, (req, res) => {
  res.json({
    totalUsers: req.db.users.length,
    totalPosts: req.db.posts.length,
    totalReels: req.db.reels.length,
    totalReports: req.db.reports.length,
    pendingVerificationRequests: req.db.verificationRequests.filter((request) => request.status === "pending").length
  });
});

app.get("/api/admin", loadUser, requireAdmin, (req, res) => {
  res.json({
    users: req.db.users.map((user) => ({ ...publicUser(user), stats: profileStats(req.db, user.id) })),
    posts: req.db.posts.map((post) => enrichTarget(req.db, post, req.user.id)),
    reports: req.db.reports,
    verificationRequests: req.db.verificationRequests.map((request) => ({ ...request, user: publicUser(req.db.users.find((user) => user.id === request.userId)) }))
  });
});

app.post("/api/admin/users/:userId/:action", loadUser, requireAdmin, asyncRoute(async (req, res) => {
  const user = req.db.users.find((candidate) => candidate.id === req.params.userId);
  if (!user) return res.status(404).json({ message: "User not found." });
  if (req.params.action === "ban") user.banned = true;
  if (req.params.action === "unban") user.banned = false;
  if (req.params.action === "make-admin") user.role = "admin";
  if (req.params.action === "remove-admin") user.role = "user";
  if (req.params.action === "verify") user.verified = true;
  if (req.params.action === "unverify") user.verified = false;
  await writeDb(req.db);
  res.json(publicUser(user));
}));

app.post("/api/admin/verification/:id/:action", loadUser, requireAdmin, asyncRoute(async (req, res) => {
  const request = req.db.verificationRequests.find((candidate) => candidate.id === req.params.id);
  if (!request) return res.status(404).json({ message: "Request not found." });
  request.status = req.params.action === "approve" ? "approved" : "denied";
  request.reviewedAt = now();
  const user = req.db.users.find((candidate) => candidate.id === request.userId);
  if (user) user.verified = request.status === "approved";
  notify(req.db, request.userId, req.user.id, "verification", `verification ${request.status}`);
  await writeDb(req.db);
  res.json(request);
}));

app.post("/api/admin/reports/:id/:action", loadUser, requireAdmin, asyncRoute(async (req, res) => {
  const report = req.db.reports.find((candidate) => candidate.id === req.params.id);
  if (!report) return res.status(404).json({ message: "Report not found." });
  report.status = req.params.action === "dismiss" ? "dismissed" : "action_taken";
  await writeDb(req.db);
  res.json(report);
}));

app.use(express.static(publicDir));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Nova Social hit a server error." });
});

app.listen(PORT, () => {
  console.log(`Nova Social API running on http://localhost:${PORT}/api`);
});
