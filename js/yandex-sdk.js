/**
 * VK Bridge integration helpers.
 * Контроллер хранилища пользовательских данных.
 * Замена Yandex Games SDK на VK Bridge.
 */

const USER_DATA_STORAGE_KEY = 'technomaster.userData';
const VK_STORAGE_KEY = 'gameState';

/**
 * Глобальная переменная типа хранилища данных.
 * Значения: "vkStorage" | "localStorage"
 * @type {string}
 */
let userDataStorage = 'localStorage';

/**
 * Кэшированные данные пользователя для быстрого доступа.
 * @type {object|null}
 */
let cachedUserData = null;

/**
 * Кэшированный результат проверки среды VK.
 * @type {boolean|null}
 */
let isVKEnvironment = null;

/**
 * Флаг: запущено ли приложение в Одноклассниках.
 * @type {boolean}
 */
let isOdnoklassnikiPlatform = false;

/**
 * Promise инициализации контроллера.
 * @type {Promise<object>|null}
 */
let initPromiseInstance = null;

/**
 * Флаг завершения инициализации.
 * @type {boolean}
 */
let isInitialized = false;

/**
 * Проверяет, запущено ли приложение в Одноклассниках (по URL-параметру vk_client или sessionStorage).
 * @returns {boolean}
 */
function checkIsOdnoklassniki() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('vk_client') === 'ok') {
            return true;
        }
        // Fallback: проверяем sessionStorage (при навигации между страницами)
        return sessionStorage.getItem(VK_SESSION_OK_FLAG) === '1';
    } catch (e) {
        return false;
    }
}

const VK_SESSION_FLAG = 'technomaster.vk.active';
const VK_SESSION_OK_FLAG = 'technomaster.vk.isOK';

/**
 * Проверяет наличие признаков VK среды.
 * Проверяет URL-параметры, а также sessionStorage (для навигации между страницами).
 * @returns {boolean}
 */
function hasVKIndicators() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const hasUrlParams = urlParams.has('vk_user_id') || urlParams.has('vk_app_id') ||
               urlParams.has('sign') || urlParams.has('vk_client');

        if (hasUrlParams) {
            // Сохраняем флаг VK-среды и платформу в sessionStorage для последующих страниц
            sessionStorage.setItem(VK_SESSION_FLAG, '1');
            if (urlParams.get('vk_client') === 'ok') {
                sessionStorage.setItem(VK_SESSION_OK_FLAG, '1');
            }
            return true;
        }

        // При навигации между страницами URL-параметры теряются — проверяем sessionStorage
        if (sessionStorage.getItem(VK_SESSION_FLAG) === '1') {
            return true;
        }

        return false;
    } catch (e) {
        return false;
    }
}

/**
 * Проверяет, запущена ли игра в среде VK.
 * Инициализирует VK Bridge если доступен.
 * @returns {Promise<boolean>}
 */
async function checkVKEnvironment() {
    if (isVKEnvironment !== null) {
        return isVKEnvironment;
    }

    // Проверяем глобальную переменную окружения
    if (typeof window !== 'undefined' && window.userDataStorage === 'localStorage') {
        console.log('VK Bridge: Найдена переменная окружения userDataStorage = "localStorage".');
        isVKEnvironment = false;
        return false;
    }

    // Проверяем наличие VK Bridge
    if (typeof window === 'undefined' || typeof vkBridge === 'undefined') {
        console.log('VK Bridge: SDK не найден на странице.');
        isVKEnvironment = false;
        return false;
    }

    // Проверяем URL-параметры VK
    if (!hasVKIndicators()) {
        console.log('VK Bridge: URL-параметры VK не обнаружены.');
        isVKEnvironment = false;
        return false;
    }

    try {
        console.log('VK Bridge: Попытка инициализации...');

        const initPromise = vkBridge.send('VKWebAppInit');
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('VK Bridge init timeout')), 5000);
        });

        const data = await Promise.race([initPromise, timeoutPromise]);

        // VKWebAppInit считается успешным если промис разрешился без исключения.
        // В некоторых окружениях VK Bridge возвращает {} или {result: undefined},
        // поэтому не проверяем data.result — само разрешение промиса достаточно.
        console.log('VK Bridge: Успешно инициализирован. Ответ:', JSON.stringify(data));
        isVKEnvironment = true;
        isOdnoklassnikiPlatform = checkIsOdnoklassniki();
        console.log('VK Bridge: Платформа:', isOdnoklassnikiPlatform ? 'Одноклассники' : 'ВКонтакте');

        // Подписываемся на обновления конфигурации экрана
        vkBridge.subscribe((e) => {
            if (e.detail.type === 'VKWebAppUpdateConfig') {
                const configData = e.detail.data;
                console.log('VK Bridge: Новая конфигурация экрана:', configData);
            }
        });

        return true;

    } catch (error) {
        const errorMessage = error?.message || String(error);
        console.log(`VK Bridge: Ошибка инициализации: "${errorMessage}"`);
        isVKEnvironment = false;
        return false;
    }
}

