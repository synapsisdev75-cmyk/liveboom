import { useEffect, useMemo, useState } from 'react';
import { Check, Lock, Send, Users, X } from 'lucide-react';
import { listenMyGroups, sendGroupMessage, type LiveGroup } from '../../lib/groupsFirestore';
import {
  listenConversations,
  listenFriends,
  sendChatMessage,
  type Conversation,
  type FriendChip,
} from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import { UserAvatar } from '../profile/UserAvatar';
import './liveboomShare.css';

type Target =
  | { key: string; kind: 'user'; section: 'recent' | 'friends'; label: string; sub: string; chip: FriendChip }
  | { key: string; kind: 'group'; section: 'groups'; label: string; sub: string; group: LiveGroup };

type SendStatus = 'sending' | 'sent' | 'error';

type Props = {
  shareUrl: string;
  /** Visibilidad del contenido original: lo privado no se envía. */
  visibility?: 'public' | 'friends' | 'private' | 'circle' | null;
  authorHandle?: string | null;
  previewText?: string;
  previewMediaUrl?: string | null;
  previewIsVideo?: boolean;
  /** Texto del mensaje cuando no se escribe uno. */
  defaultText?: string;
};

const SECTION_LABEL: Record<Target['section'], string> = {
  recent: 'Recientes',
  friends: 'Amigos',
  groups: 'Grupos',
};

