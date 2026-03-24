const OPPONENTS_DB_PATH = 'public/data/cards.db';
const OPPONENTS_AVATAR_PATH = 'public/img/opponents';
const MIN_DECK_PULSE_THRESHOLD = 5;

let currentMode = 'standard';
let opponentsList = [];
let modeProgress = { standard: 0, hard: 0, hardcore: 0 };
let userCardCount = 0;

/**
 * Создает DOM-элемент бейджа соперника.
 * @param {Object} opponent
 * @param {boolean} isLocked
 * @returns {HTMLButtonElement}
 */
function createOpponentBadge(opponent, isLocked) {
    const badge = document.createElement('button');
    badge.className = 'opponent-badge';
    badge.type = 'button';
    badge.dataset.opponentId = opponent.id;

    if (isLocked) {
        badge.classList.add('opponent-badge--locked');
        badge.setAttribute('aria-disabled', 'true');
        badge.disabled = true;
    } else {
        // Добавляем обработчик клика для запуска партии
        badge.addEventListener('click', () => {
            if (!window.partyOrchestrator?.start) {
                console.error('PartyOrchestrator: модуль не загружен.');
                return;
            }

            window.partyOrchestrator.start(opponent.id, currentMode).catch(error => {
                console.error('PartyOrchestrator: ошибка запуска партии', error);
                alert(error?.message || 'Не удалось подготовить партию.');
            });
        });
    }

    const avatar = document.createElement('img');
    avatar.className = 'opponent-avatar';
    avatar.alt = opponent.name;
    avatar.src = `${OPPONENTS_AVATAR_PATH}/${opponent.avatar}`;

    const name = document.createElement('span');
    name.className = 'opponent-name';
    name.textContent = opponent.name;

    const sequence = document.createElement('span');
    sequence.className = 'opponent-sequence';
    sequence.textContent = `Уровень ${opponent.sequence}`;

    badge.append(avatar, name, sequence);

    if (isLocked) {
        const lock = document.createElement('span');
        lock.className = 'opponent-lock';
        lock.textContent = 'Недоступно';
        badge.append(lock);
    }

    return badge;
}

/**
 * Загружает список соперников из базы данных SQLite.
 * @returns {Promise<Array<{id: number, sequence: number, name: string, avatar: string}>>}
 */
async function loadOpponentsFromDb() {
    const SQL = await SqlLoader.init();

    const response = await fetch(OPPONENTS_DB_PATH);
    const buffer = await response.arrayBuffer();
    const db = new SQL.Database(new Uint8Array(buffer));

    const result = db.exec('SELECT id, name, avatar, sequence FROM opponents ORDER BY sequence ASC');
    if (!result.length || !result[0].values.length) {
        return [];
    }

    return result[0].values.map(row => ({
        id: Number(row[0]),
        name: row[1],
        avatar: row[2],
        sequence: Number(row[3])
    }));
}

/**
 * Отрисовывает список соперников в зависимости от текущего режима и прогресса.
 */
