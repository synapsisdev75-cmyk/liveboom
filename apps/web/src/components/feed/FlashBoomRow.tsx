import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreatePostModal } from '../social/CreatePostModal';
import { FLASH_BOOM_LABEL } from '../../lib/brand';
import {
  listenActiveStories,
  listenFriends,
  listenFollowing,
  listenFollowers,
  type FriendChip,
  type FsPost,
} from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import { useVideoAspect } from '../../lib/videoAspect';
import { AutoplayMuteVideo } from './AutoplayMuteVideo';
import { HorizontalScrollRail } from './HorizontalScrollRail';
import { ReelFeedViewer, type ReelFeedItem } from './ReelFeedViewer';

type StoryReel = ReelFeedItem & { createdAt: string; mediaType: 'photo' | 'video' };

function toStoryReel(post: FsPost): StoryReel {
  return {
    id: post.id,
    username: post.username,
    authorUid: post.authorUid,
    caption: post.caption || FLASH_BOOM_LABEL,
    mediaUrl: post.mediaUrl || '',
    mediaType: post.type === 'photo' ? 'photo' : 'video',
    createdAt: post.createdAt,
    durationSec: post.durationSec ?? null,
    sharedFromPostId: post.sharedFromPostId,
    sharedFromAuthorUid: post.sharedFromAuthorUid,
    sharedFromUsername: post.sharedFromUsername,
    overlays: post.overlays,
  };
}

function StoryThumb({
  reel,
  avatarUrl,
  label,
  onOpen,
}: {
  reel: StoryReel;
  avatarUrl: string | null;
  label: string;
  onOpen: () => void;
}) {
  const videoAspect = useVideoAspect(reel.mediaUrl);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-[4.75rem] shrink-0 snap-start flex-col items-center gap-1.5 sm:w-20"
    >
      <span className="story-ring relative grid h-[4.5rem] w-[4.5rem] place-items-center rounded-full p-[2.5px] sm:h-[4.75rem] sm:w-[4.75rem]">
        <span
          className={`relative h-full w-full overflow-hidden rounded-full bg-zinc-900 ${
            videoAspect.isReady ? '' : 'aspect-[9/16]'
          }`}
          style={videoAspect.isReady ? videoAspect.aspectStyle : undefined}
        >
          {reel.mediaType === 'photo' ? (
            <img src={reel.mediaUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <AutoplayMuteVideo src={reel.mediaUrl} className="h-full w-full object-cover" />
          )}
        </span>
        <span className="absolute -bottom-0.5 -right-0.5 h-6 w-6 overflow-hidden rounded-full ring-2 ring-zinc-950">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center bg-zinc-800 text-[9px] font-bold uppercase text-zinc-300">
              {reel.username.slice(0, 1)}
            </span>
          )}
        </span>
      </span>
      <span className="w-full truncate text-center text-[10px] font-semibold text-zinc-200">
        {label}
      </span>
    </button>
  );
}

function PublishCard({
  avatarUrl,
  handle,
  hasOwnStory,
  onOpenOwn,
  onPublish,
}: {
  avatarUrl: string | null;
  handle: string;
  hasOwnStory: boolean;
  onOpenOwn?: () => void;
  onPublish: () => void;
}) {
  return (
    <div className="flex w-[4.75rem] shrink-0 flex-col items-center gap-1.5 sm:w-20">
      <div className="relative">
        <button
          type="button"
          onClick={hasOwnStory ? onOpenOwn : onPublish}
          className={`grid h-[4.5rem] w-[4.5rem] place-items-center overflow-hidden rounded-full bg-zinc-900 sm:h-[4.75rem] sm:w-[4.75rem] ${
            hasOwnStory ? 'story-ring p-[2.5px]' : 'ring-2 ring-white/15'
          }`}
        >
          <span className="h-full w-full overflow-hidden rounded-full bg-zinc-800">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center text-lg font-black uppercase text-zinc-400">
                {handle.slice(0, 1)}
              </span>
            )}
          </span>
        </button>
        <button
          type="button"
          onClick={onPublish}
          className="absolute -bottom-0.5 -right-0.5 grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-fuchsia-500 to-cyan-400 text-white ring-2 ring-zinc-950 transition hover:scale-105"
          aria-label="Publicar Flash Boom"
          title="Publicar Flash Boom"
        >
          <Plus size={16} strokeWidth={3} />
        </button>
      </div>
      <span className="line-clamp-2 w-full text-center text-[10px] font-semibold text-cyan-300">
        {hasOwnStory ? 'Tu Flash Boom' : 'Publicar'}
      </span>
    </div>
  );
}

