// js/app.js
import { AuthSystem } from "./auth.js";
import { TrickLibrary } from "./library.js";
import { VersionInfo } from "./version.js";

export const AppController = {
    currentStableTrick: null,
    currentChallengeTrick: null,
    historyStableIds: [],
    historyChallengeIds: [],

    init() {
        // 初始化本地招式庫數據
        TrickLibrary.init();
        // 啟動登入管理系統
        AuthSystem.init(); 
        // 初始化版本資訊顯示
        VersionInfo.init();
        
        // 確保綁定事件
        this.bindCounterEvents();
        this.bindActionEvents();
        this.bindSelectEvents();
        this.bindTodayInputEvents();

        // 使用者關閉分頁或切換到背景前，把還在 debounce 等待中的次數盡量送出，
        // 避免最後幾下 +1 因為還沒到 800ms 就被使用者關掉頁面而遺失。
        window.addEventListener('beforeunload', () => {
            if (AuthSystem.currentUser) TrickLibrary.flushSave();
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && AuthSystem.currentUser) {
                TrickLibrary.flushSave();
            }
        });
        
        window.AppController = this;
    },
    
    onUserSwitched() {
        this.historyStableIds = [];
        this.historyChallengeIds = [];
        this.refreshStableSelect();
        this.refreshChallengeSelect();
        this.nextStableTrick();
        this.nextChallengeTrick();
        // 登入/登出/切換帳號後，主畫面上的今日練習統計也要跟著刷新
        TrickLibrary.renderStatsSection();
    },

    // 一鍵解鎖完成後呼叫。若目前顯示的挑戰招式剛好被解鎖了，換一個新的挑戰招式；
    // 若原本沒有任何穩固招式可顯示，現在有了，補抽一個。
    onBulkUnlockDone() {
        if (this.currentChallengeTrick && this.currentChallengeTrick.isUnlocked) {
            this.nextChallengeTrick();
        }
        if (!this.currentStableTrick) {
            this.nextStableTrick();
        } else {
            this.renderStableCard();
            this.refreshStableSelect();
        }
    },

    // 新增：移除熟練招式完成後呼叫。若目前顯示的穩固招式剛好被移出了（標記為已熟練），
    // 換一個新的穩固招式；否則只需要刷新選單（移出的招式要從手選清單中消失）。
    onMasterRemoveDone() {
        if (this.currentStableTrick && this.currentStableTrick.isMastered) {
            this.nextStableTrick();
        } else {
            this.refreshStableSelect();
        }
    },

    // === 大分類 / 小分類 / 招式 三層連動選單 ===
    // type 只會是 'stable'（今日穩固招式，招式池 = 已解鎖且尚未標記為已熟練）
    // 或 'challenge'（新招式挑戰，招式池 = 未解鎖）

    getPoolForType(type) {
        if (!TrickLibrary.tricks) return [];
        return type === 'stable'
            ? TrickLibrary.tricks.filter(t => t.isUnlocked && !t.isMastered)
            : TrickLibrary.tricks.filter(t => !t.isUnlocked);
    },

    getCurrentTrickForType(type) {
        return type === 'stable' ? this.currentStableTrick : this.currentChallengeTrick;
    },

    // 重新產生「大分類」選單，並自動選到目前招式所屬的分類（如果找得到），
    // 接著往下連動重建「小分類」與「招式」選單。
    populateCategorySelect(type) {
        const catEl = document.getElementById(`select-${type}-category`);
        if (!catEl) return;

        const pool = this.getPoolForType(type);
        const categories = [...new Set(pool.map(t => t.category).filter(Boolean))];

        catEl.innerHTML = '<option value="">全部</option>' +
            categories.map(c => `<option value="${c}">${c}</option>`).join('');

        const current = this.getCurrentTrickForType(type);
        if (current && categories.includes(current.category)) {
            catEl.value = current.category;
        }

        this.populateSubcategorySelect(type);
    },

    populateSubcategorySelect(type) {
        const catEl = document.getElementById(`select-${type}-category`);
        const subEl = document.getElementById(`select-${type}-subcategory`);
        if (!subEl) return;

        const pool = this.getPoolForType(type);
        const selectedCat = catEl ? catEl.value : '';
        const subs = [...new Set(
            pool.filter(t => !selectedCat || t.category === selectedCat)
                .map(t => t.subcategory)
                .filter(Boolean)
        )];

        subEl.innerHTML = '<option value="">全部</option>' +
            subs.map(s => `<option value="${s}">${s}</option>`).join('');

        const current = this.getCurrentTrickForType(type);
        if (current && (!selectedCat || current.category === selectedCat) && subs.includes(current.subcategory)) {
            subEl.value = current.subcategory;
        }

        this.populateTrickSelect(type);
    },

    populateTrickSelect(type) {
        const catEl = document.getElementById(`select-${type}-category`);
        const subEl = document.getElementById(`select-${type}-subcategory`);
        const trickEl = document.getElementById(`select-${type}-trick`);
        if (!trickEl) return;

        const pool = this.getPoolForType(type);
        const selectedCat = catEl ? catEl.value : '';
        const selectedSub = subEl ? subEl.value : '';
        const matched = pool.filter(t =>
            (!selectedCat || t.category === selectedCat) &&
            (!selectedSub || t.subcategory === selectedSub)
        );

        trickEl.innerHTML = '<option value="">選擇招式</option>' +
            matched.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

        const current = this.getCurrentTrickForType(type);
        trickEl.value = (current && matched.some(t => t.id === current.id)) ? current.id : '';
    },

    refreshStableSelect() {
        this.populateCategorySelect('stable');
    },

    refreshChallengeSelect() {
        this.populateCategorySelect('challenge');
    },

    renderStableCard() {
        const card = document.getElementById('stable-trick-card');
        if (!card) return;
        
        const nameEl = card.querySelector('.trick-name');
        const targetEl = card.querySelector('.target-count');
        const todayEl = card.querySelector('.today-count');

        if (!this.currentStableTrick) {
            if (nameEl) nameEl.innerText = "暫無熟練招式 (請先從挑戰中解鎖)";
            if (targetEl) targetEl.innerText = "-";
            if (todayEl) {
                todayEl.value = '';
                todayEl.placeholder = '-';
                todayEl.disabled = true;
            }
            return;
        }
        
        const t = this.currentStableTrick;
        const target = TrickLibrary.getTargetCount(t.totalCount);
        
        if (nameEl) nameEl.innerText = TrickLibrary.formatTrickLabel(t);
        if (targetEl) targetEl.innerText = target;
        if (todayEl) {
            todayEl.disabled = false;
            // 使用者正在輸入時（focus 中）不要被外部渲染打斷游標位置與輸入內容
            if (document.activeElement !== todayEl) {
                todayEl.value = t.todayCount;
            }
        }
    },

    renderChallengeCard() {
        const card = document.getElementById('challenge-trick-card');
        if (!card) return;
        const nameEl = card.querySelector('.trick-name');
        if (!nameEl) return;

        if (!this.currentChallengeTrick) {
            nameEl.innerText = "恭喜全招式解鎖！";
            return;
        }
        const t = this.currentChallengeTrick;
        nameEl.innerText = TrickLibrary.formatTrickLabel(t);
    },

    nextStableTrick() {
        if (!TrickLibrary.tricks || TrickLibrary.tricks.length === 0) return;
        const pool = this.getPoolForType('stable');
        if (pool.length === 0) {
            this.currentStableTrick = null;
            this.renderStableCard();
            this.refreshStableSelect();
            return;
        }

        let available = pool.filter(t => !this.historyStableIds.includes(t.id));
        if (available.length === 0) {
            this.historyStableIds = [];
            available = pool;
        }

        const randomTrick = available[Math.floor(Math.random() * available.length)];
        if (randomTrick) {
            this.historyStableIds.push(randomTrick.id);
            this.currentStableTrick = randomTrick;
            this.renderStableCard();
            this.refreshStableSelect(); // 同步大分類／小分類／招式選單顯示目前招式
        }
    },

    nextChallengeTrick() {
        if (!TrickLibrary.tricks || TrickLibrary.tricks.length === 0) return;
        const pool = this.getPoolForType('challenge');
        if (pool.length === 0) {
            this.currentChallengeTrick = null;
            this.renderChallengeCard();
            this.refreshChallengeSelect();
            return;
        }

        let available = pool.filter(t => !this.historyChallengeIds.includes(t.id));
        if (available.length === 0) {
            this.historyChallengeIds = [];
            available = pool;
        }

        const randomTrick = available[Math.floor(Math.random() * available.length)];
        if (randomTrick) {
            this.historyChallengeIds.push(randomTrick.id);
            this.currentChallengeTrick = randomTrick;
            this.renderChallengeCard();
            this.refreshChallengeSelect(); // 同步大分類／小分類／招式選單顯示目前招式
        }
    },

    // 新增：解析招式 id（格式為「大分類序號_小分類序號_流水號」，例如 "1_1_1"）成數字陣列，方便比較順序
    parseTrickId(id) {
        return String(id).split('_').map(n => parseInt(n, 10));
    },

    // 新增：比較兩個招式 id 的順序（依序比較大分類、小分類、流水號）
    compareTrickId(idA, idB) {
        const a = this.parseTrickId(idA);
        const b = this.parseTrickId(idB);
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            const diff = (a[i] || 0) - (b[i] || 0);
            if (diff !== 0) return diff;
        }
        return 0;
    },

    // 新增：挑戰成功後，不要隨機換下一個挑戰招式，改成：
    // 1. 優先找「同大分類、同小分類」裡緊接著的下一個流水號的未解鎖招式
    // 2. 找不到的話，改成同大分類（不限小分類）裡 id 比剛解鎖的招式大的招式中，選 id 最小（最接近）的那個
    // 3. 同大分類裡已經沒有更後面的招式了（例如剛好練到分類最後一個），就從同大分類最前面（id 最小）重新開始
    // 4. 整個大分類都解鎖完了，才退回原本的隨機挑選邏輯，確保一定會抽到一個招式繼續練習
    nextChallengeTrickAfterSuccess(unlockedTrick) {
        if (!unlockedTrick || !TrickLibrary.tricks || TrickLibrary.tricks.length === 0) return;

        const pool = this.getPoolForType('challenge'); // 未解鎖招式池
        if (pool.length === 0) {
            this.currentChallengeTrick = null;
            this.renderChallengeCard();
            this.refreshChallengeSelect();
            return;
        }

        const [uCat, uSub, uSeq] = this.parseTrickId(unlockedTrick.id);

        // 1. 同大分類、同小分類，流水號剛好 +1 的招式
        let nextTrick = pool.find(t => {
            const [cat, sub, seq] = this.parseTrickId(t.id);
            return cat === uCat && sub === uSub && seq === uSeq + 1;
        });

        // 2. 同大分類裡，找 id 比目前大、且最接近的招式；如果都沒有比較大的，從同大分類最小 id 的招式重新開始
        if (!nextTrick) {
            const sameCategory = pool
                .filter(t => this.parseTrickId(t.id)[0] === uCat)
                .sort((a, b) => this.compareTrickId(a.id, b.id));

            if (sameCategory.length > 0) {
                nextTrick = sameCategory.find(t => this.compareTrickId(t.id, unlockedTrick.id) > 0) || sameCategory[0];
            }
        }

        // 3. 同大分類完全沒有未解鎖的招式了，退回原本的隨機挑選邏輯
        if (!nextTrick) {
            this.nextChallengeTrick();
            return;
        }

        this.historyChallengeIds.push(nextTrick.id);
        this.currentChallengeTrick = nextTrick;
        this.renderChallengeCard();
        this.refreshChallengeSelect();
    },

    // 「今日」次數改成 input 之後，讓使用者可以直接輸入數字，不用只能一直按 +/-。
    // 同時監聽 input 事件，使用者每打一個字，次數與下方統計就同步更新（不用等離開輸入框）。
    bindTodayInputEvents() {
        const input = document.querySelector('#stable-trick-card .today-count');
        if (!input) return;

        const commit = () => {
            if (!this.currentStableTrick) return;
            TrickLibrary.setTodayCount(this.currentStableTrick.id, input.value);
            this.renderStableCard();
            // 手動輸入今日次數後，同步刷新主畫面上的今日練習統計
            TrickLibrary.renderStatsSection();

            if (AuthSystem.currentUser) {
                TrickLibrary.scheduleSave(AuthSystem.currentUser);
            }
        };

        input.addEventListener('input', commit); // 即時同步，邊打字邊更新統計
        input.addEventListener('change', commit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur(); // blur 會觸發 change
        });
    },

    bindCounterEvents() {
        document.querySelectorAll('#stable-trick-card .btn-count').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!this.currentStableTrick) return;
                const amount = parseInt(e.currentTarget.getAttribute('data-add'), 10);
                
                TrickLibrary.updateCount(this.currentStableTrick.id, amount);
                this.renderStableCard();
                // +/- 次數後，同步刷新主畫面上的今日練習統計
                TrickLibrary.renderStatsSection();
                
                // debounce：停止點擊 800ms 後才真正上傳一次，避免連點塞爆網路請求
                if (AuthSystem.currentUser) {
                    TrickLibrary.scheduleSave(AuthSystem.currentUser);
                }
            });
        });
    },

    bindActionEvents() {
        const btnNextStable = document.getElementById('btn-next-stable');
        const btnNextChallenge = document.getElementById('btn-next-challenge');
        const btnChallengeSuccess = document.getElementById('btn-challenge-success');

        if (btnNextStable) btnNextStable.onclick = () => this.nextStableTrick();
        if (btnNextChallenge) btnNextChallenge.onclick = () => this.nextChallengeTrick();

        if (btnChallengeSuccess) {
            btnChallengeSuccess.onclick = async () => {
                if (!this.currentChallengeTrick) return;
                
                const targetId = this.currentChallengeTrick.id;
                const targetName = this.currentChallengeTrick.name;
                
                // 1. 執行解鎖（此時 library.js 內部會自動將次數 +1）
                TrickLibrary.unlockTrick(targetId);
                
                // 將剛剛解鎖成功的招式指定給當前熟練招式，以確保接下來渲染時資料正確同步
                const unlockedTrick = TrickLibrary.tricks.find(t => t.id === targetId);
                if (unlockedTrick) {
                    this.currentStableTrick = unlockedTrick;
                }

                alert(`恭喜成功解鎖【${targetName}】！`);
                
                // 2. 同步至 Firebase（因為次數已經是 1，會精準觸發歷史紀錄上傳）
                // 解鎖是重要事件，不用 debounce：取消還在等待中的計數存檔計時器，
                // 直接用目前（已包含解鎖結果）的最新狀態存一次就好，避免重複寫入。
                if (AuthSystem.currentUser) {
                    if (TrickLibrary._saveTimer) {
                        clearTimeout(TrickLibrary._saveTimer);
                        TrickLibrary._saveTimer = null;
                    }
                    await TrickLibrary.saveUserProgress(AuthSystem.currentUser);
                }

                // 3. 刷新清單選項
                this.refreshStableSelect();
                this.refreshChallengeSelect();

                // 先將資料渲染至「今日穩固」卡片中顯示剛才+1的狀態，再抽取下一輪挑戰
                // 挑戰成功後不隨機換招式：優先留在同分類，接續下一個 id 的招式
                this.renderStableCard(); 
                this.nextChallengeTrickAfterSuccess(unlockedTrick);
                // 挑戰成功後次數也變動了，同步刷新主畫面上的今日練習統計
                TrickLibrary.renderStatsSection();
            };
        }
    },

    bindSelectEvents() {
        ['stable', 'challenge'].forEach(type => {
            const catEl = document.getElementById(`select-${type}-category`);
            const subEl = document.getElementById(`select-${type}-subcategory`);
            const trickEl = document.getElementById(`select-${type}-trick`);

            if (catEl) {
                catEl.onchange = () => this.populateSubcategorySelect(type);
            }

            if (subEl) {
                subEl.onchange = () => this.populateTrickSelect(type);
            }

            // 招式 ID 是 "1_1_1" 這種字串格式，用字串比對，不能 parseInt()
            if (trickEl) {
                trickEl.onchange = (e) => {
                    const selectedId = e.target.value;
                    if (!selectedId) return;
                    const found = TrickLibrary.tricks.find(t => t.id === selectedId);
                    if (!found) return;

                    if (type === 'stable') {
                        this.currentStableTrick = found;
                        this.renderStableCard();
                    } else {
                        this.currentChallengeTrick = found;
                        this.renderChallengeCard();
                    }
                    // 選定招式後，讓大分類／小分類選單同步顯示這個招式的分類
                    this.populateCategorySelect(type);
                };
            }
        });
    }
};