function renderOpponents() {
    const opponentsGrid = document.getElementById('opponentsGrid');
    if (!opponentsGrid) return;

    opponentsGrid.innerHTML = '';

    const hasLowCardCount = userCardCount < MIN_DECK_PULSE_THRESHOLD;
    const totalOpponents = opponentsList.length;

    // Определяем максимальный доступный уровень для текущего режима
    let maxUnlockedSequence = 1;

    // Находим "максимальный по сложности режим, в котором победил игрок"
    let highestModeWithWins = 'none';
    if (modeProgress.hardcore > 0) highestModeWithWins = 'hardcore';
    else if (modeProgress.hard > 0) highestModeWithWins = 'hard';
    else if (modeProgress.standard > 0) highestModeWithWins = 'standard';

    if (currentMode === 'standard') {
        if (highestModeWithWins === 'none') {
            maxUnlockedSequence = modeProgress.standard + 1;
        } else if (highestModeWithWins === 'standard') {
            maxUnlockedSequence = modeProgress.standard + 1;
        } else {
            // Если есть победы в более высоких режимах, значит стандартный пройден полностью
            maxUnlockedSequence = totalOpponents + 1;
        }
    } else if (currentMode === 'hard') {
        if (highestModeWithWins === 'standard') {
            maxUnlockedSequence = 1; // Только начали Hard
        } else if (highestModeWithWins === 'hard') {
            maxUnlockedSequence = modeProgress.hard + 1;
        } else {
            // Пройден Hardcore, значит Hard пройден полностью
            maxUnlockedSequence = totalOpponents + 1;
        }
    } else if (currentMode === 'hardcore') {
        if (highestModeWithWins === 'hard') {
            maxUnlockedSequence = 1; // Только начали Hardcore
        } else if (highestModeWithWins === 'hardcore') {
            maxUnlockedSequence = modeProgress.hardcore + 1;
        }
    }

    opponentsList.forEach(opponent => {
        const isLocked = hasLowCardCount || opponent.sequence > maxUnlockedSequence;
        const badge = createOpponentBadge(opponent, isLocked);
        opponentsGrid.append(badge);
    });

    updateTabStates();
}

/**
 * Обновляет состояние табов (активный/доступный).
 */
function updateTabStates() {
    const totalOpponents = opponentsList.length;
    const tabs = document.querySelectorAll('.mode-tab');

    tabs.forEach(tab => {
        const mode = tab.dataset.mode;
        tab.classList.toggle('active', mode === currentMode);

        let isAvailable = false;
        if (mode === 'standard') {
            isAvailable = true;
        } else if (mode === 'hard') {
            isAvailable = modeProgress.standard >= totalOpponents;
        } else if (mode === 'hardcore') {
            isAvailable = modeProgress.hard >= totalOpponents;
        }

        tab.disabled = !isAvailable;
    });
}

/**
 * Показывает оверлей полученных карт на стартовом экране.
 * Использует те же CSS-классы, что и shop-screen.js.
 * @param {Array} cards
 * @param {string} blisterName
 */
function showReceivedCardsOnStart(cards, blisterName) {
    var overlay = document.createElement('div');
    overlay.className = 'shop-received-overlay';
    overlay.style.position = 'fixed';
    overlay.style.zIndex = '10001';

    var panel = document.createElement('div');
    panel.className = 'shop-received-panel';

    var title = document.createElement('h2');
    title.className = 'shop-received-title';
    title.textContent = blisterName;
    panel.appendChild(title);

    var subtitle = document.createElement('p');
    subtitle.className = 'shop-received-subtitle';
    subtitle.textContent = 'Получено карт: ' + cards.length;
    panel.appendChild(subtitle);

    var grid = document.createElement('div');
    grid.className = 'shop-received-grid';

    cards.forEach(function(card) {
        var wrap = document.createElement('div');
        wrap.className = 'shop-received-card';

        var cardElement = window.cardRenderer.renderCard({
            cardTypeId: card.cardTypeId,
            arrowTopLeft: card.arrowTopLeft,
            arrowTop: card.arrowTop,
            arrowTopRight: card.arrowTopRight,
            arrowRight: card.arrowRight,
            arrowBottomRight: card.arrowBottomRight,
            arrowBottom: card.arrowBottom,
            arrowBottomLeft: card.arrowBottomLeft,
            arrowLeft: card.arrowLeft,
            ownership: 'player',
            cardLevel: String(card.cardLevel),
            attackLevel: String(card.attackLevel),
            attackType: card.attackType,
            mechanicalDefense: String(card.mechanicalDefense),
            electricalDefense: String(card.electricalDefense)
        });

        wrap.appendChild(cardElement);
        grid.appendChild(wrap);
    });

    panel.appendChild(grid);

    var closeBtn = document.createElement('button');
    closeBtn.className = 'shop-received-close-btn';
    closeBtn.textContent = 'Отлично!';
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', function() {
        overlay.remove();
    });
    panel.appendChild(closeBtn);

    overlay.appendChild(panel);

    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            overlay.remove();
        }
    });

    document.body.appendChild(overlay);
}

