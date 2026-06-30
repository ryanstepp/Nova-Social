import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "data", "nova-db.json");

export const now = () => new Date().toISOString();
export const id = () => nanoid(12);

const media = {
  photo1: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80",
  photo2: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=80",
  photo3: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
  reel1: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  reel2: "https://media.w3.org/2010/05/sintel/trailer.mp4"
};

export async function seedData() {
  const passwordHash = await bcrypt.hash("password123", 10);
  const users = [
    {
      id: "u_admin",
      email: "admin@nova.test",
      username: "nova_admin",
      displayName: "Nova Admin",
      passwordHash,
      avatar: "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=300&q=80",
      bio: "Keeping Nova bright.",
      website: "https://nova.local",
      isPrivate: false,
      verified: true,
      role: "admin",
      banned: false,
      blockedUserIds: [],
      notificationSettings: { likes: true, comments: true, follows: true, mentions: true },
      createdAt: now()
    },
    {
      id: "u_maya",
      email: "maya@nova.test",
      username: "maya.studio",
      displayName: "Maya Chen",
      passwordHash,
      avatar: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=300&q=80",
      bio: "Photo walks, tiny films, city color.",
      website: "https://maya.example",
      isPrivate: false,
      verified: true,
      role: "user",
      banned: false,
      blockedUserIds: [],
      notificationSettings: { likes: true, comments: true, follows: true, mentions: true },
      createdAt: now()
    },
    {
      id: "u_leo",
      email: "leo@nova.test",
      username: "leo.moves",
      displayName: "Leo Park",
      passwordHash,
      avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80",
      bio: "Reels, rhythm, and coffee.",
      website: "",
      isPrivate: false,
      verified: false,
      role: "user",
      banned: false,
      blockedUserIds: [],
      notificationSettings: { likes: true, comments: true, follows: true, mentions: true },
      createdAt: now()
    },
    {
      id: "u_nia",
      email: "nia@nova.test",
      username: "nia.design",
      displayName: "Nia Rivera",
      passwordHash,
      avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&q=80",
      bio: "Design notes and studio days.",
      website: "",
      isPrivate: true,
      verified: false,
      role: "user",
      banned: false,
      blockedUserIds: [],
      notificationSettings: { likes: true, comments: true, follows: true, mentions: true },
      createdAt: now()
    }
  ];

  const posts = [
    {
      id: "p_city",
      authorId: "u_maya",
      type: "carousel",
      media: [
        { type: "image", url: media.photo1 },
        { type: "image", url: media.photo2 }
      ],
      caption: "Golden hour in motion. #citylight with @leo.moves",
      hashtags: ["citylight"],
      mentions: ["leo.moves"],
      taggedUserIds: ["u_leo"],
      location: "Brooklyn, NY",
      commentPolicy: "everyone",
      createdAt: now(),
      updatedAt: now()
    },
    {
      id: "p_trail",
      authorId: "u_leo",
      type: "image",
      media: [{ type: "image", url: media.photo3 }],
      caption: "Reset day outside. #weekend",
      hashtags: ["weekend"],
      mentions: [],
      taggedUserIds: [],
      location: "Hudson Valley",
      commentPolicy: "everyone",
      createdAt: now(),
      updatedAt: now()
    }
  ];

  const reels = [
    {
      id: "r_maya",
      authorId: "u_maya",
      videoUrl: media.reel1,
      caption: "A soft loop for the feed. #slowmotion",
      hashtags: ["slowmotion"],
      audioTitle: "Nova Original Audio",
      createdAt: now()
    },
    {
      id: "r_leo",
      authorId: "u_leo",
      videoUrl: media.reel2,
      caption: "Tiny trailer energy. #reels",
      hashtags: ["reels"],
      audioTitle: "Creator Mix",
      createdAt: now()
    }
  ];

  const stories = [
    {
      id: "s_maya",
      authorId: "u_maya",
      media: { type: "image", url: media.photo2 },
      views: ["u_leo"],
      createdAt: now(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }
  ];

  return {
    users,
    posts,
    reels,
    stories,
    comments: [
      { id: "c1", targetType: "post", targetId: "p_city", authorId: "u_leo", body: "This set is unreal.", parentId: null, likedBy: [], createdAt: now() }
    ],
    likes: [
      { id: id(), targetType: "post", targetId: "p_city", userId: "u_leo", createdAt: now() },
      { id: id(), targetType: "reel", targetId: "r_maya", userId: "u_leo", createdAt: now() }
    ],
    saves: [{ id: id(), targetType: "post", targetId: "p_city", userId: "u_leo", createdAt: now() }],
    follows: [
      { id: id(), followerId: "u_leo", followingId: "u_maya", status: "accepted", createdAt: now() },
      { id: id(), followerId: "u_maya", followingId: "u_leo", status: "accepted", createdAt: now() }
    ],
    followRequests: [{ id: id(), followerId: "u_leo", followingId: "u_nia", status: "pending", createdAt: now() }],
    conversations: [
      { id: "dm1", participantIds: ["u_maya", "u_leo"], updatedAt: now() }
    ],
    messages: [
      { id: "m1", conversationId: "dm1", senderId: "u_maya", body: "Sending selects tonight.", attachment: null, readBy: ["u_maya"], createdAt: now() }
    ],
    notifications: [
      { id: id(), userId: "u_maya", actorId: "u_leo", type: "like", body: "liked your post", read: false, createdAt: now() }
    ],
    verificationRequests: [
      { id: "v1", userId: "u_leo", fullName: "Leo Park", category: "Creator", reason: "Public dance educator.", links: "https://example.com/leo", status: "pending", createdAt: now(), reviewedAt: null }
    ],
    reports: [
      { id: "rep1", reporterId: "u_leo", targetType: "post", targetId: "p_city", reason: "Testing the moderation queue", status: "open", createdAt: now() }
    ]
  };
}

export async function readDb() {
  try {
    const raw = await fs.readFile(dbPath, "utf8");
    return JSON.parse(raw);
  } catch {
    const data = await seedData();
    await writeDb(data);
    return data;
  }
}

export async function writeDb(data) {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2));
}

export function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

export function enrichTarget(db, item, viewerId) {
  const author = publicUser(db.users.find((u) => u.id === item.authorId));
  const targetType = item.videoUrl ? "reel" : "post";
  const targetId = item.id;
  return {
    ...item,
    author,
    liked: db.likes.some((like) => like.targetType === targetType && like.targetId === targetId && like.userId === viewerId),
    saved: db.saves.some((save) => save.targetType === targetType && save.targetId === targetId && save.userId === viewerId),
    likeCount: db.likes.filter((like) => like.targetType === targetType && like.targetId === targetId).length,
    commentCount: db.comments.filter((comment) => comment.targetType === targetType && comment.targetId === targetId).length
  };
}
