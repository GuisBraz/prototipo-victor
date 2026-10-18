import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { connectStorageEmulator, getStorage } from "firebase/storage";

/**
 * Configuração pública do app web do Firebase (não é segredo; a proteção está
 * nas Security Rules e nas callables). NUNCA colocar aqui chaves privadas —
 * em especial, a chave da Anthropic não existe no frontend.
 */
const firebaseConfig = {
  // O Firebase Auth exige uma apiKey não vazia, mesmo com emuladores. No modo
  // emulador usamos um valor de demonstração (não é uma credencial).
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ??
    (import.meta.env.VITE_USE_EMULATORS === "true" ? "demo-api-key" : undefined),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  // Em modo emulador, o bucket padrão do projeto de demonstração.
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ??
    (import.meta.env.VITE_USE_EMULATORS === "true" && import.meta.env.VITE_FIREBASE_PROJECT_ID
      ? `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.appspot.com`
      : undefined),
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** Região das functions: deve coincidir com functions/src/config.ts. */
export const FUNCTIONS_REGION = "southamerica-east1";

export const useEmulators = import.meta.env.VITE_USE_EMULATORS === "true";

export const isFirebaseConfigured = Boolean(
  firebaseConfig.projectId && (firebaseConfig.apiKey || useEmulators),
);

const app = initializeApp(
  isFirebaseConfigured
    ? firebaseConfig
    : // Valores inertes: a UI mostra a tela de configuração pendente e não chama o Firebase.
      { apiKey: "unconfigured", projectId: "demo-unconfigured", appId: "unconfigured" },
);

export const auth = getAuth(app);
export const firestore = getFirestore(app);
export const functions = getFunctions(app, FUNCTIONS_REGION);
export const storage = getStorage(app);

if (useEmulators && isFirebaseConfigured) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
}
