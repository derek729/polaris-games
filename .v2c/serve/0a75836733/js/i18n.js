// ========================================
// Anbu Landing Page - i18n (Internationalization)
// ========================================

const translations = {};
const supportedLanguages = ['ko', 'en', 'ja', 'zh-CN', 'zh-TW'];
let currentLanguage = 'ko';

// Load translations
async function loadTranslations(lang) {
    if (translations[lang]) {
        return translations[lang];
    }

    try {
        const response = await fetch(`translations/${lang}.json`);
        if (!response.ok) throw new Error('Translation file not found');
        translations[lang] = await response.json();
        return translations[lang];
    } catch (error) {
        console.error(`Failed to load translations for ${lang}:`, error);
        // Fallback to Korean
        if (lang !== 'ko') {
            return loadTranslations('ko');
        }
        return {};
    }
}

// Apply translations to page
function applyTranslations(lang) {
    const t = translations[lang] || translations['ko'] || {};

    // Update all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (t[key]) {
            if (element.tagName === 'INPUT' && element.type === 'placeholder') {
                element.placeholder = t[key];
            } else {
                element.textContent = t[key];
            }
        }
    });

    // Update placeholder attributes
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        const key = element.getAttribute('data-i18n-placeholder');
        if (t[key]) {
            element.placeholder = t[key];
        }
    });

    // Update document lang attribute
    document.documentElement.lang = lang;
    document.body.setAttribute('lang', lang);

    // Update page title
    if (t['page_title']) {
        document.title = t['page_title'];
    }
}

// Change language
async function changeLanguage(lang) {
    if (!supportedLanguages.includes(lang)) {
        lang = 'ko';
    }

    currentLanguage = lang;
    localStorage.setItem('anbu_language', lang);

    await loadTranslations(lang);
    applyTranslations(lang);

    // Update language selector
    const selector = document.getElementById('language-selector');
    if (selector) {
        selector.value = lang;
    }
}

// Get browser language
function getBrowserLanguage() {
    const browserLang = navigator.language || navigator.userLanguage;

    // Check for exact match
    if (supportedLanguages.includes(browserLang)) {
        return browserLang;
    }

    // Check for language code match (e.g., 'en-US' -> 'en')
    const langCode = browserLang.split('-')[0];
    if (supportedLanguages.includes(langCode)) {
        return langCode;
    }

    // Special handling for Chinese
    if (browserLang.startsWith('zh')) {
        if (browserLang.includes('TW') || browserLang.includes('HK')) {
            return 'zh-TW';
        }
        return 'zh-CN';
    }

    return 'ko';
}

// Initialize i18n
async function initI18n() {
    // Check saved language preference
    const savedLang = localStorage.getItem('anbu_language');
    const initialLang = savedLang || getBrowserLanguage();

    // Load initial translations
    await loadTranslations(initialLang);
    applyTranslations(initialLang);

    // Set up language selector
    const selector = document.getElementById('language-selector');
    if (selector) {
        selector.value = initialLang;
        selector.addEventListener('change', (e) => {
            changeLanguage(e.target.value);
        });
    }

    currentLanguage = initialLang;
}

// Export for use in other scripts
window.i18n = {
    init: initI18n,
    change: changeLanguage,
    get current() { return currentLanguage; },
    t: (key) => translations[currentLanguage]?.[key] || key
};
