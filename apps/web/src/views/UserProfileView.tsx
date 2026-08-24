import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { CreatePostModal } from '../components/social/CreatePostModal';
import { FriendRequestButton, type FriendshipStatus } from '../components/social/FriendRequestButton';
import { FriendRequestsPanel } from '../components/social/FriendRequestsPanel';
import {
  FollowButton,
  FollowListModal,
  PostCard,
  type SocialPost,
} from '../components/social/SocialPostCard';
import { UserSearchBar } from '../components/social/UserSearchBar';
import { ageFromIsoDate } from '../lib/birthDate';
import { deletePost as deleteFsPost, getFriendshipStatus, isFollowing, listenFollowers, listenFollowing, listenFriends, listenPostsByUsername, listFollowers, listFollowing, listFriends } from '../lib/socialFirestore';
import { useAuthStore } from '../store/authStore';

type PublicProfile = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  uid: string;
  followersCount: number;
  followingCount: number;
  friendsCount: number;
  isFollowing: boolean;
  isOwnProfile: boolean;
  friendshipStatus: FriendshipStatus;
};

type UserChip = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export function UserProfileView() {
  const { username: usernameParam } = useParams();
  const username = usernameParam ? decodeURIComponent(usernameParam) : '';
  const profile = useAuthStore((state) => state.profile);
  const ready = useAuthStore((state) => state.ready);
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [followers, setFollowers] = useState<UserChip[]>([]);
  const [following, setFollowing] = useState<UserChip[]>([]);
  const [friends, setFriends] = useState<UserChip[]>([]);
  const [modal, setModal] = useState<'followers' | 'following' | 'friends' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;

    async function load() {
      try {
        const { fetchPublicUserByUsername } = await import('../lib/profileFirestore');
        const fsUser = await fetchPublicUserByUsername(username);
        if (fsUser) {
          let friendshipStatus: FriendshipStatus = 'none';
          let followingNow = false;
          if (profile) {
            friendshipStatus =
              profile.firebaseUid === fsUser.firebaseUid
                ? 'self'
                : await getFriendshipStatus(profile.firebaseUid, fsUser.username);
            if (friendshipStatus !== 'self') {
              followingNow = await isFollowing(profile.firebaseUid, fsUser.username);
            }
          }
          if (!cancelled) {
            setPublicProfile({
              uid: fsUser.firebaseUid,
              username: fsUser.username,
              displayName: fsUser.displayName,
              avatarUrl: fsUser.avatarUrl,
              bio: fsUser.bio,
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
  }, [username, profile?.firebaseUid]);

  useEffect(() => {
    if (!username || !publicProfile) return;
    const viewerUid = profile?.firebaseUid;
    const isOwner = Boolean(viewerUid && viewerUid === publicProfile.uid);
    const isFriend = publicProfile.friendshipStatus === 'friends';
    return listenPostsByUsername(
      username,
      (list) => {
        setPosts(
          list.map((item) => ({
            id: item.id,
            authorUsername: item.username,
            type: item.type,
            caption: item.caption,
            mediaUrl: item.mediaUrl,
            visibility: item.visibility,
            createdAt: item.createdAt,
            likes: item.likes,
            dislikes: 0,
            viewerReaction: null,
          })),
        );
      },
      viewerUid
        ? { uid: viewerUid, isFriend, isOwner }
        : null,
    );
  }, [username, publicProfile?.uid, publicProfile?.friendshipStatus, profile?.firebaseUid]);
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
    await deleteFsPost(postId, profile.firebaseUid);
  }

  if (!ready) {
    return <div className="p-6 text-sm text-zinc-400">Cargando perfil…</div>;
  }
  if (!username) {
    return <Navigate to="/" replace />;
  }
  if (error) {
    return (
      <div className="rounded-2xl bg-zinc-900 p-6 text-center">
        <p className="text-fuchsia-400">{error}</p>
        <p className="mt-2 text-xs text-zinc-500">
          Guarda tu perfil en{' '}
          <Link to="/perfil/editar" className="text-cyan-400">
            Editar perfil
          </Link>{' '}
          primero.
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
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {publicProfile.isOwnProfile ? (
        <>
          <UserSearchBar />
          <FriendRequestsPanel />
        </>
      ) : null}

      <section className="rounded-2xl bg-zinc-900 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {publicProfile.avatarUrl ? (
            <img
              src={publicProfile.avatarUrl}
              alt=""
              className="mx-auto h-24 w-24 rounded-full object-cover ring-2 ring-cyan-400/40 sm:mx-0"
            />
          ) : (
            <div className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-zinc-800 text-2xl font-black text-cyan-300 sm:mx-0">
              {publicProfile.username.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h1 className="text-xl font-bold text-white">
              {publicProfile.displayName !== publicProfile.username
                ? publicProfile.displayName
                : null}
              <span className={publicProfile.displayName !== publicProfile.username ? 'block text-base text-zinc-400' : ''}>
                @{publicProfile.username}
              </span>
            </h1>
            {publicProfile.isOwnProfile && profile?.birthDate ? (
              <p className="mt-1 text-xs text-cyan-400">
                {ageFromIsoDate(profile.birthDate)} años
              </p>
            ) : null}
            {publicProfile.bio ? <p className="mt-2 text-sm text-zinc-400">{publicProfile.bio}</p> : null}
            <div className="mt-4 flex flex-wrap justify-center gap-4 sm:justify-start">
              <button
                type="button"
                onClick={() => void openFollowers()}
                className="text-sm text-white hover:text-cyan-300"
              >
                <strong>{publicProfile.followersCount}</strong>{' '}
                <span className="text-zinc-400">seguidores</span>
              </button>
              <button
                type="button"
                onClick={() => void openFollowing()}
                className="text-sm text-white hover:text-cyan-300"
              >
                <strong>{publicProfile.followingCount}</strong>{' '}
                <span className="text-zinc-400">seguidos</span>
              </button>
              <button
                type="button"
                onClick={() => void openFriends()}
                className="text-sm text-white hover:text-cyan-300"
              >
                <strong>{publicProfile.friendsCount}</strong>{' '}
                <span className="text-zinc-400">amigos</span>
              </button>
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
              <FollowButton
                username={publicProfile.username}
                initialFollowing={publicProfile.isFollowing}
                isOwnProfile={publicProfile.isOwnProfile}
                onChange={(followingNow) =>
                  setPublicProfile((current) =>
                    current
                      ? {
                          ...current,
                          isFollowing: followingNow,
                          followersCount: current.followersCount + (followingNow ? 1 : -1),
                        }
                      : current,
                  )
                }
              />
              {!publicProfile.isOwnProfile && publicProfile.friendshipStatus === 'friends' ? (
                <Link
                  to={`/mensajes?con=${encodeURIComponent(publicProfile.username)}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-300 ring-1 ring-cyan-400/30"
                >
                  <MessageCircle size={16} />
                  Mensaje
                </Link>
              ) : !publicProfile.isOwnProfile ? (
                <FriendRequestButton
                  username={publicProfile.username}
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
              ) : null}
              {publicProfile.isOwnProfile ? (
                <Link
                  to="/perfil/editar"
                  className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-200"
                >
                  Editar perfil
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-zinc-900 p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white">Biblioteca</h2>
          {publicProfile.isOwnProfile ? (
            <CreatePostModal
              username={publicProfile.username}
              onCreated={(post) => setPosts((current) => [post, ...current])}
            />
          ) : null}
        </div>
        {posts.length === 0 ? (
          <p className="text-sm text-zinc-500">Sin publicaciones todavía.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                canDelete={publicProfile.isOwnProfile}
                onDelete={() => void deletePost(post.id)}
                onReact={(updated) =>
                  setPosts((current) => current.map((item) => (item.id === updated.id ? updated : item)))
                }
              />
            ))}
          </div>
        )}
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
    </div>
  );
}