/**
 * Синхронная проверка (использует кэшированный результат).
 * ВАЖНО: Вызывать только после checkVKEnvironment()!
 * @returns {boolean}
 */
function isRunningInVK() {
    if (isVKEnvironment !== null) {
        return isVKEnvironment;
    }
    console.warn('isRunningInVK: вызван до асинхронной проверки, возвращаю false.');
    return false;
}

/**
 * Возвращает true, если приложение запущено в Одноклассниках.
 * @returns {boolean}
 */
function isRunningInOK() {
    return isOdnoklassnikiPlatform;
}

// ========================================
// Обратная совместимость: алиасы для Yandex API
// ========================================

/**
 * @deprecated Используйте isRunningInVK()
 */
function isRunningInYandexGames() {
    return isRunningInVK();
}

/**
 * @deprecated VK Bridge не требует кэширования SDK-объекта.
 * Возвращает объект-заглушку для обратной совместимости или null.
 * @returns {null}
 */
function getCachedYsdk() {
    return null;
}

/**
 * Создаёт пустую структуру данных пользователя по схеме.
 * @returns {object}
 */
function createEmptyUserDataStructure() {
    return {
        cardholders: [],
        cards: [],
        parties: []
    };
}

/**
 * Создаёт начальную структуру данных пользователя с первым cardholder.
 * @returns {object}
 */
function createInitialUserDataStructure() {
    const data = createEmptyUserDataStructure();
    data.cardholders.push({
        id: 1,
        player: true,
        opponent_id: null
    });
    return data;
}

/**
 * Валидирует структуру данных пользователя.
 * @param {unknown} data
 * @returns {boolean}
 */
function isValidUserDataStructure(data) {
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.cardholders)) return false;
    if (!Array.isArray(data.cards)) return false;
    if (!Array.isArray(data.parties)) return false;
    return true;
}

// ========================================
// localStorage
// ========================================

/**
 * Получает данные пользователя из localStorage.
 * @returns {object|null}
 */
function getUserDataFromLocalStorage() {
    try {
        const storedData = localStorage.getItem(USER_DATA_STORAGE_KEY);
        if (!storedData) return null;

        const parsed = JSON.parse(storedData);
        if (isValidUserDataStructure(parsed)) return parsed;

        console.warn('Browser: структура данных в localStorage некорректна.');
        return null;
    } catch (e) {
        console.error('Browser: ошибка чтения данных из localStorage.', e);
        return null;
    }
}

/**
 * Сохраняет данные пользователя в localStorage.
 * @param {object} data
 * @returns {boolean}
 */
function saveUserDataToLocalStorage(data) {
    try {
        localStorage.setItem(USER_DATA_STORAGE_KEY, JSON.stringify(data));
        return true;
    } catch (e) {
        console.error('Browser: ошибка сохранения данных в localStorage.', e);
        return false;
    }
}

// ========================================
// VK Storage
// ========================================

/**
 * Получает данные пользователя из VK Storage.
 * @returns {Promise<object|null>}
 */
async function getUserDataFromVKStorage() {
    if (!isRunningInVK()) {
        console.warn('VK Storage: не в среде VK.');
        return null;
    }

    try {
        const data = await vkBridge.send('VKWebAppStorageGet', {
            keys: [VK_STORAGE_KEY]
        });

        if (data.keys) {
            const stateStr = data.keys.find(k => k.key === VK_STORAGE_KEY)?.value;
            if (stateStr) {
                const parsed = JSON.parse(stateStr);
                if (isValidUserDataStructure(parsed)) {
                    return parsed;
                }
            }
        }
        return null;
    } catch (e) {
        console.error('VK Storage: ошибка получения данных.', e);
        return null;
    }
}

