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
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    },

    init() {
        // 綁定 DOM 元素
        this.domLibraryModal = document.getElementById('modal-library');
        this.domTrigger = document.getElementById('btn-library-trigger');
        this.domClose = document.getElementById('btn-library-close');
        this.domList = document.getElementById('library-list');
        
        // 綁定新增招式相關 DOM
        this.domAddSubmit = document.getElementById('btn-add-trick-submit');
        this.domNewNameInput = document.getElementById('new-trick-name');

        this.domTrigger.addEventListener('click', () => this.openModal());
        this.domClose.addEventListener('click', () => this.closeModal());
        this.domAddSubmit.addEventListener('click', () => this.handleCreateGlobalTrick());

        // 統計頁面 DOM
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
        const todayStr = this.getTodayDateString();
        
        // 1. 抓取雲端公共自訂招式
        let currentGlobalTricks = [];
        try {
            const globalSnapshot = await getDocs(collection(db, "global_tricks"));
            globalSnapshot.forEach(docSnap => {
                currentGlobalTricks.push(docSnap.data());
            });
        } catch (e) { console.error("無法載入全域招式", e); }

        // 2. 合併基礎範本
        let fullTemplate = [...JSON.parse(JSON.stringify(this.defaultTricks)), ...currentGlobalTricks];

        // 3. 讀取使用者進度
        const userDocRef = doc(db, "users", username);
        const docSnap = await getDoc(userDocRef);

        if (docSnap.exists()) {
            let userData = docSnap.data();
            let savedTricks = userData.tricks;

            // 確保全域最新招式有補進個人的清單中
            fullTemplate.forEach(templateTrick => {
                const hasTrick = savedTricks.some(t => t.id === templateTrick.id);
                if (!hasTrick) {
                    // ⚠️ 注意：這裡繼承全域自訂招式的初始狀態（即未解鎖 🔒）
                    savedTricks.push({
                        ...templateTrick,
                        totalCount: 0,
                        todayCount: 0,
                        isUnlocked: templateTrick.isUnlocked 
                    });
                }
            });

            this.tricks = savedTricks;

            // 分辨換日檢查
            if (userData.lastUpdateDate !== todayStr) {
                this.tricks.forEach(t => t.todayCount = 0);
                await setDoc(userDocRef, { tricks: this.tricks, lastUpdateDate: todayStr });
            }
        } else {
            this.tricks = fullTemplate;
            await setDoc(userDocRef, { tricks: this.tricks, lastUpdateDate: todayStr });
        }
        this.renderLibrary();
    },

    async handleCreateGlobalTrick() {
        if (!window.currentUser) { 
            alert("【請先登入】必須登入暱稱後，才能新增全域共享招式！"); 
            return; 
        }
        
        const name = this.domNewNameInput.value.trim();
        if (!name) { alert("請輸入招式名稱！"); return; }

        const isExist = this.tricks.some(t => t.name.toLowerCase() === name.toLowerCase());
        if (isExist) { alert("此招式已存在於招式庫中！"); return; }

        const newId = Date.now();
        const newTrickObj = {
            id: newId,
            name: name,
            totalCount: 0,
            todayCount: 0,
            isUnlocked: false, // 🌟 優化：新招式全域預設為「鎖定」🔒
            isCustom: true
        };

        try {
            // 1. 存入公共資料庫
            await setDoc(doc(db, "global_tricks", `custom_${newId}`), newTrickObj);
            
            // 2. 塞入當前操作者的列表並儲存
            this.tricks.push(newTrickObj);
            await this.saveToStorage();
            
            this.renderLibrary();
            this.domNewNameInput.value = "";
            alert(`🎉 成功新增全域招式：${name}！\n該招式已加入全域挑戰池（預設鎖定 🔒），大家重新整理或切換帳號後即可抽到它。`);
        } catch (error) {
            console.error("Firebase 寫入失敗:", error);
            alert("新增失敗，請檢查網路連線。");
        }
    },

    async saveToStorage() {
        if (window.currentUser) {
            const todayStr = this.getTodayDateString();
            const userDocRef = doc(db, "users", window.currentUser);
            await setDoc(userDocRef, { tricks: this.tricks, lastUpdateDate: todayStr });

            const logData = {};
            this.tricks.forEach(t => { if (t.todayCount > 0) logData[t.name] = t.todayCount; });
            await setDoc(doc(db, "users", window.currentUser, "daily_logs", todayStr), { logData: logData });
        } else {
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
                for (let trickName in logData) { trickDetails.push(`${trickName}: <b style="color:#e67e22;">${logData[trickName]}</b> 次`); }
                if (trickDetails.length > 0) {
                    htmlContent = `<div style="padding: 12px; border-bottom: 1px solid #eee;"><div style="font-weight:bold; color:#2c3e50; margin-bottom:4px;">📅 ${date}</div><div style="font-size:0.9rem; color:#555; padding-left:10px;">${trickDetails.join(' | ')}</div></div>` + htmlContent;
                }
            });
            this.domStatsList.innerHTML = htmlContent || `<p style="text-align:center; color:#7f8c8d; margin-top:20px;">目前尚無有效紀錄。</p>`;
        } catch (error) { this.domStatsList.innerHTML = `<p style="text-align:center; color:#e74c3c; margin-top:20px;">數據載入失敗，請稍後再試。</p>`; }
    },
    closeStatsModal() { this.domStatsModal.classList.add('hidden'); },
    async openModal() { 
        if (window.currentUser) { await this.loadUserData(window.currentUser); }
        this.renderLibrary(); 
        this.domLibraryModal.classList.remove('hidden'); 
    },
    closeModal() { this.domLibraryModal.classList.add('hidden'); },
    renderLibrary() {
        this.domList.innerHTML = this.tricks.map(trick => `
            <div class="lib-item" style="${trick.isCustom ? 'border-left: 4px solid #e67e22; background-color: #fffaf5;' : ''}">
                <span>${trick.name} ${trick.isUnlocked ? '' : '🔒'} ${trick.isCustom ? '<small style="background:#e67e22; color:white; padding:1px 4px; border-radius:3px; font-size:0.7rem;">自訂</small>' : ''}</span>
                <span class="lib-count-info">總計: ${trick.totalCount} 次</span>
            </div>
        `).join('');
    },
    getTargetCount(totalCount) { if (totalCount <= 10) return 3; if (totalCount <= 50) return 5; if (totalCount <= 100) return 10; return 20; },
    updateCount(id, amount) {
        const trick = this.tricks.find(t => t.id === id);
        if (trick) {
            if (trick.todayCount + amount >= 0) trick.todayCount += amount;
            if (trick.totalCount + amount >= 0) trick.totalCount += amount;
            this.saveToStorage();
        }
        return trick;
    },
    unlockTrick(id) { const trick = this.tricks.find(t => t.id === id); if (trick) { trick.isUnlocked = true; this.saveToStorage(); } },
    getRandomTrick() { const index = Math.floor(Math.random() * this.tricks.length); return this.tricks[index]; }
};