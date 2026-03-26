const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/";
const MODEL_QUICK = "gemini-1.5-flash";
const MODEL_DEEP = "gemini-1.5-pro";
const MODEL_IMAGE = "gemini-1.5-flash"; 

// DOM Elements - Selected deferred to ensure availability
let chatContainer, messagesList, userInput, sendBtn, attachBtn, sqBtn, examModeBtn, fileInput, imagePreviewContainer;
let iconSend, iconStop, welcomeScreen, historySidebar, menuBtn, closeSidebarBtn, newChatBtn;
let historyList, typingIndicator, chipSummarize, modeSelector, micBtn;

// State
let currentChatId = null;
let chats = {};
let abortController = null;
let isGenerating = false;
let currentMode = 'quick'; // 'quick', 'deep', 'image'
let currentDraftImages = [];
let isExamMode = false;
let examModeTimeout = null;

const APP_VERSION = "1.0.0"; 

// Auth & Maintenance Globals
const API_BASE = "https://kenowa.synergize.co/server/auth.php";
let authModal, authFormContainer, maintenanceMsg, authUsernameInput, authPasswordInput, authSubmitBtn, authError, tabSignin, tabSignup, authTitle;

const isVersionOlder = (current, latest) => {
    if (!latest) return false;
    const s1 = String(current).replace(/[^0-9.]/g, '');
    const s2 = String(latest).replace(/[^0-9.]/g, '');
    const v1 = s1.split('.').map(Number);
    const v2 = s2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
        const n1 = v1[i] || 0;
        const n2 = v2[i] || 0;
        if (n1 < n2) return true;
        if (n1 > n2) return false;
    }
    return false;
};

const showAnnouncement = (data) => {
    const modal = document.getElementById('announcement-modal');
    if (!modal) return;

    const titleEl = document.getElementById('announcement-title');
    const versionEl = document.getElementById('announcement-version-tag');
    const descEl = document.getElementById('announcement-desc');
    const dlBtn = document.getElementById('announcement-download-link');
    const helpBtn = document.getElementById('announcement-help-link');

    if (titleEl) titleEl.innerText = data.version_name || "New Update Available";
    if (versionEl) versionEl.innerText = `v${data.version_number}`;
    if (descEl) descEl.innerText = data.description || "A new version is available. Please download the update to continue.";
    if (dlBtn) dlBtn.href = data.download_link || "#";

    if (helpBtn) {
        if (data.help_link) {
            helpBtn.href = data.help_link;
            helpBtn.classList.remove('hidden');
        } else {
            helpBtn.classList.add('hidden');
        }
    }

    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
};

const checkAccountStatus = async () => {
    const storedUser = localStorage.getItem('kenowa_user');
    if (!storedUser) {
        if (authModal) {
            authModal.classList.remove('hidden');
            document.body.classList.add('modal-open');
        }
        return false;
    }

    const user = JSON.parse(storedUser);
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); 

        const response = await fetch(`${API_BASE}?action=check_status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username: user.username,
                session_token: user.session_token // Enforce single session
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        const textResponse = await response.text();
        let data;
        try {
            data = JSON.parse(textResponse);
        } catch (err) {
            // Silently use fallback
            return true;
        }

        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${textResponse}`);
        }

        if (data.success) {
            // Check for Updates / Announcements
            if (data.announcement) {
                const latestVer = data.announcement.version_number;
                console.log(`[Version Check] Current: ${APP_VERSION}, Latest: ${latestVer}`);
                
                if (isVersionOlder(APP_VERSION, latestVer)) {
                    console.warn("[Update Required] Showing announcement modal.");
                    showAnnouncement(data.announcement);
                    return false;
                }
            }

            if (data.maintenance_mode === 'on') {
                showMaintenanceView();
                return false;
            }
            if (data.status === 'banned' || data.status === 'blocked') {
                forceLogout(`Your account is ${data.status}.`);
                return false;
            }
            return true;
        } else {
            if (data.error === 'new_login') {
                forceLogout(data.message);
                return false;
            }
        }
    } catch (e) {
        console.error("Status check failed", e);
        return true; 
    }
    return true;
};

const showMaintenanceView = () => {
    if (authModal) {
        authModal.classList.remove('hidden');
        authFormContainer.classList.add('hidden');
        maintenanceMsg.classList.remove('hidden');
        document.body.classList.add('modal-open');
    }
};