/**
 * Сохраняет данные пользователя в VK Storage.
 * @param {object} data
 * @returns {Promise<boolean>}
 */
async function saveUserDataToVKStorage(data) {
    if (!isRunningInVK()) {
        console.warn('VK Storage: не в среде VK для сохранения.');
        return false;
    }

    let progressString;
    try {
        progressString = JSON.stringify(data);
    } catch (serializationError) {
        console.error('VK Storage: ошибка сериализации данных.', serializationError);
        return false;
    }

    // Проверяем лимит VK Storage (4096 байт на ключ)
    const sizeBytes = new TextEncoder().encode(progressString).length;
    if (sizeBytes > 4096) {
        console.warn(`VK Storage: размер данных (${sizeBytes} байт) превышает лимит 4096 байт. Сохраняем только в localStorage.`);
        return false;
    }

    try {
        const result = await vkBridge.send('VKWebAppStorageSet', {
            key: VK_STORAGE_KEY,
            value: progressString
        });

        if (result.result) {
            console.log('VK Storage: данные успешно сохранены.', { sizeBytes });
            return true;
        }
        return false;
    } catch (e) {
        console.error('VK Storage: ошибка сохранения данных.', e);
        return false;
    }
}

// ========================================
// Общий контроллер хранилища
// ========================================

/**
 * Внутренняя функция получения данных из хранилища.
 * @returns {Promise<object|null>}
 */
async function fetchUserDataInternal() {
    if (userDataStorage === 'vkStorage') {
        return await getUserDataFromVKStorage();
    }
    return getUserDataFromLocalStorage();
}

/**
 * Получает данные пользователя из соответствующего хранилища.
 * @returns {Promise<object|null>}
 */
async function getUserData() {
    if (isInitialized && cachedUserData) {
        return cachedUserData;
    }
    return await whenReady();
}

/**
 * Сохраняет данные пользователя в соответствующее хранилище.
 * @param {object} data
 * @returns {Promise<boolean>}
 */
async function saveUserData(data) {
    cachedUserData = data;

    // Всегда сохраняем в localStorage как резервную копию
    saveUserDataToLocalStorage(data);

    if (userDataStorage === 'vkStorage') {
        return await saveUserDataToVKStorage(data);
    }

    return true;
}

/**
 * Контроллер хранилища пользовательских данных.
 * @returns {Promise<object>}
 */
async function initUserDataStorageController() {
    console.log('=== Инициализация контроллера хранилища данных ===');

    const isVK = await checkVKEnvironment();

    if (isVK) {
        console.log('Игра запущена в VK');
        userDataStorage = 'vkStorage';
    } else {
        console.log('Игра запущена не в VK');
        userDataStorage = 'localStorage';
    }

    console.log(`Тип хранилища: ${userDataStorage}`);

    let userData = await fetchUserDataInternal();

    if (!userData || !isValidUserDataStructure(userData)) {
        console.log('Структура данных не найдена в хранилище. Создаю новую структуру...');
        userData = createInitialUserDataStructure();

        const saved = await saveUserData(userData);
        if (saved) {
            console.log('Структура данных успешно создана и сохранена.');
        } else {
            console.warn('Не удалось сохранить структуру данных.');
        }

        console.log('Созданная структура данных:');
        console.log(JSON.stringify(userData, null, 2));
    } else {
        console.log('Структура данных найдена в хранилище:');
        console.log(JSON.stringify(userData, null, 2));
    }

    cachedUserData = userData;
    isInitialized = true;

    console.log('=== Инициализация контроллера завершена ===');

    return userData;
}

/**
 * Возвращает Promise, который резолвится когда контроллер полностью инициализирован.
 * @returns {Promise<object>}
 */
function whenReady() {
    if (isInitialized && cachedUserData) {
        return Promise.resolve(cachedUserData);
    }

    if (initPromiseInstance) {
        return initPromiseInstance;
    }

    initPromiseInstance = initUserDataStorageController();
    return initPromiseInstance;
}

/**
 * Проверяет, завершена ли инициализация контроллера.
 * @returns {boolean}
 */
