const fill = document.getElementById('wheelFill');
const value = document.getElementById('chanceValue');
const arrow = document.getElementById('wheelArrow');
const button = document.getElementById('upgradeBtn');
const resultBox = document.getElementById('result');
const inventoryBox = document.getElementById('inventory');
const stakeBox = document.getElementById('stake');
const targetBox = document.getElementById('target');
const targetsBox = document.getElementById('targets');
const multsBox = document.getElementById('mults');
const settingsBtn = document.getElementById('settingsBtn');
const soundBtn = document.getElementById('soundBtn');
const fastBtn = document.getElementById('fastBtn');
const settingsModal = document.getElementById('settingsModal');
const multInputsBox = document.getElementById('multInputs');
const pctInputsBox = document.getElementById('pctInputs');
const modal = document.getElementById('skinModal');
const modalCard = document.getElementById('skinModalCard');

const CURRENCY_SIGN = '₽'; // поменяйте, если меняли CURRENCY в update-skins.js

const RARITY_COLORS = {
    'Consumer Grade': '#B0C3D9',
    'Industrial Grade': '#5E98D9',
    'Mil-Spec Grade': '#4B69FF',
    'Restricted': '#8847FF',
    'Classified': '#D32CE6',
    'Covert': '#EB4B4B',
    'Contraband': '#E4AE39',
    'Extraordinary': '#E4AE39'
};

// скорость прокрутки: время в секундах и число оборотов
const SPIN = {
    normal: { seconds: 7, turns: 7 },
    fast: { seconds: 2.5, turns: 4 }
};

const ICONS = {
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="6" stroke-width="4"/><circle cx="12" cy="12" r="9.5" stroke-width="3" stroke-dasharray="3.73 3.73"/></svg>',
    soundOn: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    soundOff: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>'
};

/* ---------- настройки в браузере ---------- */