/** Enviar por LiveBoom: chats recientes, amigos y grupos; varios a la vez; se envía el enlace (por referencia). */
export function SendViaLiveBoom({
  shareUrl,
  visibility,
  authorHandle,
  previewText,
  previewMediaUrl,
  previewIsVideo = false,
  defaultText = 'Mira esto en LiveBoom',
}: Props) {
  const profile = useAuthStore((state) => state.profile);
  const uid = profile?.firebaseUid ?? null;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [friends, setFriends] = useState<FriendChip[]>([]);
  const [groups, setGroups] = useState<LiveGroup[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<Record<string, SendStatus>>({});
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);

  useEffect(() => {
    if (!uid) return;
    const offs = [listenConversations(uid, setConversations), listenFriends(uid, setFriends), listenMyGroups(uid, setGroups)];
    return () => offs.forEach((off) => off());
  }, [uid]);

  const targets = useMemo<Target[]>(() => {
    const seen = new Set<string>();
    const list: Target[] = [];
    for (const conv of conversations) {
      if (!conv.uid || conv.deletedBy === uid || seen.has(conv.uid)) continue;
      seen.add(conv.uid);
      list.push({
        key: `u:${conv.uid}`,
        kind: 'user',
        section: 'recent',
        label: conv.displayName || conv.username,
        sub: conv.username ? `@${conv.username}` : '',
        chip: { uid: conv.uid, username: conv.username, displayName: conv.displayName, avatarUrl: conv.avatarUrl },
      });
      if (list.length >= 12) break;
    }
    for (const friend of friends) {
      if (seen.has(friend.uid)) continue;
      seen.add(friend.uid);
      list.push({
        key: `u:${friend.uid}`,
        kind: 'user',
        section: 'friends',
        label: friend.displayName || friend.username,
        sub: friend.username ? `@${friend.username}` : '',
        chip: friend,
      });
    }
    for (const group of groups) {
      list.push({ key: `g:${group.id}`, kind: 'group', section: 'groups', label: group.name, sub: 'Grupo', group });
    }
    return list;
  }, [conversations, friends, groups, uid]);

  const query = search.trim().toLowerCase();
  const visible = query
    ? targets.filter((item) => `${item.label} ${item.sub}`.toLowerCase().includes(query))
    : targets;
  const byKey = useMemo(() => new Map(targets.map((item) => [item.key, item])), [targets]);
  const blocked = visibility === 'private' || visibility === 'circle';

  function toggle(key: string) {
    setSentCount(0);
    setSelected((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));
  }

  async function send() {
    if (!profile || blocked || sending || selected.length === 0) return;
    setSending(true);
    const text = note.trim() || defaultText;
    const me = {
      firebaseUid: profile.firebaseUid,
      handle: profile.handle,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl ?? null,
    };
    const keys = [...selected];
    setStatus(Object.fromEntries(keys.map((key) => [key, 'sending' as const])));
    const results = await Promise.allSettled(
      keys.map(async (key) => {
        const target = byKey.get(key);
        if (!target) throw new Error('missing');
        if (target.kind === 'user') await sendChatMessage(me, target.chip, text, { linkUrl: shareUrl });
        else await sendGroupMessage(target.group.id, { fromUid: me.firebaseUid, username: me.handle, text, linkUrl: shareUrl });
      }),
    );
    const next: Record<string, SendStatus> = {};
    results.forEach((result, index) => {
      next[keys[index]!] = result.status === 'fulfilled' ? 'sent' : 'error';
    });
    setStatus(next);
    const ok = keys.filter((key) => next[key] === 'sent');
    setSentCount(ok.length);
    setSelected(keys.filter((key) => next[key] === 'error'));
    if (ok.length) setNote('');
    setSending(false);
  }

  if (!profile) return null;

  let lastSection: Target['section'] | null = null;
  const failed = Object.entries(status).filter(([, value]) => value === 'error').map(([key]) => byKey.get(key)?.label || '');

  return (
    <section className="lb-send-lb" aria-label="Enviar por LiveBoom">
      <div className="mb-2 flex items-center gap-2">
        <Send size={14} className="text-cyan-300" aria-hidden />
        <h4 className="text-sm font-semibold text-white">Enviar por LiveBoom</h4>
      </div>

      {blocked ? (
        <p className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5 text-xs text-zinc-300">
          <Lock size={14} aria-hidden />
          Esta publicación es privada: solo su autor puede verla, por eso no se puede enviar.
        </p>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/30 p-2">
            {previewMediaUrl ? (
              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-black/40">
                {previewIsVideo ? (
                  <video src={previewMediaUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                ) : (
                  <img src={previewMediaUrl} alt="" className="h-full w-full object-cover" />
                )}
              </span>
            ) : null}
            <span className="min-w-0 flex-1">
              {authorHandle ? <span className="block truncate text-xs font-bold text-white">@{authorHandle}</span> : null}
              <span className="line-clamp-2 text-xs text-zinc-400">{previewText || 'LiveBoom'}</span>
            </span>
          </div>
          {visibility === 'friends' ? (
            <p className="mb-2 flex items-center gap-1.5 text-[11px] text-zinc-400">
              <Users size={12} aria-hidden />
              Solo la verán quienes sean amigos del autor.
            </p>
          ) : null}

          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar personas o grupos"
            className="lb-send-lb__search mb-2"
            aria-label="Buscar destinatarios"
          />

          {selected.length > 0 ? (
            <div className="lb-send-lb__chips mb-2">
              {selected.map((key) => (
                <button key={key} type="button" className="lb-send-lb__chip" onClick={() => toggle(key)}>
                  {byKey.get(key)?.label || '…'}
                  <X size={13} aria-label="Quitar" />
                </button>
              ))}
            </div>
          ) : null}

          <div className="lb-send-lb__list rounded-2xl border border-white/10 bg-black/30 p-1.5">
            {visible.length === 0 ? (
              <p className="px-2 py-3 text-sm text-zinc-400">
                {query ? 'Sin resultados.' : 'Aún no tienes chats, amigos ni grupos.'}
              </p>
            ) : (
              visible.map((item) => {
                const header = item.section !== lastSection ? SECTION_LABEL[item.section] : null;
                lastSection = item.section;
                const on = selected.includes(item.key);
                const st = status[item.key];
                return (
                  <div key={item.key}>
                    {header ? (
                      <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">{header}</p>
                    ) : null}
                    <button
                      type="button"
                      className={`lb-send-lb__row${on ? ' is-on' : ''}`}
                      aria-pressed={on}
                      onClick={() => toggle(item.key)}
                    >
                      {item.kind === 'user' ? (
                        <UserAvatar
                          uid={item.chip.uid}
                          src={item.chip.avatarUrl}
                          username={item.chip.username}
                          displayName={item.chip.displayName}
                          size={36}
                        />
                      ) : item.group.photoUrl ? (
                        <img src={item.group.photoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-bold text-cyan-300">
                          {item.label.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-white">{item.label}</span>
                        <span className="block truncate text-[11px] text-zinc-500">{item.sub}</span>
                      </span>
                      {st === 'sent' ? (
                        <span className="text-[11px] font-bold text-cyan-300">Enviado</span>
                      ) : st === 'sending' ? (
                        <span className="text-[11px] text-zinc-400">Enviando…</span>
                      ) : (
                        <span className="lb-send-lb__check" aria-hidden>
                          {on ? <Check size={13} strokeWidth={3} /> : null}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-2 flex items-center gap-2">
            <input
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, 500))}
              placeholder="Añade un mensaje (opcional)"
              className="lb-send-lb__search min-w-0 flex-1"
              aria-label="Mensaje"
            />
            <button
              type="button"
              disabled={sending || selected.length === 0}
              onClick={() => void send()}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-4 text-sm font-bold text-zinc-950 disabled:opacity-50"
            >
              {sending ? 'Enviando…' : sentCount > 0 && selected.length === 0 ? 'Enviado' : 'Enviar'}
              {sentCount > 0 && selected.length === 0 && !sending ? <Check size={15} aria-hidden /> : null}
            </button>
          </div>
          {sentCount > 0 ? (
            <p className="mt-2 text-xs font-semibold text-cyan-300">
              Enviado a {sentCount} {sentCount === 1 ? 'destinatario' : 'destinatarios'}.
            </p>
          ) : null}
          {failed.length > 0 ? (
            <p className="mt-1 text-xs text-fuchsia-400">No se pudo enviar a: {failed.join(', ')}. Puedes reintentar.</p>
          ) : null}
        </>
      )}
    </section>
  );
}
