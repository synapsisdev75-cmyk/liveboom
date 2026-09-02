import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Ban, LogOut, MessageCircle, Share2 } from 'lucide-react';
import { ActivityHistory } from '../components/live/ActivityHistory';
import { ReelFeedViewer, type ReelFeedItem } from '../components/feed/ReelFeedViewer';
import { CreatePostModal } from '../components/social/CreatePostModal';
import { FriendRequestButton, type FriendshipStatus } from '../components/social/FriendRequestButton';
import {
  FollowButton,
  FollowListModal,
  PostCard,
  type SocialPost,
} from '../components/social/SocialPostCard';
import { ageFromIsoDate } from '../lib/birthDate';
import { LevelAvatarFrame } from '../components/profile/LevelAvatarFrame';
import { LevelInsignia } from '../components/profile/LevelInsignia';
import { levelFromXp, nextTierFromXp, xpProgressInTier, xpToNextLevel } from '../lib/userLevels';
import {
  blockUser,
  deletePost as deleteFsPost,
  getFriendshipStatusByUid,
  getPostById,
  isFollowingUid,
  listenFollowers,
  listenFollowing,
  listenFriends,
  listenPostsByUsername,
  listFollowers,
  listFollowing,
  listFriends,
  unblockUser,
  updatePostVisibility,
} from '../lib/socialFirestore';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import type { PublicFsUser } from '../lib/profileFirestore';
import { isBoomClipPost, isPublicationPost } from '../lib/contentType';
import { isStoryPost } from '../lib/storyLifecycle';
import { BOOM_CLIP_LABEL } from '../lib/brand';

function LogoutProfileButton() {
  const logout = useAuthStore((state) => state.logout);
  return (
    <button
      type="button"
      onClick={() => void logout()}
      className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-400/40 bg-fuchsia-500/10 px-4 py-2 text-sm font-semibold text-fuchsia-200"
    >
      <LogOut size={16} />
      Cerrar sesión
    </button>
  );
}

type PublicProfile = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  uid: string;
  levelXp: number;
  followersCount: number;
  followingCount: number;
  friendsCount: number;
  isFollowing: boolean;
  isOwnProfile: boolean;
  friendshipStatus: FriendshipStatus;
};

