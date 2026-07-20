// js/library.js
import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { tricksData } from "./tricks-data.js"; 

export const TrickLibrary = {
    defaultTricks: (typeof tricksData !== 'undefined' && tricksData) ? tricksData : [],
    tricks: [],
    historyData: {},
    _saveTimer: null,
    _pendingUser: null,

    // 🎯 新增：debounce 儲存。原本每按一次 +1/-1 就立刻打一次 Firestore setDoc，
    // 連續點擊會產生大量不必要的寫入，甚至可能因為網路延遲導致「較新的次數」
    // 被「較舊但比較晚回來」的請求覆蓋掉（race condition）。
    // 改成：短時間內的多次呼叫合併成一次，等使用者停止點擊 800ms 後才真正上傳。
    scheduleSave(username, delay = 800) {
        if (!username) return;
        this._pendingUser = username;
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
            this._saveTimer = null;
            this.saveUserProgress(this._pendingUser);
        }, delay);
    },

    // 立即把還沒送出的 debounce 儲存強制送出（例如切換帳號、關閉頁面前）
    async flushSave() {
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
            if (this._pendingUser) await this.saveUserProgress(this._pendingUser);
        }
    },

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

        // 🎯 修正：今日統計彈窗原本是寫在 index.html 的獨立 <script> 內，
        // 直接伸手進來讀 TrickLibrary 的內部資料，等於把資料邏輯拆成兩份、放在兩個地方維護。
        // 統一搬進 library.js，讓 index.html 只負責畫面結構。
        this.domStatsModal = document.getElementById('modal-stats');
        this.domStatsTrigger = document.getElementById('btn-stats-trigger');
        this.domStatsClose = document.getElementById('btn-stats-close');
        this.domStatsList = document.getElementById('stats-list');

        if (this.domTrigger) this.domTrigger.onclick = () => this.openModal();
        if (this.domClose) this.domClose.onclick = () => this.closeModal();
        if (this.domStatsTrigger) this.domStatsTrigger.onclick = () => this.openStatsModal();
        if (this.domStatsClose) this.domStatsClose.onclick = () => this.closeStatsModal();

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

    // 🎯 修正：改為回傳 needsResave (boolean)，讓呼叫端知道「是否真的需要」重新上傳。
    // 舊版每次登入都會無條件呼叫 saveUserProgress()，一旦這裡讀取失敗（例如網路問題），
    // 就會把本地重置後的「全部歸零」資料寫回 Firebase，等於把使用者雲端進度整個清空。
    // 現在：讀取失敗時回傳 false，呼叫端就不會誤觸發覆蓋寫入。
    async loadUserProgress(username) {
        if (!username) { this.resetLocalTricks(); return false; }
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

                // 只有「雲端招式數量少於目前招式庫」(舊帳號、招式庫更新過) 才需要重新上傳升級
                const cloudCount = cloudTricks
                    ? (Array.isArray(cloudTricks) ? cloudTricks.length : Object.keys(cloudTricks).length)
                    : 0;
                return cloudCount < this.defaultTricks.length;
            } else {
                this.resetLocalTricks();
                return true; // 全新帳號，雲端還沒有資料，需要建立初始文件
            }
        } catch (e) {
            console.error("Firebase 載入失敗:", e);
            this.resetLocalTricks();
            return false; // 讀取失敗，絕不能反過來把雲端資料蓋成空白
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

    openStatsModal() {
        if (!this.domStatsModal || !this.domStatsList) return;

        const todayStr = this.getTodayDateString();
        let htmlContent = "";
        const todayLogs = this.historyData && this.historyData[todayStr];

        if (todayLogs) {
            Object.keys(todayLogs).forEach(id => {
                const item = todayLogs[id];
                htmlContent += `
                    <div class="lib-item">
                        <div><strong class="item-title">${item.name}</strong></div>
                        <span class="lib-count-info highlighted">今日: <span>${item.count}</span> 次</span>
                    </div>
                `;
            });
        } else {
            this.tricks.forEach(trick => {
                if (trick.todayCount > 0) {
                    htmlContent += `
                        <div class="lib-item">
                            <div><strong class="item-title">${trick.name}</strong></div>
                            <span class="lib-count-info highlighted">今日: <span>${trick.todayCount}</span> 次</span>
                        </div>
                    `;
                }
            });
        }

        this.domStatsList.innerHTML = htmlContent || `<div class="empty-tip">今日暫無有效練習數據</div>`;
        this.domStatsModal.classList.remove('hidden');
    },

    closeStatsModal() {
        if (this.domStatsModal) this.domStatsModal.classList.add('hidden');
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

    // 🎯 新增：統一產生「招式名稱 (大分類/小分類)」的顯示字串。
    // 原本 app.js 直接寫 `${t.category || ''}/${t.subcategory || ''}`，
    // 當兩者皆為空時會顯示成不好看的 "招式名稱 ()" 或 "招式名稱 (/)"。
    formatTrickLabel(trick) {
        if (!trick) return '';
        const meta = [trick.category, trick.subcategory].filter(Boolean).join('/');
        return meta ? `${trick.name} (${meta})` : trick.name;
    },

    getTargetCount(totalCount) { 
        if (totalCount <= 10) return 3; 
        if (totalCount <= 50) return 5; 
        if (totalCount <= 100) return 10; 
        return 20; 
    },

    updateCount(id, amount) {
        const trick = this.tricks.find(t => t.id === id);
        if (!trick) return;

        // 🎯 修正：原本 todayCount / totalCount 各自獨立判斷是否 >= 0，
        // 當兩者數值不同時（例如跨日重置後 todayCount=0 但 totalCount>0）
        // 按下「-」可能只讓其中一個扣減，導致兩者從此不同步。
        // 改成同時檢查兩者，任一個會小於 0 就整組不執行。
        const nextToday = trick.todayCount + amount;
        const nextTotal = trick.totalCount + amount;
        if (nextToday < 0 || nextTotal < 0) return;

        trick.todayCount = nextToday;
        trick.totalCount = nextTotal;
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