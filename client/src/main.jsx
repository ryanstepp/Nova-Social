import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { Bell, Bookmark, Camera, CheckCircle2, Compass, Film, Heart, Home, LogOut, MessageCircle, MoreHorizontal, PlusSquare, Search, Send, Settings, Shield, UserRound, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import "./styles.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:4200/api";

function useApi() {
  const [token, setToken] = useState(localStorage.getItem("nova_token") || "");
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  const request = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Request failed");
    return data;
  };

  const refreshMe = async () => {
    if (!token) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      const data = await request("/me");
      setMe(data.user);
    } catch {
      localStorage.removeItem("nova_token");
      setToken("");
      setMe(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshMe();
  }, [token]);

  const login = async (body, mode) => {
    const data = await request(mode === "signup" ? "/auth/signup" : "/auth/login", { method: "POST", body: JSON.stringify(body) });
    localStorage.setItem("nova_token", data.token);
    setToken(data.token);
    setMe(data.user);
  };

  const logout = () => {
    localStorage.removeItem("nova_token");
    setToken("");
    setMe(null);
  };

  return { token, me, setMe, loading, request, login, logout, refreshMe };
}

const ApiContext = React.createContext(null);
const useNova = () => React.useContext(ApiContext);

function Verified({ user }) {
  return user?.verified ? <CheckCircle2 className="verified" size={16} aria-label="Verified" /> : null;
}

function Avatar({ user, size = 42 }) {
  return <img className="avatar" src={user?.avatar} style={{ width: size, height: size }} alt={user?.displayName || "User"} />;
}

function Shell({ children }) {
  const { me, logout } = useNova();
  const nav = [
    ["/", Home, "Home"],
    ["/explore", Compass, "Explore"],
    ["/reels", Film, "Reels"],
    ["/create", PlusSquare, "Create"],
    ["/messages", Send, "Messages"],
    ["/notifications", Bell, "Alerts"],
    [`/profile/${me?.username}`, UserRound, "Profile"],
    ["/settings", Settings, "Settings"]
  ];
  if (me?.role === "admin") nav.push(["/admin", Shield, "Admin"]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="brand"><span>Nova</span> Social</Link>
        <nav>
          {nav.map(([to, Icon, label]) => <NavLink key={to} to={to} end={to === "/"}><Icon size={21} /> {label}</NavLink>)}
        </nav>
        <button className="ghost nav-logout" onClick={logout}><LogOut size={18} /> Log out</button>
      </aside>
      <main>{children}</main>
      <nav className="bottom-nav">
        {nav.slice(0, 6).map(([to, Icon, label]) => <NavLink key={to} to={to} end={to === "/"} aria-label={label}><Icon size={23} /></NavLink>)}
      </nav>
    </div>
  );
}

function Auth() {
  const { login } = useNova();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ login: "maya@nova.test", email: "", username: "", displayName: "", password: "password123" });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      await login(mode === "signup" ? form : { login: form.login, password: form.password }, mode);
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-visual">
        <div>
          <p>Creator-first photo, video, stories, and community.</p>
          <h1>Nova Social</h1>
        </div>
      </section>
      <form className="auth-card" onSubmit={submit}>
        <h2>{mode === "signup" ? "Create your account" : "Welcome back"}</h2>
        {mode === "signup" ? (
          <>
            <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <input placeholder="Display name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </>
        ) : <input placeholder="Email or username" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />}
        <input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {error && <p className="error">{error}</p>}
        <button>{mode === "signup" ? "Sign up" : "Log in"}</button>
        <button type="button" className="ghost" onClick={() => setMode(mode === "signup" ? "login" : "signup")}>
          {mode === "signup" ? "I already have an account" : "Create a new account"}
        </button>
        <p className="muted">Try `maya@nova.test`, `leo@nova.test`, or admin `admin@nova.test` with `password123`.</p>
      </form>
    </div>
  );
}

function Stories() {
  const { request } = useNova();
  const [stories, setStories] = useState([]);
  useEffect(() => { request("/stories").then(setStories).catch(() => {}); }, []);
  return <div className="stories">{stories.map((story) => <button key={story.id} className="story"><Avatar user={story.author} size={58} /><span>{story.author.username}</span></button>)}</div>;
}

