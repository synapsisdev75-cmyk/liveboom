import {
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  Flame,
  Image as ImageIcon,
  Link2,
  LogOut,
  MessageCircle,
  Paperclip,
  Search,
  Send,
  Settings,
  Sparkles,
  Trophy,
  Users,
  Shield,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LIVE_CATEGORIES } from '../lib/categories';
import {
  createGroup,
  ensureGroupMembership,
  isGroupStaffRole,
  joinGroup,
  leaveGroup,
  listenGroupMessages,
  listenGroupMembers,
  listenMyGroups,
  listenPublicGroups,
  requestJoinGroup,
  sendGroupMessage,
  setGroupMemberRole,
  updateGroupPhoto,
  getGroupMemberPreviews,
  type GroupMember,
  type GroupMemberPreview,
  type GroupMessage,
  type GroupRole,
  type LiveGroup,
} from '../lib/groupsFirestore';
import { uploadGroupChatMedia, uploadGroupCover } from '../lib/storage';
import { insertEmojiToken, CHAT_EMOJI_SIZE } from '../lib/liveboomEmojis';
import { useAuthStore } from '../store/authStore';
import { EmojiPickerButton } from '../components/social/EmojiPicker';
import { EmojiInput } from '../components/social/EmojiInput';
import { EmojiText } from '../components/social/EmojiText';

type Tab = 'descubrir' | 'mios' | 'invitaciones' | 'crear' | 'chat';

const JOIN_BTN =
  'bg-[linear-gradient(to_right,#06B6D4,#8B5CF6)] text-white shadow-[0_4px_16px_rgba(6,182,212,0.25)]';

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(n);
}

function matchesCategory(group: LiveGroup, category: string) {
  if (!category) return true;
  const blob = `${group.name} ${group.description}`.toLowerCase();
  const map: Record<string, string[]> = {
    gaming: ['game', 'gamer', 'gaming', 'play', 'lol', 'fortnite', 'xbox', 'ps5'],
    musica: ['music', 'música', 'musica', 'dj', 'rap', 'reggaeton', 'canto'],
    deportes: ['deporte', 'futbol', 'fútbol', 'sport', 'gym', 'fitness'],
    arte: ['arte', 'art', 'dibujo', 'design', 'diseño'],
    charla: ['charla', 'chat', 'talk', 'amigo', 'social'],
    educacion: ['edu', 'estudio', 'clase', 'learn', 'curso'],
    humor: ['humor', 'meme', 'risa', 'comedy'],
    negocios: ['negocio', 'business', 'emprend', 'venta'],
  };
  const keys = map[category] || [category];
  return keys.some((k) => blob.includes(k));
}

function roleLabel(role: GroupRole) {
  if (role === 'owner') return 'Dueño';
  if (role === 'admin') return 'Admin';
  return 'Miembro';
}

