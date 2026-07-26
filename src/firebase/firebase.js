import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyAyYjhvlizi7WvdbPtSJfNdUB6RDazX_b0",
  authDomain: "tamcam---ai.firebaseapp.com",
  projectId: "tamcam---ai",
  storageBucket: "tamcam---ai.firebasestorage.app",
  messagingSenderId: "62259662959",
  appId: "1:62259662959:web:c0f3fc19ef07fa32ce7d9a",
  measurementId: "G-ZMJ4NMXHN1",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const analyticsPromise = isSupported().then((supported) =>
  supported ? getAnalytics(app) : null
);

export default app;