/**
 * Hand Setup Screen Module for Technomaster
 * Экран настройки игровой руки
 */

const HAND_SETUP_DB_PATH = 'public/data/cards.db';
const HAND_SIZE = 5;

/**
 * Глобальное состояние экрана
 */
const handSetupState = {
    opponentId: null,
    opponentData: null,
    deckRuleData: null,
    playerCards: [],
    deckCards: [],
    handCards: Array(HAND_SIZE).fill(null),
    db: null,
    draggedCard: null,
    draggedFromHand: false
};

/**
 * Получает идентификатор оппонента из URL параметров
 * @returns {number|null}
 */
function getOpponentIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const opponentId = urlParams.get('opponentId');
    return opponentId ? parseInt(opponentId, 10) : null;
}

/**
 * Проверяет, запущен ли экран для подготовки партии.
 * @returns {boolean}
 */
function isPartyFlow() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('party') === '1';
}

/**
 * Инициализирует SQLite базу данных
 * @returns {Promise<Database>}
 */
async function initDatabase() {
    if (handSetupState.db) {
        return handSetupState.db;
    }

    const SQL = await SqlLoader.init();

    const response = await fetch(HAND_SETUP_DB_PATH);
    const buffer = await response.arrayBuffer();
    handSetupState.db = new SQL.Database(new Uint8Array(buffer));

    return handSetupState.db;
}

/**
 * Получает данные об оппоненте из базы данных
 * @param {number} opponentId
 * @returns {Promise<Object|null>}
 */
async function getOpponentData(opponentId) {
    const db = await initDatabase();

    const result = db.exec(`SELECT id, name, sequence FROM opponents WHERE id = ${opponentId}`);

    if (!result.length || !result[0].values.length) {
        return null;
    }

    const row = result[0].values[0];
    return {
        id: row[0],
        name: row[1],
        sequence: row[2]
    };
}

/**
 * Получает данные о правилах колоды для оппонента
 * @param {number} opponentId
 * @returns {Promise<Object|null>}
 */
async function getDeckRuleData(opponentId) {
    const db = await initDatabase();

    // Находим все записи с данным opponent_id и берем с максимальным id
    const result = db.exec(
        `SELECT id, opponent_id, description FROM deck_rules
         WHERE opponent_id = ${opponentId}
         ORDER BY id DESC
         LIMIT 1`
    );

    if (!result.length || !result[0].values.length) {
        return null;
    }

    const row = result[0].values[0];
    return {
        id: row[0],
        opponent_id: row[1],
        description: row[2]
    };
}

/**
 * Загружает карты игрока из хранилища данных
 * @returns {Promise<Array>}
 */
async function loadPlayerCards() {
    const userData = await window.userCards.getUserData();

    if (!userData || !Array.isArray(userData.cards)) {
        return [];
    }

    // Находим все карты игрока (cardholder_id = 1)
    return userData.cards.filter(card => card.cardholder_id === 1);
}

/**
 * Обновляет отображение блока "Данные об оппоненте"
 */
function updateOpponentInfoDisplay() {
    const nameEl = document.getElementById('opponentName');
    const powerEl = document.getElementById('opponentPower');
    const deckDescEl = document.getElementById('opponentDeckDesc');

    if (handSetupState.opponentData) {
        nameEl.textContent = handSetupState.opponentData.name;
        powerEl.textContent = `Уровень ${handSetupState.opponentData.sequence}`;
    } else {
        nameEl.textContent = 'Не найден';
        powerEl.textContent = '-';
    }

    if (handSetupState.deckRuleData) {
        deckDescEl.textContent = handSetupState.deckRuleData.description;
    } else {
        deckDescEl.textContent = 'Нет данных';
    }
}

/**
 * Создает DOM-элемент карты для отображения
 * @param {Object} card - Данные карты
 * @param {boolean} draggable - Можно ли перетаскивать
 * @returns {HTMLElement}
 */
function createCardElement(card, draggable = true) {
    const params = {
        cardTypeId: card.cardTypeId,
        arrowTopLeft: card.arrowTopLeft,
        arrowTop: card.arrowTop,
        arrowTopRight: card.arrowTopRight,
        arrowRight: card.arrowRight,
        arrowBottomRight: card.arrowBottomRight,
        arrowBottom: card.arrowBottom,
        arrowBottomLeft: card.arrowBottomLeft,
        arrowLeft: card.arrowLeft,
        ownership: card.ownership || 'player',
        cardLevel: String(card.cardLevel || 1),
        attackLevel: String(card.attackLevel || 0),
        attackType: card.attackType || 'P',
        mechanicalDefense: String(card.mechanicalDefense || 0),
        electricalDefense: String(card.electricalDefense || 0)
    };

    const cardElement = window.cardRenderer.renderCard(params);
    cardElement.dataset.cardId = card.id;

    if (draggable) {
        cardElement.draggable = true;
        cardElement.classList.add('draggable-card');

        cardElement.addEventListener('dragstart', handleDragStart);
        cardElement.addEventListener('dragend', handleDragEnd);
    }

    return cardElement;
}