function isReady() {
    return isInitialized;
}

/**
 * Возвращает текущий тип хранилища данных.
 * @returns {string}
 */
function getStorageType() {
    return userDataStorage;
}

// ========================================
// Функции для работы с картами
// ========================================

/**
 * Получает количество карт у пользователя из структуры данных.
 * @returns {Promise<number>}
 */
async function getUserCardCount() {
    const userData = await getUserData();

    if (!userData || !isValidUserDataStructure(userData)) {
        console.log('getUserCardCount: структура данных не найдена, возвращаю 0.');
        return 0;
    }

    const playerCardholder = userData.cardholders.find(ch => ch.player === true);

    if (!playerCardholder) {
        console.log('getUserCardCount: cardholder игрока не найден, возвращаю 0.');
        return 0;
    }

    const playerCards = userData.cards.filter(card => card.cardholder_id === playerCardholder.id);
    const count = playerCards.length;

    console.log(`getUserCardCount: найдено карт у игрока: ${count}`);
    return count;
}

/**
 * Получает максимальный уровень крутости побеждённого оппонента для каждого режима.
 * @returns {Promise<{standard: number, hard: number, hardcore: number}>}
 */
async function getMaxOpponentCoolness() {
    const userData = await getUserData();
    const result = { standard: 0, hard: 0, hardcore: 0 };

    if (!userData || !isValidUserDataStructure(userData)) {
        console.log('getMaxOpponentCoolness: структура данных не найдена.');
        return result;
    }

    const wonParties = userData.parties.filter(party => party.win === true);

    if (wonParties.length === 0) {
        console.log('getMaxOpponentCoolness: выигранных партий не найдено.');
        return result;
    }

    for (const party of wonParties) {
        const mode = party.gameMode || 'standard';
        const power = typeof party.opponent_power === 'number' ? party.opponent_power : 0;

        if (result[mode] !== undefined) {
            if (power > result[mode]) {
                result[mode] = power;
            }
        } else {
            if (power > result.standard) {
                result.standard = power;
            }
        }
    }

    console.log('getMaxOpponentCoolness:', result);
    return result;
}

// ========================================
// Функции для работы с колодой карт
// ========================================

/**
 * Сохраняет колоду карт пользователя.
 * @param {Array} cards
 * @returns {Promise<boolean>}
 */
async function saveUserDeck(cards) {
    if (!Array.isArray(cards)) {
        console.error('saveUserDeck: cards должен быть массивом');
        return false;
    }

    let userData = await getUserData();

    if (!userData || !isValidUserDataStructure(userData)) {
        userData = createInitialUserDataStructure();
    }

    let playerCardholder = userData.cardholders.find(ch => ch.player === true);

    if (!playerCardholder) {
        playerCardholder = {
            id: 1,
            player: true,
            opponent_id: null
        };
        userData.cardholders.push(playerCardholder);
    }

    userData.cards = userData.cards.filter(card => card.cardholder_id !== playerCardholder.id);

    let maxCardId = userData.cards.reduce((max, card) => Math.max(max, card.id || 0), 0);

    const newCards = cards.map((card, index) => {
        maxCardId++;
        return {
            id: maxCardId,
            cardholder_id: playerCardholder.id,
            cardTypeId: card.cardTypeId || card.renderParams?.cardTypeId || index + 1,
            arrowTopLeft: card.arrowTopLeft || card.renderParams?.arrowTopLeft || false,
            arrowTop: card.arrowTop || card.renderParams?.arrowTop || false,
            arrowTopRight: card.arrowTopRight || card.renderParams?.arrowTopRight || false,
            arrowRight: card.arrowRight || card.renderParams?.arrowRight || false,
            arrowBottomRight: card.arrowBottomRight || card.renderParams?.arrowBottomRight || false,
            arrowBottom: card.arrowBottom || card.renderParams?.arrowBottom || false,
            arrowBottomLeft: card.arrowBottomLeft || card.renderParams?.arrowBottomLeft || false,
            arrowLeft: card.arrowLeft || card.renderParams?.arrowLeft || false,
            ownership: 'player',
            cardLevel: card.cardLevel || card.renderParams?.cardLevel || 1,
            attackLevel: card.attackLevel || card.renderParams?.attackLevel || 0,
            attackType: card.attackType || card.renderParams?.attackType || '',
            mechanicalDefense: card.mechanicalDefense || card.renderParams?.mechanicalDefense || 0,
            electricalDefense: card.electricalDefense || card.renderParams?.electricalDefense || 0,
            inHand: card.inHand !== undefined ? card.inHand : false
        };
    });

    userData.cards = userData.cards.concat(newCards);

    const saved = await saveUserData(userData);

    if (saved) {
        console.log(`saveUserDeck: сохранено карт: ${newCards.length}`);
    }

    return saved;
}

