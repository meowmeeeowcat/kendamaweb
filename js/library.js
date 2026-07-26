// js/library.js
import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { tricksData } from "./tricks-data.js"; 

export const TrickLibrary = {
    defaultTricks: (typeof tricksData !== 'undefined' && tricksData) ? tricksData : [],
    tricks: [],
    historyData: {},
    activeMode: 'none', // 'none' | 'bulk' | 'master'
    _saveTimer: null,
    _pendingUser: null,

    // 新增：debounce 儲存。原本每按一次 +1/-1 就立刻打一次 Firestore setDoc，
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
        this.domList = document.getElementById('library-list');
        
        // 新增：取得篩選 DOM 節點
        this.domFilterCategory = document.getElementById('filter-category');
        this.domFilterSubcategory = document.getElementById('filter-subcategory');

        // 修正：今日統計原本是彈窗，現在直接顯示於主畫面上，
        // 不再需要開關彈窗，只需要抓到主畫面上的清單容器並隨時重新渲染即可。
        this.domStatsList = document.getElementById('stats-section-list');

        // 招式庫改成獨立頁面後，頁面的顯示／隱藏交給 app.js 的頁面切換邏輯處理；
        // 這裡的 onEnterLibraryPage() 只負責「每次切換進招式庫頁面時」要重新整理的內容。

        // 新增：綁定篩選選單切換事件
        if (this.domFilterCategory) {
            this.domFilterCategory.onchange = () => {
                this.updateSubcategoryOptions(); // 大分類改了，連動更新小分類清單
                this.renderLibrary();
            };
        }
        if (this.domFilterSubcategory) {
            this.domFilterSubcategory.onchange = () => this.renderLibrary();
        }

        // 一鍵解鎖模式 + 移除熟練招式模式：兩者互斥，用同一個 activeMode 狀態機管理
        // ('none' | 'bulk' | 'master')
        this.activeMode = 'none';
        this.bulkSelectedIds = new Set();   // 一鍵解鎖模式勾選中的招式 id
        this.masterSelectedIds = new Set(); // 移除熟練招式模式勾選中的招式 id

        this.domBulkToggle = document.getElementById('btn-bulk-unlock-toggle');
        this.domBulkActions = document.getElementById('bulk-unlock-actions');
        this.domBulkConfirm = document.getElementById('btn-bulk-unlock-confirm');
        this.domBulkCancel = document.getElementById('btn-bulk-unlock-cancel');
        this.domBulkSelectAllRow = document.getElementById('bulk-select-all-row');
        this.domBulkSelectAllCheckbox = document.getElementById('chk-bulk-select-all');

        this.domMasterToggle = document.getElementById('btn-master-remove-toggle');
        this.domMasterActions = document.getElementById('master-remove-actions');
        this.domMasterConfirm = document.getElementById('btn-master-remove-confirm');
        this.domMasterCancel = document.getElementById('btn-master-remove-cancel');
        this.domMasterSelectAllRow = document.getElementById('master-select-all-row');
        this.domMasterSelectAllCheckbox = document.getElementById('chk-master-select-all');

        // 排序：開啟招式庫就直接顯示排序依據選單，不需要另外按按鈕展開
        this.domSortSelect = document.getElementById('select-sort-mode');
        this.sortMode = 'default';
        if (this.domSortSelect) {
            this.domSortSelect.onchange = (e) => {
                this.sortMode = e.target.value;
                this.renderLibrary();
            };
        }

        // 新增：熟練招式「目標次數」自訂規則彈窗
        this.domTargetRulesToggle = document.getElementById('btn-target-rules-toggle');
        this.domTargetRulesModal = document.getElementById('modal-target-rules');
        this.domTargetRulesList = document.getElementById('target-rules-list');
        this.domTargetRuleAdd = document.getElementById('btn-target-rule-add');
        this.domTargetRulesSave = document.getElementById('btn-target-rules-save');
        this.domTargetRulesClose = document.getElementById('btn-target-rules-close');
        this.workingTargetRules = []; // 編輯中的暫存規則，按下「儲存」才會真的寫入 localStorage

        if (this.domTargetRulesToggle) this.domTargetRulesToggle.onclick = () => this.openTargetRulesModal();
        if (this.domTargetRulesClose) {
            this.domTargetRulesClose.onclick = () => {
                if (this.domTargetRulesModal) this.domTargetRulesModal.classList.add('hidden');
            };
        }
        if (this.domTargetRuleAdd) {
            this.domTargetRuleAdd.onclick = () => {
                const last = this.workingTargetRules[this.workingTargetRules.length - 1];
                this.workingTargetRules.push({
                    maxCount: last ? last.maxCount + 50 : 10,
                    target: last ? last.target + 5 : 5
                });
                this.renderTargetRulesList();
            };
        }
        if (this.domTargetRulesList) {
            this.domTargetRulesList.addEventListener('click', (e) => {
                const btn = e.target.closest('.btn-rule-delete');
                if (!btn) return;
                if (this.workingTargetRules.length <= 1) {
                    alert('至少要保留一條規則！');
                    return;
                }
                const index = parseInt(btn.getAttribute('data-index'), 10);
                this.workingTargetRules.splice(index, 1);
                this.renderTargetRulesList();
            });
        }
        if (this.domTargetRulesSave) {
            this.domTargetRulesSave.onclick = async () => {
                if (!this.domTargetRulesList) return;
                const rows = this.domTargetRulesList.querySelectorAll('.target-rule-row');
                const rules = Array.from(rows).map(row => ({
                    maxCount: parseInt(row.querySelector('.rule-max-count').value, 10) || 0,
                    target: parseInt(row.querySelector('.rule-target').value, 10) || 1
                }));

                if (rules.length === 0) {
                    alert('至少要保留一條規則！');
                    return;
                }

                this.workingTargetRules = await this.saveTargetRules(rules);

                // 目標次數規則變了，主畫面「今日穩固招式」顯示的目標次數要跟著更新
                if (window.AppController && typeof window.AppController.renderStableCard === 'function') {
                    window.AppController.renderStableCard();
                }

                // 不跳提示框，直接關閉頁面當作「已儲存」的提醒
                if (this.domTargetRulesModal) this.domTargetRulesModal.classList.add('hidden');
            };
        }

        if (this.domBulkToggle) this.domBulkToggle.onclick = () => this.setMode('bulk');
        if (this.domBulkCancel) this.domBulkCancel.onclick = () => this.setMode('none');
        if (this.domMasterToggle) this.domMasterToggle.onclick = () => this.setMode('master');
        if (this.domMasterCancel) this.domMasterCancel.onclick = () => this.setMode('none');

        // 新增：用事件委派監聽清單裡的 checkbox 勾選狀態，依照目前的模式同步記錄到對應的
        // Set（一鍵解鎖 or 移除熟練），這樣切換分類篩選重新渲染清單後，已經勾選過的招式
        // 仍然會保持勾選（不會被畫面重繪清空）。
        if (this.domList) {
            this.domList.addEventListener('change', (e) => {
                if (!e.target.classList || !e.target.classList.contains('bulk-unlock-checkbox')) return;
                const id = e.target.getAttribute('data-id');
                const targetSet = this.activeMode === 'master' ? this.masterSelectedIds : this.bulkSelectedIds;
                if (e.target.checked) {
                    targetSet.add(id);
                } else {
                    targetSet.delete(id);
                }
                this.syncSelectAllCheckboxes();
            });
        }

        // 全選 checkbox：範圍只限「目前篩選條件下看得到」的招式。
        this.bindSelectAllCheckbox(this.domBulkSelectAllCheckbox, () => this.bulkSelectedIds);
        this.bindSelectAllCheckbox(this.domMasterSelectAllCheckbox, () => this.masterSelectedIds);

        if (this.domBulkConfirm) {
            this.domBulkConfirm.onclick = async () => {
                const ids = Array.from(this.bulkSelectedIds);

                if (ids.length === 0) {
                    alert('請至少勾選一個招式再確認解鎖！');
                    return;
                }

                const count = this.bulkUnlock(ids);
                this.setMode('none');

                if (window.AppController) {
                    if (typeof window.AppController.refreshStableSelect === 'function') window.AppController.refreshStableSelect();
                    if (typeof window.AppController.refreshChallengeSelect === 'function') window.AppController.refreshChallengeSelect();
                    if (typeof window.AppController.onBulkUnlockDone === 'function') window.AppController.onBulkUnlockDone();
                }

                // 用 window.currentUser 而不是 import AuthSystem，避免 library.js 與 auth.js 互相 import 造成循環依賴
                if (window.currentUser) {
                    await this.saveUserProgress(window.currentUser);
                }

                alert(`已成功解鎖 ${count} 個招式！`);
            };
        }

        // 新增：移除熟練招式。勾選的招式維持已解鎖狀態，但會被標記為「已熟練」，
        // 從此不再出現在「今日穩固招式」的隨機池與手選選單中；招式庫清單則會用側邊顏色標示。
        if (this.domMasterConfirm) {
            this.domMasterConfirm.onclick = async () => {
                const ids = Array.from(this.masterSelectedIds);

                if (ids.length === 0) {
                    alert('請至少勾選一個招式再確認！');
                    return;
                }

                const count = this.markMastered(ids);
                this.setMode('none');

                if (window.AppController) {
                    if (typeof window.AppController.refreshStableSelect === 'function') window.AppController.refreshStableSelect();
                    if (typeof window.AppController.onMasterRemoveDone === 'function') window.AppController.onMasterRemoveDone();
                }

                if (window.currentUser) {
                    await this.saveUserProgress(window.currentUser);
                }

                alert(`已將 ${count} 個招式移出今日穩固招式！`);
            };
        }

        this.resetLocalTricks();
    },

    // 新增：綁定「全選」checkbox。勾選時把目前篩選範圍內看得到的招式全部加入對應的 Set，
    // 取消勾選則全部移除；範圍完全依照目前的分類篩選與模式（一鍵解鎖／移除熟練）而定。
    bindSelectAllCheckbox(checkboxEl, getSet) {
        if (!checkboxEl) return;
        checkboxEl.onchange = (e) => {
            const targetSet = getSet();
            const visible = this.getFilteredTricks();
            visible.forEach(t => {
                if (e.target.checked) {
                    targetSet.add(t.id);
                } else {
                    targetSet.delete(t.id);
                }
            });
            this.renderLibrary();
        };
    },

    // 新增：依目前篩選範圍內的勾選狀況，同步「全選」checkbox 的勾選／半勾選狀態
    syncSelectAllCheckboxes() {
        const visible = this.getFilteredTricks();
        const applyState = (checkboxEl, selectedSet) => {
            if (!checkboxEl) return;
            const selectedCount = visible.filter(t => selectedSet.has(t.id)).length;
            checkboxEl.checked = visible.length > 0 && selectedCount === visible.length;
            checkboxEl.indeterminate = selectedCount > 0 && selectedCount < visible.length;
        };
        if (this.activeMode === 'bulk') applyState(this.domBulkSelectAllCheckbox, this.bulkSelectedIds);
        if (this.activeMode === 'master') applyState(this.domMasterSelectAllCheckbox, this.masterSelectedIds);
    },

    resetLocalTricks() {
        this.tricks = JSON.parse(JSON.stringify(this.defaultTricks));
        this.historyData = {};
        // 訪客模式（未登入）沒有雲端帳號，讀回這台裝置上次存過的規則；沒存過就是 null（套用預設值）
        this.targetRules = this.loadGuestTargetRules();
    },

    // 新增：動態生成大分類與小分類選單選項
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

    // 新增：根據選擇的大分類，連動更新小分類的選項
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

    // 新增：自動偵測「舊版純數字招式 ID」格式的雲端資料（例如 "1","2","3"...），
    // 並依照原本的數字順序，對應搬遷到目前的新版 ID（例如 "1_1_1"）。
    // 招式 ID 從純數字改成「大分類_小分類_序號」格式後，陣列本身的排列順序並沒有變動，
    // 只有 id 欄位的寫法改變，所以「舊的第 N 個數字」＝「目前 defaultTricks 陣列中的第 N 筆」。
    // 這是一個通用的防範措施：未來不管哪個帳號、只要還留著舊格式資料，登入時都會自動修好，
    // 不需要每次都手動處理。
    // 回傳 { tricks, migrated }：migrated 為 true 代表有搬過資料，呼叫端應該立刻回存新格式。
    migrateLegacyTricksIfNeeded(cloudTricks) {
        if (!cloudTricks) return { tricks: {}, migrated: false };

        const entries = Array.isArray(cloudTricks)
            ? cloudTricks.map((t, idx) => [String(t && t.id !== undefined ? t.id : idx + 1), t])
            : Object.entries(cloudTricks);

        if (entries.length === 0) return { tricks: {}, migrated: false };

        // 目前新版 ID 一定含有底線（例如 "1_1_1"）；只有當「全部」key 都是純數字時，
        // 才判斷這是舊版資料，避免誤判正常的新版資料。
        const looksLegacy = entries.every(([key]) => /^\d+$/.test(key));
        if (!looksLegacy) {
            return { tricks: Array.isArray(cloudTricks) ? Object.fromEntries(entries) : cloudTricks, migrated: false };
        }

        console.warn(`偵測到舊版純數字招式 ID 資料，自動依原本順序搬遷至新版 ID...`);

        const sortedByOldNumber = entries
            .map(([key, val]) => [parseInt(key, 10), val])
            .filter(([num]) => !isNaN(num))
            .sort((a, b) => a[0] - b[0]);

        const migratedTricks = {};
        sortedByOldNumber.forEach(([, val], idx) => {
            const targetTrick = this.defaultTricks[idx];
            if (targetTrick && val) {
                migratedTricks[targetTrick.id] = {
                    totalCount: typeof val.totalCount === 'number' ? val.totalCount : 0,
                    isUnlocked: val.isUnlocked !== undefined ? val.isUnlocked : targetTrick.isUnlocked
                };
            }
        });

        return { tricks: migratedTricks, migrated: true };
    },

    // 修正：儲存邏輯拆成「全域資料」與「每日資料」兩種文件：
    // - users/{username}：只放「跟預設狀態不同」的招式（已解鎖、或累積次數 > 0），
    //   也就是解鎖狀態與累積次數這種「不分哪一天、永久累積」的全域資料。
    // - users/{username}/days/{yyyy-mm-dd}：每個有登入練習過的日期各自一份文件，
    //   只記錄「當天」有練習到的招式與次數，不會混進全域的累積次數／解鎖狀態。
    // 這樣一來，全域文件不會每次都寫入全部 254 個招式（大幅減少資料量），
    // 而且往後想看某一天練了什麼，直接讀那一天的獨立文件即可，不用整份撈出來過濾。
    //
    // 回傳 needsResave (boolean)，讓呼叫端知道「是否真的需要」重新上傳。
    // 讀取失敗時回傳 false，呼叫端就不會誤觸發覆蓋寫入，避免把本地重置後的空白資料蓋掉雲端進度。
    async loadUserProgress(username) {
        if (!username) { this.resetLocalTricks(); return false; }
        try {
            const todayDate = this.getTodayDateString();
            const userDocRef = doc(db, "users", username);
            const dayDocRef = doc(db, "users", username, "days", todayDate);

            const [userSnap, daySnap] = await Promise.all([getDoc(userDocRef), getDoc(dayDocRef)]);

            if (userSnap.exists()) {
                const cloudData = userSnap.data();

                // 自動偵測並搬遷舊版純數字 ID 資料（找回貓貓等舊帳號的解鎖與累積次數紀錄）
                const { tricks: cloudTricks, migrated } = this.migrateLegacyTricksIfNeeded(cloudData.tricks);

                const todayLogs = (daySnap.exists() && daySnap.data().logs) ? daySnap.data().logs : {};
                this.historyData = { [todayDate]: todayLogs };

                // 目標次數規則跟著帳號走：有存過就用雲端的，沒有就是 null（getTargetRules() 會自動套用預設值）
                this.targetRules = Array.isArray(cloudData.targetRules) && cloudData.targetRules.length > 0
                    ? cloudData.targetRules
                    : null;

                this.tricks = this.defaultTricks.map(dt => {
                    const ct = cloudTricks[dt.id];
                    const todayEntry = todayLogs[dt.id];
                    return {
                        ...dt,
                        totalCount: ct && typeof ct.totalCount === 'number' ? ct.totalCount : 0,
                        isUnlocked: ct && ct.isUnlocked !== undefined ? ct.isUnlocked : dt.isUnlocked,
                        isMastered: !!(ct && ct.isMastered),
                        todayCount: todayEntry && typeof todayEntry.count === 'number' ? todayEntry.count : 0
                    };
                });

                if (cloudData.customTricks && Array.isArray(cloudData.customTricks)) {
                    cloudData.customTricks.forEach(ct => {
                        const todayEntry = todayLogs[ct.id];
                        this.tricks.push({
                            ...ct,
                            todayCount: todayEntry && typeof todayEntry.count === 'number' ? todayEntry.count : 0
                        });
                    });
                }

                // 全域資料現在本來就只會存「有變更」的招式（刻意精簡），
                // 所以不能再用「雲端招式數量 < 招式庫總數」來判斷要不要重新上傳（正常情況下也一定會比較少）。
                // 只有「剛搬遷完舊格式資料」才需要立刻回存新格式，其餘情況維持原樣即可。
                return migrated;
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
            const todayDate = this.getTodayDateString();
            const userDocRef = doc(db, "users", username);
            const dayDocRef = doc(db, "users", username, "days", todayDate);

            const tricksMap = {};       // 全域：只記錄「已解鎖」或「累積次數 > 0」的招式
            const customTricksArray = [];
            const todayLogs = {};       // 每日：只記錄「今天有練習」的招式
            let hasTodayData = false;

            this.tricks.forEach(t => {
                if (t.isCustom) {
                    customTricksArray.push(t);
                } else if (t.isUnlocked || t.totalCount > 0) {
                    tricksMap[t.id] = {
                        totalCount: t.totalCount,
                        isUnlocked: t.isUnlocked,
                        isMastered: !!t.isMastered
                    };
                }

                if (t.todayCount > 0) {
                    todayLogs[t.id] = { name: t.name, count: t.todayCount };
                    hasTodayData = true;
                }
            });

            // 全域文件每次都是依照目前完整的本地狀態重新產生，本身就是完整快照，
            // 直接覆寫可以避免舊版「已改回預設值」的招式一直殘留在雲端。
            await setDoc(userDocRef, {
                tricks: tricksMap,
                customTricks: customTricksArray,
                targetRules: Array.isArray(this.targetRules) && this.targetRules.length > 0 ? this.targetRules : []
            });

            if (hasTodayData) {
                await setDoc(dayDocRef, { logs: todayLogs });
                this.historyData[todayDate] = todayLogs;
            }
        } catch (e) {
            console.error("同步至 Firebase 失敗:", e);
        }
    },

    // 新增：給「對戰」功能用的唯讀查詢。取得指定暱稱的使用者目前每個招式的解鎖／熟練狀態快照，
    // 不會動到 this.tricks 等任何本地狀態。找不到這個使用者就回傳 null。
    async fetchUserTricksSnapshot(username) {
        if (!username) return null;
        try {
            const userDocRef = doc(db, "users", username);
            const userSnap = await getDoc(userDocRef);
            if (!userSnap.exists()) return null;

            const cloudData = userSnap.data();
            const { tricks: cloudTricks } = this.migrateLegacyTricksIfNeeded(cloudData.tricks);

            return this.defaultTricks.map(dt => ({
                id: dt.id,
                name: dt.name,
                category: dt.category,
                subcategory: dt.subcategory,
                isUnlocked: cloudTricks[dt.id] && cloudTricks[dt.id].isUnlocked !== undefined ? cloudTricks[dt.id].isUnlocked : dt.isUnlocked,
                isMastered: !!(cloudTricks[dt.id] && cloudTricks[dt.id].isMastered)
            }));
        } catch (e) {
            console.error("讀取對手招式庫失敗:", e);
            return null;
        }
    },

    // 修正：原本的 openStatsModal 改名為 renderStatsSection，
    // 直接把內容畫進主畫面上的統計區塊，而不是開啟彈窗。
    // 只要任何練習次數有變動（+/-、直接輸入、挑戰成功、切換帳號等），呼叫這個方法即可即時更新。
    //
    // 修正核心：原本會優先讀取 this.historyData[todayStr]（雲端「上一次存檔當下」的快照），
    // 但使用者在兩次自動存檔（debounce 800ms）之間持續輸入次數時，historyData 並不會跟著更新，
    // 導致畫面上顯示的統計卡在「最後一次存檔」的舊數字，看起來像是「只記錄到最高的數量」。
    // 改成一律直接讀取 this.tricks 上即時的 todayCount，確保跟每一招的輸入完全同步。
    renderStatsSection() {
        if (!this.domStatsList) return;

        let htmlContent = "";
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

        this.domStatsList.innerHTML = htmlContent || `<div class="empty-tip">今日暫無有效練習數據</div>`;
    },

    // 招式庫改成獨立頁面後，這個函式改由 app.js 的頁面切換邏輯在「每次切換進招式庫頁面」時呼叫，
    // 負責重置為一般瀏覽模式、重新整理分類篩選選單與清單內容。頁面本身的顯示／隱藏交給頁面路由處理。
    onEnterLibraryPage() {
        if (window.AppController && typeof window.AppController.refreshStableSelect === 'function') {
            window.AppController.refreshStableSelect();
        }
        
        this.setMode('none');
        this.initFilterOptions();
        this.renderLibrary(); 
    },

    // 切換目前的操作模式：'none'（一般瀏覽）／'bulk'（一鍵解鎖）／'master'（移除熟練招式）。
    // 兩種勾選模式互斥，切換到任何一種都會重新開始一輪勾選，避免殘留勾選狀態造成混淆。
    setMode(mode) {
        this.activeMode = mode;
        this.bulkSelectedIds = new Set();
        this.masterSelectedIds = new Set();

        if (this.domBulkActions) this.domBulkActions.classList.toggle('hidden', mode !== 'bulk');
        if (this.domBulkSelectAllRow) this.domBulkSelectAllRow.classList.toggle('hidden', mode !== 'bulk');
        if (this.domBulkToggle) this.domBulkToggle.classList.toggle('hidden', mode === 'bulk' || mode === 'master');

        if (this.domMasterActions) this.domMasterActions.classList.toggle('hidden', mode !== 'master');
        if (this.domMasterSelectAllRow) this.domMasterSelectAllRow.classList.toggle('hidden', mode !== 'master');
        if (this.domMasterToggle) this.domMasterToggle.classList.toggle('hidden', mode === 'bulk' || mode === 'master');

        if (this.domBulkSelectAllCheckbox) { this.domBulkSelectAllCheckbox.checked = false; this.domBulkSelectAllCheckbox.indeterminate = false; }
        if (this.domMasterSelectAllCheckbox) { this.domMasterSelectAllCheckbox.checked = false; this.domMasterSelectAllCheckbox.indeterminate = false; }

        this.renderLibrary();
    },

    // 新增：取出「目前分類篩選 + 目前模式」條件下看得到的招式清單。
    // renderLibrary()、全選 checkbox 都共用這份篩選邏輯，確保看到的範圍一致。
    // 一鍵解鎖模式：只顯示未解鎖招式。移除熟練招式模式：只顯示「已解鎖且尚未標記為已熟練」的招式。
    getFilteredTricks() {
        const selectedCat = this.domFilterCategory ? this.domFilterCategory.value : "";
        const selectedSub = this.domFilterSubcategory ? this.domFilterSubcategory.value : "";

        return this.tricks.filter(trick => {
            const matchCat = !selectedCat || trick.category === selectedCat;
            const matchSub = !selectedSub || trick.subcategory === selectedSub;

            let matchMode = true;
            if (this.activeMode === 'bulk') matchMode = !trick.isUnlocked;
            else if (this.activeMode === 'master') matchMode = trick.isUnlocked && !trick.isMastered;

            return matchCat && matchSub && matchMode;
        });
    },

    // 新增：批次解鎖。只標記為已解鎖，不動 totalCount/todayCount，
    // 因為這是「標記我本來就已經會了」的快速動作，不代表剛才有練習一次。
    bulkUnlock(ids) {
        let count = 0;
        ids.forEach(id => {
            const trick = this.tricks.find(t => t.id === id);
            if (trick && !trick.isUnlocked) {
                trick.isUnlocked = true;
                count++;
            }
        });
        return count;
    },

    // 新增：移除熟練招式。維持 isUnlocked = true（仍算是已解鎖），只是標記 isMastered = true，
    // 從「今日穩固招式」的隨機池與手選選單中移除，招式庫清單則用側邊顏色標示已熟練。
    markMastered(ids) {
        let count = 0;
        ids.forEach(id => {
            const trick = this.tricks.find(t => t.id === id);
            if (trick && trick.isUnlocked && !trick.isMastered) {
                trick.isMastered = true;
                count++;
            }
        });
        return count;
    },

    // 新增：依照目前選定的排序邏輯排列招式清單。'default' 維持原本（分類）順序，
    // 其餘選項則在不影響原始資料的情況下，回傳一份排序過的複本。
    // 「練習次數：低到高」一律把未解鎖招式放到最後面，已解鎖的招式之間才照次數由低到高排列，
    // 避免未解鎖招式（總次數大多是 0）卡在清單中間。
    applySortMode(list) {
        if (this.sortMode === 'default') return list;

        const sorted = [...list];
        switch (this.sortMode) {
            case 'count-desc':
                sorted.sort((a, b) => b.totalCount - a.totalCount);
                break;
            case 'count-asc':
                sorted.sort((a, b) => {
                    if (a.isUnlocked !== b.isUnlocked) return (b.isUnlocked === true) - (a.isUnlocked === true);
                    return a.totalCount - b.totalCount;
                });
                break;
            case 'unlocked-first':
                sorted.sort((a, b) => (b.isUnlocked === true) - (a.isUnlocked === true));
                break;
            case 'locked-first':
                sorted.sort((a, b) => (a.isUnlocked === true) - (b.isUnlocked === true));
                break;
            case 'mastered-first':
                sorted.sort((a, b) => (b.isMastered === true) - (a.isMastered === true));
                break;
            case 'mastered-last':
                sorted.sort((a, b) => (a.isMastered === true) - (b.isMastered === true));
                break;
        }
        return sorted;
    },

    renderLibrary() {
        if (!this.domList) return;

        let filteredTricks = this.applySortMode(this.getFilteredTricks());

        if (filteredTricks.length === 0) {
            let emptyMsg = '找不到符合此分類的招式';
            if (this.activeMode === 'bulk') emptyMsg = '目前沒有可解鎖的招式了';
            else if (this.activeMode === 'master') emptyMsg = '目前沒有可移出的已解鎖招式了';
            this.domList.innerHTML = `<div style="text-align:center; color:#95a5a6; padding: 20px;">${emptyMsg}</div>`;
            this.syncSelectAllCheckboxes();
            return;
        }

        // 渲染過濾後的清單。未解鎖的招式用 .locked 樣式把底色調暗；已熟練的招式用側邊顏色標示。
        this.domList.innerHTML = filteredTricks.map(trick => {
            const classes = ['lib-item'];
            if (!trick.isUnlocked) classes.push('locked');
            if (trick.isMastered) classes.push('mastered');

            const selectedSet = this.activeMode === 'master' ? this.masterSelectedIds : this.bulkSelectedIds;
            const showCheckbox = this.activeMode === 'bulk' || this.activeMode === 'master';

            return `
            <div class="${classes.join(' ')}" style="${trick.isCustom ? 'border-left: 4px solid #e67e22; background-color: #fffaf5;' : ''}">
                <div>
                    <span style="font-size:0.72rem; background:#7f8c8d; color:white; padding:1px 4px; border-radius:3px; margin-right:4px; display:inline-block; word-break:normal; white-space:normal;">
                        ${trick.category || '未分類'} › ${trick.subcategory || '未分類'}
                    </span>
                    <strong style="display:block; margin-top:3px; color:#2c3e50; word-break:normal; white-space:normal;">
                        ${trick.name}
                    </strong>
                </div>
                ${showCheckbox
                    ? `<input type="checkbox" class="bulk-unlock-checkbox" data-id="${trick.id}" ${selectedSet.has(trick.id) ? 'checked' : ''}>`
                    : `<span class="lib-count-info">總計: ${trick.totalCount} 次</span>`
                }
            </div>
        `;
        }).join('');

        this.syncSelectAllCheckboxes();
    },

    // 新增：統一產生「招式名稱 (大分類/小分類)」的顯示字串。
    // 原本 app.js 直接寫 `${t.category || ''}/${t.subcategory || ''}`，
    // 當兩者皆為空時會顯示成不好看的 "招式名稱 ()" 或 "招式名稱 (/)"。
    // 修正：招式名稱本身常常已經包含很長的英文翻譯（例如 "一迴燈台離轉收 (1 turn lighthouse, trade kenflip spike)"），
    // 接在後面的分類資訊很容易被擠在同一行、看起來像被切掉。改成在名稱後面插入強制換行字元 \n，
    // 配合 CSS 的 white-space: pre-line，分類資訊一定會另起一行，不會跟名稱擠在一起。
    formatTrickLabel(trick) {
        if (!trick) return '';
        const meta = [trick.category, trick.subcategory].filter(Boolean).join('/');
        return meta ? `${trick.name}\n(${meta})` : trick.name;
    },

    // 新增：熟練招式「每日目標次數」規則，可由使用者自訂。
    // 規則格式：[{ maxCount, target }, ...]，依 maxCount 由小到大排列；
    // 累積次數落在某條規則的 maxCount 以內，就套用該條的 target；
    // 超過所有規則的 maxCount，套用「最後一條」規則的 target。
    // 這組預設值對應原本寫死在程式碼裡的規則（10 次內 3 下、50 次內 5 下、100 次內 10 下、超過 20 下）。
    //
    // 修正：規則要「跟著帳號走」而不是跟著裝置走，所以改成主要存在 Firebase 使用者資料裡
    // （this.targetRules 由 loadUserProgress() 從雲端讀回、saveUserProgress() 一併存回去）。
    // 沒有登入的訪客模式沒有雲端帳號可以同步，才退而求其次存在這台裝置的 localStorage。
    defaultTargetRules: [
        { maxCount: 10, target: 3 },
        { maxCount: 50, target: 5 },
        { maxCount: 100, target: 10 },
        { maxCount: 999999, target: 20 }
    ],

    targetRules: null, // null 代表沿用預設值；有登入時由雲端資料載入，訪客模式由 localStorage 載入

    getTargetRules() {
        if (Array.isArray(this.targetRules) && this.targetRules.length > 0) {
            return [...this.targetRules].sort((a, b) => a.maxCount - b.maxCount);
        }
        return this.defaultTargetRules;
    },

    // 讀取訪客模式（未登入）存在這台裝置上的規則，登入時不會使用這份資料
    loadGuestTargetRules() {
        try {
            const raw = localStorage.getItem('kendama_target_rules_guest');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch (e) {
            console.error('讀取訪客目標次數規則失敗:', e);
        }
        return null;
    },

    // 儲存規則：有登入就存回 Firebase（跟著帳號走，換裝置也看得到）；
    // 訪客模式沒有帳號，只能存在這台裝置的 localStorage 作為退而求其次的作法。
    async saveTargetRules(rules) {
        const sorted = [...rules].sort((a, b) => a.maxCount - b.maxCount);
        this.targetRules = sorted;

        if (window.currentUser) {
            if (this._saveTimer) {
                clearTimeout(this._saveTimer);
                this._saveTimer = null;
            }
            await this.saveUserProgress(window.currentUser);
        } else {
            try {
                localStorage.setItem('kendama_target_rules_guest', JSON.stringify(sorted));
            } catch (e) {
                console.error('儲存訪客目標次數規則失敗:', e);
            }
        }

        return sorted;
    },

    // 新增：開啟「熟練招式目標次數設定」彈窗，把目前生效中的規則複製一份到暫存區編輯
    openTargetRulesModal() {
        this.workingTargetRules = this.getTargetRules().map(r => ({ ...r }));
        this.renderTargetRulesList();
        if (this.domTargetRulesModal) this.domTargetRulesModal.classList.remove('hidden');
    },

    // 新增：渲染目標次數規則清單，每一列都是「累積次數 ≤ X 次，每天目標 Y 次」，可直接編輯或刪除
    renderTargetRulesList() {
        if (!this.domTargetRulesList) return;

        this.workingTargetRules = [...this.workingTargetRules].sort((a, b) => a.maxCount - b.maxCount);

        this.domTargetRulesList.innerHTML = this.workingTargetRules.map((rule, index) => `
            <div class="target-rule-row" data-index="${index}">
                <span class="rule-label">累積次數在</span>
                <input type="number" class="app-select rule-max-count" value="${rule.maxCount}" min="1">
                <span class="rule-label">次以內，每天目標</span>
                <input type="number" class="app-select rule-target" value="${rule.target}" min="1">
                <span class="rule-label">次</span>
                <button class="btn-rule-delete" data-index="${index}" type="button" aria-label="刪除">×</button>
            </div>
        `).join('');
    },

    getTargetCount(totalCount) {
        const rules = this.getTargetRules();
        for (const rule of rules) {
            if (totalCount <= rule.maxCount) return rule.target;
        }
        return rules.length > 0 ? rules[rules.length - 1].target : 20;
    },

    updateCount(id, amount) {
        const trick = this.tricks.find(t => t.id === id);
        if (!trick) return;

        // 修正：原本 todayCount / totalCount 各自獨立判斷是否 >= 0，
        // 當兩者數值不同時（例如跨日重置後 todayCount=0 但 totalCount>0）
        // 按下「-」可能只讓其中一個扣減，導致兩者從此不同步。
        // 改成同時檢查兩者，任一個會小於 0 就整組不執行。
        const nextToday = trick.todayCount + amount;
        const nextTotal = trick.totalCount + amount;
        if (nextToday < 0 || nextTotal < 0) return;

        trick.todayCount = nextToday;
        trick.totalCount = nextTotal;
    },

    // 新增：直接輸入「今日」次數。用差值 (delta) 同步調整 totalCount，
    // 邏輯上等同於連續按了好幾次 +/-，藉此維持 todayCount 與 totalCount 的關係一致。
    setTodayCount(id, newValue) {
        const trick = this.tricks.find(t => t.id === id);
        if (!trick) return;

        let val = parseInt(newValue, 10);
        if (isNaN(val) || val < 0) val = 0;

        let delta = val - trick.todayCount;
        // 若這個差值會讓 totalCount 變負數（理論上不該發生，防呆用），就把差值限制住
        if (trick.totalCount + delta < 0) {
            delta = -trick.totalCount;
            val = trick.todayCount + delta;
        }

        trick.todayCount = val;
        trick.totalCount += delta;
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