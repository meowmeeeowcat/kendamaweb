import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// 請把你在【步驟 1-4】複製的專案金鑰貼在下面替換：
const firebaseConfig = {
    apiKey: "AIzaSyA-BmERhNX0ea2UsbUEaa-Fo4AeCzs9MQI",

    authDomain: "kendamaweb-1dbee.firebaseapp.com",
  
    projectId: "kendamaweb-1dbee",
  
    storageBucket: "kendamaweb-1dbee.firebasestorage.app",
  
    messagingSenderId: "574938986688",
  
    appId: "1:574938986688:web:f98c1ac41d199fa4141525",
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
// 初始化 Firestore 資料庫並匯出
export const db = getFirestore(app);