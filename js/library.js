// js/library.js
import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { tricksData } from "./tricks-data.js"; 

export const TrickLibrary = {
    defaultTricks: (typeof tricksData !== 'undefined' && tricksData) ? tricksData : [],
    tricks: [],
    historyData: {}, // 🎯 新增：用來暫存從 Firebase 撈出來的歷史紀錄物件

    getTodayDateString() {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    },

    async init() {
        this.domLibraryModal = document.getElementById('modal-library');
        this.domTrigger = document.getElementById('btn-library-trigger');
        this.domClose = document.getElementById('btn-library-close');
        this.domList = document.getElementById('library-list');

        if (this.domTrigger) this.domTrigger.onclick = () => this.openModal();
        if (this.domClose) this.domClose.onclick = () => this.closeModal();

        this.resetLocalTricks();
    },

    resetLocalTricks() {
        this.tricks = JSON.parse(JSON.stringify(this.defaultTricks));
        this.historyData = {};
    },

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

                // 🎯 讀取並保存雲端完整的歷史紀錄
                this.historyData = cloudData.history || {};

                this.tricks = this.defaultTricks.map(dt => {
                    let ct = null;
                    if (cloudTricks) {
                        if (Array.isArray(cloudTricks)) {
                            ct = cloudTricks.find(t => t && t.id === dt.id);
                        } else {
                            ct = cloudTricks[dt.id];
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
                    return { ...dt };
                });

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
            console.error("Firebase 載入失敗:", e);
            this.resetLocalTricks();
        }
    },

    async saveUserProgress(username) {
        if (!username) return; 
        try {
            const docRef = doc(db, "users", username);
            const tricksMap = {};
            const customTricksArray = [];
            
            const todayDate = this.getTodayDateString();
            const todayLogs = {};
            let hasTodayData = false;

            this.tricks.forEach(t => {
                // 🎯 嚴格判定：只有今天大於 0 次的招式，才寫入當日紀錄
                if (t.todayCount > 0) {
                    todayLogs[t.id] = {
                        name: t.name,
                        count: t.todayCount
                    };
                    hasTodayData = true;
                }

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

            const uploadPayload = {
                tricks: tricksMap,
                customTricks: customTricksArray,
                lastSavedDate: todayDate
            };

            // 🎯 核心修改：只有當天確實有數據產生時，才包裝上傳歷史物件
            if (hasTodayData) {
                uploadPayload.history = {
                    [todayDate]: todayLogs
                };
                // 更新本地暫存，讓統計視窗免重整立即可見
                this.historyData[todayDate] = todayLogs;
            }

            await setDoc(docRef, uploadPayload, { merge: true });
            
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
        if (trick) {
            trick.isUnlocked = true;
            // 🎯 關鍵：底層數據必須在這裡自動 +1，AppController 渲染與儲存時才拿得到 1 次
            trick.todayCount = (trick.todayCount || 0) + 1;
            trick.totalCount = (trick.totalCount || 0) + 1;
        }
    }
};