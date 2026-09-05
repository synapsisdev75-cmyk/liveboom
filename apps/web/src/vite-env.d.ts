/// <reference types="vite/client" />

declare module 'virtual:liveboom-emoticones' {
  export const EMOTICON_EMOJIS: Array<{
    id: string;
    label: string;
    file: string;
    pack: 'emoticones';
  }>;
}

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_API_URL?: string;
  readonly VITE_DEEPAR_LICENSE_KEY?: string;
  readonly VITE_AGORA_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type WompiWidgetResult = {
  transaction?: {
    id: string;
    status: string;
    reference?: string;
  };
};

type WompiWidgetCheckout = {
  open: (callback?: (result: WompiWidgetResult) => void) => void;
};

interface Window {
  WidgetCheckout?: new (config: {
    currency: string;
    amountInCents: number;
    reference: string;
    publicKey: string;
    redirectUrl?: string;
    expirationTime?: string;
    signature?: { integrity: string };
  }) => WompiWidgetCheckout;
}
