import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";

const API_TRACKS = "https://functions.poehali.dev/0859e736-782d-4290-a1c8-1824f807168a";
const API_AUTH = "https://functions.poehali.dev/d4d5caf0-6b72-46a2-9242-ee6bbfae9754";
const API_SETTINGS = "https://functions.poehali.dev/76b15ad4-c742-43df-8aa9-7243003b4233";

interface Track {
  id: number;
  title: string;
  artist: string;
  url: string;
  duration: number | null;
  position: number;
}

export default function Admin() {
  const navigate = useNavigate();
  const [token, setToken] = useState(() => localStorage.getItem("radio_admin_token") || "");
  const [loginInput, setLoginInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [settings, setSettings] = useState({ stream_url: "", stream_mode: "playlist", station_name: "Радио Волна" });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [activeTab, setActiveTab] = useState<"tracks" | "settings">("tracks");
  const [newPassword, setNewPassword] = useState("");
  const [saved, setSaved] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAuthed = !!token;

  const login = async () => {
    setLoginLoading(true);
    setLoginError("");
    try {
      const res = await fetch(API_AUTH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: loginInput }),
      });
      const data = await res.json();
      if (data.ok) {
        setToken(loginInput);
        localStorage.setItem("radio_admin_token", loginInput);
      } else {
        setLoginError("Неверный пароль");
      }
    } catch {
      setLoginError("Ошибка подключения");
    }
    setLoginLoading(false);
  };

  const logout = () => {
    setToken("");
    localStorage.removeItem("radio_admin_token");
  };

  const loadTracks = async () => {
    setLoading(true);
    try {
      const res = await fetch(API_TRACKS);
      const data = await res.json();
      setTracks(data.tracks || []);
    } catch (_e) {
      setTracks([]);
    }
    setLoading(false);
  };

  const loadSettings = async () => {
    try {
      const res = await fetch(API_SETTINGS);
      const data = await res.json();
      setSettings((s) => ({ ...s, ...data }));
    } catch (_e) {
      // ignore
    }
  };

  useEffect(() => {
    if (isAuthed) {
      loadTracks();
      loadSettings();
    }
  }, [isAuthed]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress(`Загружаю ${i + 1}/${files.length}: ${file.name}`);

      const reader = new FileReader();
      await new Promise<void>((resolve) => {
        reader.onload = async (ev) => {
          const base64 = (ev.target?.result as string).split(",")[1];
          const title = file.name.replace(/\.(mp3|wav|ogg|flac)$/i, "").replace(/_/g, " ");

          try {
            await fetch(API_TRACKS, {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Admin-Token": token },
              body: JSON.stringify({ title, artist: "", file_data: base64, file_name: file.name }),
            });
          } catch (_e) {
            // ignore upload error for individual file
          }
          resolve();
        };
        reader.readAsDataURL(file);
      });
    }

    setUploading(false);
    setUploadProgress("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    loadTracks();
  };

  const deleteTrack = async (id: number) => {
    await fetch(`${API_TRACKS}?id=${id}`, {
      method: "DELETE",
      headers: { "X-Admin-Token": token },
    });
    loadTracks();
  };

  const saveSettings = async () => {
    const body: Record<string, string> = {
      stream_url: settings.stream_url,
      stream_mode: settings.stream_mode,
      station_name: settings.station_name,
    };
    if (newPassword) body.new_password = newPassword;

    await fetch(API_SETTINGS, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Token": token },
      body: JSON.stringify(body),
    });

    if (newPassword) {
      setToken(newPassword);
      localStorage.setItem("radio_admin_token", newPassword);
      setNewPassword("");
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // LOGIN SCREEN
  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 justify-center">
            <div className="flex items-end gap-[2px] h-5">
              {[3, 5, 7, 5, 3].map((h, i) => (
                <div key={i} className="w-[3px] bg-primary rounded-full" style={{ height: `${h * 3}px` }} />
              ))}
            </div>
            <span className="font-cormorant text-lg tracking-widest uppercase ml-1">Радио Волна</span>
          </div>

          <div className="bg-card border border-border p-8">
            <h1 className="font-cormorant text-2xl font-light mb-6 text-center">Вход в админку</h1>
            <div className="flex flex-col gap-3">
              <input
                type="password"
                placeholder="Пароль"
                value={loginInput}
                onChange={(e) => setLoginInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && login()}
                className="w-full bg-background border border-border px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
              />
              {loginError && <p className="text-destructive text-xs">{loginError}</p>}
              <button
                onClick={login}
                disabled={loginLoading}
                className="bg-primary text-primary-foreground py-3 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {loginLoading ? "Вход..." : "Войти"}
              </button>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-4">По умолчанию: admin123</p>
          </div>

          <button onClick={() => navigate("/")} className="mt-4 text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 mx-auto">
            <Icon name="ArrowLeft" size={12} />
            На сайт
          </button>
        </div>
      </div>
    );
  }

  // ADMIN PANEL
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground transition-colors">
              <Icon name="ArrowLeft" size={16} />
            </button>
            <div className="flex items-center gap-2">
              <div className="flex items-end gap-[2px] h-4">
                {[3, 5, 7, 5, 3].map((h, i) => (
                  <div key={i} className="w-[2px] bg-primary rounded-full" style={{ height: `${h * 2}px` }} />
                ))}
              </div>
              <span className="font-cormorant text-base tracking-widest uppercase ml-1">Админка</span>
            </div>
          </div>
          <button onClick={logout} className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
            <Icon name="LogOut" size={14} />
            Выйти
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-1 mb-8 border-b border-border">
          {(["tracks", "settings"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px ${
                activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "tracks" ? "Треки" : "Настройки"}
            </button>
          ))}
        </div>

        {/* TRACKS TAB */}
        {activeTab === "tracks" && (
          <div>
            {/* Upload zone */}
            <div
              className="border-2 border-dashed border-border hover:border-primary transition-colors p-10 text-center mb-8 cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.wav,.ogg,.flac"
                multiple
                className="hidden"
                onChange={handleFileUpload}
              />
              {uploading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-end gap-[3px] h-8">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div key={i} className="w-[3px] bg-primary rounded-full h-full wave-bar" />
                    ))}
                  </div>
                  <p className="text-sm text-primary">{uploadProgress}</p>
                </div>
              ) : (
                <>
                  <Icon name="Upload" size={32} className="text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium mb-1">Нажмите или перетащите файлы</p>
                  <p className="text-xs text-muted-foreground">MP3, WAV, OGG, FLAC — можно несколько сразу</p>
                </>
              )}
            </div>

            {/* Tracks list */}
            {loading ? (
              <div className="text-center py-12 text-muted-foreground text-sm">Загрузка...</div>
            ) : tracks.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Icon name="Music" size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Треков пока нет — загрузите первый mp3</p>
              </div>
            ) : (
              <div className="flex flex-col gap-px bg-border">
                {tracks.map((track, i) => (
                  <div key={track.id} className="bg-card flex items-center gap-4 px-5 py-4 hover:bg-secondary transition-colors group">
                    <span className="text-muted-foreground text-xs w-5 text-right flex-shrink-0">{i + 1}</span>
                    <div className="w-8 h-8 rounded-full border border-border flex items-center justify-center flex-shrink-0">
                      <Icon name="Music" size={14} className="text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{track.title}</p>
                      {track.artist && <p className="text-xs text-muted-foreground">{track.artist}</p>}
                    </div>
                    <a
                      href={track.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Icon name="ExternalLink" size={14} />
                    </a>
                    <button
                      onClick={() => deleteTrack(track.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Icon name="Trash2" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === "settings" && (
          <div className="max-w-lg">
            <div className="flex flex-col gap-6">
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground block mb-2">Название радиостанции</label>
                <input
                  type="text"
                  value={settings.station_name}
                  onChange={(e) => setSettings((s) => ({ ...s, station_name: e.target.value }))}
                  className="w-full bg-card border border-border px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground block mb-2">Режим вещания</label>
                <div className="flex gap-px bg-border">
                  {[
                    { value: "playlist", label: "Плейлист", icon: "ListMusic" },
                    { value: "stream", label: "Прямой эфир", icon: "Radio" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setSettings((s) => ({ ...s, stream_mode: opt.value }))}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm transition-colors ${
                        settings.stream_mode === opt.value
                          ? "bg-primary text-primary-foreground"
                          : "bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon name={opt.icon as "Radio"} size={14} />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {settings.stream_mode === "stream" && (
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground block mb-2">URL потока (Icecast / Shoutcast)</label>
                  <input
                    type="url"
                    placeholder="https://stream.example.com:8000/radio"
                    value={settings.stream_url}
                    onChange={(e) => setSettings((s) => ({ ...s, stream_url: e.target.value }))}
                    className="w-full bg-card border border-border px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Для вещания с компьютера используйте Butt, MIXXX или Darkice — они создают Icecast/Shoutcast поток
                  </p>
                </div>
              )}

              <div className="border-t border-border pt-6">
                <label className="text-xs uppercase tracking-wider text-muted-foreground block mb-2">Новый пароль администратора</label>
                <input
                  type="password"
                  placeholder="Оставьте пустым, чтобы не менять"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-card border border-border px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              <button
                onClick={saveSettings}
                className="bg-primary text-primary-foreground py-3 px-6 text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                {saved ? <><Icon name="Check" size={14} /> Сохранено</> : "Сохранить настройки"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}