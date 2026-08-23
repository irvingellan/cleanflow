import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { firebaseApp } from "../../services/firebase/client.js";

const auth = getAuth(firebaseApp);

export function subscribeToAuthState(onChange) {
  return onAuthStateChanged(auth, onChange);
}

export function signInWithEmail({ email, password }) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function signOutManager() {
  return signOut(auth);
}
