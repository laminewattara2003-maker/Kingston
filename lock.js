window.lock = {
    EDITOR_CODE: "master2030",
    REQUIRED_CLICKS: 9,
    SESSION_KEY: "smart_composition_editor_unlocked",
    clickCount: 0,
    clickResetTimer: null,

    init() {
        this.bindNineClicksToEditorButton();
    },

    isEditorUnlocked() {
        return sessionStorage.getItem(this.SESSION_KEY) === "true";
    },

    setEditorUnlocked() {
        sessionStorage.setItem(this.SESSION_KEY, "true");
    },

    showStatus(elId, message) {
        const el = document.getElementById(elId);
        if (!el) return;
        el.textContent = message;
        el.classList.remove('hidden');
    },

    hideStatus(elId) {
        const el = document.getElementById(elId);
        if (el) el.classList.add('hidden');
    },

    openEditorCodeModal() {
        const modal = document.getElementById('editor-code-modal');
        const input = document.getElementById('editor-code-input');
        if (!modal || !input) return;
        modal.classList.remove('hidden');
        input.value = '';
        input.focus();
        this.hideStatus('editor-code-status');
    },

    bindNineClicksToEditorButton() {
        const toggleBtn = document.getElementById('toggle-mode-btn');
        if (!toggleBtn) return;

        toggleBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (window.app && window.app.currentViewZone === 'editor-zone') {
                window.app.toggleAdminMode();
                return;
            }

            if (this.isEditorUnlocked()) {
                this.openEditorCodeModal();
                return;
            }

            this.clickCount += 1;
            clearTimeout(this.clickResetTimer);
            this.clickResetTimer = setTimeout(() => {
                this.clickCount = 0;
            }, 4000);

            if (this.clickCount >= this.REQUIRED_CLICKS) {
                this.clickCount = 0;
                this.openEditorCodeModal();
            }
        };
    },

    cancelEditorPrompt() {
        this.clickCount = 0;
        document.getElementById('editor-code-modal').classList.add('hidden');
        document.getElementById('editor-code-input').value = '';
        this.hideStatus('editor-code-status');
    },

    tryEditorUnlock() {
        const input = document.getElementById('editor-code-input');
        const code = input.value.trim().replace(/\s+/g, '').toLowerCase();
        if (!code) return;

        if (code === this.EDITOR_CODE.toLowerCase()) {
            this.clickCount = 0;
            this.setEditorUnlocked();
            document.getElementById('editor-code-modal').classList.add('hidden');
            input.value = '';
            this.hideStatus('editor-code-status');
            if (window.app && typeof window.app.toggleAdminMode === 'function') {
                window.app.toggleAdminMode();
            }
        } else {
            this.showStatus('editor-code-status', 'Code éditeur incorrect.');
        }
    }
};

document.addEventListener("DOMContentLoaded", () => {
    window.lock.init();
});
