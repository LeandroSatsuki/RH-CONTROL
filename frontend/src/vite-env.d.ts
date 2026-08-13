/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_DEMO_MODE?: string;
  readonly VITE_ALLOW_LOCAL_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type NexoUpdateState = "idle" | "checking" | "available" | "downloading" | "ready" | "error";

interface NexoUpdateStatus {
  state: NexoUpdateState;
  message: string;
  version?: string;
}

interface Window {
  NEXO_CONFIG?: {
    API_URL?: string;
  };
  nexoUpdater?: {
    onStatus: (callback: (status: NexoUpdateStatus) => void) => () => void;
    restart: () => void;
    check: () => void;
  };
  nexoCredentials?: {
    load: () => Promise<{ username: string; password: string } | null>;
    save: (credentials: { username: string; password: string }) => Promise<boolean>;
    clear: () => Promise<void>;
  };
}
