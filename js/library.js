import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc } from "firebase/firestore";

export const TrickLibrary = {
    defaultTricks: [
        { id: 1, name: "大皿 (Big Cup)", totalCount: 0, todayCount: 0, isUnlocked: true },
        { id: 2, name: "小皿 (Small Cup)", totalCount: 0, todayCount: 0, isUnlocked: true },
        { id: 3, name: "中皿 (Base Cup)", totalCount: 0, todayCount: 0, isUnlocked: true },
        { id: 4, name: "蠟燭 (Candle)", totalCount: 0, todayCount: 0, isUnlocked: false },
        { id: 5, name: "飛行大皿 (Airplane)", totalCount: 0, todayCount: 0, isUnlocked: false },
        { id: 6, name: "日本一周 (Around Japan)", totalCount: 0, todayCount: 0, isUnlocked: false },
        { id: 7, name: "世界一周 (Around the World)", totalCount: 0, todayCount: 0, isUnlocked: false },
        { id: 8, name: "燈塔 (Lighthouse)", totalCount: 0, todayCount: 0, isUnlocked: false }
    ],
    
    tricks: [],

    init() {
        this.domLibraryModal = document.getElementById('modal-library');
        this.domTrigger = document.getElementById('btn-library-trigger');
        this.domClose = document.getElementById('btn-library-close');
        this.domList = document.getElementById('library-list');

        this.domTrigger.addEventListener('click', () => this.openModal());
        this.domClose.addEventListener('click', () => this.closeModal());
        
        this.tricks = JSON.parse(JSON.stringify(this.defaultTricks));
        this.renderLibrary();
    },

    // 🌟 核心改動：從 Firebase 雲端載入或註冊使用者
    async loadUserData(username) {
        // 在雲端建立一個叫做 "users" 的集合，並以 "暱稱" 當作文件 ID
        const userDocRef = doc(db, "users", username);
        const docSnap = await getDoc(userDocRef);

        if (docSnap.exists()) {
            // 使用者存在，載入雲端進度
            this.tricks = docSnap.data().tricks;
        } else {
            // 使用者不存在，自動註冊並初始化
            this.tricks = JSON.parse(JSON.stringify(this.defaultTricks));
            await setDoc(userDocRef, { tricks: this.tricks });
        }
        this.renderLibrary();
    },

    // 🌟 核心改動：即時更新並同步至雲端
    async saveToStorage() {
        // 外部有存取全域 AuthSystem 的話要確認載入順序，此處改為由參數或 window 取得
        if (window.currentUser) {
            const userDocRef = doc(db, "users", window.currentUser);
            await setDoc(userDocRef, { tricks: this.tricks });
        }
    },

    getTargetCount(totalCount) {
        if (totalCount <= 10) return 3;
        if (totalCount <= 50) return 5;
        if (totalCount <= 100) return 10;
        return 20;
    },

    updateCount(id, amount) {
        const trick = this.tricks.find(t => t.id === id);
        if (trick) {
            if (trick.todayCount + amount >= 0) trick.todayCount += amount;
            if (trick.totalCount + amount >= 0) trick.totalCount += amount;
            this.saveToStorage(); // 非同步寫入雲端
        }
        return trick;
    },

    unlockTrick(id) {
        const trick = this.tricks.find(t => t.id === id);
        if (trick) { 
            trick.isUnlocked = true; 
            this.saveToStorage();
        }
    },

    openModal() {
        this.renderLibrary();
        this.domLibraryModal.classList.remove('hidden');
    },
    closeModal() { this.domLibraryModal.classList.add('hidden'); },

    renderLibrary() {
        this.domList.innerHTML = this.tricks.map(trick => `
            <div class="lib-item">
                <span>${trick.name} ${trick.isUnlocked ? '' : '🔒'}</span>
                <span class="lib-count-info">總計: ${trick.totalCount} 次</span>
            </div>
        `).join('');
    },

    getRandomTrick() {
        const index = Math.floor(Math.random() * this.tricks.length);
        return this.tricks[index];
    }
};