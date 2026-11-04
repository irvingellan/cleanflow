import {
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { emulatorPorts, firebaseApp, useFirebaseEmulators } from "../../services/firebase/client.js";

const auth = getAuth(firebaseApp);

if (useFirebaseEmulators) {
  connectAuthEmulator(auth, `http://127.0.0.1:${emulatorPorts.auth}`, { disableWarnings: true });
}

export function subscribeToAuthState(onChange) {
  return onAuthStateChanged(auth, onChange);
}

export function signInWithEmail({ email, password }) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function signOutManager() {
  return signOut(auth);
}