/**
 * Генерирует карты из блистера и добавляет их в userData при обработке зависшей покупки на старте.
 * @param {object} blister
 */
async function generateAndSaveBlisterAtStartup(blister) {
    await window.cardRenderer.init();

    const deckParams = {
        deck_size: blister.deck_size,
        level_min: blister.level_min,
        level_max: blister.level_max,
        group_1_weight: blister.group_1_weight,
        group_2_weight: blister.group_2_weight,
        group_3_weight: blister.group_3_weight,
        group_4_weight: blister.group_4_weight
    };

    const generatedCards = window.cardRenderer.generateDeck(deckParams);

    const userData = await window.userCards.getUserData();
    if (!userData) return;

    const playerCardholder = userData.cardholders.find(function(ch) { return ch.player === true; });
    if (!playerCardholder) return;

    let maxCardId = userData.cards.reduce(function(max, card) {
        return Math.max(max, card.id || 0);
    }, 0);

    const newCards = generatedCards.map(function(generated) {
        maxCardId++;
        const rp = generated.renderParams;
        return {
            id: maxCardId,
            cardholder_id: playerCardholder.id,
            cardTypeId: rp.cardTypeId,
            arrowTopLeft: rp.arrowTopLeft,
            arrowTop: rp.arrowTop,
            arrowTopRight: rp.arrowTopRight,
            arrowRight: rp.arrowRight,
            arrowBottomRight: rp.arrowBottomRight,
            arrowBottom: rp.arrowBottom,
            arrowBottomLeft: rp.arrowBottomLeft,
            arrowLeft: rp.arrowLeft,
            ownership: 'player',
            cardLevel: rp.cardLevel,
            attackLevel: rp.attackLevel,
            attackType: rp.attackType,
            mechanicalDefense: rp.mechanicalDefense,
            electricalDefense: rp.electricalDefense,
            inHand: false
        };
    });

    userData.cards = userData.cards.concat(newCards);
    await window.userCards.saveUserData(userData);

    console.log('StartScreen: Выдано ' + newCards.length + ' карт из зависшей покупки блистера "' + blister.blister_name + '"');

    showReceivedCardsOnStart(newCards, blister.blister_name);
}

/**
 * Проверяет и обрабатывает незавершённые инап-покупки при старте игры.
 * В VK покупки валидируются через серверный callback,
 * поэтому клиентская проверка зависших покупок не требуется.
 */
async function checkPendingPurchasesAtStartup() {
    // В VK нет клиентского API getPurchases/consumePurchase.
    // Зависшие покупки обрабатываются серверным callback (vktrade.fly.dev).
    console.log('StartScreen: Проверка зависших покупок не требуется (VK callback).');
}

/**
 * Инициализирует стартовый экран.
 */
