// firebase.js — Firebase 초기화 및 공통설정

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDV4apwgvIzD1uGnUO-k0v4tccgAaXHgbI",
  authDomain: "seonyeong-nation.firebaseapp.com",
  projectId: "seonyeong-nation",
  storageBucket: "seonyeong-nation.firebasestorage.app",
  messagingSenderId: "11123500914",
  appId: "1:11123500914:web:5ee83479db12e59dabdfeb"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// ── 국가 설정 기본값 ──
export const NATION_DEFAULTS = {
  name: "선영국가",
  className: "3학년 X반",
  masterPassword: "6301",
  shopOpen: false,
};