type UserChip = {
  uid?: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

function postToReel(post: SocialPost): ReelFeedItem {
  return {
    id: post.id,
    username: post.authorUsername,
    authorUid: post.authorUid ?? '',
    caption: post.caption || 'Video',
    mediaUrl: post.mediaUrl ?? '',
    mediaType: 'video',
  };
}

export function UserProfileView() {
  const { username: usernameParam } = useParams();
  const [searchParams] = useSearchParams();
  const username = usernameParam
    ? decodeURIComponent(usernameParam).trim().replace(/^@/, '')
    : '';
  const uidHint = searchParams.get('uid')?.trim() || '';
  const postHint = searchParams.get('post')?.trim() || '';
  const crearParam = searchParams.get('crear')?.trim().toLowerCase() || '';
  const autoOpenCreate = ['1', 'historia', 'video', 'foto', 'texto'].includes(crearParam);
  const defaultVideoMode =
    crearParam === 'historia' ? ('story' as const) : crearParam === 'video' ? ('post' as const) : undefined;
  const defaultCreateKind =
    crearParam === 'foto' ? ('photo' as const) : crearParam === 'texto' ? ('text' as const) : undefined;
  const profile = useAuthStore((state) => state.profile);
  const ready = useAuthStore((state) => state.ready);
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [followers, setFollowers] = useState<UserChip[]>([]);
  const [following, setFollowing] = useState<UserChip[]>([]);
  const [friends, setFriends] = useState<UserChip[]>([]);
  const [modal, setModal] = useState<'followers' | 'following' | 'friends' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [expandVideoId, setExpandVideoId] = useState<string | null>(postHint || null);
  const [expandPhotoId, setExpandPhotoId] = useState<string | null>(postHint || null);
  const [feedTab, setFeedTab] = useState<'posts' | 'clips' | 'photos'>('posts');
  const highlightPostRef = useRef<HTMLDivElement | null>(null);
  const setToast = useUiStore((s) => s.setToast);

  const filteredPosts = useMemo(() => {
    const withoutStories = posts.filter((post) => !isStoryPost(post as never));
    if (feedTab === 'clips') {
      return withoutStories.filter((post) =>
        isBoomClipPost({
          type: post.type,
          mediaUrl: post.mediaUrl,
          visibility: post.visibility,
          postFormat: post.postFormat,
          durationSec: post.durationSec,
          reelFeedUntilMs: post.reelFeedUntilMs,
        }),
      );
    }
    if (feedTab === 'photos') {
      return withoutStories.filter(
        (post) =>
          post.type === 'photo' &&
          isPublicationPost({
            type: post.type,
            mediaUrl: post.mediaUrl,
            visibility: post.visibility,
            postFormat: post.postFormat,
            durationSec: post.durationSec,
            reelFeedUntilMs: post.reelFeedUntilMs,
          }),
      );
    }
    return withoutStories.filter((post) =>
      isPublicationPost({
        type: post.type,
        mediaUrl: post.mediaUrl,
        visibility: post.visibility,
        postFormat: post.postFormat,
        durationSec: post.durationSec,
        reelFeedUntilMs: post.reelFeedUntilMs,
      }),
    );
  }, [posts, feedTab]);

  const profileVideoPosts = useMemo(() => {
    return filteredPosts.filter((post) => post.type === 'video' && post.mediaUrl);
  }, [filteredPosts]);

  const profileViewerIndex = expandVideoId
    ? profileVideoPosts.findIndex((post) => post.id === expandVideoId)
    : -1;

  useEffect(() => {
    const postId = searchParams.get('post')?.trim();
    if (!postId) return;
    setExpandVideoId(postId);
    setExpandPhotoId(postId);
  }, [searchParams]);

  useEffect(() => {
    if (!postHint) return;
    void getPostById(postHint).then((post) => {
      if (!post) return;
      if (post.type === 'video' && isBoomClipPost(post)) setFeedTab('clips');
      else if (post.type === 'photo') setFeedTab('photos');
      else setFeedTab('posts');
    });
  }, [postHint]);

  useEffect(() => {
    if (!postHint) return;
    const timer = window.setTimeout(() => {
      highlightPostRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [postHint, posts.length, feedTab]);

  useEffect(() => {
    if (!username && !uidHint) return;
    let cancelled = false;

    async function load() {
      try {
        const { fetchPublicUserByUid, fetchPublicUserByUsername } = await import(
          '../lib/profileFirestore'
        );
        let fsUser = uidHint ? await fetchPublicUserByUid(uidHint) : null;
        if (!fsUser && username) {
          fsUser = await fetchPublicUserByUsername(username);
        }
        if (!fsUser && profile) {
          const friends = await listFriends(profile.firebaseUid);
          const needle = username.toLowerCase();
          const match = friends.find(
            (friend) =>
              (uidHint && friend.uid === uidHint) ||
              friend.username.toLowerCase() === needle ||
              friend.displayName.toLowerCase() === needle,
          );
          if (match) {
            fsUser = (await fetchPublicUserByUid(match.uid)) ?? {
                id: match.uid,
                firebaseUid: match.uid,
                username: match.username || username,
                email: '',
                displayName: match.displayName || match.username || username,
                avatarUrl: match.avatarUrl,
                bio: null,
                birthDate: null,
                category: null,
                coinsBalance: 0,
                levelXp: 0,
              } satisfies PublicFsUser;
          }
        }
        if (fsUser) {
          let friendshipStatus: FriendshipStatus = 'none';
          let followingNow = false;
          if (profile) {
            friendshipStatus = await getFriendshipStatusByUid(
              profile.firebaseUid,
              fsUser.firebaseUid,
            );
            if (friendshipStatus !== 'self') {
              followingNow = await isFollowingUid(profile.firebaseUid, fsUser.firebaseUid);
            }
          }
          if (!cancelled) {
            setPublicProfile({
              uid: fsUser.firebaseUid,
              username: fsUser.username,
              displayName: fsUser.displayName,
              avatarUrl: fsUser.avatarUrl,
              bio: fsUser.bio,
              levelXp: Number(fsUser.levelXp ?? 0),
              followersCount: 0,
              followingCount: 0,
              friendsCount: 0,
              isFollowing: followingNow,
              isOwnProfile: Boolean(profile && profile.firebaseUid === fsUser.firebaseUid),
              friendshipStatus,
            });
            setError(null);
          }
        } else if (profile && profile.handle.toLowerCase() === username.toLowerCase()) {
          if (!cancelled) {
            setPublicProfile({
              uid: profile.firebaseUid,
              username: profile.handle,
              displayName: profile.displayName,
              avatarUrl: profile.avatarUrl,
              bio: profile.bio,
              levelXp: Number(profile.levelXp ?? 0),
              followersCount: 0,
              followingCount: 0,
              friendsCount: 0,
              isFollowing: false,
              isOwnProfile: true,
              friendshipStatus: 'self',
            });
            setError(null);
          }
        } else {
          throw new Error('Usuario no encontrado');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el perfil');
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [username, uidHint, profile?.firebaseUid]);

  useEffect(() => {
    if (!publicProfile) return;
    const handle = publicProfile.username;
    const viewerUid = profile?.firebaseUid;
    const isOwner = Boolean(viewerUid && viewerUid === publicProfile.uid);
    const isFriend = publicProfile.friendshipStatus === 'friends';
    return listenPostsByUsername(
      handle,
      (list) => {
        setLibraryError(null);
        setPosts(
          list.map((item) => ({
            id: item.id,
            authorUid: item.authorUid,
            authorUsername: item.username,
            type: item.type,
            caption: item.caption,
            mediaUrl: item.mediaUrl,
            visibility: item.visibility,
            createdAt: item.createdAt,
            likes: item.likes,
            dislikes: 0,
            viewerReaction: null,
            postFormat: item.postFormat,
            durationSec: item.durationSec,
            reelFeedUntilMs: item.reelFeedUntilMs,
          })),
        );
      },
      viewerUid
        ? { uid: viewerUid, isFriend, isOwner, profileUid: publicProfile.uid }
        : null,
    );
  }, [publicProfile?.username, publicProfile?.uid, publicProfile?.friendshipStatus, profile?.firebaseUid]);
  useEffect(() => {
    if (!publicProfile?.uid) return;
    const unsubFriends = listenFriends(publicProfile.uid, (list) => {
      setFriends(list);
      setPublicProfile((current) =>
        current ? { ...current, friendsCount: list.length } : current,
      );
    });
    const unsubFollowers = listenFollowers(publicProfile.uid, (list) => {
      setFollowers(list);
      setPublicProfile((current) =>
        current ? { ...current, followersCount: list.length } : current,
      );
    });
    const unsubFollowing = listenFollowing(publicProfile.uid, (list) => {
      setFollowing(list);
      setPublicProfile((current) =>
        current ? { ...current, followingCount: list.length } : current,
      );
    });
    return () => {
      unsubFriends();
      unsubFollowers();
      unsubFollowing();
    };
  }, [publicProfile?.uid]);

  async function openFollowers() {
    if (!publicProfile) return;
    setFollowers(await listFollowers(publicProfile.uid));
    setModal('followers');
  }

  async function openFollowing() {
    if (!publicProfile) return;
    setFollowing(await listFollowing(publicProfile.uid));
    setModal('following');
  }

  async function openFriends() {
    if (!publicProfile) return;
    setFriends(await listFriends(publicProfile.uid));
    setModal('friends');
  }

  async function deletePost(postId: string) {
    if (!profile) return;
    if (!window.confirm('¿Estás seguro de borrar esta publicación? Esta acción no se puede deshacer.')) {
      return;
    }
    try {
      await deleteFsPost(postId, profile.firebaseUid);
      setPosts((current) => current.filter((item) => item.id !== postId));
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : 'No se pudo eliminar la publicación');
    }
  }

  if (!ready) {
    return <div className="p-6 text-sm text-zinc-400">Cargando perfil…</div>;
  }
  if (!username) {
    return <Navigate to="/" replace />;
  }
  if (error) {
    const lookingAtSelf =
      Boolean(profile) && profile!.handle.toLowerCase() === username.toLowerCase();
    if (lookingAtSelf) {
      return <Navigate to="/perfil/editar?completar=1" replace />;
    }
    return (
      <div className="rounded-2xl bg-zinc-900 p-6 text-center">
        <p className="text-fuchsia-400">No encontramos este perfil todavía.</p>
        <p className="mt-2 text-xs text-zinc-500">
          Si acaba de entrar con Google, pídele que abra LiveBoom una vez más. Luego vuelve a buscarlo.
        </p>
        <Link to="/" className="mt-3 inline-block text-sm text-cyan-400">
          Volver al inicio
        </Link>
      </div>
    );
  }
  if (!publicProfile) {
    return <div className="p-6 text-sm text-zinc-400">Cargando biblioteca…</div>;
  }

  return (
    <div className="lb-page mx-auto w-full max-w-3xl space-y-4 pb-2">
      <section className="lb-panel relative overflow-hidden rounded-3xl p-4 sm:p-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="relative shrink-0">
            <LevelAvatarFrame
              levelXp={publicProfile.levelXp}
              avatarUrl={publicProfile.avatarUrl}
              fallbackLetter={publicProfile.username}
              size="2xl"
            />
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-white sm:text-2xl">
                  {publicProfile.displayName !== publicProfile.username
                    ? publicProfile.displayName
                    : null}
                  <span
                    className={
                      publicProfile.displayName !== publicProfile.username
                        ? 'mt-0.5 block text-base font-medium text-zinc-400'
                        : ''
                    }
                  >
                    @{publicProfile.username}
                  </span>
                </h1>
                {(() => {
                  const info = levelFromXp(publicProfile.levelXp);
                  const progress = xpProgressInTier(publicProfile.levelXp);
                  const remaining = xpToNextLevel(publicProfile.levelXp);
                  const next = nextTierFromXp(publicProfile.levelXp);
                  return (
                    <div className="mt-3">
                      <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                        <span className="font-semibold text-cyan-300">{info.title}</span>
                        <span className="text-[10px] text-zinc-500">· {info.rangeLabel}</span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-zinc-400">
                        <span>{publicProfile.levelXp.toLocaleString('es-CO')} XP</span>
                        <span>
                          {next
                            ? `${remaining.toLocaleString('es-CO')} XP para ${next.title}`
                            : 'Nivel máximo PRO'}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-400 transition-[width] duration-500"
                          style={{ width: `${progress.pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="shrink-0 self-center sm:self-start">
                <LevelInsignia levelXp={publicProfile.levelXp} />
              </div>
            </div>
            {publicProfile.isOwnProfile && profile?.birthDate ? (
              <p className="mt-2 text-xs text-cyan-400">{ageFromIsoDate(profile.birthDate)} años</p>
            ) : null}
            {publicProfile.bio ? <p className="mt-2 text-sm text-zinc-400">{publicProfile.bio}</p> : null}
            <div className="mt-4 flex flex-wrap justify-center gap-4 sm:justify-start">
              <button
                type="button"
                onClick={() => void openFollowers()}
                className="text-sm text-white hover:text-cyan-300"
              >
                <strong>{publicProfile.followersCount}</strong>{' '}
                <span className="text-zinc-400">Seguidores</span>
              </button>
              <button
                type="button"
                onClick={() => void openFollowing()}
                className="text-sm text-white hover:text-cyan-300"
              >
                <strong>{publicProfile.followingCount}</strong>{' '}
                <span className="text-zinc-400">Siguiendo</span>
              </button>
              <button
                type="button"
                onClick={() => void openFriends()}
                className="text-sm text-white hover:text-cyan-300"
              >
                <strong>{publicProfile.friendsCount}</strong>{' '}
                <span className="text-zinc-400">Amigos</span>
              </button>
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
              {publicProfile.isOwnProfile ? (
                <>
                  <Link
                    to="/perfil/editar"
                    className="lb-gradient-btn rounded-full px-4 py-2 text-sm font-bold text-white"
                  >
                    Editar perfil
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${window.location.origin}/u/${encodeURIComponent(publicProfile.username)}`;
                      void navigator.clipboard?.writeText(url).catch(() => undefined);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-200"
                  >
                    <Share2 size={16} />
                    Compartir perfil
                  </button>
                  <LogoutProfileButton />
                </>
              ) : publicProfile.friendshipStatus === 'blocked' ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!profile) return;
                    void unblockUser(profile.firebaseUid, publicProfile.uid).then(() => {
                      setPublicProfile((current) =>
                        current ? { ...current, friendshipStatus: 'none' } : current,
                      );
                    });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200"
                >
                  <Ban size={16} />
                  Desbloquear
                </button>
              ) : (
                <>
                  <FollowButton
                    username={publicProfile.username}
                    targetUid={publicProfile.uid}
                    targetHint={{
                      uid: publicProfile.uid,
                      username: publicProfile.username,
                      displayName: publicProfile.displayName,
                      avatarUrl: publicProfile.avatarUrl,
                    }}
                    initialFollowing={publicProfile.isFollowing}
                    isOwnProfile={publicProfile.isOwnProfile}
                    onChange={(followingNow) =>
                      setPublicProfile((current) => {
                        if (!current || current.isFollowing === followingNow) return current;
                        return {
                          ...current,
                          isFollowing: followingNow,
                          followersCount: Math.max(
                            0,
                            current.followersCount + (followingNow ? 1 : -1),
                          ),
                        };
                      })
                    }
                  />
                  {publicProfile.friendshipStatus === 'friends' ? (
                    <Link
                      to={`/mensajes?con=${encodeURIComponent(publicProfile.username)}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-300 ring-1 ring-cyan-400/30"
                    >
                      <MessageCircle size={16} />
                      Mensaje
                    </Link>
                  ) : (
                    <FriendRequestButton
                      username={publicProfile.username}
                      uid={publicProfile.uid}
                      initialStatus={publicProfile.friendshipStatus}
                      isOwnProfile={publicProfile.isOwnProfile}
                      onChange={(status) =>
                        setPublicProfile((current) =>
                          current
                            ? {
                                ...current,
                                friendshipStatus: status,
                                friendsCount:
                                  status === 'friends'
                                    ? current.friendsCount + 1
                                    : status === 'none'
                                      ? Math.max(0, current.friendsCount - 1)
                                      : current.friendsCount,
                              }
                            : current,
                        )
                      }
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (!profile) return;
                      const ok = window.confirm(
                        `¿Bloquear a @${publicProfile.username}? Dejarán de ser amigos y no podrán enviarte mensajes.`,
                      );
                      if (!ok) return;
                      void blockUser(
                        {
                          firebaseUid: profile.firebaseUid,
                          handle: profile.handle,
                          displayName: profile.displayName,
                          avatarUrl: profile.avatarUrl,
                        },
                        {
                          uid: publicProfile.uid,
                          username: publicProfile.username,
                          displayName: publicProfile.displayName,
                          avatarUrl: publicProfile.avatarUrl,
                        },
                      ).then(() => {
                        setPublicProfile((current) =>
                          current
                            ? { ...current, friendshipStatus: 'blocked', isFollowing: false }
                            : current,
                        );
                      });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/10"
                  >
                    <Ban size={16} />
                    Bloquear usuario
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {publicProfile.isOwnProfile ? (
        <ActivityHistory username={publicProfile.username} limit={2} showAllLink />
      ) : null}

      <section className="lb-panel rounded-3xl p-4 sm:p-6">
        {publicProfile.isOwnProfile ? (
          <CreatePostModal
            variant="inline"
            hideTrigger
            username={publicProfile.username}
            autoOpen={autoOpenCreate}
            defaultVideoMode={defaultVideoMode}
            defaultKind={defaultCreateKind}
            onCreated={(post) => {
              setLibraryError(null);
              setPosts((current) => [post, ...current.filter((item) => item.id !== post.id)]);
              const isClip = isBoomClipPost({
                type: post.type,
                mediaUrl: post.mediaUrl,
                visibility: post.visibility,
                postFormat: post.postFormat,
                durationSec: post.durationSec,
              });
              if (isClip) {
                setToast(`${BOOM_CLIP_LABEL} publicado`, 'success');
                return;
              }
              setToast('Publicación lista', 'success');
              if (post.type === 'video') setExpandVideoId(post.id);
              if (post.type === 'photo') setExpandPhotoId(post.id);
            }}
          />
        ) : null}
        <div className={`flex flex-wrap items-center gap-3 ${publicProfile.isOwnProfile ? 'mb-3' : 'mb-4'}`}>
          <div className="flex flex-wrap gap-1 rounded-full border border-white/10 bg-black/20 p-1">
            {(
              [
                { id: 'posts' as const, label: 'Publicaciones' },
                { id: 'clips' as const, label: 'Boom Clips' },
                { id: 'photos' as const, label: 'Fotos' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFeedTab(tab.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  feedTab === tab.id
                    ? 'bg-gradient-to-r from-fuchsia-500 to-cyan-400 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        {libraryError ? <p className="mb-3 text-sm text-fuchsia-400">{libraryError}</p> : null}
        {(() => {
          if (filteredPosts.length === 0) {
            return (
              <p className="text-sm text-zinc-500">
                {profile
                  ? 'Sin contenido en esta pestaña todavía.'
                  : 'Inicia sesión para ver las publicaciones públicas de esta cuenta.'}
              </p>
            );
          }
          return (
            <div className="flex flex-col gap-3">
              {filteredPosts.map((post) => (
                <div
                  key={post.id}
                  ref={post.id === postHint ? highlightPostRef : undefined}
                >
                  <PostCard
                  post={post}
                  canDelete={publicProfile.isOwnProfile}
                  canChangeVisibility={publicProfile.isOwnProfile}
                  startVideoExpanded={expandVideoId === post.id}
                  onCloseVideoExpand={() => setExpandVideoId(null)}
                  onVideoExpand={
                    post.type === 'video' && post.mediaUrl
                      ? () => setExpandVideoId(post.id)
                      : undefined
                  }
                  startPhotoExpanded={expandPhotoId === post.id}
                  onClosePhotoExpand={() => setExpandPhotoId(null)}
                  onDelete={() => void deletePost(post.id)}
                  onChangeVisibility={(visibility) => {
                    if (!profile) return;
                    void updatePostVisibility(post.id, profile.firebaseUid, visibility)
                      .then(() => {
                        setLibraryError(null);
                        setPosts((current) =>
                          current.map((item) => (item.id === post.id ? { ...item, visibility } : item)),
                        );
                      })
                      .catch((err) => {
                        setLibraryError(
                          err instanceof Error ? err.message : 'No se pudo guardar la privacidad',
                        );
                      });
                  }}
                  onReact={(updated) =>
                    setPosts((current) =>
                      current.map((item) => (item.id === updated.id ? updated : item)),
                    )
                  }
                />
                </div>
              ))}
            </div>
          );
        })()}
      </section>

      {modal === 'followers' ? (
        <FollowListModal title="Seguidores" users={followers} onClose={() => setModal(null)} />
      ) : null}
      {modal === 'following' ? (
        <FollowListModal title="Seguidos" users={following} onClose={() => setModal(null)} />
      ) : null}
      {modal === 'friends' ? (
        <FollowListModal title="Amigos" users={friends} onClose={() => setModal(null)} />
      ) : null}

      {profileViewerIndex >= 0 ? (
        <ReelFeedViewer
          reels={profileVideoPosts.map(postToReel)}
          initialIndex={profileViewerIndex}
          onClose={() => setExpandVideoId(null)}
        />
      ) : null}
    </div>
  );
}
