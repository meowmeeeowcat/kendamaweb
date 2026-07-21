// js/version.js
// 新增：版本號與更新紀錄。每次修改網站時，在最上面新增一筆紀錄即可，
// 主頁面會自動顯示最新版本號，點擊後可以看到完整的更新歷史。
export const CHANGELOG = [
    {
        version: "1.2.6",
        date: "2026-07-21",
        changes: [
            "招式庫清單裡的未解鎖招式不再用括弧文字標註，改為底色調暗來區分",
            "排序「練習次數：低到高」不再讓未解鎖招式卡在清單中間，統一排到最後面",
            "移除「排序」按鈕：打開招式庫時直接顯示排序依據選單，不用再點開",
            "一鍵解鎖模式：切換分類篩選時，原本勾選的招式會保留；新增「全選本分類」按鈕，範圍依目前篩選的分類而定",
            "首頁大分類／小分類選單的預設文字改為「全部」，並調整成一排顯示：前兩項依文字內容窄一點，招式選單盡量伸展"
        ]
    },
    {
        version: "1.2.5",
        date: "2026-07-21",
        changes: [
            "完整招式庫按鈕移除文字，改為純圖示的圓形按鈕（電腦版圓形照片同步放大填滿）",
            "移除網站上所有表情符號（按鈕文字、提示訊息與程式註解）",
            "完整招式庫新增「排序」按鈕，可依練習次數高到低／低到高、已解鎖優先、未解鎖優先等邏輯重新排列招式清單",
            "首頁「今日穩固招式」與「新招式挑戰」的手選招式，改成先選大分類、再選小分類、最後選擇招式的連動選單（也可以直接用隨機換一招）",
            "修正版本更新紀錄彈窗中「返回首頁」按鈕在內容較多時被擠壓變形的問題"
        ]
    },
    {
        version: "1.2.4",
        date: "2026-07-20",
        changes: [
            "電腦版「完整招式庫」白色圓形照片放大一些，並讓上方環繞文字與照片之間保留更明顯的間距",
            "修正因招式 ID 格式改變導致舊帳號雲端進度讀不到的問題：登入時自動偵測舊版純數字招式 ID，依原本順序搬遷對應到新版 ID，找回已解鎖與累積次數紀錄，之後招式 ID 若再調整也會自動比照辦理",
            "重構 Firebase 儲存邏輯：招式解鎖狀態與累積次數（全域資料）跟每日練習次數（每日資料）分開儲存；全域資料只記錄「有變更」的招式（已解鎖或累積次數大於 0），不再整包上傳所有招式；每次登入的日期都會各自建立獨立的每日紀錄檔案，分別記錄當天練習了哪些招式"
        ]
    },
    {
        version: "1.2.3",
        date: "2026-07-20",
        changes: [
            "選手資訊與切換帳號按鈕改成同一排，按鈕放在選手文字右側",
            "電腦版「完整招式庫」按鈕外框改為圓形，並懸浮在導覽列上方，文字置於照片正上方 90 度弧形範圍內",
            "招式庫圖示照片正式加入專案（images/library-icon.png），並設定為網站圖示"
        ]
    },
    {
        version: "1.2.2",
        date: "2026-07-20",
        changes: [
            "手機板維持原樣：切換帳號按鈕、版本號、完整招式庫按鈕恢復原本較小的樣式",
            "手機板的切換帳號按鈕縮小，避免壓到標題或選手文字",
            "「切換帳號按鈕往下移、版本號放大、完整招式庫改為大圓形照片＋環繞文字」僅套用於電腦版"
        ]
    },
    {
        version: "1.2.1",
        date: "2026-07-20",
        changes: [
            "修正今日練習統計卡在舊數字的問題，改為即時跟每一招的輸入次數同步",
            "「今日」次數輸入框改為邊打字邊即時更新統計，不用等離開輸入框",
            "切換帳號／帳號登入按鈕位置往下移一點，版本號文字放大",
            "完整招式庫按鈕改為大圓形照片置中顯示，文字沿著圓形邊緣環繞照片外圍"
        ]
    },
    {
        version: "1.2.0",
        date: "2026-07-20",
        changes: [
            "移除「今日統計」按鈕，統計內容直接顯示於主畫面上",
            "電腦版版面調整：今日穩固招式／新招式挑戰改為左側上下排列，今日練習統計放在右側",
            "手機版版面調整：今日練習統計固定顯示於最上方",
            "帳號登入／切換帳號按鈕移至頁首右上角（選手資訊上方），並將選手文字調大",
            "完整招式庫按鈕改為置中放大樣式，並可放置圓形招式庫照片"
        ]
    },
    {
        version: "1.1.0",
        date: "2026-07-20",
        changes: [
            "新增版本號與更新紀錄，並顯示於主頁面",
            "新增手機／電腦響應式版面 (RWD)",
            "招式 ID 改為「大分類_小分類_序號」格式，之後新增招式不必重排整個資料庫",
            "「今日」次數新增可直接輸入數字，不必只靠 +/- 按鈕",
            "完整招式庫新增「一鍵解鎖模式」，可勾選多個未解鎖招式一次解鎖"
        ]
    },
    {
        version: "1.0.0",
        date: "2026-07-20",
        changes: [
            "初始版本：今日穩固招式、新招式挑戰、雲端帳號同步、完整招式庫瀏覽與篩選"
        ]
    }
];

export const CURRENT_VERSION = CHANGELOG[0].version;

export const VersionInfo = {
    init() {
        this.domBadge = document.getElementById('btn-version');
        this.domModal = document.getElementById('modal-version');
        this.domList = document.getElementById('version-list');
        this.domClose = document.getElementById('btn-version-close');

        if (this.domBadge) {
            this.domBadge.innerText = `v${CURRENT_VERSION}`;
            this.domBadge.onclick = () => this.openModal();
        }
        if (this.domClose) this.domClose.onclick = () => this.closeModal();
    },

    openModal() {
        if (!this.domModal || !this.domList) return;

        this.domList.innerHTML = CHANGELOG.map(entry => `
            <div class="version-entry">
                <div class="version-entry-header">
                    <span class="version-tag">v${entry.version}</span>
                    <span class="version-date">${entry.date}</span>
                </div>
                <ul class="version-changes">
                    ${entry.changes.map(c => `<li>${c}</li>`).join('')}
                </ul>
            </div>
        `).join('');

        this.domModal.classList.remove('hidden');
    },

    closeModal() {
        if (this.domModal) this.domModal.classList.add('hidden');
    }
};
