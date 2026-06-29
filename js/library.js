// js/library.js
import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { tricksData } from "./tricks-data.js"; 

export const TrickLibrary = {
    defaultTricks: (typeof tricksData !== 'undefined' && tricksData) ? tricksData : [],
    tricks: [],
    historyData: {}, 

    getTodayDateString() {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    },

    async init() {
        this.domLibraryModal = document.getElementById('modal-library');
        this.domTrigger = document.getElementById('btn-library-trigger');
        this.domClose = document.getElementById('btn-library-close');
        this.domList = document.getElementById('library-list');
        
        // 🎯 新增：取得篩選 DOM 節點
        this.domFilterCategory = document.getElementById('filter-category');
        this.domFilterSubcategory = document.getElementById('filter-subcategory');

        if (this.domTrigger) this.domTrigger.onclick = () => this.openModal();
        if (this.domClose) this.domClose.onclick = () => this.closeModal();

        // 🎯 新增：綁定篩選選單切換事件
        if (this.domFilterCategory) {
            this.domFilterCategory.onchange = () => {
                this.updateSubcategoryOptions(); // 大分類改了，連動更新小分類清單
                this.renderLibrary();
            };
        }
        if (this.domFilterSubcategory) {
            this.domFilterSubcategory.onchange = () => this.renderLibrary();
        }

        this.resetLocalTricks();
    },

    resetLocalTricks() {
        this.tricks = JSON.parse(JSON.stringify(this.defaultTricks));
        this.historyData = {};
    },

    // 🎯 新增：動態生成大分類與小分類選單選項
    initFilterOptions() {
        if (!this.domFilterCategory) return;
        
        // 收集所有不重複的大分類
        const categories = new Set();
        this.tricks.forEach(t => { if (t.category) categories.add(t.category); });
        
        // 填入大分類下拉選單
        this.domFilterCategory.innerHTML = '<option value="">全部大分類</option>';
        categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.innerText = cat;
            this.domFilterCategory.appendChild(opt);
        });

        // 初始填充小分類
        this.updateSubcategoryOptions();
    },

    // 🎯 新增：根據選擇的大分類，連動更新小分類的選項
    updateSubcategoryOptions() {
        if (!this.domFilterCategory || !this.domFilterSubcategory) return;
        
        const selectedCat = this.domFilterCategory.value;
        const subcategories = new Set();
        
        // 根據大分類過濾出對應的小分類
        this.tricks.forEach(t => {
            if (!selectedCat || t.category === selectedCat) {
                if (t.subcategory) subcategories.add(t.subcategory);
            }
        });

        this.domFilterSubcategory.innerHTML = '<option value="">全部小分類</option>';
        subcategories.forEach(sub => {
            const opt = document.createElement('option');
            opt.value = sub;
            opt.innerText = sub;
            this.domFilterSubcategory.appendChild(opt);
        });
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
                if (t.todayCount > 0) {
                    todayLogs[t.id] = { name: t.name, count: t.todayCount };
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

            if (hasTodayData) {
                uploadPayload.history = { [todayDate]: todayLogs };
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
        
        // 🎯 新增：開啟彈窗時，重置並初始化分類下拉選單清單選項
        this.initFilterOptions();
        
        this.renderLibrary(); 
        if (this.domLibraryModal) this.domLibraryModal.classList.remove('hidden'); 
    },
    
    closeModal() { if (this.domLibraryModal) this.domLibraryModal.classList.add('hidden'); },

    renderLibrary() {
        if (!this.domList) return;

        // 🎯 核心修改：取得當前下拉選單選中的篩選條件值
        const selectedCat = this.domFilterCategory ? this.domFilterCategory.value : "";
        const selectedSub = this.domFilterSubcategory ? this.domFilterSubcategory.value : "";

        // 🎯 核心修改：過濾出符合條件的招式
        const filteredTricks = this.tricks.filter(trick => {
            const matchCat = !selectedCat || trick.category === selectedCat;
            const matchSub = !selectedSub || trick.subcategory === selectedSub;
            return matchCat && matchSub;
        });

        if (filteredTricks.length === 0) {
            this.domList.innerHTML = `<div style="text-align:center; color:#95a5a6; padding: 20px;">找不到符合此分類的招式</div>`;
            return;
        }

        // 渲染過濾後的清單
        this.domList.innerHTML = filteredTricks.map(trick => `
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
            trick.todayCount = (trick.todayCount || 0) + 1;
            trick.totalCount = (trick.totalCount || 0) + 1;
        }
    }
};