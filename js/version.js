// js/version.js
// 🎯 新增：版本號與更新紀錄。每次修改網站時，在最上面新增一筆紀錄即可，
// 主頁面會自動顯示最新版本號，點擊後可以看到完整的更新歷史。
export const CHANGELOG = [
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
