// library.js
import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { tricksData } from "./tricks-data.js"; // 🌟 匯入獨立的 254 個招式庫

export const TrickLibrary = {
    defaultTricks: tricksData, // 🌟 直接套用外部完整的招式庫
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

        if (this.domTrigger) {
            this.domTrigger.addEventListener('click', () => this.openModal());
        }
        if (this.domClose) {
            this.domClose.addEventListener('click', () => this.closeModal());
        }

        this.resetLocalTricks();
    },

    resetLocalTricks() {
        this.tricks = JSON.parse(JSON.stringify(this.defaultTricks));
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
                const cloudTricksMap = cloudData.tricks || {};

                // 🌟 核心對齊：用 254 個標準招式為基底，合併雲端進度
                this.tricks = this.defaultTricks.map(dt => {
                    const ct = cloudTricksMap[dt.id];
                    if (ct) {
                        return {
                            ...dt,
                            totalCount: ct.totalCount || 0,
                            todayCount: isNewDay ? 0 : (ct.todayCount || 0),
                            isUnlocked: ct.isUnlocked !== undefined ? ct.isUnlocked : dt.isUnlocked
                        };
                    }
                    return dt;
                });

                // 合併自訂招式
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
            console.error("載入進度失敗，改用本地預設招式:", e);
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
            console.error("同步進度至雲端失敗:", e);
        }
    },

    openModal() {
        if (window.AppController && typeof window.AppController.refreshStableSelect === 'function') {
            window.AppController.refreshStableSelect();
        }
        this.renderLibrary(); 
        this.domLibraryModal.classList.remove('hidden'); 
    },
    
    closeModal() { this.domLibraryModal.classList.add('hidden'); },

    // 🌟 修正後的優化渲染：顯示完整大分類、小分類與解鎖鎖定圖示
    renderLibrary() {
        this.domList.innerHTML = this.tricks.map(trick => `
            <div class=\"lib-item\" style=\"${trick.isCustom ? 'border-left: 4px solid #e67e22; background-color: #fffaf5;' : ''}\">
                <div>
                    <span style=\"font-size:0.75rem; background:#7f8c8d; color:white; padding:1px 4px; border-radius:3px; margin-right:4px;\">
                        ${trick.category || '未分類'} ➔ ${trick.subcategory || '未分類'}
                    </span>
                    <strong style=\"display:block; margin-top:3px;\">
                        ${trick.name} ${trick.isUnlocked ? '' : '🔒'} 
                        ${trick.isCustom ? '<small style=\"background:#e67e22; color:white; padding:1px 3px; border-radius:3px; font-size:0.65rem;\">自訂</small>' : ''}
                    </strong>
                </div>
                <span class=\"lib-count-info\">總計: ${trick.totalCount} 次</span>
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