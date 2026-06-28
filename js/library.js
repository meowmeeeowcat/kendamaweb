import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";

export const TrickLibrary = {
    // ... defaultTricks 保持不變 ...
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

    // 獲取今天日期的字串 (格式如: 2026-06-28)
    getTodayDateString() {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    },

    init() {
        // 綁定招式庫 DOM
        this.domLibraryModal = document.getElementById('modal-library');
        this.domTrigger = document.getElementById('btn-library-trigger');
        this.domClose = document.getElementById('btn-library-close');
        this.domList = document.getElementById('library-list');
        this.domTrigger.addEventListener('click', () => this.openModal());
        this.domClose.addEventListener('click', () => this.closeModal());

        // 🌟 新增：綁定統計頁面 DOM
        this.domStatsModal = document.getElementById('modal-stats');
        this.domStatsTrigger = document.getElementById('btn-stats-trigger');
        this.domStatsClose = document.getElementById('btn-stats-close');
        this.domStatsList = document.getElementById('stats-list');
        this.domStatsTrigger.addEventListener('click', () => this.openStatsModal());
        this.domStatsClose.addEventListener('click', () => this.closeStatsModal());
        
        this.tricks = JSON.parse(JSON.stringify(this.defaultTricks));
        this.renderLibrary();
    },

    async loadUserData(username) {
        const userDocRef = doc(db, "users", username);
        const docSnap = await getDoc(userDocRef);
        const todayStr = this.getTodayDateString();

        if (docSnap.exists()) {
            let data = docSnap.data();
            this.tricks = data.tricks;
            
            // 🌟 核心：自動分辨換日檢查
            // 如果雲端紀錄的上次更新日期跟今天不同，代表換日了！
            if (data.lastUpdateDate !== todayStr) {
                // 將所有招式的今日次數歸零
                this.tricks.forEach(t => t.todayCount = 0);
                // 更新雲端的上次更新日期為今天
                await setDoc(userDocRef, { tricks: this.tricks, lastUpdateDate: todayStr });
            }
        } else {
            // 新註冊用戶
            this.tricks = JSON.parse(JSON.stringify(this.defaultTricks));
            await setDoc(userDocRef, { tricks: this.tricks, lastUpdateDate: todayStr });
        }
        this.renderLibrary();
    },

    async saveToStorage() {
        if (window.currentUser) {
            const todayStr = this.getTodayDateString();
            const userDocRef = doc(db, "users", window.currentUser);
            
            // 1. 同步更新總表與日期標記
            await setDoc(userDocRef, { tricks: this.tricks, lastUpdateDate: todayStr });

            // 2. 🌟 同步更新「統計日誌」：把今天所有大於 0 次的招式存進當天文件
            const logData = {};
            this.tricks.forEach(t => {
                if (t.todayCount > 0) {
                    logData[t.name] = t.todayCount;
                }
            });
            
            const logDocRef = doc(db, "users", window.currentUser, "daily_logs", todayStr);
            await setDoc(logDocRef, { logData: logData });
        }
    },

    // 🌟 新增：開啟並加載統計數據
    async openStatsModal() {
        this.domStatsModal.classList.remove('hidden');
        if (!window.currentUser) {
            this.domStatsList.innerHTML = `<p style="text-align:center; color:#e74c3c; margin-top:20px;">請先登入帳號以檢視統計紀錄！</p>`;
            return;
        }
        
        this.domStatsList.innerHTML = `<p style="text-align:center; color:#999; margin-top:20px;">正在讀取雲端歷程...</p>`;
        
        try {
            // 撈取 daily_logs 子集合下的所有日期文件
            const logsCollectionRef = collection(db, "users", window.currentUser, "daily_logs");
            const querySnapshot = await getDocs(logsCollectionRef);
            
            if (querySnapshot.empty) {
                this.domStatsList.innerHTML = `<p style="text-align:center; color:#7f8c8d; margin-top:20px;">目前尚無練習數據，開始點擊 +1 吧！</p>`;
                return;
            }

            let htmlContent = "";
            // 遍歷每一天的紀錄
            querySnapshot.forEach((docSnap) => {
                const date = docSnap.id; // 文件 ID 就是日期 (2026-06-28)
                const logData = docSnap.data().logData;
                
                let trickDetails = [];
                for (let trickName in logData) {
                    trickDetails.push(`${trickName}: <b style="color:#e67e22;">${logData[trickName]}</b> 次`);
                }

                if (trickDetails.length > 0) {
                    htmlContent = `
                        <div style="padding: 12px; border-bottom: 1px solid #eee;">
                            <div style="font-weight:bold; color:#2c3e50; margin-bottom:4px;">📅 ${date}</div>
                            <div style="font-size:0.9rem; color:#555; padding-left:10px;">${trickDetails.join(' | ')}</div>
                        </div>
                    ` + htmlContent; // 新日期顯示在最上面
                }
            });

            this.domStatsList.innerHTML = htmlContent || `<p style="text-align:center; color:#7f8c8d; margin-top:20px;">目前尚無有效紀錄。</p>`;
        } catch (error) {
            this.domStatsList.innerHTML = `<p style="text-align:center; color:#e74c3c; margin-top:20px;">數據載入失敗，請稍後再試。</p>`;
        }
    },

    closeStatsModal() { this.domStatsModal.classList.add('hidden'); },
    openModal() { this.renderLibrary(); this.domLibraryModal.classList.remove('hidden'); },
    closeModal() { this.domLibraryModal.classList.add('hidden'); },
    
    renderLibrary() {
        this.domList.innerHTML = this.tricks.map(trick => `
            <div class="lib-item">
                <span>${trick.name} ${trick.isUnlocked ? '' : '🔒'}</span>
                <span class="lib-count-info">總計: ${trick.totalCount} 次</span>
            </div>
        `).join('');
    },
    updateCount(id, amount) {
        const trick = this.tricks.find(t => t.id === id);
        if (trick) {
            if (trick.todayCount + amount >= 0) trick.todayCount += amount;
            if (trick.totalCount + amount >= 0) trick.totalCount += amount;
            this.saveToStorage();
        }
        return trick;
    },
    unlockTrick(id) {
        const trick = this.tricks.find(t => t.id === id);
        if (trick) { trick.isUnlocked = true; this.saveToStorage(); }
    },
    getRandomTrick() { const index = Math.floor(Math.random() * this.tricks.length); return this.tricks[index]; }
};