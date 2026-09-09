import { Ban, Flag, Info, Loader2, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useDismissOnOutside } from '../../hooks/useDismissOnOutside';
import { blockUser, type FriendChip } from '../../lib/socialFirestore';
import { fetchPublicUserByUid, type PublicFsUser } from '../../lib/profileFirestore';
import { submitUserReport } from '../../lib/userReports';
import { UserAvatar } from '../profile/UserAvatar';
import { LevelInsignia } from '../profile/LevelInsignia';
import type { SessionUser } from '../../lib/api';

const REASON_MAX = 1000;

type Props = {
  peer: FriendChip;
  chatId: string | null;
  me: SessionUser;
  onToast: (message: string) => void;
  onBlocked?: () => void;
};

export function ChatSafetyMenu({ peer, chatId, me, onToast, onBlocked }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useDismissOnOutside(menuOpen, rootRef, closeMenu);

  async function runBlock() {
    if (blocking || !peer.uid || peer.uid === me.firebaseUid) return;
    setBlocking(true);
    try {
      await blockUser(
        {
          firebaseUid: me.firebaseUid,
          handle: me.handle,
          displayName: me.displayName,
          avatarUrl: me.avatarUrl,
        },
        {
          uid: peer.uid,
          username: peer.username,
          displayName: peer.displayName,
          avatarUrl: peer.avatarUrl,
        },
      );
      onBlocked?.();
      onToast('Usuario bloqueado');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'No se pudo bloquear');
    } finally {
      setBlocking(false);
    }
  }

  function onPick(action: 'block' | 'report' | 'both') {
    setMenuOpen(false);
    if (action === 'block') {
      void runBlock();
      return;
    }
    if (action === 'both') {
      void runBlock().finally(() => setReportOpen(true));
      return;
    }
    setReportOpen(true);
  }

  return (
    <div className="lb-chat-safety-wrap" ref={rootRef}>
      <button
        type="button"
        className="grid h-9 w-9 place-items-center rounded-lg text-zinc-300 hover:bg-white/5"
        aria-label="Opciones de seguridad"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <Info size={18} />
      </button>
      {menuOpen ? (
        <div className="lb-chat-safety-menu" role="menu" aria-label="Acciones de seguridad">
          <button type="button" role="menuitem" className="lb-chat-safety-item" disabled={blocking} onClick={() => onPick('block')}>
            <Ban size={15} />
            Bloquear
          </button>
          <button type="button" role="menuitem" className="lb-chat-safety-item" onClick={() => onPick('report')}>
            <Flag size={15} />
            Reportar
          </button>
          <button type="button" role="menuitem" className="lb-chat-safety-item" disabled={blocking} onClick={() => onPick('both')}>
            <ShieldAlert size={15} />
            Bloquear y reportar
          </button>
        </div>
      ) : null}
      {reportOpen
        ? createPortal(
            <ChatReportModal
              peer={peer}
              chatId={chatId}
              onClose={() => setReportOpen(false)}
              onToast={onToast}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

function ChatReportModal({
  peer,
  chatId,
  onClose,
  onToast,
}: {
  peer: FriendChip;
  chatId: string | null;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const [profile, setProfile] = useState<PublicFsUser | null>(null);
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicUserByUid(peer.uid).then((user) => {
      if (!cancelled) setProfile(user);
    });
    return () => {
      cancelled = true;
    };
  }, [peer.uid]);

  const displayName = profile?.displayName || peer.displayName || peer.username;
  const username = profile?.username || peer.username;
  const avatarUrl = profile?.avatarUrl ?? peer.avatarUrl;
  const levelXp = profile?.levelXp ?? 0;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = reason.trim();
    if (!text) {
      setError('Escribe el motivo del reporte.');
      return;
    }
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      await submitUserReport({
        reportedUserId: peer.uid,
        conversationId: chatId,
        reason: text,
      });
      onToast('Reporte enviado correctamente');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el reporte');
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="lb-chat-report-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lb-chat-report-title"
      onClick={() => {
        if (!sending) onClose();
      }}
    >
      <form className="lb-chat-report" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void onSubmit(event)}>
        <div className="lb-chat-report-profile">
          <UserAvatar
            uid={peer.uid}
            src={avatarUrl}
            username={username}
            displayName={displayName}
            size={48}
            alt={displayName}
          />
          <div className="min-w-0 flex-1">
            <p className="lb-chat-report-name">{displayName}</p>
            <p className="lb-chat-report-handle">@{username}</p>
            <p id="lb-chat-report-title" className="lb-chat-report-kicker">
              Reportar usuario
            </p>
          </div>
          <LevelInsignia
            levelXp={levelXp}
            className="lb-chat-report-badge"
            previewSize={{
              mobile: { width: 36, height: 42 },
              desktop: { width: 40, height: 46 },
            }}
          />
        </div>

        <label className="lb-chat-report-label" htmlFor="lb-chat-report-reason">
          Cuéntanos qué está ocurriendo
        </label>
        <textarea
          id="lb-chat-report-reason"
          className="lb-chat-report-textarea"
          value={reason}
          maxLength={REASON_MAX}
          disabled={sending}
          placeholder="Describe qué hizo este usuario o qué norma de LiveBoom consideras que está infringiendo..."
          onChange={(event) => setReason(event.target.value.slice(0, REASON_MAX))}
        />
        <p className="lb-chat-report-count">
          {reason.length} / {REASON_MAX}
        </p>
        {error ? <p className="lb-chat-report-error">{error}</p> : null}

        <div className="lb-chat-report-actions">
          <button type="button" className="lb-chat-manage-btn" disabled={sending} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="lb-chat-manage-btn lb-chat-report-send" disabled={sending}>
            {sending ? <Loader2 size={14} className="animate-spin" /> : null}
            {sending ? 'Enviando...' : 'Enviar reporte'}
          </button>
        </div>
      </form>
    </div>
  );
}