/**
 * Обработчик начала перетаскивания
 * @param {DragEvent} e
 */
function handleDragStart(e) {
    const cardEl = e.target.closest('.game-card');
    if (!cardEl) return;

    handSetupState.draggedCard = cardEl;
    handSetupState.draggedFromHand = cardEl.closest('.hand-slot') !== null;

    cardEl.classList.add('dragging');
    e.dataTransfer.setData('text/plain', cardEl.dataset.cardId);
    e.dataTransfer.effectAllowed = 'move';
}

/**
 * Обработчик окончания перетаскивания
 * @param {DragEvent} e
 */
function handleDragEnd(e) {
    const cardEl = e.target.closest('.game-card');
    if (cardEl) {
        cardEl.classList.remove('dragging');
    }
    handSetupState.draggedCard = null;
    handSetupState.draggedFromHand = false;

    // Убираем подсветку со всех слотов и колоды
    document.querySelectorAll('.hand-slot').forEach(slot => {
        slot.classList.remove('drag-over');
    });
    document.getElementById('deckContainer')?.classList.remove('drag-over');
}

/**
 * Обработчик перетаскивания над зоной
 * @param {DragEvent} e
 */
function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

/**
 * Обработчик входа в зону
 * @param {DragEvent} e
 */
function handleDragEnter(e) {
    e.preventDefault();
    const target = e.currentTarget;
    target.classList.add('drag-over');
}

/**
 * Обработчик выхода из зоны
 * @param {DragEvent} e
 */
function handleDragLeave(e) {
    const target = e.currentTarget;
    // Проверяем, что мы действительно покинули элемент
    if (!target.contains(e.relatedTarget)) {
        target.classList.remove('drag-over');
    }
}

/**
 * Перемещает карту из колоды в руку
 * @param {number} cardId
 * @param {number|null} slotIndex - Индекс конкретного слота (для drag-and-drop)
 */
async function moveCardToHand(cardId, slotIndex = null) {
    // Проверяем, не находится ли карта уже в руке
    if (handSetupState.handCards.some(c => c && c.id === cardId)) return;

    // Определяем целевой индекс
    let targetIndex = slotIndex;
    if (targetIndex === null) {
        targetIndex = handSetupState.handCards.findIndex(slot => slot === null);
    }

    if (targetIndex === -1 || targetIndex === null || targetIndex >= HAND_SIZE) {
        console.warn('Нет свободных слотов');
        return;
    }

    // Если целевой слот занят, ищем первый свободный (только для клика)
    if (handSetupState.handCards[targetIndex] !== null) {
        if (slotIndex !== null) {
            console.warn('Слот уже занят');
            return;
        }
        targetIndex = handSetupState.handCards.findIndex(slot => slot === null);
        if (targetIndex === -1) return;
    }

    // Находим карту в колоде
    const cardIndex = handSetupState.deckCards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return;

    const card = handSetupState.deckCards[cardIndex];

    // Перемещаем карту из колоды в руку
    handSetupState.deckCards.splice(cardIndex, 1);
    card.inHand = true;
    handSetupState.handCards[targetIndex] = card;

    // Обновляем хранилище
    await saveCardInHandState(card.id, true);

    // Перерисовываем блоки
    renderDeckCards();
    renderHandCards();
    updateStartButtonState();
}

/**
 * Перемещает карту из руки обратно в колоду
 * @param {number} cardId
 */
async function moveCardToDeck(cardId) {
    // Находим карту в руке
    const cardIndex = handSetupState.handCards.findIndex(c => c && c.id === cardId);
    if (cardIndex === -1) return;

    const card = handSetupState.handCards[cardIndex];

    // Перемещаем карту из руки в колоду
    handSetupState.handCards[cardIndex] = null;
    card.inHand = false;
    handSetupState.deckCards.push(card);

    // Обновляем хранилище
    await saveCardInHandState(card.id, false);

    // Перерисовываем блоки
    renderDeckCards();
    renderHandCards();
    updateStartButtonState();
}

/**
 * Обработчик сброса карты в слот руки
 * @param {DragEvent} e
 */
