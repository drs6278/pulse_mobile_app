// Native (iOS/Android): persist the Supabase session in on-device SQLite.
// The web build uses auth-storage.web.ts instead, so expo-sqlite (and the
// web worker it needs in the browser) is never bundled for web.
import 'expo-sqlite/localStorage/install';

export const authStorage: Storage | undefined = localStorage;