const forceLogout = (msg) => {
    localStorage.removeItem('kenowa_user');
    if (authModal) {
        authModal.classList.remove('hidden');
        authFormContainer.classList.remove('hidden');
        maintenanceMsg.classList.add('hidden');
        authError.innerText = msg;
        authError.classList.remove('hidden');
        document.body.classList.add('modal-open');
    }
};

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    // Select Elements
    chatContainer = document.getElementById('chat-container');
    messagesList = document.getElementById('messages-list');
    userInput = document.getElementById('user-input');
    sendBtn = document.getElementById('send-btn');
    attachBtn = document.getElementById('attach-btn');
    sqBtn = document.getElementById('sq-btn');
    examModeBtn = document.getElementById('exam-mode-btn');
    fileInput = document.getElementById('file-input');
    imagePreviewContainer = document.getElementById('image-preview-container');
    iconSend = document.getElementById('icon-send');
    iconStop = document.getElementById('icon-stop');
    welcomeScreen = document.getElementById('welcome-screen');
    historySidebar = document.getElementById('history-sidebar');
    menuBtn = document.getElementById('menu-btn');
    closeSidebarBtn = document.getElementById('close-sidebar-btn');
    newChatBtn = document.getElementById('new-chat-btn');
    historyList = document.getElementById('history-list');
    typingIndicator = document.getElementById('typing-indicator');
    chipSummarize = document.getElementById('chip-summarize');
    modeSelector = document.getElementById('mode-selector');
    micBtn = document.getElementById('mic-btn');

    // Attach Event Listeners
    if (menuBtn) menuBtn.addEventListener('click', toggleSidebar);
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', toggleSidebar);
    if (newChatBtn) newChatBtn.addEventListener('click', startNewChat);

    if (sendBtn) {
        sendBtn.addEventListener('click', () => {
            if (isGenerating) stopGeneration();
            else handleSend();
        });
    }

    if (attachBtn && fileInput) {
        attachBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleFileSelect);
    }

    if (sqBtn) {
        sqBtn.addEventListener('click', handleSQ);
    }
    
    if (examModeBtn) {
        examModeBtn.addEventListener('click', toggleExamMode);
    }

    if (userInput) {
        userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        });
        userInput.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
            if (this.value === '') this.style.height = '24px';
        });
    }

    if (modeSelector) {
        modeSelector.addEventListener('change', (e) => {
            currentMode = e.target.value;
            if (currentMode === 'image') {
                userInput.placeholder = "Describe the image you want to generate...";
            } else {
                userInput.placeholder = "Message Kenowa or @mention a tab";
            }
        });
    }

    if (micBtn) {
        micBtn.addEventListener('click', toggleVoiceInput);
    }

    document.querySelectorAll('.suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            if (chip.id === 'chip-summarize') summarizePage();
            else {
                if (userInput) userInput.value = chip.innerText;
                handleSend();
            }
        });
    });

    // Auth & Onboarding UI assignment
    authModal = document.getElementById('auth-modal');
    authFormContainer = document.getElementById('auth-form-container');
    maintenanceMsg = document.getElementById('maintenance-msg');
    authUsernameInput = document.getElementById('auth-username');
    authPasswordInput = document.getElementById('auth-password');
    authSubmitBtn = document.getElementById('auth-submit-btn');
    authError = document.getElementById('auth-error');
    tabSignin = document.getElementById('tab-signin');
    tabSignup = document.getElementById('tab-signup');
    authTitle = document.getElementById('auth-title');

    let authMode = 'signin'; 

    const updateAuthUI = () => {
        if (authMode === 'signin') {
            tabSignin.classList.add('active');
            tabSignup.classList.remove('active');
            authTitle.innerText = "Welcome Back";
            authSubmitBtn.innerText = "Sign In";
        } else {
            tabSignup.classList.add('active');
            tabSignin.classList.remove('active');
            authTitle.innerText = "Create Account";
            authSubmitBtn.innerText = "Sign Up";
        }
    };

    if (tabSignin) tabSignin.addEventListener('click', () => { authMode = 'signin'; updateAuthUI(); });
    if (tabSignup) tabSignup.addEventListener('click', () => { authMode = 'signup'; updateAuthUI(); });

    const handleAuth = async () => {
        const username = authUsernameInput.value.trim();
        const password = authPasswordInput.value.trim();

        if (!username || !password) {
            authError.innerText = "Username and password are required.";
            authError.classList.remove('hidden');
            return;
        }

        authSubmitBtn.innerText = "Processing...";
        authSubmitBtn.disabled = true;

        try {
            let data;
            // First, try the real backend
            try {
                const response = await fetch(`${API_BASE}?action=${authMode}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                
                const text = await response.text();
                try {
                    data = JSON.parse(text);
                } catch (parseErr) {
                    data = null; // trigger fallback
                }
            } catch (networkErr) {
                data = null;
            }

            // Fallback: Local Storage Mock Auth
            if (!data) {
                let localAccounts = JSON.parse(localStorage.getItem('kenowa_local_accounts') || '{}');
                
                if (authMode === 'signup') {
                    if (localAccounts[username]) {
                        data = { success: false, error: "Username already exists." };
                    } else {
                        localAccounts[username] = { password, session_token: 'local_' + Date.now() };
                        localStorage.setItem('kenowa_local_accounts', JSON.stringify(localAccounts));
                        data = { success: true };
                    }
                } else {
                    if (localAccounts[username] && localAccounts[username].password === password) {
                        data = { 
                            success: true, 
                            user: { username, session_token: localAccounts[username].session_token } 
                        };
                    } else {
                        data = { success: false, error: "Invalid username or password." };
                    }
                }
            }

            if (data && data.success) {
                if (authMode === 'signup') {
                    authMode = 'signin';
                    updateAuthUI();
                    authError.innerText = "Account created! Please sign in.";
                    authError.style.color = "#2ed573";
                    authError.classList.remove('hidden');
                } else {
                    localStorage.setItem('kenowa_user', JSON.stringify(data.user || { username }));
                    authModal.classList.add('hidden');
                    document.body.classList.remove('modal-open');
                    updateGreeting(data.user ? data.user.username : username);
                }
            } else {
                authError.innerText = (data && data.error) ? data.error : "Authentication failed.";
                authError.style.color = "#ff4757"; // ensure error color is consistent
                authError.classList.remove('hidden');
            }
        } catch (e) {
            console.error("Auth Logic Error:", e);
            authError.innerText = "Connection error. Check your server or network.";
            authError.classList.remove('hidden');
        } finally {
            authSubmitBtn.innerText = authMode === 'signin' ? "Sign In" : "Sign Up";
            authSubmitBtn.disabled = false;
        }
    };

    if (authSubmitBtn) authSubmitBtn.addEventListener('click', handleAuth);

    const handleAuthEnter = (e) => {
        if (e.key === 'Enter') handleAuth();
    };

    if (authUsernameInput) authUsernameInput.addEventListener('keydown', handleAuthEnter);
    if (authPasswordInput) authPasswordInput.addEventListener('keydown', handleAuthEnter);

    // Initial check
    const storedUser = localStorage.getItem('kenowa_user');
    if (!storedUser) {
        if (authModal) authModal.classList.remove('hidden');
        document.body.classList.add('modal-open');
        fetch(`${API_BASE}?action=check_registration`).then(async r => {
            const text = await r.text();
            try {
                return JSON.parse(text);
            } catch (err) {
                return { success: true, registration_enabled: 'on' }; // Fallback allowing signup
            }
        }).then(data => {
            if (data && data.success) {
                // Mandatory update check even for non-logged-in users
                if (data.announcement) {
                    const latestVer = data.announcement.version_number;
                    console.log(`[Init Version Check] Current: ${APP_VERSION}, Latest: ${latestVer}`);
                    if (isVersionOlder(APP_VERSION, latestVer)) {
                        showAnnouncement(data.announcement);
                        return; // Stop here if update required
                    }
                }
                if (data.registration_enabled === 'off') {
                    if (tabSignup) { tabSignup.classList.add('hidden'); tabSignin.style.width = '100%'; }
                    authMode = 'signin';
                    updateAuthUI();
                }
            }
        }).catch(e => console.error("Initial check fetch failed:", e.message));
    } else {
        const user = JSON.parse(storedUser);
        updateGreeting(user.username); // Use username
        checkAccountStatus();
    }



    try {
        const lastId = await loadChats();
        if (lastId && chats[lastId]) {
            loadChat(lastId, false); // Don't toggle sidebar on auto-load
        } else {
            startNewChat();
        }
    } catch (e) {
        console.error(e);
        startNewChat();
    }
});


// Event Delegation for Dynamic Content (Code Copy Buttons)
if (messagesList) {
    messagesList.addEventListener('click', (e) => {
        const btn = e.target.closest('.copy-code-btn');
        if (btn) {
            const code = decodeURIComponent(btn.getAttribute('data-code'));
            copyToClipboard(code, btn);
        }
    });
}


// Functions

function updateGreeting(name) {
    if (!welcomeScreen) return;
    const greetingEl = welcomeScreen.querySelector('.greeting');
    if (greetingEl) {
        const displayName = name || 'there';
        greetingEl.innerText = `Hi ${displayName}, what should we dive into today?`;
    }
}

async function loadChats() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
        const result = await chrome.storage.local.get(['chats', 'lastChatId']);
        chats = result.chats || {};
        renderHistoryList();
        return result.lastChatId;
    }
    return null;
}

async function saveChats() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
            chats: chats,
            lastChatId: currentChatId
        });
        renderHistoryList();
    }
}

function toggleSidebar() {
    if (historySidebar) historySidebar.classList.toggle('show');
}

function startNewChat() {
    currentChatId = Date.now().toString();
    if (messagesList) messagesList.innerHTML = '';
    if (welcomeScreen) welcomeScreen.classList.remove('hidden');
    if (userInput) {
        userInput.value = '';
        userInput.focus();
    }
    if (historySidebar) historySidebar.classList.remove('show');
    clearImages();

    isGenerating = false;
    toggleSendButton(false);
}

function clearImages() {
    currentDraftImages = [];
    renderImagePreviews();
    if (fileInput) fileInput.value = '';
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    files.forEach(file => {
        if (!file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            if (currentDraftImages.length < 5) { // Limit to 5 images
                currentDraftImages.push(e.target.result);
                renderImagePreviews();
            }
        };
        reader.readAsDataURL(file);
    });
}

function renderImagePreviews() {
    if (!imagePreviewContainer) return;

    imagePreviewContainer.innerHTML = '';
    if (currentDraftImages.length === 0) {
        imagePreviewContainer.classList.add('hidden');
        return;
    }
    imagePreviewContainer.classList.remove('hidden');

    currentDraftImages.forEach((imgSrc, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'image-thumbnail-wrapper';

        const img = document.createElement('img');
        img.src = imgSrc;
        img.className = 'image-thumbnail';

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-image-btn';
        removeBtn.innerHTML = '&times;';
        removeBtn.onclick = () => {
            currentDraftImages.splice(index, 1);
            renderImagePreviews();
        };

        wrapper.appendChild(img);
        wrapper.appendChild(removeBtn);
        imagePreviewContainer.appendChild(wrapper);
    });
}

function deleteChat(e, chatId) {
    e.stopPropagation();
    if (confirm('Delete this chat?')) {
        delete chats[chatId];
        saveChats();
        if (currentChatId === chatId) {
            startNewChat();
        }
    }
}

function toggleSendButton(loading) {
    isGenerating = loading;
    if (loading) {
        if (iconSend) iconSend.classList.add('hidden');
        if (iconStop) iconStop.classList.remove('hidden');
        if (sendBtn) sendBtn.classList.add('stop');
    } else {
        if (iconSend) iconSend.classList.remove('hidden');
        if (iconStop) iconStop.classList.add('hidden');
        if (sendBtn) sendBtn.classList.remove('stop');
    }
}

function linkify(text) {
    if (typeof text !== 'string') return text;
    if (text.includes('<a href')) return text;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, function (url) {
        return `<a href="${url}" target="_blank">${url}</a>`;
    });
}

function copyToClipboard(text, btnElement) {
    navigator.clipboard.writeText(text).then(() => {
        const originalText = btnElement.innerHTML;
        btnElement.innerHTML = 'Copied!';
        setTimeout(() => {
            btnElement.innerHTML = originalText;
        }, 2000);
    });
}

function appendMessage(role, content, images = [], animate = false) {
    if (welcomeScreen) welcomeScreen.classList.add('hidden');

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;

    // Images
    if (images && images.length > 0) {
        const imgsDiv = document.createElement('div');
        imgsDiv.style.display = 'flex';
        imgsDiv.style.gap = '5px';
        imgsDiv.style.marginBottom = '5px';
        imgsDiv.style.flexWrap = 'wrap';
        images.forEach(img => {
            const src = typeof img === 'string' ? img : img.image_url.url;
            const imgEl = document.createElement('img');
            imgEl.src = src;
            imgEl.style.maxWidth = '100px';
            imgEl.style.borderRadius = '5px';
            imgsDiv.appendChild(imgEl);
        });
        msgDiv.appendChild(imgsDiv);
    }

    const textDiv = document.createElement('div');

    // Animate AI response (Typewriter)
    if (role === 'ai' && animate) {
        textDiv.className = 'typewriter-text';
        // We need to append msgDiv now to see streaming
        if (messagesList) messagesList.appendChild(msgDiv);
        if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;

        let i = 0;
        const speed = 15; // ms per char

        function type() {
            if (i < content.length) {
                textDiv.textContent += content.charAt(i);
                i++;
                if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
                setTimeout(type, speed);
            } else {
                // Finished typing
                let finalHTML = typeof parseMarkdown === 'function' ? parseMarkdown(content) : content;
                finalHTML = linkify(finalHTML);
                textDiv.innerHTML = finalHTML;
                addActions(msgDiv, content);
                saveToHistory(role, content, images);
            }
        }
        type();

    } else {
        // Static render
        let innerHTML = '';
        if (role === 'user') {
            innerHTML = content.replace(/\n/g, '<br>');
        } else {
            innerHTML = typeof parseMarkdown === 'function' ? parseMarkdown(content) : content;
            innerHTML = linkify(innerHTML);
        }
        textDiv.innerHTML = innerHTML;

        // Actions
        if (role === 'ai') {
            addActions(msgDiv, content);
        } else if (role === 'user') {
            const editBtn = document.createElement('button');
            editBtn.className = 'edit-msg-btn';
            editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;
            editBtn.title = "Edit message";
            editBtn.onclick = () => {
                if (userInput) {
                    userInput.value = content;
                    userInput.focus();
                }
            };
            msgDiv.appendChild(editBtn);
        }

        msgDiv.appendChild(textDiv);
        if (messagesList) messagesList.appendChild(msgDiv);
        if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;

        // Save if not animating (animating saves at end)
        if (!animate) saveToHistory(role, content, images);
    }

    if (role === 'ai' && animate) {
        msgDiv.appendChild(textDiv);
    }
}

function addActions(parentDiv, content) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'action-btn';
    copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy`;
    copyBtn.onclick = () => copyToClipboard(content, copyBtn);

    const regenBtn = document.createElement('button');
    regenBtn.className = 'action-btn';
    regenBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg> Regenerate`;
    regenBtn.onclick = () => regenerateMessage();

    actionsDiv.appendChild(copyBtn);
    actionsDiv.appendChild(regenBtn);
    parentDiv.appendChild(actionsDiv);
}

function saveToHistory(role, content, images) {
    if (!chats[currentChatId]) {
        chats[currentChatId] = {
            title: content.substring(0, 30) + (content.length > 30 ? '...' : ' Image'),
            messages: [],
            timestamp: Date.now()
        };
    }
    chats[currentChatId].messages.push({ role, content, images });
    saveChats();
}

async function handleSend(textOverride = null) {
    const text = textOverride || (userInput ? userInput.value.trim() : '');
    const hasImages = currentDraftImages.length > 0;

    if (!text && !hasImages) return;

    // Check Status & Maintenance before every AI call
    const isOk = await checkAccountStatus();
    if (!isOk) return;

    // Capture images for this send
    const imagesToSend = [...currentDraftImages];

    if (!textOverride && userInput) {
        userInput.value = '';
        userInput.style.height = '24px';
        appendMessage('user', text, imagesToSend);
        clearImages();
    }

    // Show Loading
    if (currentMode === 'deep') {
        showTypingIndicator("Thinking Deeply (Pro model)...");
    } else if (currentMode === 'image') {
        showTypingIndicator("Painting Masterpiece...");
    } else {
        showTypingIndicator("Kenowa is thinking...");
    }

    toggleSendButton(true);
    abortController = new AbortController();

    try {
        const provider = localStorage.getItem('kenowa_provider') || 'gemini';
        let apiKey, url, body;

        // --- MODE & MODEL SELECTION ---
        let model = localStorage.getItem('kenowa_model') || MODEL_QUICK;

        // Auto-fix legacy models (only likely relevant for Gemini default)
        if (provider === 'gemini' && model && model.includes('1.5')) {
            console.log("Migrating legacy model 1.5 to 2.5");
            model = MODEL_QUICK;
            localStorage.setItem('kenowa_model', MODEL_QUICK);
        }

        // For Gemini, we override model based on mode. 
        if (provider === 'gemini') {
            if (currentMode === 'deep') model = MODEL_DEEP;
            else if (currentMode === 'image') model = MODEL_IMAGE;
        }

        if (provider === 'gemini') {
            // --- GEMINI LOGIC ---
            apiKey = localStorage.getItem('kenowa_api_key');
            if (!apiKey) {
                appendMessage('ai', 'Please set your Gemini API Key in Settings.');
                hideTypingIndicator();
                toggleSendButton(false);
                return;
            }

            if (currentMode === 'image' && !checkImageGenLimit()) {
                appendMessage('ai', "🔒 Daily limit reached. You can generate only 1 image per day. Try again tomorrow!");
                return;
            }

            const parts = [];
            if (text) parts.push({ text: text });

            // Handle Images (Inline Data)
            if (hasImages) {
                for (const imgDataUrl of currentDraftImages) {
                    const [header, base64Data] = imgDataUrl.split(',');
                    const mimeType = header.match(/:(.*?);/)[1];
                    parts.push({
                        inline_data: { mime_type: mimeType, data: base64Data }
                    });
                }
            }

            if (parts.length === 0 && !hasImages) return;

            url = `${BASE_URL}${model}:generateContent?key=${apiKey}`;
            body = JSON.stringify({ contents: [{ parts: parts }] });

        } else {
            // --- OPENROUTER (OpenAI Format) LOGIC ---
            apiKey = localStorage.getItem('kenowa_openrouter_key');
            if (!apiKey) {
                appendMessage('ai', 'Please set your OpenRouter API Key in Settings.');
                hideTypingIndicator();
                toggleSendButton(false);
                return;
            }

            const messages = [];
            const contentArray = [];

            if (text) contentArray.push({ type: "text", text: text });

            if (hasImages) {
                for (const imgDataUrl of currentDraftImages) {
                    contentArray.push({
                        type: "image_url",
                        image_url: { url: imgDataUrl }
                    });
                }
            }

            if (contentArray.length === 0) return;

            messages.push({ role: "user", content: contentArray });

            url = "https://openrouter.ai/api/v1/chat/completions";
            body = JSON.stringify({
                model: model, // Depends on user selection in settings
                messages: messages
            });
        }

        // --- FETCH ---
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(provider === 'openrouter' ? {
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://kenowa.extension',
                    'X-Title': 'Kenowa Extension'
                } : {})
            },
            body: body,
            signal: abortController.signal
        });

        if (!response.ok) {
            let errorMsg = 'API request failed';
            try {
                const errData = await response.json();
                errorMsg = errData.error?.message || JSON.stringify(errData);
            } catch (e) {
                errorMsg += ` (${response.status} ${response.statusText})`;
            }
            throw new Error(errorMsg);
        }

        const data = await response.json();

        let aiMessage = "";
        let imageResponses = [];

        if (provider === 'gemini') {
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                const partsResponse = data.candidates[0].content.parts;
                if (partsResponse) {
                    for (const part of partsResponse) {
                        if (part.text) aiMessage += part.text;
                        else if (part.inline_data) {
                            const base64 = part.inline_data.data;
                            const mime = part.inline_data.mime_type || 'image/png';
                            imageResponses.push(`data:${mime};base64,${base64}`);
                        }
                    }
                }
            }
        } else {
            // OpenRouter / OpenAI Format
            if (data.choices && data.choices[0] && data.choices[0].message) {
                aiMessage = data.choices[0].message.content;
            }
        }

        hideTypingIndicator();

        if (imageResponses.length > 0) {
            if (currentMode === 'image' && provider === 'gemini') logImageGenSuccess();
            appendMessage('ai', aiMessage || "Generated Content:", imageResponses);
        } else {
            if (!aiMessage && !imageResponses.length) aiMessage = "No content generated.";
            appendMessage('ai', aiMessage, [], true);
        }

    } catch (error) {
        hideTypingIndicator();
        if (error.name === 'AbortError') {
            console.log('Fetch aborted');
        } else {
            console.error("API Error", error);
            appendMessage('ai', "Sorry, I can't process that right now. Error: " + error.message);
        }
    } finally {
        toggleSendButton(false);
        abortController = null;
    }
}
function checkImageGenLimit() {
    const lastGen = localStorage.getItem('kenowa_last_image_gen');
    if (!lastGen) return true;

    const lastDate = new Date(parseInt(lastGen));
    const today = new Date();

    return lastDate.getDate() !== today.getDate() ||
        lastDate.getMonth() !== today.getMonth() ||
        lastDate.getFullYear() !== today.getFullYear();
}

function logImageGenSuccess() {
    localStorage.setItem('kenowa_last_image_gen', Date.now().toString());
}

function stopGeneration() {
    if (abortController) {
        abortController.abort();
        hideTypingIndicator();
        toggleSendButton(false);
    }
}

async function handleSQ() {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs || tabs.length === 0) return;
        const tab = tabs[0];

        if (!tab.url || tab.url.startsWith('chrome://')) {
            appendMessage('ai', 'Cannot analyze system pages.');
            return;
        }

        // Show generic thinking
        showTypingIndicator("Scanning page for questions...");

        // Extract text
        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                // simple heuristic to get likely main content
                return document.body.innerText;
            }
        });

        if (result && result[0] && result[0].result) {
            const pageText = result[0].result.substring(0, 5000); 
            const prompt = `Strictly identify any quiz/test/problem question in the following text. 
If found, provide ONLY the direct answer.
If multiple, answer the first one.
Do not provide explanations unless necessary for the answer itself.

Text:
${pageText}`;

            // Reset UI state to allow immediate send
            isGenerating = false; 
            if (typingIndicator) typingIndicator.classList.add('hidden');
            
            handleSend(prompt);
        } else {
            hideTypingIndicator();
            appendMessage('ai', 'Could not read page content.');
        }

    } catch (err) {
        hideTypingIndicator();
        console.error(err);
        appendMessage('ai', 'Error scanning page: ' + err.message);
    }
}

async function summarizePage() {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs || tabs.length === 0) return;
        const tab = tabs[0];

        if (!tab.url) {
        } else if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:') || tab.url.startsWith('view-source:')) {
            appendMessage('ai', 'I cannot summarize this system page for security reasons. Try a normal website!');
            return;
        }

        // Check Permissions for this specific site
        try {
            const hasPermission = await new Promise(resolve => {
                chrome.permissions.contains({ origins: [tab.url] }, (result) => resolve(result));
            });

            if (!hasPermission) {
                const granted = await new Promise(resolve => {
                    chrome.permissions.request({ origins: [tab.url] }, (result) => resolve(result));
                });

                if (!granted) {
                    appendMessage('ai', 'I cannot summarize this page because permission was denied.');
                    return;
                }
            }
        } catch (permErr) {
            console.warn("Permission check failed, trying anyway...", permErr);
        }

        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => document.body.innerText
        });

        if (result && result[0] && result[0].result) {
            const pageText = result[0].result;
            const truncatedText = pageText.substring(0, 4000);
            const prompt = `Summarize the following page content in a concise, bulleted format:\n\n${truncatedText}`;
            handleSend(prompt);
        } else {
            appendMessage('ai', 'I could not read the content of this page. It might be protected or empty.');
        }
    } catch (err) {
        console.error('Summarization failed', err);
        appendMessage('ai', 'Failed to read page content. \nError: ' + (err.message || 'Unknown error'));
    }
}

function regenerateMessage() {
    const chat = chats[currentChatId];
    if (!chat || !chat.messages.length) return;

    let lastUserMsg = null;
    let spliceIndex = -1;

    for (let i = chat.messages.length - 1; i >= 0; i--) {
        if (chat.messages[i].role === 'user') {
            lastUserMsg = chat.messages[i];
            spliceIndex = i + 1;
            break;
        }
    }

    if (lastUserMsg) {
        if (messagesList) {
            const allMessages = messagesList.querySelectorAll('.message');
            for (let i = spliceIndex; i < chat.messages.length; i++) {
                if (i < allMessages.length) allMessages[i].remove();
            }
        }

        chat.messages.splice(spliceIndex);
        saveChats();

        let textToSend = "";
        let imagesToSend = [];

        if (Array.isArray(lastUserMsg.content)) {
            // Complex structure not fully supported in simple regenerate without parsing.
            // Simplified: grab pure text if complex
            // But we stored it as array in 'content' if it was array. 
            // Wait, in handleSend we send array, but in saveToHistory we save...
            // In handleSend we called appendMessage(user, text, images).
            // appendMessage saves to history { role, content: text, images: images }. 
            // So content is just string. Good.
            textToSend = lastUserMsg.content;
            imagesToSend = lastUserMsg.images || [];
        } else {
            textToSend = lastUserMsg.content;
            imagesToSend = lastUserMsg.images || [];
        }

        currentDraftImages = imagesToSend.map(img => (typeof img === 'string' ? img : img.image_url.url));
        handleSend(textToSend);
    }
}

function showTypingIndicator(message = "Thinking...") {
    if (!typingIndicator) return;

    typingIndicator.innerHTML = `<span class="thinking-text">${message}</span>`;
    typingIndicator.classList.add('thinking-indicator');
    typingIndicator.classList.remove('hidden');
    if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
}

function hideTypingIndicator() {
    if (typingIndicator) typingIndicator.classList.add('hidden');
}

function renderHistoryList() {
    if (!historyList) return;

    historyList.innerHTML = '';
    const sortedChatIds = Object.keys(chats).sort((a, b) => chats[b].timestamp - chats[a].timestamp);

    sortedChatIds.forEach(id => {
        const chat = chats[id];
        const item = document.createElement('div');
        item.className = 'history-item';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'history-item-title';
        titleSpan.textContent = chat.title || 'New Chat';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-chat-btn';
        deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
        deleteBtn.onclick = (e) => deleteChat(e, id);

        item.appendChild(titleSpan);
        item.appendChild(deleteBtn);
        item.onclick = (e) => {
            loadChat(id, true);
        };

        historyList.appendChild(item);
    });
}

function loadChat(id, closeSidebar = true) {
    currentChatId = id;
    const chat = chats[id];

    // Persist current chat selection
    saveChats();

    if (messagesList) messagesList.innerHTML = '';
    if (welcomeScreen) welcomeScreen.classList.add('hidden');

    chat.messages.forEach(msg => {
        appendMessage(msg.role, msg.content, msg.images);
    });

    if (closeSidebar) toggleSidebar();
    if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Scroll to Bottom Logic
const scrollBottomBtn = document.getElementById('scroll-bottom-btn');
if (scrollBottomBtn && messagesList) {
    // Show/Hide button on scroll
    messagesList.addEventListener('scroll', () => {
        const threshold = 100;
        const isNearBottom = messagesList.scrollHeight - messagesList.scrollTop - messagesList.clientHeight < threshold;

        if (isNearBottom) {
            scrollBottomBtn.classList.add('hidden');
        } else {
            scrollBottomBtn.classList.remove('hidden');
        }
    });

    // Scroll to bottom on click
    scrollBottomBtn.addEventListener('click', () => {
        messagesList.scrollTo({
            top: messagesList.scrollHeight,
            behavior: 'smooth'
        });
    });
}

// Settings & Logout Logic
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        forceLogout('Logged out successfully.');
    });
}

const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const clearDataBtn = document.getElementById('clear-data-btn');

const providerInput = document.getElementById('settings-provider-input');
const keyInput = document.getElementById('settings-key-input');
const openRouterKeyInput = document.getElementById('settings-openrouter-key-input');
const modelInput = document.getElementById('settings-model-input');

if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
        if (settingsModal) {
            settingsModal.classList.remove('hidden');
            // Pre-fill current values
            providerInput.value = localStorage.getItem('kenowa_provider') || 'gemini';
            keyInput.value = localStorage.getItem('kenowa_api_key') || '';
            openRouterKeyInput.value = localStorage.getItem('kenowa_openrouter_key') || '';
            modelInput.value = localStorage.getItem('kenowa_model') || MODEL_QUICK;
        }
        if (historySidebar) historySidebar.classList.remove('show'); 
    });
}

if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', () => {
        localStorage.setItem('kenowa_provider', providerInput.value);
        localStorage.setItem('kenowa_api_key', keyInput.value.trim());
        localStorage.setItem('kenowa_openrouter_key', openRouterKeyInput.value.trim());
        localStorage.setItem('kenowa_model', modelInput.value);

        // Feedback UI
        const originalText = saveSettingsBtn.innerText;
        saveSettingsBtn.innerText = 'Saved!';
        saveSettingsBtn.style.backgroundColor = '#4caf50';

        setTimeout(() => {
            saveSettingsBtn.innerText = originalText;
            saveSettingsBtn.style.backgroundColor = '';
            if (settingsModal) settingsModal.classList.add('hidden');
        }, 800);
    });
}

if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', () => {
        if (settingsModal) settingsModal.classList.add('hidden');
    });
}

if (clearDataBtn) {
    clearDataBtn.addEventListener('click', async () => {
        if (confirm("Are you sure you want to clear all data? This cannot be undone.")) {
            localStorage.clear();
            if (typeof chrome !== 'undefined' && chrome.storage) {
                await chrome.storage.local.clear();
            }
            window.location.reload();
        }
    });
}


// Voice Input Logic
let recognition;

function toggleVoiceInput() {

    if (!('webkitSpeechRecognition' in window)) {
        appendMessage('ai', 'Sorry, speech recognition is not supported in this browser.');
        return;
    }

    if (recognition && recognition.active) {
        recognition.stop();
        return;
    }

    recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = function () {
        recognition.active = true;
        if (micBtn) micBtn.classList.add('mic-active');
        if (userInput) userInput.placeholder = "Listening...";
    };

    recognition.onresult = function (event) {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }

        if (userInput) {
            // Append to existing text if any? Or replace? 
            // Usually replace for short commands, append for dictation. 
            // Let's go with: if input matches transcript start, update, else append.
            // Simpler: Just set value to current total transcript.
            // But we need to handle existing text in input. 
            // Stick to simple: Replace current input or append?
            // User likely wants to speak the message.
            userInput.value = finalTranscript + interimTranscript;

            // Auto resize
            userInput.style.height = 'auto';
            userInput.style.height = (userInput.scrollHeight) + 'px';
        }
    };

    recognition.onerror = function (event) {
        console.error("Speech recognition error", event.error);
        stopRecognitionUI();
    };

    recognition.onend = function () {
        stopRecognitionUI();
        // Auto send if settings enabled? For now, just let user review and send.
    };

    recognition.start();
}

function stopRecognitionUI() {
    if (recognition) recognition.active = false;
    if (micBtn) micBtn.classList.remove('mic-active');
    if (userInput) userInput.placeholder = "Message Kenowa or @mention a tab";
}

// Exam Mode Logic
async function apiGenerateText(prompt) {
    // Standard security check
    const isOk = await checkAccountStatus();
    if (!isOk) return null;

    const provider = localStorage.getItem('kenowa_provider') || 'gemini';
    let apiKey, url, body;
    let model = localStorage.getItem('kenowa_model') || MODEL_QUICK;
    
    if (provider === 'gemini') {
        apiKey = localStorage.getItem('kenowa_api_key');
        if (!apiKey) return null;
        url = `${BASE_URL}${model}:generateContent?key=${apiKey}`;
        body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] });
    } else {
        apiKey = localStorage.getItem('kenowa_openrouter_key');
        if (!apiKey) return null;
        url = "https://openrouter.ai/api/v1/chat/completions";
        body = JSON.stringify({
            model: model,
            messages: [{ role: "user", content: [{ type: "text", text: prompt }] }]
        });
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(provider === 'openrouter' ? {
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://kenowa.extension',
                    'X-Title': 'Kenowa Extension'
                } : {})
            },
            body: body
        });

        if (!response.ok) return null;
        const data = await response.json();
        
        if (provider === 'gemini') {
            if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts.length) {
                return data.candidates[0].content.parts.map(p => p.text).join('').trim();
            }
        } else {
            if (data.choices && data.choices[0] && data.choices[0].message) {
                return data.choices[0].message.content.trim();
            }
        }
    } catch(e) {
        console.error("Exam mode API error", e);
    }
    return null;
}

function toggleExamMode() {
    isExamMode = !isExamMode;
    if (isExamMode) {
        if (examModeBtn) {
            examModeBtn.classList.add('mic-active');
            examModeBtn.style.color = '#4caf50';
        }
        appendMessage('ai', 'Exam Mode Activated. Automatically scanning for questions, solving them, clicking the correct option, and proceeding to Next or Submit when time is up.');
        runExamModeStep();
    } else {
        if (examModeBtn) {
            examModeBtn.classList.remove('mic-active');
            examModeBtn.style.color = '';
        }
        clearTimeout(examModeTimeout);
        hideTypingIndicator();
        appendMessage('ai', 'Exam Mode Deactivated.');
    }
}

async function runExamModeStep() {
    if (!isExamMode) return;

    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs || tabs.length === 0) {
            toggleExamMode();
            return;
        }
        const tab = tabs[0];

        if (!tab.url || tab.url.startsWith('chrome://')) {
            appendMessage('ai', 'Exam mode cannot run on system pages.');
            toggleExamMode();
            return;
        }

        showTypingIndicator("Exam Mode: Scanning page...");

        const extraction = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                let text = document.body.innerText;
                let isExamComplete = false;
                // Basic check if its a complete exam/score screen
                if(text.toLowerCase().includes('score') && text.toLowerCase().includes('result')) {
                    isExamComplete = true;
                }
                return { text, isExamComplete };
            }
        });

        if (!extraction || !extraction[0] || !extraction[0].result) {
            throw new Error('Could not read page');
        }

        if(extraction[0].result.isExamComplete) {
            appendMessage('ai', 'Exam appears to be complete.');
            toggleExamMode();
            return;
        }
        
        const pageText = extraction[0].result.text.substring(0, 15000);
        const prompt = `You are an expert test-taking assistant. Extracted text from an exam page:
${pageText}

Your task is to identify ALL multiple-choice questions on this page and determine the correct answer for EACH.
Reply with a JSON array containing ONLY the exact text of the correct options as they appear on the page. Do not include the letter/number prefix (e.g. A, B, 1).
Example: ["First correct answer text", "Second correct answer text"]
IMPORTANT: Only output the valid JSON array, no other text or explanation.`;

        const aiAnswer = await apiGenerateText(prompt);

        if (!aiAnswer || aiAnswer.trim() === '') {
             appendMessage('ai', 'Exam Mode: Failed to determine answer. Trying again soon.');
        } else {
             appendMessage('ai', 'Exam Mode Found Answer: ' + aiAnswer);

             // Inject script to click option and proceed
             await chrome.scripting.executeScript({
                 target: { tabId: tab.id },
                 args: [aiAnswer],
                 func: (answerText) => {
                     // Parse AI response
                     let aiAnswers = [];
                     try {
                         let jsonMatch = answerText.match(/\[[\s\S]*\]/);
                         if (jsonMatch) {
                             aiAnswers = JSON.parse(jsonMatch[0]);
                         } else {
                             aiAnswers = [answerText];
                         }
                     } catch(e) {
                         aiAnswers = [answerText];
                     }

                     aiAnswers.forEach(ans => {
                         if (typeof ans !== 'string') return;
                         let cleanAnswer = ans.trim();
                         // Remove leading A. B. etc which AI might add
                         cleanAnswer = cleanAnswer.replace(/^[A-Z][\.\)]\s*/, '').toLowerCase();
                         if (!cleanAnswer) return;

                         let elements = Array.from(document.querySelectorAll('label, div, span, button, p'));
                         
                         // Helper score
                         let getScore = (el) => {
                             let text = el.innerText ? el.innerText.trim().toLowerCase() : '';
                             if(!text) return 0;
                             if (text === cleanAnswer) return 100;
                             if (text.includes(cleanAnswer) && cleanAnswer.length > 2) return (cleanAnswer.length / text.length) * 100;
                             return 0;
                         };

                         let bestElement = null;
                         let bestScore = 1; // Needs to be > 1
                         elements.forEach(el => {
                             let score = getScore(el);
                             if(score > bestScore && el.children.length === 0) { // Prefer leaf nodes
                                 bestScore = score;
                                 bestElement = el;
                             }
                         });

                         if (bestElement) {
                             bestElement.click();
                             let parent = bestElement.parentElement;
                             if(parent) {
                                 let inputs = parent.querySelectorAll('input[type="radio"], input[type="checkbox"]');
                                 if(inputs.length > 0) inputs[0].click();
                             }
                         }
                     });

                     // Click Next/Submit Buttons
                     setTimeout(() => {
                         let allBtns = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a'));
                         
                         let submitAllBtns = allBtns.filter(b => (b.innerText || b.value || '').toLowerCase().includes('submit all and finish'));
                         let finishAttemptBtns = allBtns.filter(b => (b.innerText || b.value || '').toLowerCase().includes('finish attempt'));
                         let nextBtns = allBtns.filter(b => /^(next|continue)\b/i.test(b.innerText || b.value || ''));
                         let submitBtns = allBtns.filter(b => (b.innerText || b.value || '').toLowerCase().includes('submit'));

                         if (submitAllBtns.length > 0) {
                             submitAllBtns[0].click();
                         } else if (finishAttemptBtns.length > 0) {
                             finishAttemptBtns[0].click();
                         } else if (nextBtns.length > 0) {
                             nextBtns[0].click();
                         } else if (submitBtns.length > 0) {
                             submitBtns[0].click();
                         }
                     }, 1000);
                 }
             });
        }

        // Loop next step after delay
        if (isExamMode) {
            examModeTimeout = setTimeout(runExamModeStep, 4000);
        }

    } catch (err) {
        console.error("Exam Mode Error:", err);
        appendMessage('ai', 'Exam Mode Error: ' + err.message);
        toggleExamMode();
    }
}
