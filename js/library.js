// library.js
import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { tricksData } from "./tricks-data.js"; // 確保你有匯入 254 個招式的完整資料

export const TrickLibrary = {
    defaultTricks: tricksData || [], 
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

        // 🌟 核心防護 1：一啟動網頁，未登入前就立刻灌入本地 254 個完整招式，確保按鈕絕對不會卡死
        this.resetLocalTricks();
    },

    resetLocalTricks() {
        this.tricks = JSON.parse(JSON.stringify(this.defaultTricks));
    },

    // 🌟 核心防護 2：對齊 Firebase 與本地 254 個招式庫
    async loadUserProgress(username) {
        if (!username) { this.resetLocalTricks(); return; }
        try {
            const docRef = doc(db, "users", username);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const cloudData = docSnap.data();
                const savedDate = cloudData.lastSavedDate || "";
                const isNewDay = (savedDate !== this.getTodayDateString());
                
                // 取得雲端的招式對照表 (Map 或 Array 結構防護)
                const cloudTricksMap = cloudData.tricks || {};

                // 🌟 以本地 254 個招式為骨架，只比對並更新次數與解鎖狀態
                this.tricks = this.defaultTricks.map(dt => {
                    // 兼容舊格式（可能是陣列或物件）
                    let ct = null;
                    if (Array.isArray(cloudTricksMap)) {
                        ct = cloudTricksMap.find(t => t && t.id === dt.id);
                    } else {
                        ct = cloudTricksMap[dt.id];
                    }

                    if (ct) {
                        return {
                            ...dt,
                            totalCount: ct.totalCount || 0,
                            todayCount: isNewDay ? 0 : (ct.todayCount || 0),
                            isUnlocked: ct.isUnlocked !== undefined ? ct.isUnlocked : dt.isUnlocked
                        };
                    }
                    // 如果雲端沒有這個招式（代表是後來新增的招式），就直接用本地預設
                    return { ...dt };
                });

                // 載入自訂招式
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
            console.error("Firebase 載入失敗，直接啟用本地招式庫:", e);
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
                    <span style="font-size:0.75rem; background:#7f8c8d; color:white; padding:1px 4px; border-radius:3px; margin-right:4px;">
                        ${trick.category || '未分類'} ➔ ${trick.subcategory || '未分類'}
                    </span>
                    <strong style="display:block; margin-top:3px;">
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