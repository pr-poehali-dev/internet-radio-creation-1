import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";

const API_TRACKS = "https://functions.poehali.dev/0859e736-782d-4290-a1c8-1824f807168a";
const API_SETTINGS = "https://functions.poehali.dev/76b15ad4-c742-43df-8aa9-7243003b4233";

const SCHEDULE = [
  { time: "06:00", title: "Доброе утро", host: "Алина Соколова", active: false },
  { time: "09:00", title: "Час новостей", host: "Михаил Орлов", active: false },
  { time: "10:00", title: "Утренний эфир", host: "Дарья Климова", active: false },
  { time: "13:00", title: "Дневник музыки", host: "Артём Веснин", active: true },
  { time: "15:00", title: "Вечерний джаз", host: "Елена Пирогова", active: false },
  { time: "18:00", title: "Час пик", host: "Михаил Орлов", active: false },
  { time: "20:00", title: "Ночная волна", host: "Кирилл Романов", active: false },
  { time: "23:00", title: "Тихий эфир", host: "Алина Соколова", active: false },
];

const PODCASTS = [
  { title: "Городская среда", ep: "Эп. 14", duration: "42 мин", date: "8 апр" },
  { title: "Музыка без границ", ep: "Эп. 7", duration: "38 мин", date: "5 апр" },
  { title: "Разговор о главном", ep: "Эп. 23", duration: "55 мин", date: "2 апр" },
  { title: "Звуки города", ep: "Эп. 5", duration: "29 мин", date: "28 мар" },
];

const NAV = ["Главная", "Плеер", "Программа", "О радио", "Подкасты", "Контакты"];

interface Track {
  id: number;
  title: string;
  artist: string;
  url: string;
}

