import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyA6R9qMJLBAsi_ZtOfO_c4aKLsAWJPiRPs",
  authDomain: "gambar-ai.firebaseapp.com",
  projectId: "gambar-ai",
  storageBucket: "gambar-ai.appspot.com",
  messagingSenderId: "741221155339",
  appId: "1:741221155339:web:9b4a37e42a33686eb67d0e",
  measurementId: "G-RQK58F7CH4"
};

const app = initializeApp(firebaseConfig);
export const storage = getStorage(app);