function FriendIdleBubble({ friend }: { friend: FriendChip }) {
  return (
    <div
      className="flex w-[4.75rem] shrink-0 flex-col items-center gap-1.5 opacity-55 sm:w-20"
      title={`@${friend.username} aún no tiene Flash Boom`}
    >
      <span className="grid h-[4.5rem] w-[4.5rem] place-items-center rounded-full bg-zinc-900 ring-2 ring-white/10 sm:h-[4.75rem] sm:w-[4.75rem]">
        {friend.avatarUrl ? (
          <img
            src={friend.avatarUrl}
            alt=""
            className="h-full w-full rounded-full object-cover grayscale-[0.35]"
          />
        ) : (
          <span className="grid h-full w-full place-items-center rounded-full bg-zinc-800 text-sm font-bold uppercase text-zinc-400">
            {friend.username.slice(0, 1)}
          </span>
        )}
      </span>
      <span className="line-clamp-2 w-full text-center text-[10px] font-medium text-zinc-500">
        {friend.displayName?.split(' ')[0] || friend.username}
      </span>
    </div>
  );
}

/** Flash Boom: publicar + historias de amigos y de quien sigues. */
export function FlashBoomRow() {
  const profile = useAuthStore((state) => state.profile);
  const [friends, setFriends] = useState<FriendChip[]>([]);
  const [following, setFollowing] = useState<FriendChip[]>([]);
  const [followers, setFollowers] = useState<FriendChip[]>([]);
  const [stories, setStories] = useState<StoryReel[]>([]);
  const [viewerReels, setViewerReels] = useState<StoryReel[] | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!profile?.firebaseUid) {
      setFriends([]);
      return;
    }
    return listenFriends(profile.firebaseUid, setFriends);
  }, [profile?.firebaseUid]);

  useEffect(() => {
    if (!profile?.firebaseUid) {
      setFollowing([]);
      return;
    }
    return listenFollowing(profile.firebaseUid, setFollowing);
  }, [profile?.firebaseUid]);

  useEffect(() => {
    if (!profile?.firebaseUid) {
      setFollowers([]);
      return;
    }
    return listenFollowers(profile.firebaseUid, setFollowers);
  }, [profile?.firebaseUid]);

  useEffect(() => {
    if (!profile) {
      setStories([]);
      return;
    }
    return listenActiveStories((posts) => setStories(posts.map(toStoryReel)));
  }, [profile?.firebaseUid]);

  const storiesByAuthor = useMemo(() => {
    const map = new Map<string, StoryReel[]>();
    for (const story of stories) {
      const list = map.get(story.authorUid) ?? [];
      list.push(story);
      map.set(story.authorUid, list);
    }
    for (const [uid, list] of map) {
      map.set(
        uid,
        [...list].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)),
      );
    }
    return map;
  }, [stories]);

  const networkPeople = useMemo(() => {
    const seen = new Set<string>();
    const list: FriendChip[] = [];
    for (const person of [...friends, ...following, ...followers]) {
      if (!person.uid || seen.has(person.uid)) continue;
      seen.add(person.uid);
      list.push(person);
    }
    return list;
  }, [friends, following, followers]);

  const networkSet = useMemo(() => new Set(networkPeople.map((f) => f.uid)), [networkPeople]);

  const ownStories = profile ? storiesByAuthor.get(profile.firebaseUid) ?? [] : [];

  const networkWithStories = useMemo(() => {
    return networkPeople.filter((person) => (storiesByAuthor.get(person.uid)?.length ?? 0) > 0);
  }, [networkPeople, storiesByAuthor]);

  const friendsWithoutStories = useMemo(() => {
    return friends.filter((friend) => !(storiesByAuthor.get(friend.uid)?.length ?? 0));
  }, [friends, storiesByAuthor]);

  /** Historias visibles: propias + amigos + quien sigues. */
  const visibleStories = useMemo(() => {
    if (!profile) return [];
    return stories.filter(
      (story) =>
        story.authorUid === profile.firebaseUid || networkSet.has(story.authorUid),
    );
  }, [stories, profile, networkSet]);

  function openRingFromAuthor(authorUid: string) {
    if (!profile) return;
    const ordered: StoryReel[] = [];
    const uids = [
      ...(ownStories.length ? [profile.firebaseUid] : []),
      ...networkWithStories.map((person) => person.uid),
    ].filter((uid, index, list) => list.indexOf(uid) === index);

    for (const uid of uids) {
      const list = storiesByAuthor.get(uid);
      if (!list?.length) continue;
      const avatar =
        uid === profile.firebaseUid
          ? profile.avatarUrl
          : networkPeople.find((person) => person.uid === uid)?.avatarUrl;
      ordered.push(
        ...list.map((story) => ({
          ...story,
          authorAvatarUrl: avatar ?? story.authorAvatarUrl ?? null,
        })),
      );
    }
    if (!ordered.length) return;
    const startId = storiesByAuthor.get(authorUid)?.[0]?.id;
    const idx = startId ? ordered.findIndex((story) => story.id === startId) : 0;
    setViewerReels(ordered);
    setViewerIndex(Math.max(0, idx));
  }

  if (!profile) {
    return (
      <section className="w-full">
        <div className="mb-3">
          <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-white">{FLASH_BOOM_LABEL}</h2>
          <p className="mt-0.5 text-[10px] text-zinc-500">24 h · amigos y seguidores</p>
        </div>
        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-500">
          <Link to="/login" className="text-cyan-400 underline">
            Inicia sesión
          </Link>{' '}
          para ver Flash Boom de amigos y seguidores.
        </p>
      </section>
    );
  }

  return (
    <section className="w-full">
      <div className="mb-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-white">{FLASH_BOOM_LABEL}</h2>
        <p className="mt-0.5 text-[10px] text-zinc-500">
          24 h · amigos y seguidores · {networkPeople.length} en tu red
        </p>
      </div>

      {networkPeople.length === 0 && visibleStories.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center">
          <p className="text-sm text-zinc-500">
            Sigue cuentas o agrega amigos para ver sus Flash Boom aquí.{' '}
            <Link to="/buscar" className="text-cyan-400 underline">
              Buscar personas
            </Link>
          </p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-5 text-sm font-bold text-white"
          >
            <Plus size={16} />
            Publicar Flash Boom
          </button>
        </div>
      ) : (
        <HorizontalScrollRail ariaLabel={FLASH_BOOM_LABEL}>
          <div className="snap-start">
            <PublishCard
              avatarUrl={profile.avatarUrl ?? null}
              handle={profile.handle}
              hasOwnStory={ownStories.length > 0}
              onOpenOwn={() => openRingFromAuthor(profile.firebaseUid)}
              onPublish={() => setCreateOpen(true)}
            />
          </div>

          {networkWithStories.map((person) => {
            const reel = storiesByAuthor.get(person.uid)?.[0];
            if (!reel) return null;
            return (
              <StoryThumb
                key={person.uid}
                reel={reel}
                avatarUrl={person.avatarUrl}
                label={person.displayName?.split(' ')[0] || person.username}
                onOpen={() => openRingFromAuthor(person.uid)}
              />
            );
          })}

          {friendsWithoutStories.map((friend) => (
            <div key={friend.uid} className="snap-start">
              <FriendIdleBubble friend={friend} />
            </div>
          ))}
        </HorizontalScrollRail>
      )}

      {viewerReels && viewerReels.length > 0 ? (
        <ReelFeedViewer
          reels={viewerReels}
          initialIndex={viewerIndex}
          storyMode
          immersiveLandscapeLayout
          collapsibleCaption
          onClose={() => setViewerReels(null)}
        />
      ) : null}

      {createOpen ? (
        <CreatePostModal
          username={profile.handle}
          autoOpen
          hideTrigger
          defaultVideoMode="story"
          onClose={() => setCreateOpen(false)}
          onCreated={() => setCreateOpen(false)}
        />
      ) : null}
    </section>
  );
}
