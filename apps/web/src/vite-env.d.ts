/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_API_URL?: string;
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
    signature?: { integrity: string };
  }) => WompiWidgetCheckout;
}