function loadSetting(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function saveSetting(key, val) {
    try {
        localStorage.setItem(key, JSON.stringify(val));
    } catch {
        // хранилище недоступно, ничего страшного
    }
}

const DEFAULTS = { mults: [2, 5, 10, 25], pcts: [35, 55, 75], sound: true, fast: false };

function sanitizeSettings(raw) {
    const s = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
    const okMults = Array.isArray(s.mults) && s.mults.length === 4
        && s.mults.every(n => Number.isFinite(n) && n >= 1.1 && n <= 100);
    const okPcts = Array.isArray(s.pcts) && s.pcts.length === 3
        && s.pcts.every(n => Number.isFinite(n) && n >= 1 && n <= 95);
    return {
        mults: okMults ? s.mults : DEFAULTS.mults,
        pcts: okPcts ? s.pcts : DEFAULTS.pcts,
        sound: s.sound !== false,
        fast: s.fast === true
    };
}

let settings = sanitizeSettings(loadSetting('upgradeSettings', null));

let inventory = [];
let selectedIds = new Set();
let targets = [];
let target = null;
let filter = { kind: 'all', value: 0 }; // быстрый подбор: все, коэффициент или процент
let rotation = 180; // стрелка в покое стоит внизу
let spinning = false;
let loadToken = 0;

/* ---------- звук (рисуется в браузере, файлы не нужны) ---------- */

let audioCtx = null;

function getAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

function beep({ freq = 600, endFreq = freq, duration = 0.1, type = 'sine', volume = 0.12, delay = 0 }) {
    const ctx = getAudio();
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
}

// громкость каждого звука меняется параметром volume
const SOUNDS = {
    select:   () => beep({ freq: 520, endFreq: 780, duration: 0.09, volume: 0.12 }),
    deselect: () => beep({ freq: 600, endFreq: 380, duration: 0.09, volume: 0.10 }),
    target:   () => {
        beep({ freq: 660, duration: 0.12, volume: 0.12 });
        beep({ freq: 990, duration: 0.20, volume: 0.10, delay: 0.07 });
    },
    mult:     () => beep({ freq: 900, endFreq: 700, duration: 0.05, volume: 0.09, type: 'triangle' }),
    tick:     () => beep({ freq: 1400, endFreq: 900, duration: 0.03, volume: 0.07, type: 'triangle' }),
    start:    () => beep({ freq: 200, endFreq: 800, duration: 0.4, volume: 0.07 }),
    win:      () => [523, 659, 784, 1047].forEach((f, i) => beep({ freq: f, duration: 0.3, volume: 0.12, delay: i * 0.1 })),
    lose:     () => beep({ freq: 330, endFreq: 150, duration: 0.6, volume: 0.10, type: 'triangle' })
};

function playSound(name) {
    if (settings.sound) SOUNDS[name]();
}

// текущий угол стрелки (читаем из браузера прямо во время анимации)
function arrowAngle() {
    const m = getComputedStyle(arrow).transform;
    if (m === 'none') return 0;
    const [a, b] = m.slice(7, -1).split(',').map(Number);
    return Math.atan2(b, a) * 180 / Math.PI;
}

// щелчки при прокрутке: по одному на каждые 12 градусов, замедляются вместе со стрелкой
function runSpinSound() {
    const STEP = 12;
    let last = arrowAngle();
    let acc = 0;

    function frame() {
        if (!spinning) return;
        const now = arrowAngle();
        acc += Math.max(0, ((now - last + 540) % 360) - 180);
        last = now;
        if (acc >= STEP) {
            playSound('tick');
            acc %= STEP;
        }
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

/* ---------- вспомогательное ---------- */

function esc(text) {
    return String(text).replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function formatNumber(p) {
    return p.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

function rarityColor(name) {
    return RARITY_COLORS[name] || '#8B8B8B';
}

// "StatTrak™ PP-Bizon | Embargo (Minimal Wear)" -> тип оружия и название
function splitName(name) {
    const [type, rest = ''] = name.split(' | ');
    return rest
        ? { type, title: rest.replace(/[()]/g, '') }
        : { type: '', title: type };
}

// одна карточка скина, используется везде
function skinCard(s, { className = '', attrs = '', badge = '' } = {}) {
    const { type, title } = splitName(s.name);
    return `
        <div class="skin ${className}" style="--rarity: ${rarityColor(s.rarity)}" ${attrs}>
            ${badge}
            <img src="${esc(s.image)}" alt="${esc(s.name)}" loading="lazy">
            ${type ? `<div class="skin__type">${esc(type)}</div>` : ''}
            <div class="skin__name">${esc(title)}</div>
            <div class="skin__price">
                <span>${formatNumber(s.price)}</span>
                <span class="coin coin--sm">${CURRENCY_SIGN}</span>
            </div>
        </div>`;
}

/* ---------- отрисовка ---------- */

function renderInventory() {
    if (!inventory.length) {
        inventoryBox.innerHTML = '<div class="empty">Инвентарь пуст</div>';
        return;
    }
    inventoryBox.innerHTML = inventory.map(s => skinCard(s, {
        className: 'skin--click' + (selectedIds.has(s.itemId) ? ' selected' : ''),
        attrs: `data-item="${s.itemId}"`
    })).join('');
}

const CHEVRONS = '<svg viewBox="0 0 24 32" fill="currentColor"><polygon points="2,2 12,8 22,2 22,6 12,12 2,6" opacity=".35"/><polygon points="2,10 12,16 22,10 22,14 12,20 2,14"/><polygon points="2,18 12,24 22,18 22,22 12,28 2,22" opacity=".35"/></svg>';

// пустая панель с подсказкой
function emptyHero(title, text) {
    return `
        <div class="hero-empty">
            <h3>${title}</h3>
            <p>${text}</p>
            <div class="hero-empty__icon">${CHEVRONS}</div>
        </div>`;
}

// выбранная цель: крупная карточка во всю панель
function heroSkin(s) {
    const { type, title } = splitName(s.name);
    return `
        <div class="hero-skin" style="--rarity: ${rarityColor(s.rarity)}">
            <button class="hero-skin__close" type="button" data-clear-target aria-label="Убрать">✕</button>
            ${type ? `<div class="hero-skin__type">${esc(type)}</div>` : ''}
            <div class="hero-skin__name">${esc(title)}</div>
            <img class="hero-skin__image" src="${esc(s.image)}" alt="${esc(s.name)}">
            <div class="hero-skin__price">
                <span>${formatNumber(s.price)}</span>
                <span class="coin">${CURRENCY_SIGN}</span>
            </div>
        </div>`;
}

function renderStake() {
    const items = inventory.filter(s => selectedIds.has(s.itemId));
    stakeBox.classList.toggle('is-empty', items.length === 0);
    stakeBox.innerHTML = items.length
        ? items.map(s => skinCard(s)).join('')
        : emptyHero('Выберите предметы для улучшения', 'Вы можете выбрать несколько предметов');
}

function renderTarget() {
    targetBox.innerHTML = target
        ? heroSkin(target)
        : emptyHero('Выберите скин для улучшения', 'Выберите цель в списке «На что улучшить»');
}

// крестик на карточке цели убирает выбор
targetBox.addEventListener('click', e => {
    if (spinning || !e.target.closest('[data-clear-target]')) return;
    target = null;
    playSound('deselect');
    renderTargets();
    renderTarget();
    updateWheel();
});

function renderTargets() {
    if (!targets.length) {
        targetsBox.innerHTML = '<div class="empty">Нет подходящих скинов</div>';
        return;
    }
    targetsBox.innerHTML = targets.map(s => skinCard(s, {
        className: 'skin--click' + (target && target.id === s.id ? ' selected' : ''),
        attrs: `data-target="${s.id}"`,
        badge: `<div class="skin__chance">${Number(s.chance.toFixed(2))}%</div>`
    })).join('');
}

// ряд кнопок быстрого подбора: Все, коэффициенты, проценты
function renderQuick() {
    const btn = (kind, val, label) => `
        <button class="mult ${filter.kind === kind && filter.value === val ? 'active' : ''}"
                type="button" data-kind="${kind}" data-value="${val}">${label}</button>`;

    multsBox.innerHTML =
        btn('all', 0, 'Все') +
        settings.mults.map(m => btn('mult', m, `x${m}`)).join('') +
        '<span class="mults__sep"></span>' +
        settings.pcts.map(p => btn('chance', p, `${p}%`)).join('');
}

function renderToolbar() {
    soundBtn.innerHTML = settings.sound ? ICONS.soundOn : ICONS.soundOff;
    soundBtn.classList.toggle('active', settings.sound);
    fastBtn.classList.toggle('active', settings.fast);
}

function updateWheel() {
    const chance = target ? target.chance : 0;
    // заливка начинается так, чтобы её середина приходилась на нижнюю точку
    fill.style.strokeDasharray = `${chance} 100`;
    fill.style.strokeDashoffset = `${chance / 2 - 50}`;
    value.textContent = Number(chance.toFixed(2));
    button.disabled = spinning || !target || selectedIds.size === 0;
}

function refresh() {
    renderInventory();
    renderStake();
    renderTarget();
    updateWheel();
    loadTargets();
}

/* ---------- данные с сервера ---------- */

async function loadInventory() {
    try {
        const response = await fetch('/api/inventory');
        if (!response.ok) throw new Error();
        inventory = await response.json();
        refresh();
    } catch {
        inventoryBox.textContent = 'Не удалось загрузить инвентарь';
    }
}

async function loadTargets() {
    const token = ++loadToken;

    if (selectedIds.size === 0) {
        targets = [];
        targetsBox.innerHTML = '<div class="empty">Сначала выберите скины в инвентаре</div>';
        return;
    }

    const params = new URLSearchParams({
        items: [...selectedIds].join(','),
        mult: filter.kind === 'mult' ? filter.value : 0,
        chance: filter.kind === 'chance' ? filter.value : 0
    });

    try {
        const response = await fetch(`/api/targets?${params}`);
        if (!response.ok) throw new Error();
        const list = await response.json();
        if (token !== loadToken) return; // пришёл устаревший ответ
        targets = list;
        renderTargets();
    } catch {
        targetsBox.textContent = 'Не удалось загрузить скины';
    }
}

/* ---------- клики ---------- */

inventoryBox.addEventListener('click', e => {
    if (spinning) return;
    const card = e.target.closest('[data-item]');
    if (!card) return;

    const id = Number(card.dataset.item);
    if (selectedIds.has(id)) {
        selectedIds.delete(id);
        playSound('deselect');
    } else if (selectedIds.size < 10) {
        selectedIds.add(id);
        playSound('select');
    }
    target = null; // ставка изменилась, цель нужно выбрать заново
    resultBox.textContent = '';
    refresh();
});

targetsBox.addEventListener('click', e => {
    if (spinning) return;
    const card = e.target.closest('[data-target]');
    if (!card) return;

    target = targets.find(s => s.id === Number(card.dataset.target));
    playSound('target');
    renderTargets();
    renderTarget();
    updateWheel();
});

multsBox.addEventListener('click', e => {
    if (spinning) return;
    const btn = e.target.closest('[data-kind]');
    if (!btn) return;

    filter = { kind: btn.dataset.kind, value: Number(btn.dataset.value) };
    target = null;
    playSound('mult');
    renderQuick();
    renderTarget();
    updateWheel();
    loadTargets();
});

/* ---------- значки над панелью ---------- */

soundBtn.addEventListener('click', () => {
    settings.sound = !settings.sound;
    saveSetting('upgradeSettings', settings);
    renderToolbar();
    playSound('select');
});

fastBtn.addEventListener('click', () => {
    settings.fast = !settings.fast;
    saveSetting('upgradeSettings', settings);
    renderToolbar();
    playSound('mult');
});

/* ---------- окно настроек ---------- */

function renderSettingsForm(s) {
    multInputsBox.innerHTML = s.mults.map(m => `
        <label class="chip"><span>x</span><input type="number" min="1.1" max="100" step="any" value="${m}"></label>`
    ).join('');

    pctInputsBox.innerHTML = s.pcts.map(p => `
        <label class="chip"><input type="number" min="1" max="95" step="1" value="${p}"><span>%</span></label>`
    ).join('');

    settingsModal.querySelector(`input[name="sound"][value="${s.sound ? 'on' : 'off'}"]`).checked = true;
    settingsModal.querySelector(`input[name="speed"][value="${s.fast ? 'fast' : 'normal'}"]`).checked = true;
}

function openSettings() {
    renderSettingsForm(settings);
    settingsModal.hidden = false;
}

function closeSettings() {
    settingsModal.hidden = true;
}

function saveSettingsForm() {
    const mults = [...multInputsBox.querySelectorAll('input')]
        .map((input, i) => {
            const v = Math.round(Number(input.value) * 100) / 100;
            return v >= 1.1 && v <= 100 ? v : settings.mults[i]; // неверное значение остаётся прежним
        })
        .sort((a, b) => a - b);

    const pcts = [...pctInputsBox.querySelectorAll('input')]
        .map((input, i) => {
            const v = Math.round(Number(input.value));
            return v >= 1 && v <= 95 ? v : settings.pcts[i];
        })
        .sort((a, b) => a - b);

    settings = {
        mults,
        pcts,
        sound: settingsModal.querySelector('input[name="sound"]:checked').value === 'on',
        fast: settingsModal.querySelector('input[name="speed"]:checked').value === 'fast'
    };
    saveSetting('upgradeSettings', settings);

    // выбранной кнопки быстрого подбора могло не остаться в списке
    const gone =
        (filter.kind === 'mult' && !settings.mults.includes(filter.value)) ||
        (filter.kind === 'chance' && !settings.pcts.includes(filter.value));
    if (gone) {
        filter = { kind: 'all', value: 0 };
        target = null;
        renderTarget();
        updateWheel();
        loadTargets();
    }

    renderToolbar();
    renderQuick();
    closeSettings();
}

settingsBtn.addEventListener('click', openSettings);
document.getElementById('settingsClose').addEventListener('click', closeSettings);
document.getElementById('settingsSave').addEventListener('click', saveSettingsForm);
document.getElementById('settingsDefault').addEventListener('click', () => renderSettingsForm(DEFAULTS));

settingsModal.addEventListener('click', e => {
    if (e.target === settingsModal) closeSettings(); // клик по тёмному фону

    const reset = e.target.closest('[data-reset]');
    if (reset) {
        const isMults = reset.dataset.reset === 'mults';
        const inputs = (isMults ? multInputsBox : pctInputsBox).querySelectorAll('input');
        const defaults = isMults ? DEFAULTS.mults : DEFAULTS.pcts;
        inputs.forEach((input, i) => { input.value = defaults[i]; });
    }
});

/* ---------- улучшение ---------- */

button.addEventListener('click', async () => {
    if (spinning || !target || selectedIds.size === 0) return;

    spinning = true;
    updateWheel();
    resultBox.className = 'upgrade__result';
    resultBox.textContent = '';

    let result;
    try {
        const response = await fetch('/api/upgrade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemIds: [...selectedIds], targetId: target.id })
        });
        if (!response.ok) throw new Error();
        result = await response.json();
    } catch {
        spinning = false;
        updateWheel();
        resultBox.textContent = 'Ошибка сервера, попробуйте ещё раз';
        return;
    }

    // крутим стрелку: обычная прокрутка медленная, ускоренная быстрая
    const spin = settings.fast ? SPIN.fast : SPIN.normal;
    const current = rotation % 360;
    rotation += 360 * spin.turns + ((result.angle - current + 360) % 360);
    arrow.style.transitionDuration = `${spin.seconds}s`;
    arrow.style.transform = `rotate(${rotation}deg)`;
    playSound('start');
    runSpinSound();

    arrow.addEventListener('transitionend', () => {
        resultBox.className = 'upgrade__result ' + (result.win ? 'win' : 'lose');
        resultBox.textContent = result.win
            ? `Победа! Вы получили: ${result.target.name}`
            : 'Не повезло, ставка сгорела';

        playSound(result.win ? 'win' : 'lose');
        if (result.win) openSkinModal(result.target);

        inventory = result.inventory;
        selectedIds.clear();
        target = null;
        spinning = false;
        refresh();
    }, { once: true });
});

/* ---------- окно скина ---------- */

function openSkinModal(skin) {
    const { type, title } = splitName(skin.name);

    document.getElementById('skinModalType').textContent = type;
    document.getElementById('skinModalName').textContent = title;

    const image = document.getElementById('skinModalImage');
    image.src = skin.image;
    image.alt = skin.name;

    document.getElementById('skinModalPrice').textContent = formatNumber(skin.price);
    modal.querySelector('.coin').textContent = CURRENCY_SIGN;

    modalCard.style.setProperty('--rarity', rarityColor(skin.rarity));
    modal.hidden = false;
}

function closeSkinModal() {
    modal.hidden = true;
}

document.getElementById('skinModalClose').addEventListener('click', closeSkinModal);
modal.addEventListener('click', e => {
    if (e.target === modal) closeSkinModal(); // клик по тёмному фону
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeSkinModal();
        closeSettings();
    }
});

/* ---------- запуск ---------- */

settingsBtn.innerHTML = ICONS.gear;
fastBtn.innerHTML = ICONS.bolt;
document.getElementById('settingsGear').innerHTML = ICONS.gear;
document.querySelectorAll('[data-reset]').forEach(b => { b.innerHTML = ICONS.reset; });

renderToolbar();
renderQuick();
loadInventory();