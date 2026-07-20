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
        // 🎯 新增：初始化版本資訊顯示
        VersionInfo.init();
        
        // 確保綁定事件
        this.bindCounterEvents();
        this.bindActionEvents();
        this.bindSelectEvents();
        this.bindTodayInputEvents();

        // 🎯 新增：使用者關閉分頁或切換到背景前，把還在 debounce 等待中的次數盡量送出，
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
    },

    // 🎯 新增：一鍵解鎖完成後呼叫。若目前顯示的挑戰招式剛好被解鎖了，換一個新的挑戰招式；
    // 若原本沒有任何穩固招式可顯示，現在有了，補抽一個。
    onBulkUnlockDone() {
        if (this.currentChallengeTrick && this.currentChallengeTrick.isUnlocked) {
            this.nextChallengeTrick();
        }
        if (!this.currentStableTrick) {
            this.nextStableTrick();
        } else {
            this.renderStableCard();
        }
    },
    
    refreshStableSelect() {
        const selectEl = document.getElementById('select-stable-trick');
        if (!selectEl) return;
        selectEl.innerHTML = '<option value="">-- 手選熟練招式 --</option>';
        if (!TrickLibrary.tricks || TrickLibrary.tricks.length === 0) return;
        
        const unlockedTricks = TrickLibrary.tricks.filter(t => t.isUnlocked);
        unlockedTricks.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.innerText = `[${t.category || '熟練'}] ${t.name}`;
            selectEl.appendChild(opt);
        });
    },

    refreshChallengeSelect() {
        const selectEl = document.getElementById('select-challenge-trick');
        if (!selectEl) return;
        selectEl.innerHTML = '<option value="">-- 手選挑戰招式 --</option>';
        if (!TrickLibrary.tricks || TrickLibrary.tricks.length === 0) return;
        
        const lockedTricks = TrickLibrary.tricks.filter(t => !t.isUnlocked);
        lockedTricks.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.innerText = `[${t.category || '挑戰'}] ${t.name}`;
            selectEl.appendChild(opt);
        });
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
            nameEl.innerText = "恭喜全招式解鎖！🎉";
            return;
        }
        const t = this.currentChallengeTrick;
        nameEl.innerText = TrickLibrary.formatTrickLabel(t);
    },

    nextStableTrick() {
        if (!TrickLibrary.tricks || TrickLibrary.tricks.length === 0) return;
        const pool = TrickLibrary.tricks.filter(t => t.isUnlocked);
        if (pool.length === 0) {
            this.currentStableTrick = null;
            this.renderStableCard();
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
            const selectEl = document.getElementById('select-stable-trick');
            if (selectEl) selectEl.value = randomTrick.id;
        }
    },

    nextChallengeTrick() {
        if (!TrickLibrary.tricks || TrickLibrary.tricks.length === 0) return;
        const pool = TrickLibrary.tricks.filter(t => !t.isUnlocked);
        if (pool.length === 0) {
            this.currentChallengeTrick = null;
            this.renderChallengeCard();
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
            const selectEl = document.getElementById('select-challenge-trick');
            if (selectEl) selectEl.value = randomTrick.id;
        }
    },

    // 🎯 新增：「今日」次數改成 input 之後，讓使用者可以直接輸入數字，
    // 不用只能一直按 +/-。change 事件在使用者按 Enter 或離開輸入框時觸發。
    bindTodayInputEvents() {
        const input = document.querySelector('#stable-trick-card .today-count');
        if (!input) return;

        const commit = () => {
            if (!this.currentStableTrick) return;
            TrickLibrary.setTodayCount(this.currentStableTrick.id, input.value);
            this.renderStableCard();

            if (AuthSystem.currentUser) {
                TrickLibrary.scheduleSave(AuthSystem.currentUser);
            }
        };

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
                
                // 🎯 修正：原本每按一下 +1/-1 就立刻 await 一次 Firestore 寫入，
                // 連點會塞爆網路請求，而且較舊的請求可能比較晚回來、覆蓋掉新的次數。
                // 改成 debounce：停止點擊 800ms 後才真正上傳一次。
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
                
                // 🎯 修正核心：將剛剛解鎖成功的招式指定給當前熟練招式，以確保接下來渲染時資料正確同步
                const unlockedTrick = TrickLibrary.tricks.find(t => t.id === targetId);
                if (unlockedTrick) {
                    this.currentStableTrick = unlockedTrick;
                }

                alert(`🏆 恭喜成功解鎖【${targetName}】！`);
                
                // 2. 同步至 Firebase（因為次數已經是 1，會精準觸發歷史紀錄上傳）
                // 🎯 解鎖是重要事件，不用 debounce：取消還在等待中的計數存檔計時器，
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

                // 🎯 修正核心：先將資料渲染至「今日穩固」卡片中顯示剛才+1的狀態，再抽取下一輪挑戰
                this.renderStableCard(); 
                this.nextChallengeTrick();
            };
        }
    },

    bindSelectEvents() {
        const selectStable = document.getElementById('select-stable-trick');
        const selectChallenge = document.getElementById('select-challenge-trick');

        // 🎯 修正：招式 ID 已改為 "1_1_1" 這種字串格式，原本用 parseInt() 轉換
        // 會把 "1_1_1" 誤解析成數字 1，導致選單選到錯的招式。改成直接用字串比對。
        if (selectStable) {
            selectStable.onchange = (e) => {
                const selectedId = e.target.value;
                if (!selectedId) return;
                const found = TrickLibrary.tricks.find(t => t.id === selectedId);
                if (found) {
                    this.currentStableTrick = found;
                    this.renderStableCard();
                }
            };
        }

        if (selectChallenge) {
            selectChallenge.onchange = (e) => {
                const selectedId = e.target.value;
                if (!selectedId) return;
                const found = TrickLibrary.tricks.find(t => t.id === selectedId);
                if (found) {
                    this.currentChallengeTrick = found;
                    this.renderChallengeCard();
                }
            };
        }
    }
};