/**
 * Записывает результат партии.
 * @param {number} opponentId
 * @param {boolean} win
 * @param {number} opponentPower
 * @param {string} gameMode
 * @returns {Promise<boolean>}
 */
async function recordPartyResult(opponentId, win, opponentPower, gameMode = 'standard') {
    let userData = await getUserData();

    if (!userData || !isValidUserDataStructure(userData)) {
        userData = createInitialUserDataStructure();
    }

    const maxPartyId = userData.parties.reduce((max, party) => Math.max(max, party.id || 0), 0);

    const newParty = {
        id: maxPartyId + 1,
        opponent_id: opponentId,
        win: win,
        opponent_power: opponentPower,
        gameMode: gameMode,
        date: new Date().toISOString()
    };

    userData.parties.push(newParty);

    const saved = await saveUserData(userData);

    if (saved) {
        console.log(`recordPartyResult: записана партия #${newParty.id}, победа: ${win}, крутость оппонента: ${opponentPower}, режим: ${gameMode}`);
    }

    return saved;
}

/**
 * Добавляет карту в колоду пользователя.
 * @param {object} cardData
 * @returns {Promise<boolean>}
 */
async function addCardToUserDeck(cardData) {
    let userData = await getUserData();

    if (!userData || !isValidUserDataStructure(userData)) {
        userData = createInitialUserDataStructure();
    }

    let playerCardholder = userData.cardholders.find(ch => ch.player === true);

    if (!playerCardholder) {
        playerCardholder = {
            id: 1,
            player: true,
            opponent_id: null
        };
        userData.cardholders.push(playerCardholder);
    }

    const maxCardId = userData.cards.reduce((max, card) => Math.max(max, card.id || 0), 0);

    const newCard = {
        id: maxCardId + 1,
        cardholder_id: playerCardholder.id,
        cardTypeId: cardData.cardTypeId || cardData.renderParams?.cardTypeId || 1,
        arrowTopLeft: cardData.arrowTopLeft || cardData.renderParams?.arrowTopLeft || false,
        arrowTop: cardData.arrowTop || cardData.renderParams?.arrowTop || false,
        arrowTopRight: cardData.arrowTopRight || cardData.renderParams?.arrowTopRight || false,
        arrowRight: cardData.arrowRight || cardData.renderParams?.arrowRight || false,
        arrowBottomRight: cardData.arrowBottomRight || cardData.renderParams?.arrowBottomRight || false,
        arrowBottom: cardData.arrowBottom || cardData.renderParams?.arrowBottom || false,
        arrowBottomLeft: cardData.arrowBottomLeft || cardData.renderParams?.arrowBottomLeft || false,
        arrowLeft: cardData.arrowLeft || cardData.renderParams?.arrowLeft || false,
        ownership: 'player',
        cardLevel: cardData.cardLevel || cardData.renderParams?.cardLevel || 1,
        attackLevel: cardData.attackLevel || cardData.renderParams?.attackLevel || 0,
        attackType: cardData.attackType || cardData.renderParams?.attackType || '',
        mechanicalDefense: cardData.mechanicalDefense || cardData.renderParams?.mechanicalDefense || 0,
        electricalDefense: cardData.electricalDefense || cardData.renderParams?.electricalDefense || 0,
        inHand: false
    };

    userData.cards.push(newCard);

    const saved = await saveUserData(userData);

    if (saved) {
        console.log(`addCardToUserDeck: добавлена карта #${newCard.id}`);
    }

    return saved;
}

/**
 * Очищает кэш данных пользователя.
 */
function clearUserDataCache() {
    cachedUserData = null;
    console.log('Кэш данных пользователя очищен.');
}