async function handleSlotDrop(e) {
    e.preventDefault();
    const slot = e.currentTarget;
    slot.classList.remove('drag-over');

    const cardId = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!cardId) return;

    const slotIndex = parseInt(slot.dataset.slotIndex, 10);

    // Если карта уже в руке и перетаскивается в другой слот
    if (handSetupState.draggedFromHand) {
        const oldIndex = handSetupState.handCards.findIndex(c => c && c.id === cardId);
        if (oldIndex !== -1 && oldIndex !== slotIndex) {
            // Меняем местами карты в слотах
            const targetCard = handSetupState.handCards[slotIndex];
            handSetupState.handCards[slotIndex] = handSetupState.handCards[oldIndex];
            handSetupState.handCards[oldIndex] = targetCard;
            renderHandCards();
        }
        return;
    }

    await moveCardToHand(cardId, slotIndex);
}

/**
 * Обработчик сброса карты обратно в колоду
 * @param {DragEvent} e
 */
async function handleDeckDrop(e) {
    e.preventDefault();
    const container = e.currentTarget;
    container.classList.remove('drag-over');

    const cardId = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!cardId) return;

    // Если карта из колоды - ничего не делаем
    if (!handSetupState.draggedFromHand) {
        return;
    }

    await moveCardToDeck(cardId);
}

/**
 * Сохраняет состояние inHand для карты в хранилище
 * @param {number} cardId
 * @param {boolean} inHand
 */
async function saveCardInHandState(cardId, inHand) {
    const userData = await window.userCards.getUserData();

    if (!userData || !Array.isArray(userData.cards)) {
        return;
    }

    const card = userData.cards.find(c => c.id === cardId);
    if (card) {
        card.inHand = inHand;
        await window.userCards.saveUserData(userData);
        console.log(`Карта ${cardId}: inHand = ${inHand}`);
    }
}

/**
 * Отрисовывает карты в блоке "Колода"
 */
function renderDeckCards() {
    const container = document.getElementById('deckContainer');
    if (!container) return;

    container.innerHTML = '';

    if (handSetupState.deckCards.length === 0) {
        container.innerHTML = '<div class="empty-message">Колода пуста</div>';
        return;
    }

    handSetupState.deckCards.forEach(card => {
        const cardElement = createCardElement(card, true);
        container.appendChild(cardElement);
    });
}

/**
 * Отрисовывает карты в блоке "Рука"
 */
function renderHandCards() {
    const slotsContainer = document.getElementById('handSlots');
    if (!slotsContainer) return;

    const slots = slotsContainer.querySelectorAll('.hand-slot');

    slots.forEach((slot, index) => {
        const card = handSetupState.handCards[index];
        slot.innerHTML = '';

        if (card) {
            slot.classList.remove('empty');
            const cardElement = createCardElement(card, true);
            slot.appendChild(cardElement);
        } else {
            slot.classList.add('empty');
            const placeholder = document.createElement('span');
            placeholder.className = 'slot-placeholder';
            placeholder.textContent = `Слот ${index + 1}`;
            slot.appendChild(placeholder);
        }
    });

    // Обновляем счетчик
    updateHandCounter();
}

/**
 * Обновляет счетчик карт в руке
 */
function updateHandCounter() {
    const handCount = handSetupState.handCards.filter(c => c !== null).length;
    const counter = document.getElementById('handCounter');
    if (counter) {
        counter.textContent = `(${handCount}/${HAND_SIZE})`;
    }
}

/**
 * Обновляет состояние кнопки "Начать игру"
 */
function updateStartButtonState() {
    const handCount = handSetupState.handCards.filter(c => c !== null).length;
    const startBtn = document.getElementById('startGameBtn');
    if (startBtn) {
        startBtn.disabled = handCount !== HAND_SIZE;
    }
}

/**
 * Обработчик клика на "Собрать руку автоматически"
 */
