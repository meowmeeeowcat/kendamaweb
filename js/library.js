// library.js
import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { tricksData } from "./tricks-data.js"; // 🌟 確保你有正確引入 254 個招式的完整資料檔案

export const TrickLibrary = {
    // 如果匯入失敗，就用舊的 8 個保底，確保程式絕對不崩潰
    defaultTricks: (typeof tricksData !== 'undefined' && tricksData) ? tricksData : [
        { id: 1, name: "大皿 (Big Cup)", totalCount: 0, todayCount: 0, isUnlocked: true, category: "皿技", subcategory: "基礎技" },
        { id: 2, name: "小皿 (Small Cup)", totalCount: 0, todayCount: 0, isUnlocked: true, category: "皿技", subcategory: "基礎技" },
        { id: 3, name: "中皿 (Base Cup)", totalCount: 0, todayCount: 0, isUnlocked: true, category: "皿技", subcategory: "基礎技" },
        { id: 4, name: "蠟燭 (Candle)", totalCount: 0, todayCount: 0, isUnlocked: false, category: "皿技", subcategory: "基礎技" },
        { id: 5, name: "飛行大皿 (Airplane)", totalCount: 0, todayCount: 0, isUnlocked: false, category: "皿技", subcategory: "基礎技" },
        { id: 6, name: "日本一周 (Around Japan)", totalCount: 0, todayCount: 0, isUnlocked: false, category: "手眼技", subcategory: "一周技" },
        { id: 7, name: "世界一周 (Around the World)", totalCount: 0, todayCount: 0, isUnlocked: false, category: "手眼技", subcategory: "一周技" },
        { id: 8, name: "燈塔 (Lighthouse)", totalCount: 0, todayCount: 0, isUnlocked: false, category: "平衡技", subcategory: "燈塔池" }
    ],
    tricks: [],

    getTodayDateString() {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    },

    async init() {
        this.domLibraryModal = document.getElementById('modal-library');
        this.domTrigger = document.getElementById('btn-library-trigger');
        this.domClose = document.getElementById('btn-library-close');
        this.domList = document.getElementById('library-list');

        if (this.domTrigger) this.domTrigger.addEventListener('click', () => this.openModal());
        if (this.domClose) this.domClose.addEventListener('click', () => this.closeModal());

        // 🌟 核心修正：網頁一打開，在還沒載入雲端或未登入前，立刻灌入本地 254 個完整招式！
        this.resetLocalTricks();
    },

    resetLocalTricks() {
        // 深拷貝預設招式，避免污染原始資料
        this.tricks = JSON.parse(JSON.stringify(this.defaultTricks));
    },

    // 🌟 核心修正：安全的雲端與本地同步邏輯
    async loadUserProgress(username) {
        if (!username) { this.resetLocalTricks(); return; }
        try {
            const docRef = doc(db, "users", username);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const cloudData = docSnap.data();
                const savedDate = cloudData.lastSavedDate || "";
                const isNewDay = (savedDate !== this.getTodayDateString());
                const cloudTricks = cloudData.tricks;

                // 🌟 以本地 254 個招式為骨架，只拿雲端的次數跟解鎖狀態來填入
                this.tricks = this.defaultTricks.map(dt => {
                    let ct = null;
                    if (cloudTricks) {
                        if (Array.isArray(cloudTricks)) {
                            ct = cloudTricks.find(t => t && t.id === dt.id);
                        } else {
                            ct = cloudTricks[dt.id]; // 支援 Map 格式
                        }
                    }

                    if (ct) {
                        return {
                            ...dt,
                            totalCount: typeof ct.totalCount === 'number' ? ct.totalCount : 0,
                            todayCount: isNewDay ? 0 : (typeof ct.todayCount === 'number' ? ct.todayCount : 0),
                            isUnlocked: ct.isUnlocked !== undefined ? ct.isUnlocked : dt.isUnlocked
                        };
                    }
                    // 雲端如果沒有這個招式（代表是新增的招式），就直接用本地預設
                    return { ...dt };
                });

                // 載入玩家個人自訂的外加招式
                if (cloudData.customTricks && Array.isArray(cloudData.customTricks)) {
                    cloudData.customTricks.forEach(ct => {
                        this.tricks.push({
                            ...ct,
                            todayCount: isNewDay ? 0 : (ct.todayCount || 0)
                        });
                    });
                }
            } else {
                this.resetLocalTricks();
            }
        } catch (e) {
            console.error("Firebase 進度下載失敗，啟動本地招式庫防護:", e);
            this.resetLocalTricks();
        }
    },

    async saveUserProgress(username) {
        if (!username) return; 
        try {
            const docRef = doc(db, "users", username);
            const tricksMap = {};
            const customTricksArray = [];

            this.tricks.forEach(t => {
                if (t.isCustom) {
                    customTricksArray.push(t);
                } else {
                    tricksMap[t.id] = {
                        id: t.id,
                        name: t.name,
                        totalCount: t.totalCount,
                        todayCount: t.todayCount,
                        isUnlocked: t.isUnlocked
                    };
                }
            });

            await setDoc(docRef, {
                tricks: tricksMap,
                customTricks: customTricksArray,
                lastSavedDate: this.getTodayDateString()
            }, { merge: true });
        } catch (e) {
            console.error("同步至 Firebase 失敗:", e);
        }
    },

    openModal() {
        if (window.AppController && typeof window.AppController.refreshStableSelect === 'function') {
            window.AppController.refreshStableSelect();
        }
        this.renderLibrary(); 
        if (this.domLibraryModal) this.domLibraryModal.classList.remove('hidden'); 
    },
    
    closeModal() { if (this.domLibraryModal) this.domLibraryModal.classList.add('hidden'); },

    renderLibrary() {
        if (!this.domList) return;
        this.domList.innerHTML = this.tricks.map(trick => `
            <div class="lib-item" style="${trick.isCustom ? 'border-left: 4px solid #e67e22; background-color: #fffaf5;' : ''}">
                <div>
                    <span style="font-size:0.72rem; background:#7f8c8d; color:white; padding:1px 4px; border-radius:3px; margin-right:4px;">
                        ${trick.category || '未分類'} ➔ ${trick.subcategory || '未分類'}
                    </span>
                    <strong style="display:block; margin-top:3px; color:#2c3e50;">
                        ${trick.name} ${trick.isUnlocked ? '' : '🔒'} 
                    </strong>
                </div>
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
        }
    },

    unlockTrick(id) {
        const trick = this.tricks.find(t => t.id === id);
        if (trick) trick.isUnlocked = true;
    }
};