export default function Index() {
  const navigate = useNavigate();

  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(75);
  const [isMuted, setIsMuted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [streamMode, setStreamMode] = useState<"playlist" | "stream">("playlist");
  const [streamUrl, setStreamUrl] = useState("");
  const [stationName, setStationName] = useState("Радио Волна");
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [activeSection, setActiveSection] = useState("Главная");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    fetch(API_TRACKS)
      .then((r) => r.json())
      .then((d) => setTracks(d.tracks || []))
      .catch(() => {});

    fetch(API_SETTINGS)
      .then((r) => r.json())
      .then((d) => {
        if (d.stream_mode) setStreamMode(d.stream_mode);
        if (d.stream_url) setStreamUrl(d.stream_url);
        if (d.station_name) setStationName(d.station_name);
        setSettingsLoaded(true);
      })
      .catch(() => setSettingsLoaded(true));
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || tracks.length === 0 || streamMode !== "playlist") return;
    const track = tracks[currentIndex];
    if (track) {
      audio.src = track.url;
      if (isPlaying) audio.play().catch(() => {});
    }
  }, [currentIndex, tracks, streamMode]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !settingsLoaded || streamMode !== "stream" || !streamUrl) return;
    audio.src = streamUrl;
    if (isPlaying) audio.play().catch(() => {});
  }, [streamMode, streamUrl, settingsLoaded]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      if (streamMode === "playlist" && tracks.length > 0) {
        if (!audio.src || audio.src === window.location.href) {
          audio.src = tracks[currentIndex]?.url || "";
        }
        await audio.play().catch(() => {});
        setIsPlaying(true);
      } else if (streamMode === "stream" && streamUrl) {
        if (!audio.src || audio.src === window.location.href) {
          audio.src = streamUrl;
        }
        await audio.play().catch(() => {});
        setIsPlaying(true);
      }
    }
  };

  const nextTrack = () => {
    if (tracks.length === 0) return;
    setCurrentIndex((i) => (i + 1) % tracks.length);
  };

  const prevTrack = () => {
    if (tracks.length === 0) return;
    setCurrentIndex((i) => (i - 1 + tracks.length) % tracks.length);
  };

  const handleEnded = () => {
    if (streamMode === "playlist" && tracks.length > 1) {
      const next = (currentIndex + 1) % tracks.length;
      setCurrentIndex(next);
      setTimeout(() => audioRef.current?.play().catch(() => {}), 100);
    } else {
      setIsPlaying(false);
    }
  };

  const toggleMute = () => setIsMuted((m) => !m);

  const scrollTo = (section: string) => {
    setActiveSection(section);
    setMobileMenuOpen(false);
    const id = section.toLowerCase().replace(/ё/g, "e").replace(/\s/g, "-");
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const sections = document.querySelectorAll("section[id]");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            const match = NAV.find(
              (n) => n.toLowerCase().replace(/ё/g, "e").replace(/\s/g, "-") === id
            );
            if (match) setActiveSection(match);
          }
        });
      },
      { threshold: 0.3 }
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  const currentTrack = tracks[currentIndex];
  const nowPlaying =
    streamMode === "stream"
      ? "Прямой эфир"
      : currentTrack
      ? currentTrack.title
      : "Нет треков — загрузите mp3 в админке";
  const nowArtist = streamMode === "playlist" && currentTrack?.artist ? currentTrack.artist : "";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <audio ref={audioRef} onEnded={handleEnded} />

      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-end gap-[2px] h-5">
              {[3, 5, 7, 5, 3].map((h, i) => (
                <div key={i} className="w-[3px] bg-primary rounded-full" style={{ height: `${h * 3}px` }} />
              ))}
            </div>
            <span className="font-cormorant text-lg font-light tracking-widest uppercase text-foreground ml-1">
              {stationName}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1">
            {NAV.map((item) => (
              <button
                key={item}
                onClick={() => scrollTo(item)}
                className={`px-3 py-1.5 text-sm transition-colors rounded ${
                  activeSection === item ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item}
              </button>
            ))}
            <button
              onClick={() => navigate("/admin")}
              className="ml-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-primary transition-colors border border-border rounded"
            >
              Админка
            </button>
          </div>

          <button
            className="md:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setMobileMenuOpen((o) => !o)}
          >
            <Icon name={mobileMenuOpen ? "X" : "Menu"} size={20} />
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-background px-6 py-3 flex flex-col gap-1">
            {NAV.map((item) => (
              <button
                key={item}
                onClick={() => scrollTo(item)}
                className={`text-left py-2 text-sm transition-colors ${
                  activeSection === item ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {item}
              </button>
            ))}
            <button
              onClick={() => navigate("/admin")}
              className="text-left py-2 text-xs text-muted-foreground"
            >
              Админка
            </button>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section
        id="главная"
        className="min-h-screen flex flex-col items-center justify-center px-6 pt-14 relative overflow-hidden"
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/[0.04] blur-3xl" />
          <div className="absolute top-1/3 left-1/4 w-[300px] h-[300px] rounded-full bg-primary/[0.03] blur-3xl" />
        </div>

        <div className="text-center relative z-10 max-w-2xl animate-fade-up">
          <div className="flex items-center justify-center gap-2 mb-6">
            <span className="live-dot w-2 h-2 rounded-full bg-primary inline-block" />
            <span className="text-xs tracking-[0.3em] uppercase text-primary font-medium">
              {streamMode === "stream" ? "Прямой эфир" : "В эфире"}
            </span>
          </div>

          <h1 className="font-cormorant text-6xl md:text-8xl font-light leading-none mb-2 text-foreground">
            {stationName.split(" ")[0]}
          </h1>
          <h1 className="font-cormorant text-6xl md:text-8xl font-light leading-none mb-8 text-primary italic">
            {stationName.split(" ").slice(1).join(" ") || "Волна"}
          </h1>

          <p className="text-muted-foreground text-base mb-12 tracking-wide">
            Музыка. Разговоры. Настроение — 24 часа в сутки
          </p>

          <button
            onClick={togglePlay}
            className="group w-20 h-20 rounded-full border-2 border-primary flex items-center justify-center mx-auto hover:bg-primary transition-all duration-300"
          >
            <Icon
              name={isPlaying ? "Pause" : "Play"}
              size={28}
              className="text-primary group-hover:text-primary-foreground transition-colors ml-1"
            />
          </button>

          <p className="text-muted-foreground text-xs mt-4 tracking-widest uppercase">
            {isPlaying ? "Остановить" : "Слушать сейчас"}
          </p>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <Icon name="ChevronDown" size={16} className="text-muted-foreground" />
        </div>
      </section>

      {/* PLAYER */}
      <section id="плеер" className="py-20 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs tracking-[0.3em] uppercase text-primary mb-2">Плеер</p>
          <h2 className="font-cormorant text-4xl font-light mb-12">
            {streamMode === "stream" ? "Прямой эфир" : "Плейлист"}
          </h2>

          <div className="bg-card border border-border p-8 md:p-12 mb-6">
            <div className="flex flex-col md:flex-row md:items-center gap-8">
              <div className="flex-shrink-0">
                <div className="w-20 h-20 rounded-full border border-border flex items-center justify-center">
                  <div className="flex items-end gap-[3px] h-8">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-[3px] bg-primary rounded-full h-full wave-bar ${!isPlaying ? "paused" : ""}`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="live-dot w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                  <span className="text-xs tracking-widest uppercase text-primary">
                    {streamMode === "stream"
                      ? "Прямой эфир"
                      : `Трек ${tracks.length > 0 ? currentIndex + 1 : 0} из ${tracks.length}`}
                  </span>
                </div>
                <h3 className="font-cormorant text-2xl font-light mb-1 truncate">{nowPlaying}</h3>
                {nowArtist && <p className="text-muted-foreground text-sm">{nowArtist}</p>}
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  {streamMode === "playlist" && (
                    <button
                      onClick={prevTrack}
                      disabled={tracks.length <= 1}
                      className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
                    >
                      <Icon name="SkipBack" size={18} />
                    </button>
                  )}

                  <button
                    onClick={togglePlay}
                    className="w-12 h-12 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors"
                  >
                    <Icon
                      name={isPlaying ? "Pause" : "Play"}
                      size={20}
                      className="text-primary-foreground ml-0.5"
                    />
                  </button>

                  {streamMode === "playlist" && (
                    <button
                      onClick={nextTrack}
                      disabled={tracks.length <= 1}
                      className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
                    >
                      <Icon name="SkipForward" size={18} />
                    </button>
                  )}

                  <button onClick={toggleMute} className="text-muted-foreground hover:text-foreground transition-colors">
                    <Icon name={isMuted ? "VolumeX" : volume > 50 ? "Volume2" : "Volume1"} size={18} />
                  </button>

                  <div className="flex items-center gap-2 w-24">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={isMuted ? 0 : volume}
                      onChange={(e) => {
                        setVolume(Number(e.target.value));
                        if (isMuted) setIsMuted(false);
                      }}
                      className="w-full"
                    />
                  </div>

                  <span className="text-xs text-muted-foreground w-8">{isMuted ? "0" : volume}%</span>
                </div>

                <div className="flex items-center gap-2">
                  <Icon name="Radio" size={14} className="text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">128 kbps · Высокое качество</span>
                </div>
              </div>
            </div>
          </div>

          {streamMode === "playlist" && tracks.length > 0 && (
            <div className="flex flex-col gap-px bg-border">
              {tracks.map((track, i) => (
                <div
                  key={track.id}
                  onClick={() => setCurrentIndex(i)}
                  className={`flex items-center gap-4 px-5 py-3 cursor-pointer transition-colors ${
                    i === currentIndex
                      ? "bg-primary/[0.08] border-l-2 border-l-primary"
                      : "bg-card hover:bg-secondary"
                  }`}
                >
                  <span className="text-xs text-muted-foreground w-5 text-right flex-shrink-0">{i + 1}</span>
                  <div className="w-7 h-7 flex items-center justify-center flex-shrink-0">
                    {i === currentIndex && isPlaying ? (
                      <div className="flex items-end gap-[2px] h-4">
                        {[2, 4, 3, 4, 2].map((h, idx) => (
                          <div
                            key={idx}
                            className="w-[2px] bg-primary rounded-full wave-bar"
                            style={{ height: `${h * 3}px` }}
                          />
                        ))}
                      </div>
                    ) : (
                      <Icon
                        name="Music"
                        size={14}
                        className={i === currentIndex ? "text-primary" : "text-muted-foreground"}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${i === currentIndex ? "text-primary font-medium" : ""}`}>
                      {track.title}
                    </p>
                    {track.artist && <p className="text-xs text-muted-foreground">{track.artist}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {streamMode === "playlist" && tracks.length === 0 && (
            <div className="text-center py-10 text-muted-foreground bg-card border border-border">
              <Icon name="Music" size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                Плейлист пуст — добавьте треки в{" "}
                <button onClick={() => navigate("/admin")} className="text-primary hover:underline">
                  админке
                </button>
              </p>
            </div>
          )}
        </div>
      </section>

      {/* SCHEDULE */}
      <section id="программа" className="py-20 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs tracking-[0.3em] uppercase text-primary mb-2">Расписание</p>
          <h2 className="font-cormorant text-4xl font-light mb-12">Программа передач</h2>

          <div className="flex flex-col gap-px bg-border">
            {SCHEDULE.map((item, i) => (
              <div
                key={i}
                className={`flex items-center gap-6 px-6 py-4 transition-colors ${
                  item.active ? "bg-primary/[0.08] border-l-2 border-l-primary" : "bg-card hover:bg-secondary"
                }`}
              >
                <span
                  className={`font-cormorant text-xl font-light w-14 flex-shrink-0 ${
                    item.active ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {item.time}
                </span>
                <div className="flex-1">
                  <p className="font-medium text-sm text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.host}</p>
                </div>
                {item.active && (
                  <div className="flex items-center gap-2">
                    <span className="live-dot w-1.5 h-1.5 rounded-full bg-primary" />
                    <span className="text-xs text-primary tracking-widest uppercase">Сейчас</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="о-радио" className="py-20 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-xs tracking-[0.3em] uppercase text-primary mb-2">О нас</p>
              <h2 className="font-cormorant text-4xl md:text-5xl font-light leading-tight mb-6">
                Голос, который<br />
                <span className="italic text-primary">всегда рядом</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                {stationName} — это живое радио с настоящими людьми в студии. Мы вещаем с 2010 года, и каждый день нас слушают тысячи людей по всей стране.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Наш формат — музыка хорошего вкуса, актуальные новости и искренние разговоры о том, что важно.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-px bg-border">
              {[
                { value: "15", label: "лет в эфире" },
                { value: "24/7", label: "прямое вещание" },
                { value: "128k", label: "слушателей" },
                { value: "8", label: "ведущих" },
              ].map((stat, i) => (
                <div key={i} className="bg-card p-8 text-center">
                  <p className="font-cormorant text-4xl text-primary mb-1">{stat.value}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* PODCASTS */}
      <section id="подкасты" className="py-20 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs tracking-[0.3em] uppercase text-primary mb-2">Архив</p>
          <h2 className="font-cormorant text-4xl font-light mb-12">Подкасты</h2>

          <div className="grid md:grid-cols-2 gap-px bg-border">
            {PODCASTS.map((pod, i) => (
              <div key={i} className="bg-card p-6 hover:bg-secondary transition-colors cursor-pointer group">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full border border-border flex items-center justify-center flex-shrink-0 group-hover:border-primary transition-colors">
                    <Icon
                      name="Play"
                      size={14}
                      className="text-muted-foreground group-hover:text-primary transition-colors ml-0.5"
                    />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-sm mb-0.5">{pod.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {pod.ep} · {pod.duration}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">{pod.date}</span>
                </div>
              </div>
            ))}
          </div>

          <button className="mt-8 text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
            <span>Смотреть все подкасты</span>
            <Icon name="ArrowRight" size={14} />
          </button>
        </div>
      </section>

      {/* CONTACTS */}
      <section id="контакты" className="py-20 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16">
            <div>
              <p className="text-xs tracking-[0.3em] uppercase text-primary mb-2">Контакты</p>
              <h2 className="font-cormorant text-4xl font-light mb-8">Свяжитесь с нами</h2>

              <div className="flex flex-col gap-0">
                {[
                  { icon: "Phone", label: "Телефон", value: "+7 (800) 123-45-67" },
                  { icon: "Mail", label: "Email", value: "hello@radiovolna.ru" },
                  { icon: "MapPin", label: "Студия", value: "Москва, ул. Арбат, 15" },
                ].map((c, i) => (
                  <div key={i} className="flex items-center gap-4 py-4 border-b border-border">
                    <Icon
                      name={c.icon as "Phone" | "Mail" | "MapPin"}
                      size={16}
                      className="text-primary flex-shrink-0"
                    />
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">{c.label}</p>
                      <p className="text-sm">{c.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-6">Напишите нам — мы отвечаем в течение дня</p>
              <div className="flex flex-col gap-3">
                <input
                  type="text"
                  placeholder="Ваше имя"
                  className="w-full bg-card border border-border px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                />
                <input
                  type="email"
                  placeholder="Email"
                  className="w-full bg-card border border-border px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                />
                <textarea
                  rows={4}
                  placeholder="Сообщение"
                  className="w-full bg-card border border-border px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors resize-none"
                />
                <button className="bg-primary text-primary-foreground py-3 px-6 text-sm font-medium hover:bg-primary/90 transition-colors">
                  Отправить
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex items-end gap-[2px] h-4">
              {[3, 5, 7, 5, 3].map((h, i) => (
                <div key={i} className="w-[2px] bg-primary/50 rounded-full" style={{ height: `${h * 2}px` }} />
              ))}
            </div>
            <span className="font-cormorant text-sm tracking-widest uppercase text-muted-foreground ml-1">
              {stationName}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">© 2024 {stationName}. Все права защищены.</p>
          <div className="flex gap-4">
            {["ВКонтакте", "Telegram", "YouTube"].map((s) => (
              <button key={s} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                {s}
              </button>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