async function handleAutoCollect() {
    console.log('AutoCollect: Запуск автоматического сбора руки...');

    // Получаем все карты игрока (объединяем колоду и руку)
    const currentHandCards = handSetupState.handCards.filter(c => c !== null);
    const allCards = [...handSetupState.deckCards, ...currentHandCards];

    if (allCards.length < HAND_SIZE) {
        console.warn(`AutoCollect: Недостаточно карт (${allCards.length} < ${HAND_SIZE})`);
        alert(`Недостаточно карт для сбора руки. Нужно минимум ${HAND_SIZE} карт.`);
        return;
    }

    // Запускаем autoHandCollector
    const result = window.autoHandCollector.collectHand(allCards);
    console.log('AutoCollect: Результат:', result);

    // Получаем id выбранных карт
    const selectedIds = new Set(result.map(r => r.id));

    // Обновляем состояние
    handSetupState.handCards = Array(HAND_SIZE).fill(null);
    const newDeckCards = [];

    allCards.forEach(card => {
        if (selectedIds.has(card.id)) {
            card.inHand = true;
            const firstNull = handSetupState.handCards.indexOf(null);
            if (firstNull !== -1) handSetupState.handCards[firstNull] = card;
        } else {
            card.inHand = false;
            newDeckCards.push(card);
        }
    });

    handSetupState.deckCards = newDeckCards;

    // Сохраняем в хранилище
    const userData = await window.userCards.getUserData();
    if (userData && Array.isArray(userData.cards)) {
        userData.cards.forEach(card => {
            if (card.cardholder_id === 1) {
                card.inHand = selectedIds.has(card.id);
            }
        });
        await window.userCards.saveUserData(userData);
        console.log('AutoCollect: Данные сохранены в хранилище');
    }

    // Перерисовываем блоки
    renderDeckCards();
    renderHandCards();
    updateStartButtonState();
}

/**
 * Обработчик клика на "Начать игру"
 * @returns {Array<number>} - Список идентификаторов карт из руки
 */
function handleStartGame() {
    const validHandCards = handSetupState.handCards.filter(c => c !== null);
    if (validHandCards.length !== HAND_SIZE) {
        console.warn('Нельзя начать игру: рука не заполнена');
        return [];
    }

    const handCardIds = validHandCards.map(card => card.id);
    console.log('Начало игры с картами:', handCardIds);

    if (isPartyFlow() && window.partyOrchestrator?.finish) {
        window.partyOrchestrator.finish(handSetupState.opponentId).catch(error => {
            console.error('PartyOrchestrator: ошибка завершения подготовки партии', error);
            alert(error?.message || 'Не удалось запустить партию.');
        });
        return handCardIds;
    }

    return handCardIds;
}

/**
 * Настраивает обработчики событий для drag-and-drop
 */
function setupDragAndDrop() {
    // Настраиваем слоты руки
    const slots = document.querySelectorAll('.hand-slot');
    slots.forEach((slot, index) => {
        slot.dataset.slotIndex = index;
        slot.addEventListener('dragover', handleDragOver);
        slot.addEventListener('dragenter', handleDragEnter);
        slot.addEventListener('dragleave', handleDragLeave);
        slot.addEventListener('drop', handleSlotDrop);
    });

    // Настраиваем контейнер колоды
    const deckContainer = document.getElementById('deckContainer');
    if (deckContainer) {
        deckContainer.addEventListener('dragover', handleDragOver);
        deckContainer.addEventListener('dragenter', handleDragEnter);
        deckContainer.addEventListener('dragleave', handleDragLeave);
        deckContainer.addEventListener('drop', handleDeckDrop);
    }
}

/**
 * Настраивает механику клика для карт (быстрый перенос)
 */
function setupClickMechanics() {
    const deckContainer = document.getElementById('deckContainer');
    if (deckContainer) {
        deckContainer.addEventListener('click', async (e) => {
            const cardEl = e.target.closest('.game-card');
            if (cardEl && !cardEl.classList.contains('dragging')) {
                const cardId = parseInt(cardEl.dataset.cardId, 10);
                await moveCardToHand(cardId);
            }
        });
    }

    const handSlots = document.getElementById('handSlots');
    if (handSlots) {
        handSlots.addEventListener('click', async (e) => {
            const cardEl = e.target.closest('.game-card');
            if (cardEl && !cardEl.classList.contains('dragging')) {
                const cardId = parseInt(cardEl.dataset.cardId, 10);
                await moveCardToDeck(cardId);
            }
        });
    }
}

/**
 * Настраивает обработчики кнопок
 */
