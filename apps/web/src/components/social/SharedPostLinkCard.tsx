import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Play } from 'lucide-react';
import { emojiTokensToUnicode } from '../../lib/liveboomEmojis';
import { profileHref } from '../../lib/profileFirestore';
import { getPostById, viewerCanSeePost, type FsPost } from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import './liveboomShare.css';

type State = { status: 'loading' } | { status: 'ok'; post: FsPost } | { status: 'unavailable' };

/**
 * Publicación enviada por LiveBoom (mensaje con enlace /s/{postId}). Se carga por referencia
 * y solo se muestra si quien la recibe tiene permiso de verla.
 */
export function SharedPostLinkCard({ postId, className = '' }: { postId: string; className?: string }) {
  const viewerUid = useAuthStore((state) => state.profile?.firebaseUid ?? null);
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    void (async () => {
      try {
        const post = await getPostById(postId);
        const visible = post ? await viewerCanSeePost(post, viewerUid) : false;
        if (!cancelled) setState(post && visible ? { status: 'ok', post } : { status: 'unavailable' });
      } catch {
        if (!cancelled) setState({ status: 'unavailable' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [postId, viewerUid]);

  if (state.status === 'loading') {
    return <div className={`lb-shared-post lb-shared-post--loading ${className}`} aria-busy="true" />;
  }
  if (state.status === 'unavailable') {
    return (
      <div className={`lb-shared-post lb-shared-post--off ${className}`}>
        <Lock size={14} aria-hidden />
        <span>Publicación no disponible</span>
      </div>
    );
  }

  const { post } = state;
  const base = profileHref(post.username, post.authorUid);
  const href = `${base}${base.includes('?') ? '&' : '?'}post=${encodeURIComponent(post.id)}`;
  const thumb = post.thumbUrl || (post.type === 'photo' ? post.mediaUrl : null);
  const caption = emojiTokensToUnicode(post.caption || '').trim();

  return (
    <Link to={href} className={`lb-shared-post ${className}`} onClick={(event) => event.stopPropagation()}>
      {thumb ? (
        <span className="lb-shared-post__media">
          <img src={thumb} alt="" loading="lazy" decoding="async" />
          {post.type === 'video' ? (
            <span className="lb-shared-post__play" aria-hidden>
              <Play size={14} />
            </span>
          ) : null}
        </span>
      ) : null}
      <span className="lb-shared-post__body">
        <span className="lb-shared-post__author">@{post.username}</span>
        <span className="lb-shared-post__caption">{caption || 'Publicación en LiveBoom'}</span>
      </span>
    </Link>
  );
}