async function initStartScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    const loadingError = document.getElementById('loadingError');
    const loadingText = document.getElementById('loadingText');

    // Блокируем взаимодействие до полной загрузки
    const blocker = document.createElement('div');
    blocker.id = 'initial-interaction-blocker';
    blocker.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 10000; background: transparent; cursor: wait;';
    document.body.appendChild(blocker);

    const deckBanner = document.getElementById('deckBanner');
    const guideButton = document.getElementById('guideButton');
    const guideModal = document.getElementById('guideModal');
    const guideModalClose = document.getElementById('guideModalClose');
    const modeTabs = document.getElementById('modeTabs');

    if (!deckBanner || !guideButton || !guideModal || !guideModalClose) {
        return;
    }

    const openGuideModal = () => {
        guideModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    };

    const closeGuideModal = () => {
        guideModal.classList.add('hidden');
        document.body.style.overflow = '';
    };

    guideButton.addEventListener('click', openGuideModal);
    guideModalClose.addEventListener('click', closeGuideModal);
    guideModal.addEventListener('click', event => {
        if (event.target === guideModal) {
            closeGuideModal();
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !guideModal.classList.contains('hidden')) {
            closeGuideModal();
        }
    });

    if (modeTabs) {
        modeTabs.addEventListener('click', (event) => {
            const tab = event.target.closest('.mode-tab');
            if (tab && !tab.disabled) {
                currentMode = tab.dataset.mode;
                renderOpponents();
            }
        });
    }

    try {
        console.log('StartScreen: Start initializing...');

        // Ждём завершения инициализации контроллера хранилища
        if (window.userCards?.whenReady) {
            await window.userCards.whenReady();
        }

        // Проверяем и обрабатываем незавершённые инап-покупки
        await checkPendingPurchasesAtStartup();

        let [cardCount, maxCoolness] = await Promise.all([
            window.userCards?.getUserCardCount?.() ?? Promise.resolve(0),
            window.userCards?.getMaxOpponentCoolness?.() ?? Promise.resolve({ standard: 0, hard: 0, hardcore: 0 })
        ]);

        userCardCount = cardCount;
        modeProgress = typeof maxCoolness === 'object' ? maxCoolness : { standard: Number(maxCoolness), hard: 0, hardcore: 0 };

        // Если карт 0, генерируем стартовую колоду
        if (userCardCount === 0 && window.cardRenderer) {
            await window.cardRenderer.init();
            const rules = window.cardRenderer.getStarterDeckRules();
            if (rules) {
                const deck = window.cardRenderer.generateDeck(rules);
                if (window.userCards.saveUserDeck) {
                    await window.userCards.saveUserDeck(deck);
                    userCardCount = deck.length;
                }
            }
        }

        opponentsList = await loadOpponentsFromDb();

        // Клик по баннеру «МОЯ КОЛОДА» — переход на экран колоды
        deckBanner.addEventListener('click', () => {
            window.location.href = 'deck.html';
        });

        const hasLowCardCount = userCardCount < MIN_DECK_PULSE_THRESHOLD;
        if (hasLowCardCount) {
            deckBanner.classList.add('deck-banner--pulse');
        } else {
            deckBanner.classList.remove('deck-banner--pulse');
        }

        // Автоматически выбираем максимально доступный режим при загрузке
        if (modeProgress.hard >= opponentsList.length && opponentsList.length > 0) {
            currentMode = 'hardcore';
        } else if (modeProgress.standard >= opponentsList.length && opponentsList.length > 0) {
            currentMode = 'hard';
        } else {
            currentMode = 'standard';
        }

        renderOpponents();

        // Автоматический переход в полноэкранный режим при первом клике
        if (window.userCards?.requestFullscreen) {
            window.addEventListener('click', () => {
                window.userCards.requestFullscreen();
            }, { once: true });
        }

        // Убираем загрузочный экран перед снятием блокировщика
        if (loadingScreen) {
            // Ждем два кадра, чтобы браузер успел отрисовать изменения в DOM
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    loadingScreen.classList.add('hidden');
                });
            });
        }

        // Убираем блокировщик
        blocker.remove();

    } catch (error) {
        if (blocker) blocker.remove();
        console.error('Ошибка загрузки стартового экрана:', error);

        if (loadingError) {
            loadingError.textContent = 'Ошибка загрузки: ' + (error?.message || 'Неизвестная ошибка');
            loadingError.classList.add('visible');
        }
        if (loadingText) {
            loadingText.style.display = 'none';
        }

        const spinner = loadingScreen?.querySelector('.loading-spinner');
        if (spinner) spinner.style.display = 'none';

        const grid = document.getElementById('opponentsGrid');
        if (grid) grid.innerHTML = '<p class="opponents-error">Не удалось загрузить список соперников.</p>';
    }
}

document.addEventListener('DOMContentLoaded', initStartScreen);
