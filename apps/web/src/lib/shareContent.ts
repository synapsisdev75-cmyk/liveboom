export type ShareMediaType = 'photo' | 'video' | 'text';

export type ShareContentInput = {
  url: string;
  title?: string;
  text?: string;
  mediaUrl?: string | null;
  mediaType?: ShareMediaType | null;
};

export function buildPostShareUrl(
  username: string,
  postId: string,
  authorUid?: string | null,
) {
  const handle = encodeURIComponent(String(username || '').trim().replace(/^@/, '') || 'user');
  const params = new URLSearchParams();
  params.set('post', postId);
  const uid = String(authorUid || '').trim();
  if (uid) params.set('uid', uid);
  return `${window.location.origin}/u/${handle}?${params.toString()}`;
}

function mediaFileName(mediaType: ShareMediaType, mime: string) {
  if (mediaType === 'video') {
    if (mime.includes('webm')) return `liveboom-${Date.now()}.webm`;
    return `liveboom-${Date.now()}.mp4`;
  }
  if (mime.includes('png')) return `liveboom-${Date.now()}.png`;
  return `liveboom-${Date.now()}.jpg`;
}

async function tryShareWithMedia(input: ShareContentInput): Promise<boolean> {
  const { mediaUrl, mediaType, title = 'LiveBoom', text, url } = input;
  if (!mediaUrl || !mediaType || mediaType === 'text' || !navigator.share) return false;

  try {
    const response = await fetch(mediaUrl);
    if (!response.ok) return false;
    const blob = await response.blob();
    const file = new File([blob], mediaFileName(mediaType, blob.type), {
      type: blob.type || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg'),
    });
    if (!navigator.canShare?.({ files: [file] })) return false;
    await navigator.share({
      title,
      text: text || 'Mira esto en LiveBoom',
      url,
      files: [file],
    });
    return true;
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    return false;
  }
}

export async function shareContent(input: ShareContentInput): Promise<'shared' | 'copied' | 'failed'> {
  const { url, title = 'LiveBoom', text } = input;
  const shareText = text || 'Mira esto en LiveBoom';

  try {
    const sharedWithMedia = await tryShareWithMedia(input);
    if (sharedWithMedia) return 'shared';
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return 'failed';
  }

  try {
    if (navigator.share) {
      await navigator.share({ title, url, text: shareText });
      return 'shared';
    }
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return 'failed';
    try {
      await navigator.clipboard.writeText(url);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
}