function ActionBar({ item, type, onChange }) {
  const { request } = useNova();
  const toggle = async (action) => {
    await request(`/${type}/${item.id}/${action}`, { method: "POST" });
    onChange?.();
  };
  return (
    <div className="actions">
      <button onClick={() => toggle("like")} className={item.liked ? "active" : ""}><Heart size={21} /> {item.likeCount}</button>
      <Link to={`/comments/${type}/${item.id}`}><MessageCircle size={21} /> {item.commentCount}</Link>
      <button onClick={() => navigator.clipboard?.writeText(location.origin + `/${type}/${item.id}`)}><Send size={21} /></button>
      <button onClick={() => toggle("save")} className={item.saved ? "active" : ""}><Bookmark size={21} /></button>
    </div>
  );
}

function RichText({ text = "" }) {
  const parts = text.split(/([#@][\w.]+)/g);
  return parts.map((part, index) => part.startsWith("#") ? <Link key={index} to={`/hashtag/${part.slice(1)}`}>{part}</Link> : part.startsWith("@") ? <Link key={index} to={`/profile/${part.slice(1)}`}>{part}</Link> : part);
}

function PostCard({ post, reload }) {
  const { request, me } = useNova();
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const media = post.media?.[0];
  const remove = async () => {
    await request(`/posts/${post.id}`, { method: "DELETE" });
    reload();
  };
  return (
    <article className="post">
      <header>
        <Link to={`/profile/${post.author.username}`}><Avatar user={post.author} /><strong>{post.author.displayName}</strong><Verified user={post.author} /><span>@{post.author.username}</span></Link>
        <button className="icon" onClick={() => setMenu(!menu)}><MoreHorizontal /></button>
      </header>
      {menu && <div className="menu">{post.authorId === me.id && <button onClick={remove}>Delete post</button>}<button onClick={() => setReporting(true)}>Report</button></div>}
      <div className="media-frame">{media?.type === "video" ? <video src={media.url} controls /> : <img src={media?.url} alt={post.caption} />}</div>
      <ActionBar item={post} type="post" onChange={reload} />
      <p><strong>{post.author.username}</strong> <RichText text={post.caption} /></p>
      <p className="muted">{post.location} · {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}</p>
      {reporting && <ReportModal targetType="post" targetId={post.id} onClose={() => setReporting(false)} />}
    </article>
  );
}

function HomePage() {
  const { request } = useNova();
  const [feed, setFeed] = useState([]);
  const [suggested, setSuggested] = useState([]);
  const load = () => {
    request("/feed").then(setFeed);
    request("/users/suggested").then(setSuggested);
  };
  useEffect(load, []);
  return (
    <Shell>
      <div className="page-grid">
        <section className="feed-column">
          <Stories />
          {feed.map((post) => <PostCard key={post.id} post={post} reload={load} />)}
        </section>
        <aside className="right-rail">
          <h3>Suggested creators</h3>
          {suggested.map((user) => <UserRow key={user.id} user={user} />)}
        </aside>
      </div>
    </Shell>
  );
}

function UserRow({ user }) {
  return <Link className="user-row" to={`/profile/${user.username}`}><Avatar user={user} /><span><strong>{user.displayName}</strong><small>@{user.username}</small></span><Verified user={user} /></Link>;
}

function ExplorePage() {
  const { request } = useNova();
  const [q, setQ] = useState("");
  const [data, setData] = useState({ users: [], posts: [], reels: [], hashtags: [] });
  useEffect(() => { request(`/search?q=${encodeURIComponent(q)}`).then(setData); }, [q]);
  return (
    <Shell>
      <section className="section">
        <div className="searchbar"><Search size={20} /><input placeholder="Search users, posts, reels, hashtags" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="chips">{data.hashtags.map((tag) => <Link key={tag} to={`/hashtag/${tag}`}>#{tag}</Link>)}</div>
        <div className="people">{data.users.map((user) => <UserRow key={user.id} user={user} />)}</div>
        <div className="explore-grid">{[...data.posts, ...data.reels].map((item) => <Link key={item.id} to={item.videoUrl ? "/reels" : `/profile/${item.author.username}`}><img src={item.media?.[0]?.url || item.author.avatar} /></Link>)}</div>
      </section>
    </Shell>
  );
}

function HashtagPage() {
  const { tag } = useParams();
  const { request } = useNova();
  const [data, setData] = useState({ posts: [], reels: [] });
  useEffect(() => { request(`/hashtags/${tag}`).then(setData); }, [tag]);
  return <Shell><section className="section"><h1>#{tag}</h1><div className="explore-grid">{[...data.posts, ...data.reels].map((item) => <img key={item.id} src={item.media?.[0]?.url || item.author.avatar} />)}</div></section></Shell>;
}

function ReelsPage() {
  const { request } = useNova();
  const [reels, setReels] = useState([]);
  const load = () => request("/reels").then(setReels);
  useEffect(load, []);
  return <Shell><section className="reels">{reels.map((reel) => <article key={reel.id} className="reel"><video src={reel.videoUrl} controls loop /><div className="reel-meta"><UserRow user={reel.author} /><p><RichText text={reel.caption} /></p><small>{reel.audioTitle}</small><ActionBar item={reel} type="reel" onChange={load} /></div></article>)}</section></Shell>;
}

function CreatePage() {
  const { request } = useNova();
  const [kind, setKind] = useState("post");
  const [form, setForm] = useState({ url: "", mediaType: "image", caption: "", location: "", audioTitle: "" });
  const [message, setMessage] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    const path = kind === "reel" ? "/reels" : kind === "story" ? "/stories" : "/posts";
    const body = kind === "reel" ? { videoUrl: form.url, caption: form.caption, audioTitle: form.audioTitle } : kind === "story" ? { media: { type: form.mediaType, url: form.url } } : { media: [{ type: form.mediaType, url: form.url }], caption: form.caption, location: form.location, commentPolicy: "everyone" };
    await request(path, { method: "POST", body: JSON.stringify(body) });
    setMessage("Published to Nova.");
    setForm({ url: "", mediaType: "image", caption: "", location: "", audioTitle: "" });
  };
  return (
    <Shell>
      <form className="composer" onSubmit={submit}>
        <h1>Create</h1>
        <div className="tabs">{["post", "reel", "story"].map((tab) => <button type="button" className={kind === tab ? "selected" : ""} onClick={() => setKind(tab)} key={tab}>{tab}</button>)}</div>
        <input required placeholder={kind === "reel" ? "Video URL" : "Image or video URL"} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        {kind !== "reel" && <select value={form.mediaType} onChange={(e) => setForm({ ...form, mediaType: e.target.value })}><option>image</option><option>video</option></select>}
        {kind !== "story" && <textarea placeholder="Caption with #hashtags and @mentions" value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} />}
        {kind === "post" && <input placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />}
        {kind === "reel" && <input placeholder="Audio title" value={form.audioTitle} onChange={(e) => setForm({ ...form, audioTitle: e.target.value })} />}
        <button><Camera size={18} /> Publish</button>
        {message && <p className="success">{message}</p>}
      </form>
    </Shell>
  );
}

function ProfilePage() {
  const { username } = useParams();
  const { request, me } = useNova();
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState("posts");
  const load = () => request(`/users/${username}`).then(setProfile);
  useEffect(load, [username]);
  if (!profile) return <Shell><p className="section">Loading...</p></Shell>;
  const follow = async () => {
    await request(`/users/${profile.user.id}/follow`, { method: "POST" });
    load();
  };
  const items = tab === "reels" ? profile.reels : tab === "saved" ? profile.saved : profile.posts;
  return (
    <Shell>
      <section className="profile">
        <div className="profile-head">
          <Avatar user={profile.user} size={96} />
          <div>
            <h1>{profile.user.displayName} <Verified user={profile.user} /></h1>
            <p>@{profile.user.username}</p>
            <p>{profile.user.bio}</p>
            <a href={profile.user.website}>{profile.user.website}</a>
            <div className="stats"><b>{profile.stats.posts}</b> posts <b>{profile.stats.followers}</b> followers <b>{profile.stats.following}</b> following</div>
            {profile.user.id !== me.id ? <button onClick={follow}>{profile.following ? "Unfollow" : profile.requested ? "Requested" : "Follow"}</button> : <Link className="buttonish" to="/settings">Edit profile</Link>}
          </div>
        </div>
        {!profile.visible ? <div className="locked">This account is private.</div> : <>
          <div className="tabs">{["posts", "reels", ...(profile.user.id === me.id ? ["saved"] : []), "tagged"].map((name) => <button className={tab === name ? "selected" : ""} onClick={() => setTab(name)} key={name}>{name}</button>)}</div>
          <div className="explore-grid">{items.map((item) => <img key={item.id} src={item.media?.[0]?.url || item.author.avatar} />)}</div>
        </>}
      </section>
    </Shell>
  );
}

function SettingsPage() {
  const { me, setMe, request, logout } = useNova();
  const [form, setForm] = useState(me);
  const [verification, setVerification] = useState({ fullName: "", category: "", reason: "", links: "" });
  const [saved, setSaved] = useState("");
  const save = async (event) => {
    event.preventDefault();
    const data = await request("/me", { method: "PATCH", body: JSON.stringify(form) });
    setMe(data.user);
    setSaved("Settings saved.");
  };
  const apply = async () => {
    await request("/verification", { method: "POST", body: JSON.stringify(verification) });
    setSaved("Verification request sent.");
  };
  return (
    <Shell>
      <section className="settings">
        <form onSubmit={save}>
          <h1>Settings</h1>
          <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input placeholder="Avatar URL" value={form.avatar} onChange={(e) => setForm({ ...form, avatar: e.target.value })} />
          <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
          <input placeholder="Website" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          <label className="toggle"><input type="checkbox" checked={form.isPrivate} onChange={(e) => setForm({ ...form, isPrivate: e.target.checked })} /> Private account</label>
          <button>Save settings</button>
          <button type="button" className="ghost" onClick={logout}>Log out</button>
        </form>
        <div className="panel">
          <h2>Verification</h2>
          {["fullName", "category", "reason", "links"].map((field) => <input key={field} placeholder={field} value={verification[field]} onChange={(e) => setVerification({ ...verification, [field]: e.target.value })} />)}
          <button onClick={apply}>Apply</button>
          {saved && <p className="success">{saved}</p>}
        </div>
      </section>
    </Shell>
  );
}

function MessagesPage() {
  const { request } = useNova();
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  useEffect(() => { request("/messages").then((items) => { setConversations(items); setActive(items[0]); }); }, []);
  useEffect(() => { if (active) request(`/messages/${active.id}`).then(setMessages); }, [active?.id]);
  const send = async () => {
    await request(`/messages/${active.id}`, { method: "POST", body: JSON.stringify({ body }) });
    setBody("");
    setMessages(await request(`/messages/${active.id}`));
  };
  return (
    <Shell>
      <section className="messages">
        <aside>{conversations.map((conversation) => <button key={conversation.id} onClick={() => setActive(conversation)}>{conversation.participants.map((p) => p.displayName).join(", ")}</button>)}</aside>
        <div className="chat">{messages.map((message) => <p key={message.id}><b>{message.sender.username}</b> {message.body}</p>)}<div className="chatbox"><input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" /><button onClick={send}>Send</button></div></div>
      </section>
    </Shell>
  );
}

function NotificationsPage() {
  const { request } = useNova();
  const [items, setItems] = useState([]);
  useEffect(() => { request("/notifications").then(setItems); request("/notifications/read", { method: "POST" }); }, []);
  return <Shell><section className="section"><h1>Notifications</h1>{items.map((item) => <div className="notice" key={item.id}><Avatar user={item.actor} /><span><b>{item.actor?.username || "Nova"}</b> {item.body}</span></div>)}</section></Shell>;
}

function CommentsPage() {
  const { targetType, targetId } = useParams();
  const { request } = useNova();
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState("");
  const load = () => request(`/${targetType}/${targetId}/comments`).then(setComments);
  useEffect(load, [targetType, targetId]);
  const send = async () => {
    await request(`/${targetType}/${targetId}/comments`, { method: "POST", body: JSON.stringify({ body }) });
    setBody("");
    load();
  };
  return <Shell><section className="section comments"><h1>Comments</h1>{comments.map((c) => <div key={c.id}><UserRow user={c.author} /><p>{c.body}</p></div>)}<div className="chatbox"><input value={body} onChange={(e) => setBody(e.target.value)} /><button onClick={send}>Post</button></div></section></Shell>;
}

function ReportModal({ targetType, targetId, onClose }) {
  const { request } = useNova();
  const [reason, setReason] = useState("");
  const send = async () => {
    await request("/reports", { method: "POST", body: JSON.stringify({ targetType, targetId, reason }) });
    onClose();
  };
  return <div className="modal"><div><button className="icon close" onClick={onClose}><X /></button><h2>Report</h2><textarea value={reason} onChange={(e) => setReason(e.target.value)} /><button onClick={send}>Submit report</button></div></div>;
}

function AdminPage() {
  const { request } = useNova();
  const [stats, setStats] = useState(null);
  const [data, setData] = useState(null);
  const load = () => {
    request("/admin/stats").then(setStats);
    request("/admin").then(setData);
  };
  useEffect(load, []);
  const act = async (path) => { await request(path, { method: "POST" }); load(); };
  if (!data) return <Shell><section className="section">Loading admin...</section></Shell>;
  return (
    <Shell>
      <section className="admin">
        <h1>Admin Dashboard</h1>
        <div className="stat-grid">{Object.entries(stats).map(([k, v]) => <div key={k}><b>{v}</b><span>{k}</span></div>)}</div>
        <h2>Users</h2>
        {data.users.map((user) => <div className="admin-row" key={user.id}><UserRow user={user} /><button onClick={() => act(`/admin/users/${user.id}/${user.banned ? "unban" : "ban"}`)}>{user.banned ? "Unban" : "Ban"}</button><button onClick={() => act(`/admin/users/${user.id}/${user.verified ? "unverify" : "verify"}`)}>{user.verified ? "Unverify" : "Verify"}</button></div>)}
        <h2>Verification Requests</h2>
        {data.verificationRequests.map((r) => <div className="admin-row" key={r.id}><span>{r.user?.username}: {r.reason}</span><button onClick={() => act(`/admin/verification/${r.id}/approve`)}>Approve</button><button onClick={() => act(`/admin/verification/${r.id}/deny`)}>Deny</button></div>)}
        <h2>Reports</h2>
        {data.reports.map((r) => <div className="admin-row" key={r.id}><span>{r.targetType} {r.reason} ({r.status})</span><button onClick={() => act(`/admin/reports/${r.id}/dismiss`)}>Dismiss</button><button onClick={() => act(`/admin/reports/${r.id}/action`)}>Action taken</button></div>)}
      </section>
    </Shell>
  );
}

function Protected({ children }) {
  const { me, loading } = useNova();
  if (loading) return <div className="boot">Nova Social</div>;
  return me ? children : <Navigate to="/auth" />;
}

function App() {
  const api = useApi();
  return (
    <ApiContext.Provider value={api}>
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={api.me ? <Navigate to="/" /> : <Auth />} />
          <Route path="/" element={<Protected><HomePage /></Protected>} />
          <Route path="/explore" element={<Protected><ExplorePage /></Protected>} />
          <Route path="/hashtag/:tag" element={<Protected><HashtagPage /></Protected>} />
          <Route path="/reels" element={<Protected><ReelsPage /></Protected>} />
          <Route path="/create" element={<Protected><CreatePage /></Protected>} />
          <Route path="/messages" element={<Protected><MessagesPage /></Protected>} />
          <Route path="/notifications" element={<Protected><NotificationsPage /></Protected>} />
          <Route path="/comments/:targetType/:targetId" element={<Protected><CommentsPage /></Protected>} />
          <Route path="/profile/:username" element={<Protected><ProfilePage /></Protected>} />
          <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
          <Route path="/admin" element={<Protected><AdminPage /></Protected>} />
        </Routes>
      </BrowserRouter>
    </ApiContext.Provider>
  );
}

createRoot(document.getElementById("root")).render(<App />);