// ========================================
// Функция повышения уровня карты
// ========================================

/**
 * Функция технической замены карты на уровень выше.
 * @param {number} oldCardId
 * @param {object} userData
 * @param {object} cardGenerator
 * @returns {object}
 */
function processCardLevelUp(oldCardId, userData, cardGenerator) {
    if (!userData || !Array.isArray(userData.cards)) {
        return { status: 'error', message: 'Некорректная структура userData' };
    }

    if (!cardGenerator || typeof cardGenerator.generateCardParams !== 'function') {
        return { status: 'error', message: 'cardGenerator не предоставлен или не имеет метода generateCardParams' };
    }

    const cardIndex = userData.cards.findIndex(c => c.id === oldCardId);
    if (cardIndex === -1) {
        return { status: 'error', message: 'Card not found' };
    }

    const oldCard = userData.cards[cardIndex];
    const currentLevel = parseInt(oldCard.cardLevel, 10);

    if (currentLevel >= 2) {
        return { status: 'skipped', message: 'Карта уже максимального уровня' };
    }

    const targetLevel = currentLevel + 1;

    let newStats;
    try {
        newStats = cardGenerator.generateCardParams(oldCard.cardTypeId, targetLevel);
    } catch (error) {
        return {
            status: 'error',
            message: `Ошибка генерации параметров карты: ${error.message}`
        };
    }

    const maxId = userData.cards.reduce((max, c) => (c.id > max ? c.id : max), 0);
    const newId = maxId + 1;

    const newCard = {
        id: newId,
        cardholder_id: oldCard.cardholder_id,
        cardTypeId: oldCard.cardTypeId,
        cardLevel: targetLevel,
        ownership: 'player',
        inHand: false,
        attackLevel: newStats.attackLevel,
        attackType: newStats.attackType,
        mechanicalDefense: newStats.mechanicalDefense,
        electricalDefense: newStats.electricalDefense,
        arrowTopLeft: newStats.arrowTopLeft,
        arrowTop: newStats.arrowTop,
        arrowTopRight: newStats.arrowTopRight,
        arrowRight: newStats.arrowRight,
        arrowBottomRight: newStats.arrowBottomRight,
        arrowBottom: newStats.arrowBottom,
        arrowBottomLeft: newStats.arrowBottomLeft,
        arrowLeft: newStats.arrowLeft
    };

    userData.cards.splice(cardIndex, 1);
    userData.cards.push(newCard);

    return {
        status: 'success',
        oldCardId: oldCardId,
        newCard: newCard
    };
}

/**
 * Асинхронная обёртка для processCardLevelUp с автоматическим сохранением.
 * @param {number} oldCardId
 * @param {object} cardGenerator
 * @returns {Promise<object>}
 */
async function processCardLevelUpAndSave(oldCardId, cardGenerator) {
    const userData = await getUserData();

    if (!userData) {
        return { status: 'error', message: 'Не удалось получить данные пользователя' };
    }

    const result = processCardLevelUp(oldCardId, userData, cardGenerator);

    if (result.status === 'success') {
        await saveUserData(userData);
        console.log(`processCardLevelUpAndSave: Карта #${oldCardId} повышена до уровня ${result.newCard.cardLevel}`);
    }

    return result;
}

// ========================================
// VK Bridge: Реклама
// ========================================

/**
 * Проверяет наличие рекламы через VKWebAppCheckNativeAds.
 * @param {string} ad_format - 'interstitial' | 'reward'
 * @returns {Promise<boolean>}
 */
async function checkNativeAds(ad_format) {
    if (!isRunningInVK()) {
        return true;
    }

    try {
        const data = await vkBridge.send('VKWebAppCheckNativeAds', { ad_format });
        return !!data.result;
    } catch (error) {
        console.log('VK Ads: Ошибка проверки рекламы:', error);
        return false;
    }
}

/**
 * Показывает полноэкранную рекламу (interstitial) через VK Bridge.
 * @param {object} callbacks - { onClose: function, onError: function }
 */