function GroupAvatar({
  name,
  photoUrl,
  size = 'md',
}: {
  name: string;
  photoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const dim =
    size === 'sm'
      ? 'h-7 w-7 text-[9px]'
      : size === 'lg'
        ? 'h-10 w-10 text-sm'
        : size === 'xl'
          ? 'h-14 w-14 text-lg'
          : 'h-8 w-8 text-[11px]';
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        className={`shrink-0 rounded-full object-cover ring-2 ring-white/15 ${dim}`}
      />
    );
  }
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-fuchsia-500/40 to-cyan-500/30 font-black text-white ring-2 ring-white/15 ${dim}`}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function ProfileAvatar({
  url,
  name,
  size = 28,
}: {
  url?: string | null;
  name: string;
  size?: number;
}) {
  const letter = (name || '?').slice(0, 1).toUpperCase();
  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover ring-2 ring-[#0a0b10]"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-zinc-800 text-[10px] font-bold text-violet-200 ring-2 ring-[#0a0b10]"
      style={{ width: size, height: size }}
    >
      {letter}
    </span>
  );
}

function MemberStack({
  members,
  total,
}: {
  members: GroupMemberPreview[];
  total: number;
}) {
  const show = members.slice(0, 4);
  const extra = Math.max(0, total - show.length);
  if (show.length === 0 && total > 0) {
    return (
      <div className="flex items-center gap-1 text-[11px] text-zinc-500">
        <Users size={12} />
        {formatCount(total)}
      </div>
    );
  }
  return (
    <div className="flex items-center">
      {show.map((member, i) => (
        <span key={member.uid} className="relative" style={{ marginLeft: i === 0 ? 0 : -8 }}>
          <ProfileAvatar
            url={member.avatarUrl}
            name={member.username}
            size={28}
          />
        </span>
      ))}
      {extra > 0 ? (
        <span className="ml-1.5 text-[11px] font-semibold text-zinc-500">+{formatCount(extra)}</span>
      ) : null}
    </div>
  );
}

export function GroupsView() {
  const profile = useAuthStore((s) => s.profile);
  const [searchParams, setSearchParams] = useSearchParams();
  const [mine, setMine] = useState<LiveGroup[]>([]);
  const [publicGroups, setPublicGroups] = useState<LiveGroup[]>([]);
  const [tab, setTab] = useState<Tab>(() =>
    searchParams.get('tab') === 'crear' ? 'crear' : 'descubrir',
  );
  const [category, setCategory] = useState('');
  const [showMoreCats, setShowMoreCats] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [draft, setDraft] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [memberPreviews, setMemberPreviews] = useState<Record<string, GroupMemberPreview[]>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const featuredRef = useRef<HTMLDivElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const chatImageRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchParams.get('tab') === 'crear') setTab('crear');
  }, [searchParams]);

  function selectTab(next: Tab) {
    setTab(next);
    if (next === 'crear') setSearchParams({ tab: 'crear' });
    else if (searchParams.has('tab')) {
      searchParams.delete('tab');
      setSearchParams(searchParams, { replace: true });
    }
  }

  const active = useMemo(
    () => [...mine, ...publicGroups].find((g) => g.id === activeId) || null,
    [mine, publicGroups, activeId],
  );
  const isMember = useMemo(
    () => Boolean(profile && members.some((m) => m.uid === profile.firebaseUid)),
    [members, profile],
  );
  const myRole = useMemo(
    () => members.find((m) => m.uid === profile?.firebaseUid)?.role ?? null,
    [members, profile?.firebaseUid],
  );
  const canManage = isGroupStaffRole(myRole);

  const filteredPublic = useMemo(() => {
    const n = query.trim().toLowerCase();
    return publicGroups.filter((g) => {
      if (!matchesCategory(g, category)) return false;
      if (!n) return true;
      return g.name.toLowerCase().includes(n) || g.description.toLowerCase().includes(n);
    });
  }, [publicGroups, query, category]);

  const featured = filteredPublic.slice(0, 8);
  const popular = filteredPublic.slice(0, 5);
  const previewGroupIds = useMemo(() => {
    const ids = new Set<string>();
    for (const g of featured) ids.add(g.id);
    for (const g of popular) ids.add(g.id);
    return [...ids];
  }, [featured, popular]);

  useEffect(() => {
    if (previewGroupIds.length === 0) {
      setMemberPreviews({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        previewGroupIds.map(async (groupId) => {
          try {
            const previews = await getGroupMemberPreviews(groupId, 4);
            return [groupId, previews] as const;
          } catch {
            return [groupId, []] as const;
          }
        }),
      );
      if (!cancelled) setMemberPreviews(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [previewGroupIds.join('|')]);

  useEffect(() => {
    if (!profile) return;
    return listenMyGroups(profile.firebaseUid, setMine);
  }, [profile?.firebaseUid]);

  useEffect(() => listenPublicGroups(setPublicGroups), []);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      setMembers([]);
      return;
    }
    const u1 = listenGroupMessages(activeId, setMessages);
    const u2 = listenGroupMembers(activeId, setMembers);
    return () => {
      u1();
      u2();
    };
  }, [activeId]);

  useEffect(() => {
    if (!activeId || !profile) return;
    void ensureGroupMembership(activeId, {
      uid: profile.firebaseUid,
      username: profile.handle,
      displayName: profile.displayName || profile.handle,
      avatarUrl: profile.avatarUrl,
    }).catch(() => undefined);
  }, [activeId, profile?.firebaseUid]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, activeId]);

  async function openChat(groupId: string) {
    if (!profile) return;
    setBusy(true);
    setNote(null);
    try {
      await ensureGroupMembership(groupId, {
        uid: profile.firebaseUid,
        username: profile.handle,
        displayName: profile.displayName || profile.handle,
        avatarUrl: profile.avatarUrl,
      });
      setActiveId(groupId);
      selectTab('chat');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo abrir el chat');
    } finally {
      setBusy(false);
    }
  }

  /** Toque en un grupo: miembro → chat; público → unirse; privado → solicitar. */
  async function onGroupTap(group: LiveGroup) {
    if (!profile) return;
    const isMember = mine.some((m) => m.id === group.id);
    if (isMember) {
      await openChat(group.id);
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      if (group.isPublic !== false) {
        await joinGroup(group.id, {
          uid: profile.firebaseUid,
          username: profile.handle,
          displayName: profile.displayName || profile.handle,
          avatarUrl: profile.avatarUrl,
        });
        setActiveId(group.id);
        selectTab('chat');
        setNote('Te uniste al grupo');
        return;
      }
      const result = await requestJoinGroup(group.id, {
        uid: profile.firebaseUid,
        username: profile.handle,
        displayName: profile.displayName || profile.handle,
        avatarUrl: profile.avatarUrl,
      });
      if (result === 'joined' || result === 'already') {
        setActiveId(group.id);
        selectTab('chat');
        return;
      }
      setActiveId(group.id);
      selectTab('chat');
      setNote('Solicitud enviada. El admin debe aceptarte.');
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'No se pudo unir al grupo';
      setNote(
        /permission|insufficient/i.test(raw)
          ? 'Sin permiso. Recarga e inicia sesión de nuevo.'
          : raw,
      );
    } finally {
      setBusy(false);
    }
  }

  async function onCreate() {
    if (!profile) return;
    setBusy(true);
    setNote(null);
    try {
      const id = await createGroup({
        name,
        description,
        ownerUid: profile.firebaseUid,
        ownerUsername: profile.handle,
        ownerDisplayName: profile.displayName || profile.handle,
        ownerAvatarUrl: profile.avatarUrl,
        isPublic: true,
      });
      await ensureGroupMembership(id, {
        uid: profile.firebaseUid,
        username: profile.handle,
        displayName: profile.displayName || profile.handle,
        avatarUrl: profile.avatarUrl,
      });
      setName('');
      setDescription('');
      setActiveId(id);
      selectTab('chat');
      setNote('Grupo creado');
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'No se pudo crear el grupo';
      setNote(
        /permission|insufficient/i.test(raw)
          ? 'Sin permiso para crear el grupo. Cierra sesión y vuelve a entrar.'
          : raw,
      );
    } finally {
      setBusy(false);
    }
  }

  async function onLeave() {
    if (!profile || !activeId) return;
    setBusy(true);
    try {
      await leaveGroup(activeId, profile.firebaseUid);
      setActiveId(null);
      selectTab('mios');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo salir');
    } finally {
      setBusy(false);
    }
  }

  async function onSend(extras?: {
    mediaUrl?: string | null;
    mediaType?: 'image' | null;
    linkUrl?: string | null;
  }) {
    if (!profile || !activeId) return;
    const text = draft;
    if (!text.trim() && !extras?.mediaUrl && !extras?.linkUrl) return;
    setDraft('');
    try {
      await sendGroupMessage(activeId, {
        fromUid: profile.firebaseUid,
        username: profile.handle,
        text,
        ...extras,
      });
    } catch (err) {
      setDraft(text);
      setNote(err instanceof Error ? err.message : 'No se pudo enviar');
    }
  }

  async function onPickCover(file: File | null) {
    if (!file || !activeId || !canManage || !profile) return;
    setBusy(true);
    setNote(null);
    try {
      await ensureGroupMembership(activeId, {
        uid: profile.firebaseUid,
        username: profile.handle,
        displayName: profile.displayName || profile.handle,
      });
      const url = await uploadGroupCover(
        activeId,
        profile.firebaseUid,
        file,
        file.name.split('.').pop() || 'jpg',
      );
      await updateGroupPhoto(activeId, url);
      setMine((list) => list.map((g) => (g.id === activeId ? { ...g, photoUrl: url } : g)));
      setPublicGroups((list) => list.map((g) => (g.id === activeId ? { ...g, photoUrl: url } : g)));
      setNote('Foto del grupo actualizada');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo subir la foto');
    } finally {
      setBusy(false);
    }
  }

  async function onPickChatImage(file: File | null) {
    if (!file || !profile || !activeId) return;
    setBusy(true);
    setNote(null);
    try {
      const url = await uploadGroupChatMedia(activeId, profile.firebaseUid, file, file.name);
      await sendGroupMessage(activeId, {
        fromUid: profile.firebaseUid,
        username: profile.handle,
        text: '📷 Foto',
        mediaUrl: url,
        mediaType: 'image',
      });
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo enviar la foto');
    } finally {
      setBusy(false);
    }
  }

  function onShareLink() {
    const url = window.prompt('Pega un enlace (https://…)');
    if (!url?.trim()) return;
    void onSend({ linkUrl: url.trim() });
  }

  async function onToggleAdmin(member: GroupMember) {
    if (!activeId || !canManage || member.role === 'owner') return;
    setBusy(true);
    setNote(null);
    try {
      const next = member.role === 'admin' ? 'member' : 'admin';
      await setGroupMemberRole(activeId, member.uid, next);
      setNote(next === 'admin' ? `@${member.username} ahora es admin` : `Se quitó admin a @${member.username}`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo cambiar el rol');
    } finally {
      setBusy(false);
    }
  }

  const primaryCats = [
    { id: '', label: 'Todos' },
    { id: 'recomendados', label: 'Recomendados' },
    ...LIVE_CATEGORIES.filter((c) =>
      ['gaming', 'musica', 'deportes', 'arte', 'charla', 'educacion'].includes(c.id),
    ).map((c) => ({
      id: c.id,
      label: c.id === 'charla' ? 'Charlas' : c.id === 'musica' ? 'Música' : c.label,
    })),
    { id: 'negocios', label: 'Negocios' },
  ];

  if (!profile) {
    return (
      <div className="lb-panel rounded-2xl p-6 text-center">
        <p className="text-zinc-300">Inicia sesión para crear o unirte a grupos.</p>
        <Link to="/login" className="mt-3 inline-block text-sm font-semibold text-cyan-400">
          Entrar
        </Link>
      </div>
    );
  }

  return (
    <div className="lb-page mx-auto flex w-full max-w-5xl flex-col gap-5 pb-2">
      <div className="min-w-0 space-y-5">
        <header>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold text-white sm:text-3xl">
                <Users className="text-violet-400" size={26} />
                Grupos
              </h1>
              <p className="mt-1 max-w-lg text-sm text-zinc-400">
                Únete a comunidades, comparte, participa y crece con otros Boomers.
              </p>
            </div>
            <label className="relative w-full sm:max-w-xs">
              <Search
                size={15}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar grupos..."
                className="h-11 w-full rounded-full border border-white/10 bg-[#14151c] pl-10 pr-4 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-cyan-500/50"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(
              [
                ['descubrir', 'Descubrir'],
                ['mios', 'Mis grupos'],
                ['invitaciones', 'Invitaciones'],
                ['crear', 'Crear grupo'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => selectTab(id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                  tab === id
                    ? 'border border-cyan-400/70 bg-cyan-500/10 text-cyan-200 shadow-[0_0_14px_rgba(34,211,238,0.2)]'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {label}
                {id === 'invitaciones' ? (
                  <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[#A855F7] px-1 text-[9px] font-black text-white">
                    0
                  </span>
                ) : null}
              </button>
            ))}
            {activeId ? (
              <button
                type="button"
                onClick={() => selectTab('chat')}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold ${
                  tab === 'chat'
                    ? 'border border-cyan-400/70 bg-cyan-500/10 text-cyan-200'
                    : 'text-zinc-400'
                }`}
              >
                <MessageCircle size={12} /> Chat
              </button>
            ) : null}
          </div>

          {tab === 'descubrir' ? (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {primaryCats.map((cat) => {
                return (
                  <button
                    key={cat.id || 'todos'}
                    type="button"
                    onClick={() => setCategory(cat.id === 'recomendados' ? '' : cat.id)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                      (cat.id === '' && !category) || (cat.id !== '' && cat.id !== 'recomendados' && category === cat.id)
                        ? 'bg-cyan-500 text-white'
                        : cat.id === 'recomendados' && !category
                          ? 'bg-cyan-500 text-white'
                          : 'border border-white/10 bg-[#14151c] text-zinc-400 hover:text-white'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setShowMoreCats((v) => !v)}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-[#14151c] px-3 py-1.5 text-[11px] font-semibold text-zinc-400"
              >
                Más <ChevronDown size={12} className={showMoreCats ? 'rotate-180' : ''} />
              </button>
            </div>
          ) : null}
          {showMoreCats && tab === 'descubrir' ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {LIVE_CATEGORIES.filter(
                (c) => !['gaming', 'musica', 'deportes', 'arte', 'charla', 'educacion'].includes(c.id),
              ).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                    category === c.id ? 'bg-cyan-500/20 text-cyan-200' : 'border border-white/10 text-zinc-500'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          ) : null}
        </header>

        {note ? (
          <p className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-2 text-sm text-fuchsia-200">
            {note}
          </p>
        ) : null}

        {/* Descubrir */}
        {tab === 'descubrir' ? (
          <>
            <section>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-sm font-bold text-white">
                  <Flame size={15} className="text-violet-400" /> Grupos destacados
                </h2>
                <button
                  type="button"
                  onClick={() => featuredRef.current?.scrollBy({ left: 280, behavior: 'smooth' })}
                  className="text-[12px] font-semibold text-cyan-400 hover:underline"
                >
                  Ver todos
                </button>
              </div>
              {featured.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-500">
                  No hay grupos públicos todavía. Crea el primero.
                </p>
              ) : (
                <div className="relative">
                  <div
                    ref={featuredRef}
                    className="gift-row flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {featured.map((g) => {
                      const joined = mine.some((m) => m.id === g.id);
                      const free = g.isPublic !== false;
                      return (
                        <article
                          key={g.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => void onGroupTap(g)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              void onGroupTap(g);
                            }
                          }}
                          className="lb-card w-[13rem] shrink-0 cursor-pointer overflow-hidden rounded-2xl border border-white/[0.08] bg-[#14151c] sm:w-[14rem]"
                        >
                          <div className="flex items-start gap-2.5 p-3 pb-2">
                            <GroupAvatar name={g.name} photoUrl={g.photoUrl} size="xl" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold text-white">{g.name}</p>
                              <p className="text-[11px] font-semibold text-emerald-400">
                                {formatCount(g.memberCount)} miembros
                              </p>
                            </div>
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-400/15 text-amber-300">
                              <Trophy size={14} />
                            </span>
                          </div>
                          <p className="line-clamp-2 px-3 text-[11px] leading-relaxed text-zinc-500">
                            {g.description || 'Comunidad abierta en LiveBoom'}
                          </p>
                          <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                            <MemberStack
                              members={memberPreviews[g.id] || []}
                              total={g.memberCount}
                            />
                            <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                              <Users size={11} />
                              comunidad
                            </span>
                          </div>
                          <div className="px-3 pb-3">
                            <span
                              className={`flex h-8 w-full items-center justify-center rounded-full text-[11px] font-bold ${
                                joined
                                  ? 'border border-cyan-400/40 text-cyan-300'
                                  : JOIN_BTN
                              }`}
                            >
                              {joined ? 'Abrir chat' : free ? 'Unirse' : 'Solicitar'}
                            </span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  {featured.length > 2 ? (
                    <button
                      type="button"
                      aria-label="Más grupos"
                      onClick={() => featuredRef.current?.scrollBy({ left: 280, behavior: 'smooth' })}
                      className="absolute -right-1 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-zinc-900/95 text-white md:grid"
                    >
                      <ChevronRight size={18} />
                    </button>
                  ) : null}
                </div>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-sm font-bold text-white">
                  <Sparkles size={15} className="text-violet-400" /> Grupos populares
                </h2>
                <span className="text-[12px] font-semibold text-cyan-400">Ver todos</span>
              </div>
              <ul className="space-y-2">
                {popular.map((g, i) => {
                  const joined = mine.some((m) => m.id === g.id);
                  const free = g.isPublic !== false;
                  return (
                    <li
                      key={`pop-${g.id}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => void onGroupTap(g)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          void onGroupTap(g);
                        }
                      }}
                      className="lb-card flex cursor-pointer flex-wrap items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#14151c] px-3 py-3 sm:flex-nowrap"
                    >
                      <span className="w-5 text-lg font-black text-zinc-600">{i + 1}</span>
                      <div className="relative shrink-0">
                        <GroupAvatar name={g.name} photoUrl={g.photoUrl} size="xl" />
                        {i < 3 ? (
                          <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-md bg-amber-400 text-[8px] text-zinc-950">
                            <Trophy size={9} />
                          </span>
                        ) : (
                          <BadgeCheck
                            size={14}
                            className="absolute -bottom-0.5 -right-0.5 text-sky-400"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-white">{g.name}</p>
                        <p className="text-[11px] font-semibold text-emerald-400">
                          {formatCount(g.memberCount)} miembros
                          {!free ? ' · Privado' : ''}
                        </p>
                      </div>
                      <p className="hidden min-w-0 flex-[1.2] truncate text-[11px] text-zinc-500 md:block">
                        {g.description || 'Comunidad LiveBoom'}
                      </p>
                      <div className="hidden sm:block">
                        <MemberStack
                          members={memberPreviews[g.id] || []}
                          total={g.memberCount}
                        />
                      </div>
                      <span
                        className={`ml-auto h-8 shrink-0 rounded-full px-3.5 text-[11px] font-bold leading-8 ${
                          joined
                            ? 'border border-cyan-400/40 text-cyan-300'
                            : JOIN_BTN
                        }`}
                      >
                        {joined ? 'Abrir chat' : free ? 'Unirse' : 'Solicitar'}
                      </span>
                    </li>
                  );
                })}
                {popular.length === 0 ? (
                  <li className="py-6 text-center text-sm text-zinc-500">Sin grupos aún.</li>
                ) : null}
              </ul>
            </section>
          </>
        ) : null}

        {tab === 'mios' ? (
          <section className="rounded-2xl border border-white/[0.08] bg-[#14151c] p-4">
            {mine.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-500">
                Aún no perteneces a ningún grupo.{' '}
                <button
                  type="button"
                  onClick={() => selectTab('descubrir')}
                  className="text-cyan-400 underline"
                >
                  Descubre uno
                </button>
              </p>
            ) : (
              <ul className="space-y-2">
                {mine.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void openChat(g.id)}
                      className="lb-card flex w-full items-center gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-3 text-left hover:border-cyan-400/30"
                    >
                      <GroupAvatar name={g.name} photoUrl={g.photoUrl} size="lg" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-white">{g.name}</span>
                        <span className="text-[11px] text-zinc-500">
                          {formatCount(g.memberCount)} miembros
                        </span>
                      </span>
                      <MessageCircle size={16} className="text-cyan-400" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {tab === 'invitaciones' ? (
          <section className="rounded-2xl border border-dashed border-white/10 px-4 py-12 text-center">
            <p className="text-sm text-zinc-400">No tienes invitaciones pendientes.</p>
            <p className="mt-1 text-xs text-zinc-600">Cuando alguien te invite a un grupo, aparecerá aquí.</p>
          </section>
        ) : null}

        {tab === 'crear' ? (
          <section className="space-y-3 rounded-2xl border border-white/[0.08] bg-[#14151c] p-4 sm:p-5">
            <p className="text-sm font-semibold text-white">Crear tu grupo público</p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del grupo"
              maxLength={48}
              className="h-11 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm text-white outline-none focus:border-cyan-500"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción (opcional)"
              rows={3}
              maxLength={280}
              className="w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
            />
            <button
              type="button"
              disabled={busy || name.trim().length < 3}
              onClick={() => void onCreate()}
              className={`h-11 w-full rounded-full text-sm font-bold disabled:opacity-50 ${JOIN_BTN}`}
            >
              {busy ? 'Creando…' : 'Crear grupo'}
            </button>
          </section>
        ) : null}

        {tab === 'chat' ? (
          <section className="flex h-[min(78dvh,42rem)] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#14151c]">
            {!active ? (
              <div className="grid flex-1 place-items-center p-6 text-center text-sm text-zinc-500">
                Elige un grupo en Mis grupos o únete desde Descubrir.
              </div>
            ) : (
              <>
                <header className="flex items-start justify-between gap-2 border-b border-white/10 p-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <GroupAvatar name={active.name} photoUrl={active.photoUrl} size="sm" />
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-bold text-white">{active.name}</h2>
                      <p className="truncate text-xs text-zinc-400">
                        {active.description || `${members.length} miembros`}
                        {myRole ? ` · ${roleLabel(myRole)}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => setSettingsOpen((v) => !v)}
                        className={`grid h-9 w-9 place-items-center rounded-lg border border-white/15 ${
                          settingsOpen ? 'bg-violet-500/20 text-violet-200' : 'text-zinc-300'
                        }`}
                        aria-label="Configurar grupo"
                        title="Configurar grupo"
                      >
                        <Settings size={16} />
                      </button>
                    ) : null}
                    {isMember && active.ownerUid !== profile.firebaseUid ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onLeave()}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2 py-1 text-[11px] text-zinc-300"
                      >
                        <LogOut size={12} /> Salir
                      </button>
                    ) : null}
                  </div>
                </header>

                {settingsOpen && canManage ? (
                  <div className="max-h-[40%] space-y-3 overflow-y-auto border-b border-white/10 bg-zinc-950/50 p-3">
                    <div className="flex items-center gap-2.5">
                      <GroupAvatar name={active.name} photoUrl={active.photoUrl} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-white">Foto del grupo</p>
                        <p className="text-[10px] text-zinc-500">Visible en listas y chat.</p>
                        <input
                          ref={coverInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            void onPickCover(e.target.files?.[0] || null);
                            e.target.value = '';
                          }}
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => coverInputRef.current?.click()}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-cyan-400/50 px-3 py-1.5 text-[11px] font-bold text-cyan-300"
                        >
                          <ImageIcon size={12} /> Cambiar foto
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-white">
                        <Shield size={13} className="text-violet-300" /> Administradores
                      </p>
                      <p className="mb-2 text-[11px] text-zinc-500">
                        Delega a otros miembros para que ayuden a gestionar el grupo.
                      </p>
                      <ul className="space-y-2">
                        {members.map((m) => (
                          <li
                            key={m.uid}
                            className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-[#14151c] px-2.5 py-2"
                          >
                            <ProfileAvatar
                              url={m.avatarUrl}
                              name={m.displayName || m.username}
                              size={36}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-semibold text-white">
                                {m.displayName || m.username}
                              </span>
                              <span className="text-[10px] text-zinc-500">
                                @{m.username} · {roleLabel(m.role)}
                              </span>
                            </span>
                            {m.role === 'owner' ? (
                              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-200">
                                Dueño
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void onToggleAdmin(m)}
                                className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                                  m.role === 'admin'
                                    ? 'border border-zinc-600 text-zinc-400'
                                    : 'border border-violet-400/50 text-violet-200'
                                }`}
                              >
                                {m.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}

                {!isMember ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
                    <p className="text-center text-sm text-zinc-400">
                      {active.isPublic !== false
                        ? 'Únete para ver el chat y participar.'
                        : 'Este grupo es privado. Solicita unirte al administrador.'}
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onGroupTap(active)}
                      className={`min-h-10 rounded-full px-5 text-sm font-bold ${JOIN_BTN}`}
                    >
                      {active.isPublic !== false ? 'Unirme al grupo' : 'Solicitar unirme'}
                    </button>
                  </div>
                ) : (
                  <>
                    <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                      {messages.length === 0 ? (
                        <p className="py-8 text-center text-xs text-zinc-500">Sin mensajes. Di hola 👋</p>
                      ) : (
                        messages.map((msg) => {
                          const mineMsg = msg.fromUid === profile.firebaseUid;
                          return (
                            <div
                              key={msg.id}
                              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                                mineMsg
                                  ? 'ml-auto bg-gradient-to-br from-violet-600/80 to-fuchsia-600/70 text-white'
                                  : 'bg-zinc-800 text-zinc-100'
                              }`}
                            >
                              {!mineMsg ? (
                                <p className="text-[10px] font-semibold text-cyan-300">@{msg.username}</p>
                              ) : null}
                              {msg.mediaType === 'image' && msg.mediaUrl ? (
                                <a href={msg.mediaUrl} target="_blank" rel="noreferrer">
                                  <img
                                    src={msg.mediaUrl}
                                    alt=""
                                    className="mb-1 max-h-52 w-full rounded-xl object-cover"
                                  />
                                </a>
                              ) : null}
                              {msg.linkUrl ? (
                                <a
                                  href={msg.linkUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mb-1 block break-all text-xs underline opacity-90"
                                >
                                  {msg.linkUrl}
                                </a>
                              ) : null}
                              {msg.text && msg.text !== '📷 Foto' && msg.text !== '🔗 Enlace' ? (
                                <p className="whitespace-pre-wrap break-words">
                                  <EmojiText text={msg.text} size={CHAT_EMOJI_SIZE} />
                                </p>
                              ) : msg.text === '📷 Foto' && !msg.mediaUrl ? (
                                <p>{msg.text}</p>
                              ) : null}
                            </div>
                          );
                        })
                      )}
                    </div>

                    <form
                      className="flex items-center gap-1 border-t border-white/10 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void onSend();
                      }}
                    >
                      <input
                        ref={chatImageRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          void onPickChatImage(e.target.files?.[0] || null);
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => chatImageRef.current?.click()}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-zinc-400 hover:bg-white/5 hover:text-cyan-300"
                        aria-label="Enviar foto"
                        title="Enviar foto"
                      >
                        <Paperclip size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={onShareLink}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-zinc-400 hover:bg-white/5 hover:text-cyan-300"
                        aria-label="Compartir enlace"
                        title="Compartir enlace"
                      >
                        <Link2 size={18} />
                      </button>
                      <EmojiInput
                        value={draft}
                        onChange={setDraft}
                        placeholder="Escribe en el grupo…"
                        emojiSize={CHAT_EMOJI_SIZE}
                        fieldClassName="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-950 focus-within:border-cyan-500"
                        mirrorTextClassName="text-white"
                      />
                      <EmojiPickerButton
                        placement="above"
                        onPick={(id) => setDraft((d) => insertEmojiToken(d, id))}
                      />
                      <button
                        type="submit"
                        disabled={busy || !draft.trim()}
                        className="grid h-11 w-11 place-items-center rounded-xl bg-cyan-400 text-zinc-950 disabled:opacity-50"
                        aria-label="Enviar"
                      >
                        <Send size={16} />
                      </button>
                    </form>
                  </>
                )}
              </>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}

