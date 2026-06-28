import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";

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

    getTodayDateString() {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    },

    init() {
        this.domLibraryModal = document.getElementById('modal-library');
        this.domTrigger = document.getElementById('btn-library-trigger');
        this.domClose = document.getElementById('btn-library-close');
        this.domList = document.getElementById('library-list');
        this.domTrigger.addEventListener('click', () => this.openModal());
        this.domClose.addEventListener('click', () => this.closeModal());

        this.domStatsModal = document.getElementById('modal-stats');
        this.domStatsTrigger = document.getElementById('btn-stats-trigger');
        this.domStatsClose = document.getElementById('btn-stats-close');
        this.domStatsList = document.getElementById('stats-list');
        this.domStatsTrigger.addEventListener('click', () => this.openStatsModal());
        this.domStatsClose.addEventListener('click', () => this.closeStatsModal());
        
        // 🌟 修正點：初始化時先將預設招式複製給 tricks，確保訪客未登入前也能正常顯示
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
            
            // 自動分辨換日檢查
            if (data.lastUpdateDate !== todayStr) {
                this.tricks.forEach(t => t.todayCount = 0);
                await setDoc(userDocRef, { tricks: this.tricks, lastUpdateDate: todayStr });
            }
        } else {
            this.tricks = JSON.parse(JSON.stringify(this.defaultTricks));
            await setDoc(userDocRef, { tricks: this.tricks, lastUpdateDate: todayStr });
        }
        this.renderLibrary();
    },

    async saveToStorage() {
        // 🌟 修正點：如果尚未登入帳號，則暫時存到 LocalStorage（訪客模式），有登入才同步雲端
        if (window.currentUser) {
            const todayStr = this.getTodayDateString();
            const userDocRef = doc(db, "users", window.currentUser);
            
            await setDoc(userDocRef, { tricks: this.tricks, lastUpdateDate: todayStr });

            const logData = {};
            this.tricks.forEach(t => {
                if (t.todayCount > 0) {
                    logData[t.name] = t.todayCount;
                }
            });
            
            const logDocRef = doc(db, "users", window.currentUser, "daily_logs", todayStr);
            await setDoc(logDocRef, { logData: logData });
        } else {
            // 訪客本地快取
            localStorage.setItem('kendama_guest_tricks', JSON.stringify(this.tricks));
        }
    },

    async openStatsModal() {
        this.domStatsModal.classList.remove('hidden');
        if (!window.currentUser) {
            this.domStatsList.innerHTML = `<p style="text-align:center; color:#e74c3c; margin-top:20px;">請先登入帳號以檢視統計紀錄！</p>`;
            return;
        }
        
        this.domStatsList.innerHTML = `<p style="text-align:center; color:#999; margin-top:20px;">正在讀取雲端歷程...</p>`;
        
        try {
            const logsCollectionRef = collection(db, "users", window.currentUser, "daily_logs");
            const querySnapshot = await getDocs(logsCollectionRef);
            
            if (querySnapshot.empty) {
                this.domStatsList.innerHTML = `<p style="text-align:center; color:#7f8c8d; margin-top:20px;">目前尚無練習數據，開始點擊 +1 吧！</p>`;
                return;
            }

            let htmlContent = "";
            querySnapshot.forEach((docSnap) => {
                const date = docSnap.id;
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
                    ` + htmlContent;
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