function showInterstitialAd(callbacks) {
    if (!isRunningInVK()) {
        if (callbacks?.onClose) callbacks.onClose(false);
        return;
    }

    vkBridge.send('VKWebAppShowNativeAds', { ad_format: 'interstitial' })
        .then((data) => {
            if (callbacks?.onClose) callbacks.onClose(data.result);
        })
        .catch((error) => {
            console.log('VK Ads: Ошибка показа interstitial:', error);
            if (callbacks?.onError) {
                callbacks.onError(error);
            } else if (callbacks?.onClose) {
                // Продолжаем игру даже при ошибке
                callbacks.onClose(false);
            }
        });
}

/**
 * Показывает рекламу за вознаграждение (rewarded) через VK Bridge.
 * @param {object} callbacks - { onRewarded: function, onClose: function, onError: function }
 */
function showRewardedAd(callbacks) {
    if (!isRunningInVK()) {
        // Не в VK — выдаём награду сразу
        if (callbacks?.onRewarded) callbacks.onRewarded();
        if (callbacks?.onClose) callbacks.onClose();
        return;
    }

    vkBridge.send('VKWebAppShowNativeAds', { ad_format: 'reward' })
        .then((data) => {
            if (data.result) {
                if (callbacks?.onRewarded) callbacks.onRewarded();
            }
            if (callbacks?.onClose) callbacks.onClose();
        })
        .catch((error) => {
            console.log('VK Ads: Ошибка показа rewarded:', error);
            if (callbacks?.onError) {
                callbacks.onError(error);
            } else if (callbacks?.onClose) {
                callbacks.onClose();
            }
        });
}

// ========================================
// VK Bridge: Покупки (IAP)
// ========================================

/**
 * Выполняет покупку товара через VKWebAppShowOrderBox.
 * @param {string} itemId - ID товара
 * @returns {Promise<{success: boolean, orderId?: string}>}
 */
async function purchaseItem(itemId) {
    if (!isRunningInVK() || isRunningInOK()) {
        throw new Error('Покупки недоступны на данной платформе');
    }

    const data = await vkBridge.send('VKWebAppShowOrderBox', {
        type: 'item',
        item: itemId
    });

    if (data.success) {
        return { success: true, orderId: data.order_id };
    }

    throw new Error('Покупка не была завершена');
}

// ========================================
// VK Bridge: Полноэкранный режим
// ========================================

/**
 * Запрашивает полноэкранный режим.
 * На мобильных — через VKWebAppSetViewSettings, на десктопе — Fullscreen API.
 */
function requestFullscreen() {
    const inVK = isRunningInVK();
    const fsElement = document.fullscreenElement || document.webkitFullscreenElement || null;
    console.log('[Fullscreen] requestFullscreen() вызван | isVK=' + inVK + ' | document.fullscreenElement=' + (fsElement ? fsElement.tagName : 'null') + ' | caller=' + (new Error().stack.split('\n')[2] || '').trim());
    if (inVK) {
        vkBridge.send('VKWebAppSetViewSettings', {
            status_bar_style: 'light',
            fullscreen: true
        })
            .then(() => console.log('[Fullscreen] VKWebAppSetViewSettings(fullscreen:true) — успешно'))
            .catch(e => {
                console.warn('[Fullscreen] VKWebAppSetViewSettings(fullscreen:true) — ошибка, fallback на Fullscreen API', e);
                requestBrowserFullscreen();
            });
    } else {
        requestBrowserFullscreen();
    }
}

/**
 * Запрашивает полноэкранный режим через стандартное Fullscreen API браузера.
 */
function requestBrowserFullscreen() {
    const elem = document.documentElement;
    console.log('[Fullscreen] requestBrowserFullscreen() | document.fullscreenElement=' + (document.fullscreenElement ? document.fullscreenElement.tagName : 'null'));
    if (elem.requestFullscreen) {
        elem.requestFullscreen()
            .then(() => console.log('[Fullscreen] requestFullscreen() — успешно'))
            .catch(e => console.warn('[Fullscreen] requestFullscreen() — ошибка:', e));
    } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
    }
}

/**
 * Выходит из полноэкранного режима.
 * На мобильных — через VKWebAppSetViewSettings, на десктопе — Fullscreen API.
 */