function setupButtonHandlers() {
    const backBtn = document.getElementById('backToStartBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            // Остановка GameplayAPI при возврате
            if (window.userCards?.stopGameplay) {
                window.userCards.stopGameplay();
            }
            window.location.href = 'index.html';
        });
    }

    const autoCollectBtn = document.getElementById('autoCollectBtn');
    if (autoCollectBtn) {
        autoCollectBtn.addEventListener('click', handleAutoCollect);
    }

    const startGameBtn = document.getElementById('startGameBtn');
    if (startGameBtn) {
        startGameBtn.addEventListener('click', () => {
            const cardIds = handleStartGame();
            if (cardIds.length === HAND_SIZE) {
                if (!isPartyFlow()) {
                    alert(`Игра начинается с картами: ${cardIds.join(', ')}`);
                }
            }
        });
    }

    // Кнопка полноэкранного режима
    const fullscreenBtn = document.getElementById('fullscreenToggleBtn');
    if (fullscreenBtn) {
        let isFullscreen = false;

        const updateFullscreenIcon = (fs) => {
            isFullscreen = fs;
            fullscreenBtn.title = isFullscreen ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим';
            fullscreenBtn.setAttribute('aria-label', fullscreenBtn.title);
        };

        fullscreenBtn.addEventListener('click', () => {
            if (isFullscreen) {
                window.userCards.exitFullscreen();
                updateFullscreenIcon(false);
            } else {
                window.userCards.requestFullscreen();
                updateFullscreenIcon(true);
            }
        });

        document.addEventListener('fullscreenchange', () => {
            updateFullscreenIcon(!!document.fullscreenElement);
        });
        document.addEventListener('webkitfullscreenchange', () => {
            updateFullscreenIcon(!!document.webkitFullscreenElement);
        });
    }
}

/**
 * Главная функция инициализации экрана
 */
async function initHandSetupScreen() {
    console.log('HandSetup: Инициализация экрана настройки руки...');

    const loadingScreen = document.getElementById('loadingScreen');
    const loadingError = document.getElementById('loadingError');
    const loadingText = document.getElementById('loadingText');

    handSetupState.opponentId = getOpponentIdFromUrl();

    if (!handSetupState.opponentId) {
        console.error('HandSetup: Не указан идентификатор оппонента');
        const errorMsg = 'Ошибка: не указан оппонент';
        if (document.getElementById('opponentName')) {
            document.getElementById('opponentName').textContent = errorMsg;
        }

        if (loadingError) {
            loadingError.textContent = errorMsg;
            loadingError.classList.add('visible');
        }
        if (loadingText) loadingText.style.display = 'none';

        const spinner = loadingScreen?.querySelector('.loading-spinner');
        if (spinner) spinner.style.display = 'none';

        return;
    }

    try {
        if (window.userCards?.whenReady) {
            await window.userCards.whenReady();
        }

        await window.cardRenderer.init();

        const [opponentData, deckRuleData, playerCards] = await Promise.all([
            getOpponentData(handSetupState.opponentId),
            getDeckRuleData(handSetupState.opponentId),
            loadPlayerCards()
        ]);

        handSetupState.opponentData = opponentData;
        handSetupState.deckRuleData = deckRuleData;
        handSetupState.playerCards = playerCards;

        // Разделяем карты на руку и колоду
        handSetupState.deckCards = playerCards.filter(c => !c.inHand);
        const inHandCards = playerCards.filter(c => c.inHand);

        handSetupState.handCards = Array(HAND_SIZE).fill(null);
        inHandCards.forEach((card, i) => {
            if (i < HAND_SIZE) {
                handSetupState.handCards[i] = card;
            } else {
                card.inHand = false;
                handSetupState.deckCards.push(card);
            }
        });

        updateOpponentInfoDisplay();
        renderDeckCards();
        renderHandCards();
        updateStartButtonState();

        setupDragAndDrop();
        setupClickMechanics();
        setupButtonHandlers();

        // Запускаем GameplayAPI сессию
        if (window.userCards?.startGameplay) {
            window.userCards.startGameplay();
        }

        console.log('HandSetup: Инициализация завершена');

        if (loadingScreen) {
            // Ждем два кадра, чтобы браузер успел отрисовать изменения в DOM
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    loadingScreen.classList.add('hidden');
                });
            });
        }

    } catch (error) {
        console.error('HandSetup: Ошибка инициализации:', error);

        if (loadingError) {
            loadingError.textContent = 'Ошибка загрузки: ' + (error?.message || 'Неизвестная ошибка');
            loadingError.classList.add('visible');
        }
        if (loadingText) loadingText.style.display = 'none';

        const spinner = loadingScreen?.querySelector('.loading-spinner');
        if (spinner) spinner.style.display = 'none';

        document.getElementById('opponentName').textContent = 'Ошибка загрузки';
        document.getElementById('deckContainer').innerHTML =
            `<div class="error">Ошибка загрузки: ${error.message}</div>`;
    }
}

// Экспортируем функции в глобальную область
window.handSetup = {
    init: initHandSetupScreen,
    getHandCardIds: () => handSetupState.handCards.filter(c => c !== null).map(c => c.id),
    getState: () => ({ ...handSetupState }),
    autoCollect: handleAutoCollect,
    startGame: handleStartGame
};

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', initHandSetupScreen);
