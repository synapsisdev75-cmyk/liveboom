import { useEffect, useState } from 'react';
import {
  isMessageBoxesVisibleNow,
  isMessagesInboxVisibleNow,
} from '../lib/messagesUiFlags';

const BOXES_OFF_CLASS = 'lb-msg-boxes-off';

function syncBoxesOffClass(visible: boolean) {
  document.documentElement.classList.toggle(BOXES_OFF_CLASS, !visible);
}

/** Se actualiza al rotar o redimensionar (tablet horizontal ↔ vertical, PC, etc.). */
export function useMessagesInboxVisible(): boolean {
  const [visible, setVisible] = useState(() => isMessagesInboxVisibleNow());

  useEffect(() => {
    const sync = () => setVisible(isMessagesInboxVisibleNow());
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    const mq = window.matchMedia('(orientation: landscape)');
    mq.addEventListener('change', sync);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      mq.removeEventListener('change', sync);
    };
  }, []);

  return visible;
}

export function useMessageBoxesVisible(): boolean {
  const [visible, setVisible] = useState(() => isMessageBoxesVisibleNow());

  useEffect(() => {
    const sync = () => {
      const next = isMessageBoxesVisibleNow();
      setVisible(next);
      syncBoxesOffClass(next);
    };
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    const mq = window.matchMedia('(orientation: landscape)');
    mq.addEventListener('change', sync);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      mq.removeEventListener('change', sync);
    };
  }, []);

  return visible;
}