function exitFullscreen() {
    const inVK = isRunningInVK();
    const fsElement = document.fullscreenElement || document.webkitFullscreenElement || null;
    console.log('[Fullscreen] exitFullscreen() вызван | isVK=' + inVK + ' | document.fullscreenElement=' + (fsElement ? fsElement.tagName : 'null') + ' | caller=' + (new Error().stack.split('\n')[2] || '').trim());
    if (inVK) {
        vkBridge.send('VKWebAppSetViewSettings', {
            status_bar_style: 'dark',
            fullscreen: false
        })
            .then(() => console.log('[Fullscreen] VKWebAppSetViewSettings(fullscreen:false) — успешно'))
            .catch(e => {
                console.warn('[Fullscreen] VKWebAppSetViewSettings(fullscreen:false) — ошибка, fallback на Fullscreen API', e);
                exitBrowserFullscreen();
            });
    } else {
        exitBrowserFullscreen();
    }
}

/**
 * Выходит из полноэкранного режима через стандартное Fullscreen API браузера.
 */
function exitBrowserFullscreen() {
    console.log('[Fullscreen] exitBrowserFullscreen() | document.fullscreenElement=' + (document.fullscreenElement ? document.fullscreenElement.tagName : 'null'));
    if (document.exitFullscreen) {
        document.exitFullscreen()
            .then(() => console.log('[Fullscreen] exitFullscreen() — успешно'))
            .catch(e => console.warn('[Fullscreen] exitFullscreen() — ошибка:', e));
    } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
    }
}

// ========================================
// GameplayAPI заглушки (VK не имеет аналога)
// ========================================

const GAMEPLAY_ACTIVE_KEY = 'technomaster.gameplay.active';

/**
 * Запускает сессию геймплея (заглушка для обратной совместимости).
 */
function startGameplay() {
    const isActive = sessionStorage.getItem(GAMEPLAY_ACTIVE_KEY) === '1';
    if (!isActive) {
        console.log('Gameplay: start');
        sessionStorage.setItem(GAMEPLAY_ACTIVE_KEY, '1');
    }
}

/**
 * Останавливает сессию геймплея (заглушка для обратной совместимости).
 */
function stopGameplay() {
    console.log('Gameplay: stop');
    sessionStorage.removeItem(GAMEPLAY_ACTIVE_KEY);
}

// ========================================
// Блокировки UI
// ========================================

/**
 * Инициализирует глобальные блокировки UI (ПКМ, выделение, перетаскивание).
 */
function initGlobalUIBlocking() {
    window.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    }, false);

    window.addEventListener('selectstart', (e) => {
        e.preventDefault();
    }, false);

    window.addEventListener('dragstart', (e) => {
        if (e.target.closest('.player-hand-card') || e.target.closest('.draggable-card')) {
            return;
        }
        if (e.target.tagName === 'IMG' || e.target.closest('img')) {
            e.preventDefault();
        }
    }, false);
}

// Инициализация блокировок при загрузке
if (typeof window !== 'undefined') {
    initGlobalUIBlocking();
}

// ========================================
// Экспорт в глобальную область видимости
// ========================================

window.userCards = {
    // Основные функции
    initUserDataStorageController,
    whenReady,
    isReady,
    getUserCardCount,
    getMaxOpponentCoolness,
    saveUserDeck,

    // Дополнительные функции
    getUserData,
    saveUserData,
    recordPartyResult,
    addCardToUserDeck,
    clearUserDataCache,

    // Функции повышения уровня карты
    processCardLevelUp,
    processCardLevelUpAndSave,

    // GameplayAPI (заглушки для обратной совместимости)
    startGameplay,
    stopGameplay,

    // VK Bridge: Реклама
    showInterstitialAd,
    showRewardedAd,

    // VK Bridge: Покупки
    purchaseItem,

    // VK Bridge: Полноэкранный режим
    requestFullscreen,
    exitFullscreen,

    // Утилиты
    checkVKEnvironment,
    isRunningInVK,
    isRunningInOK,
    checkNativeAds,
    getStorageType,
    createEmptyUserDataStructure,
    createInitialUserDataStructure,

    // Обратная совместимость (deprecated)
    isRunningInYandexGames,
    getCachedYsdk,
    checkYandexGamesEnvironment: checkVKEnvironment
};

// Автоматическая инициализация при загрузке скрипта
if (typeof document !== 'undefined') {
    const startInit = () => {
        initPromiseInstance = initUserDataStorageController();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startInit);
    } else {
        startInit();
    }
}
