import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
const firebaseConfig = {
  apiKey: "AIzaSyDCVi_LPNfalO1vdyTC3jFg7tREm_txfgU",
  authDomain: "rahboard-7750b.firebaseapp.com",
  projectId: "rahboard-7750b",
  storageBucket: "rahboard-7750b.firebasestorage.app",
  messagingSenderId: "560375516213",
  appId: "1:560375516213:web:0cf0dabb43eb7cd0f4757c"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);