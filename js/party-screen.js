/**
 * Party Screen Module for Technomaster
 * Экран партии - полный игровой экран с логикой боя
 * Работает в связке с PartyGameOrchestrator
 */

const PARTY_SCREEN_DB_PATH = 'public/data/cards.db';

/**
 * Режимы экрана партии
 */
const PartyScreenMode = {
    LOADING: 'loading',
    EVENTS: 'events',           // Отображение игровых событий (взаимодействие заблокировано)
    PLAYER_TURN: 'player_turn', // Ожидание хода от игрока
    SELECT_ATTACK: 'select_attack',   // Выбор карты для атаки
    SELECT_WINNER: 'select_winner',   // Выбор карты для взятия победителем
    BATTLE: 'battle',           // Бой между картами
    OWNERSHIP_CHANGE: 'ownership_change', // Изменение владельцев карт
    GAME_END: 'game_end'        // Конец игры
};

/**
 * Типы игровых событий
 */
const GameEventType = {
    TURN_CHANGE: 'turn_change',
    BATTLE: 'battle',
    OWNERSHIP_CHANGE: 'ownership_change',
    FIELD_STATE: 'field_state',
    MESSAGE: 'message',
    OPPONENT_MOVE: 'opponent_move',
    GAME_END: 'game_end',
    PROGRESS_SAVED: 'progress_saved'
};

/**
 * Глобальное состояние экрана партии
 */
const partyScreenState = {
    // Данные партии
    opponentId: null,
    opponentData: null,
    playerHand: [],
    opponentHand: [],

    // Игровое поле
    gameField: null,
    fieldCells: [],
    unavailableCells: [],

    // Карты на поле
    fieldCards: new Map(), // cellIndex -> cardData

    // Текущий режим
    mode: PartyScreenMode.LOADING,

    // Счёт
    playerScore: 0,
    opponentScore: 0,

    // Drag & Drop
    draggedCard: null,
    draggedCardData: null,
    dragPreview: null,

    // Выбор карт
    selectedCells: [],
    selectionCallback: null,

    // База данных
    db: null,

    // Флаг готовности
    isReady: false,

    // Оркестратор управляет игрой
    orchestratorActive: false,

    // Сохранение прогресса
    progressSaved: false
};

/**
 * Получение данных партии из sessionStorage
 */
function getPartyPayload() {
    const payloadKey = window.partyOrchestrator?.keys?.payload || 'technomaster.party.payload';
    const raw = sessionStorage.getItem(payloadKey);

    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw);
    } catch (error) {
        console.error('PartyScreen: не удалось разобрать данные партии', error);
        return null;
    }
}

function clearPartyPayload() {
    const payloadKey = window.partyOrchestrator?.keys?.payload || 'technomaster.party.payload';
    const pendingKey = window.partyOrchestrator?.keys?.pending || 'technomaster.party.pending';
    sessionStorage.removeItem(payloadKey);
    sessionStorage.removeItem(pendingKey);
}

function showReturnButton() {
    const returnButton = document.getElementById('partyReturnButton');
    if (returnButton) {
        returnButton.classList.remove('hidden');
    }
}

function hideReturnButton() {
    const returnButton = document.getElementById('partyReturnButton');
    if (returnButton) {
        returnButton.classList.add('hidden');
    }
}

/**
 * Инициализирует SQLite базу данных
 */
async function initPartyDatabase() {
    if (partyScreenState.db) {
        return partyScreenState.db;
    }

    const SQL = await SqlLoader.init();

    const response = await fetch(PARTY_SCREEN_DB_PATH);
    const buffer = await response.arrayBuffer();
    partyScreenState.db = new SQL.Database(new Uint8Array(buffer));

    return partyScreenState.db;
}

/**
 * Получение данных об оппоненте из базы данных
 */
async function getOpponentDataFromDb(opponentId) {
    const db = await initPartyDatabase();

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
 * Установка режима экрана
 */
function setScreenMode(mode) {
    const frame = document.querySelector('.party-frame');
    const selectionOverlay = document.getElementById('selectionOverlay');
    const battleOverlay = document.getElementById('battleOverlay');

    // Убираем все классы режимов
    frame.classList.remove(
        'mode-locked',
        'mode-player-turn',
        'mode-select-attack',
        'mode-select-winner',
        'mode-battle',
        'mode-ownership-change',
        'mode-game-end'
    );

    partyScreenState.mode = mode;

    switch (mode) {
        case PartyScreenMode.LOADING:
        case PartyScreenMode.EVENTS:
        case PartyScreenMode.BATTLE:
        case PartyScreenMode.OWNERSHIP_CHANGE:
            frame.classList.add('mode-locked');
            selectionOverlay.classList.add('hidden');
            hideReturnButton();
            break;

        case PartyScreenMode.PLAYER_TURN:
            frame.classList.add('mode-player-turn');
            selectionOverlay.classList.add('hidden');
            battleOverlay.classList.add('hidden');
            hideReturnButton();
            enableDropTargets();
            break;

        case PartyScreenMode.SELECT_ATTACK:
            frame.classList.add('mode-select-attack');
            selectionOverlay.classList.add('hidden');
            battleOverlay.classList.add('hidden');
            hideReturnButton();
            break;

        case PartyScreenMode.SELECT_WINNER:
            frame.classList.add('mode-select-winner');
            selectionOverlay.classList.add('hidden');
            battleOverlay.classList.add('hidden');
            hideReturnButton();
            break;

        case PartyScreenMode.GAME_END:
            frame.classList.add('mode-game-end');
            selectionOverlay.classList.add('hidden');
            battleOverlay.classList.add('hidden');
            showReturnButton();
            break;
    }

    console.log(`PartyScreen: Режим изменён на ${mode}`);
}

/**
 * Отображение сообщения для игрока
 */
function showMessage(text, duration = 0) {
    const messageEl = document.getElementById('messageContent');
    messageEl.textContent = text;

    // Сброс к базовому размеру шрифта
    messageEl.style.fontSize = '';

    // Уменьшаем шрифт, пока текст не уместится в одну строку
    if (messageEl.scrollWidth > messageEl.clientWidth) {
        const baseFontSize = parseFloat(getComputedStyle(messageEl).fontSize);
        let fontSize = baseFontSize;
        const minFontSize = 8;
        while (messageEl.scrollWidth > messageEl.clientWidth && fontSize > minFontSize) {
            fontSize -= 0.5;
            messageEl.style.fontSize = `${fontSize}px`;
        }
    }

    if (duration > 0) {
        setTimeout(() => {
            messageEl.textContent = '';
            messageEl.style.fontSize = '';
        }, duration);
    }
}

/**
 * Обновление отображения информации об оппоненте
 */
function updateOpponentDisplay() {
    const avatarEl = document.getElementById('opponentAvatar');
    const nameEl = document.getElementById('opponentNameDisplay');
    const powerEl = document.getElementById('opponentPowerDisplay');

    if (partyScreenState.opponentData) {
        const opponentId = partyScreenState.opponentData.id;
        const avatarNumber = String(opponentId).padStart(2, '0');
        avatarEl.src = `public/img/opponents/opponent_${avatarNumber}.png`;
        nameEl.textContent = partyScreenState.opponentData.name;
        powerEl.textContent = `Сила: ${partyScreenState.opponentData.sequence}`;
    }
}

/**
 * Отрисовка информации о картах оппонента (количество оставшихся)
 */
function renderOpponentHand() {
    const countEl = document.getElementById('opponentCardCount');
    if (countEl) {
        const remainingCards = partyScreenState.opponentHand.filter(c => !c.used).length;
        countEl.textContent = remainingCards;
    }
}

/**
 * Отрисовка карт игрока (открытые)
 */
function renderPlayerHand() {
    const container = document.getElementById('playerHandContainer');
    container.innerHTML = '';

    partyScreenState.playerHand.forEach((card, index) => {
        const cardWrapper = document.createElement('div');
        cardWrapper.className = 'player-hand-card';
        cardWrapper.dataset.cardIndex = index;
        cardWrapper.dataset.cardId = card.id;

        if (card.used) {
            cardWrapper.classList.add('used');
        }

        // Создаём элемент карты через cardRenderer
        const cardElement = window.cardRenderer.renderCard({
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
            cardLevel: String(card.cardLevel || 1),
            attackLevel: String(card.attackLevel || 0),
            attackType: card.attackType || 'P',
            mechanicalDefense: String(card.mechanicalDefense || 0),
            electricalDefense: String(card.electricalDefense || 0)
        });

        cardWrapper.appendChild(cardElement);

        // Настраиваем drag-and-drop
        if (!card.used) {
            cardWrapper.draggable = true;
            cardWrapper.addEventListener('dragstart', handleCardDragStart);
            cardWrapper.addEventListener('dragend', handleCardDragEnd);
        }

        container.appendChild(cardWrapper);
    });

    // Масштабируем карты в руке под доступное пространство
    scalePlayerHandToFit();
}

/**
 * Масштабирование карт в руке игрока, чтобы все помещались без прокрутки.
 * Автоматически выбирает оптимальное число колонок и масштаб (max 0.85).
 */
function scalePlayerHandToFit() {
    const container = document.getElementById('playerHandContainer');
    if (!container) return;

    const cards = container.querySelectorAll('.player-hand-card');
    if (cards.length === 0) return;

    const containerHeight = container.clientHeight;
    const containerWidth = container.clientWidth;
    if (containerHeight === 0 || containerWidth === 0) return;

    const gap = 4;
    const cols = 2;
    const rows = Math.ceil(cards.length / cols);

    // Предпочтительный масштаб 0.85 (как в deck-detail-modal), но уменьшаем если не влезает
    const scaleW = (containerWidth - (cols - 1) * gap) / (200 * cols);
    const scaleH = (containerHeight - (rows - 1) * gap) / (280 * rows);
    const scale = Math.min(0.85, scaleW, scaleH);

    const cardWidth = Math.floor(200 * scale);
    const cardHeight = Math.floor(280 * scale);

    container.style.gridTemplateColumns = `repeat(${cols}, ${cardWidth}px)`;

    cards.forEach(card => {
        card.style.width = `${cardWidth}px`;
        card.style.height = `${cardHeight}px`;

        const gameCard = card.querySelector('.game-card');
        if (gameCard) {
            gameCard.style.transform = `scale(${scale})`;
        }
    });
}

/**
 * Инициализация и отрисовка игрового поля
 */
function initGameField() {
    const container = document.getElementById('gameFieldContainer');

    // Генерируем поле с ячейками 170×238 (соответствует scale 0.85 карты 200×280)
    const fieldData = gameFieldRenderer.renderField({
        unavailableCount: null, // случайное количество 0-6
        cellWidth: 170,
        cellHeight: 238,
        cellGap: 6
    });

    // Сохраняем данные поля
    partyScreenState.gameField = fieldData.element;
    partyScreenState.fieldCells = fieldData.cells;
    partyScreenState.unavailableCells = fieldData.unavailableIndices;

    // Добавляем поле в контейнер
    container.innerHTML = '';
    container.appendChild(fieldData.element);

    // Масштабируем поле под доступное пространство
    scaleFieldToFit();

    // Настраиваем обработчики для ячеек
    fieldData.cells.forEach(cellData => {
        const cell = cellData.element;

        if (cellData.isAvailable) {
            cell.addEventListener('dragover', handleCellDragOver);
            cell.addEventListener('dragenter', handleCellDragEnter);
            cell.addEventListener('dragleave', handleCellDragLeave);
            cell.addEventListener('drop', handleCellDrop);
            cell.addEventListener('click', handleCellClick);
        }
    });

    // Фиксируем размеры фрейма после начальной подстройки,
    // чтобы при изменении окна появлялись полосы прокрутки вместо перемасштабирования
    lockPartyFrameSize();

    // Инициализируем SVG-оверлей для предиктивных стрелок
    if (window.PredictionHelper) {
        window.PredictionHelper.initOverlay();
    }

    console.log(`PartyScreen: Игровое поле создано. Заблокированных ячеек: ${fieldData.unavailableCount}`);

    return fieldData;
}

/**
 * Масштабирование игрового поля под доступное пространство секции.
 * Поле масштабируется по обоим измерениям, центрируется в секции.
 */
function scaleFieldToFit() {
    const wrapper = document.getElementById('gameFieldContainer');
    const field = wrapper ? wrapper.querySelector('.game-field') : null;
    if (!field || !wrapper) return;

    const section = wrapper.closest('.party-field-section');

    // Сбрасываем масштаб для точного измерения натуральных размеров поля
    field.style.transform = 'none';

    const fieldWidth = field.scrollWidth;
    const fieldHeight = field.scrollHeight;
    if (fieldWidth === 0 || fieldHeight === 0) return;

    // Доступное пространство внутри wrapper
    const wrapperWidth = wrapper.clientWidth;
    const wrapperHeight = wrapper.clientHeight;

    // Масштабируем по обоим измерениям, выбирая минимальный масштаб
    const scale = Math.min(wrapperWidth / fieldWidth, wrapperHeight / fieldHeight);

    field.style.transform = `scale(${scale})`;
    field.style.transformOrigin = 'top left';

    // Устанавливаем wrapper размеры для центрирования
    wrapper.style.width = `${fieldWidth * scale}px`;
    wrapper.style.height = `${fieldHeight * scale}px`;
}

/**
 * Фиксация размеров фрейма партии после начальной подстройки.
 * Устанавливает фиксированные pixel-размеры на .party-frame,
 * а также замораживает все vw/clamp-зависимые CSS-свойства внутренних элементов,
 * чтобы при уменьшении окна появлялись полосы прокрутки без смещения компонентов.
 */
function lockPartyFrameSize() {
    const partyFrame = document.querySelector('.party-frame');
    const partyScreen = document.querySelector('.party-screen');
    if (!partyFrame || !partyScreen) return;

    // Запоминаем текущие вычисленные размеры фрейма
    const rect = partyFrame.getBoundingClientRect();
    partyFrame.style.width = `${rect.width}px`;
    partyFrame.style.height = `${rect.height}px`;

    // Замораживаем vw/clamp-зависимые свойства внутренних элементов
    freezeComputedStyles(partyFrame);

    // Включаем режим прокрутки на body
    partyScreen.classList.add('game-locked');
}

/**
 * Замораживает вычисленные значения CSS-свойств, зависящих от viewport (clamp/vw),
 * устанавливая их как inline-стили с фиксированными pixel-значениями.
 */
function freezeComputedStyles(root) {
    const propsToFreeze = ['width', 'height', 'padding', 'gap', 'font-size'];

    // Селекторы элементов с vw-зависимыми стилями
    const selectors = [
        '.party-main-area',
        '.party-right-column',
        '.party-opponent-section',
        '.opponent-profile',
        '.opponent-avatar-large',
        '.opponent-name-display',
        '.opponent-power-display',
        '.opponent-hand-counter',
        '.opponent-cards-label',
        '.opponent-cards-count',
        '.party-score',
        '.score-label',
        '.party-messages-panel',
        '.message-content',
        '.party-field-section',
    ];

    selectors.forEach(selector => {
        const elements = root.querySelectorAll(selector);
        elements.forEach(el => {
            const computed = getComputedStyle(el);
            propsToFreeze.forEach(prop => {
                const value = computed.getPropertyValue(prop);
                if (value && value !== 'normal' && value !== 'none') {
                    el.style.setProperty(prop, value);
                }
            });
        });
    });
}

/**
 * Обработчик начала перетаскивания карты игрока
 */
function handleCardDragStart(e) {
    if (partyScreenState.mode !== PartyScreenMode.PLAYER_TURN) {
        e.preventDefault();
        return;
    }

    const cardWrapper = e.target.closest('.player-hand-card');
    if (!cardWrapper || cardWrapper.classList.contains('used')) {
        e.preventDefault();
        return;
    }

    partyScreenState.draggedCard = cardWrapper;
    const cardIndex = parseInt(cardWrapper.dataset.cardIndex, 10);
    partyScreenState.draggedCardData = partyScreenState.playerHand[cardIndex];

    cardWrapper.classList.add('dragging');
    e.dataTransfer.setData('text/plain', cardWrapper.dataset.cardId);
    e.dataTransfer.effectAllowed = 'move';

    // Создаём кастомный drag image - клон карты
    const gameCard = cardWrapper.querySelector('.game-card');
    if (gameCard) {
        const dragImage = gameCard.cloneNode(true);
        dragImage.classList.add('drag-preview');
        dragImage.style.position = 'absolute';
        dragImage.style.top = '-9999px';
        dragImage.style.left = '-9999px';
        dragImage.style.transform = 'scale(0.5)';
        dragImage.style.opacity = '0.9';
        dragImage.style.pointerEvents = 'none';
        dragImage.style.zIndex = '9999';
        document.body.appendChild(dragImage);

        // Устанавливаем кастомный drag image
        e.dataTransfer.setDragImage(dragImage, 50, 70);

        // Сохраняем для удаления позже
        partyScreenState.dragPreview = dragImage;
    }

    // Подсвечиваем доступные ячейки
    enableDropTargets();
}

/**
 * Обработчик окончания перетаскивания
 */
function handleCardDragEnd(e) {
    const cardWrapper = e.target.closest('.player-hand-card');
    if (cardWrapper) {
        cardWrapper.classList.remove('dragging');
    }

    // Удаляем кастомный drag image
    if (partyScreenState.dragPreview) {
        partyScreenState.dragPreview.remove();
        partyScreenState.dragPreview = null;
    }

    partyScreenState.draggedCard = null;
    partyScreenState.draggedCardData = null;

    // Убираем подсветку с ячеек
    disableDropTargets();

    // Очищаем стрелки предсказания
    if (window.PredictionHelper) {
        window.PredictionHelper.clearArrows();
    }
}

/**
 * Включение подсветки доступных ячеек для сброса
 */
function enableDropTargets() {
    partyScreenState.fieldCells.forEach(cellData => {
        if (cellData.isAvailable && !partyScreenState.fieldCards.has(cellData.index)) {
            cellData.element.classList.add('drop-target');
        }
    });
}

/**
 * Выключение подсветки ячеек
 */
function disableDropTargets() {
    partyScreenState.fieldCells.forEach(cellData => {
        cellData.element.classList.remove('drop-target', 'drag-over');
    });
}

/**
 * Обработчик dragover для ячейки
 */
function handleCellDragOver(e) {
    if (partyScreenState.mode !== PartyScreenMode.PLAYER_TURN) return;

    const cell = e.currentTarget;
    const cellIndex = parseInt(cell.dataset.index, 10);

    if (partyScreenState.fieldCards.has(cellIndex)) return;
    if (!cell.classList.contains('available')) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Предиктивная визуализация
    if (window.PredictionHelper && partyScreenState.draggedCardData) {
        const fieldCells = partyScreenState.fieldCells.map(c => ({
            index: c.index,
            row: c.row,
            col: c.col,
            isAvailable: c.isAvailable,
            card: partyScreenState.fieldCards.get(c.index) || null
        }));
        window.PredictionHelper.onCellHover(partyScreenState.draggedCardData, cellIndex, fieldCells);
    }
}

/**
 * Обработчик dragenter для ячейки
 */
function handleCellDragEnter(e) {
    if (partyScreenState.mode !== PartyScreenMode.PLAYER_TURN) return;

    const cell = e.currentTarget;
    const cellIndex = parseInt(cell.dataset.index, 10);

    if (partyScreenState.fieldCards.has(cellIndex)) return;
    if (!cell.classList.contains('available')) return;

    e.preventDefault();
    cell.classList.add('drag-over');
}

/**
 * Обработчик dragleave для ячейки
 */
function handleCellDragLeave(e) {
    const cell = e.currentTarget;
    if (!cell.contains(e.relatedTarget)) {
        cell.classList.remove('drag-over');

        // Очищаем стрелки предсказания
        if (window.PredictionHelper) {
            window.PredictionHelper.onCellLeave();
        }
    }
}

/**
 * Обработчик drop для ячейки - размещение карты на поле
 */
async function handleCellDrop(e) {
    e.preventDefault();

    // Очищаем стрелки предсказания перед реальным ходом
    if (window.PredictionHelper) {
        window.PredictionHelper.clearArrows();
    }

    if (partyScreenState.mode !== PartyScreenMode.PLAYER_TURN) return;

    const cell = e.currentTarget;
    cell.classList.remove('drag-over');

    const cellIndex = parseInt(cell.dataset.index, 10);

    if (partyScreenState.fieldCards.has(cellIndex)) {
        console.warn('PartyScreen: Ячейка уже занята');
        return;
    }

    if (!partyScreenState.draggedCardData) {
        console.warn('PartyScreen: Нет данных перетаскиваемой карты');
        return;
    }

    const cardData = partyScreenState.draggedCardData;

    // Размещаем карту на поле
    placeCardOnField(cellIndex, cardData, 'player');

    // Помечаем карту как использованную
    markCardAsUsed(cardData.id, partyScreenState.playerHand);

    // Перерисовываем руку игрока
    renderPlayerHand();

    // Обновляем счёт
    updateScore();

    // Выключаем подсветку
    disableDropTargets();

    // Переключаемся в режим событий
    setScreenMode(PartyScreenMode.EVENTS);

    // Отправляем состояние поля оркестратору
    sendFieldStateToOrchestrator();

    // Передаем управление оркестратору
    if (window.partyGameOrchestrator?.onPlayerMove) {
        partyScreenState.orchestratorActive = true;
        await window.partyGameOrchestrator.onPlayerMove({
            type: 'place_card',
            cellIndex: cellIndex,
            cardId: cardData.id,
            cardData: cardData
        });
    } else {
        // Резервный режим без оркестратора - простое поочередное размещение
        console.warn('PartyScreen: Оркестратор недоступен, используется резервный режим');
        setTimeout(() => {
            handleFallbackOpponentTurn();
        }, 1000);
    }
}

/**
 * Обработчик клика на ячейку (для режимов выбора)
 */
function handleCellClick(e) {
    const cell = e.currentTarget;
    const cellIndex = parseInt(cell.dataset.index, 10);

    if (partyScreenState.mode === PartyScreenMode.SELECT_ATTACK ||
        partyScreenState.mode === PartyScreenMode.SELECT_WINNER) {

        if (cell.classList.contains('selectable')) {
            handleCardSelection(cellIndex);
        }
    }
}

/**
 * Размещение карты на поле
 */
function placeCardOnField(cellIndex, cardData, owner) {
    const cellData = partyScreenState.fieldCells.find(c => c.index === cellIndex);
    if (!cellData) return;

    const cell = cellData.element;

    // Сохраняем данные карты
    partyScreenState.fieldCards.set(cellIndex, {
        ...cardData,
        owner: owner
    });

    // Создаём элемент карты
    const cardElement = window.cardRenderer.renderCard({
        cardTypeId: cardData.cardTypeId,
        arrowTopLeft: cardData.arrowTopLeft,
        arrowTop: cardData.arrowTop,
        arrowTopRight: cardData.arrowTopRight,
        arrowRight: cardData.arrowRight,
        arrowBottomRight: cardData.arrowBottomRight,
        arrowBottom: cardData.arrowBottom,
        arrowBottomLeft: cardData.arrowBottomLeft,
        arrowLeft: cardData.arrowLeft,
        ownership: owner === 'player' ? 'player' : 'rival',
        cardLevel: String(cardData.cardLevel || 1),
        attackLevel: String(cardData.attackLevel || 0),
        attackType: cardData.attackType || 'P',
        mechanicalDefense: String(cardData.mechanicalDefense || 0),
        electricalDefense: String(cardData.electricalDefense || 0)
    });

    // Очищаем ячейку и добавляем карту
    const cellInner = cell.querySelector('.cell-inner');
    cellInner.innerHTML = '';
    cellInner.appendChild(cardElement);

    // Добавляем классы состояния
    cell.classList.add('occupied');
    cell.classList.add(owner === 'player' ? 'player-owned' : 'opponent-owned');
    cell.classList.remove('drop-target');

    console.log(`PartyScreen: Карта ${cardData.id} размещена в ячейке ${cellIndex} (владелец: ${owner})`);
}

/**
 * Пометка карты как использованной
 */
function markCardAsUsed(cardId, handArray) {
    const card = handArray.find(c => c.id === cardId);
    if (card) {
        card.used = true;
    }
}

/**
 * Обновление счёта
 */
function updateScore() {
    let playerCount = 0;
    let opponentCount = 0;

    partyScreenState.fieldCards.forEach(cardData => {
        if (cardData.owner === 'player') {
            playerCount++;
        } else {
            opponentCount++;
        }
    });

    partyScreenState.playerScore = playerCount;
    partyScreenState.opponentScore = opponentCount;

    document.getElementById('scorePlayer').textContent = playerCount;
    document.getElementById('scoreOpponent').textContent = opponentCount;
}

/**
 * Резервный ход оппонента (без оркестратора)
 */
function handleFallbackOpponentTurn() {
    showMessage('Ход соперника...');

    // Подготавливаем состояние поля для расчёта хода
    const fieldState = {
        cells: partyScreenState.fieldCells.map(c => ({
            index: c.index,
            row: c.row,
            col: c.col,
            isAvailable: c.isAvailable,
            card: partyScreenState.fieldCards.get(c.index) || null
        }))
    };

    const move = window.aiMoveCalculator?.calculateAiMove(
        fieldState,
        partyScreenState.opponentHand,
        partyScreenState.playerHand
    );

    if (!move || move.cardId === null || move.cellIndex === null) {
        showMessage('Партия завершена!');
        handleFallbackGameEnd();
        return;
    }

    const selectedCard = partyScreenState.opponentHand.find(card => card.id === move.cardId);
    if (!selectedCard) {
        showMessage('Партия завершена!');
        handleFallbackGameEnd();
        return;
    }

    // Размещаем карту оппонента
    placeCardOnField(move.cellIndex, selectedCard, 'opponent');
    markCardAsUsed(selectedCard.id, partyScreenState.opponentHand);
    renderOpponentHand();
    updateScore();

    showMessage(`Оппонент разместил карту`);

    // Возвращаем ход игроку
    setTimeout(() => {
        // Проверяем, остались ли карты
        const playerHasCards = partyScreenState.playerHand.some(c => !c.used);
        const opponentHasCards = partyScreenState.opponentHand.some(c => !c.used);
        const hasEmptyCells = partyScreenState.fieldCells.some(
            c => c.isAvailable && !partyScreenState.fieldCards.has(c.index)
        );

        if (!hasEmptyCells || (!playerHasCards && !opponentHasCards)) {
            handleFallbackGameEnd();
        } else if (playerHasCards) {
            setScreenMode(PartyScreenMode.PLAYER_TURN);
            showMessage('Ваш ход! Перетащите карту на поле.');
        } else {
            // У игрока нет карт, но у оппонента есть
            setTimeout(() => handleFallbackOpponentTurn(), 1000);
        }
    }, 1500);
}

/**
 * Резервная обработка окончания игры (без оркестратора)
 */
function handleFallbackGameEnd() {
    setScreenMode(PartyScreenMode.GAME_END);
    clearPartyPayload();

    const playerScore = partyScreenState.playerScore;
    const opponentScore = partyScreenState.opponentScore;

    let resultText;
    if (playerScore > opponentScore) {
        resultText = `Победа! Счёт: ${playerScore}:${opponentScore}`;
    } else if (opponentScore > playerScore) {
        resultText = `Поражение! Счёт: ${playerScore}:${opponentScore}`;
    } else {
        resultText = `Ничья! Счёт: ${playerScore}:${opponentScore}`;
    }

    showMessage(resultText);
}

/**
 * Отправка состояния поля оркестратору
 */
function sendFieldStateToOrchestrator() {
    const fieldState = {
        cells: partyScreenState.fieldCells.map(c => ({
            index: c.index,
            row: c.row,
            col: c.col,
            isAvailable: c.isAvailable,
            card: partyScreenState.fieldCards.get(c.index) || null
        })),
        unavailableCells: partyScreenState.unavailableCells,
        opponentHand: partyScreenState.opponentHand.filter(c => !c.used)
    };

    console.log('PartyScreen: Состояние поля:', fieldState);

    if (window.partyGameOrchestrator?.onFieldStateUpdate) {
        window.partyGameOrchestrator.onFieldStateUpdate(fieldState);
    }
}

/**
 * Обработка игрового события от оркестратора
 */
async function handleGameEvent(event) {
    console.log('PartyScreen: Получено событие:', event);

    switch (event.type) {
        case GameEventType.MESSAGE:
            showMessage(event.text, event.duration || 0);
            break;

        case GameEventType.TURN_CHANGE:
            await handleTurnChange(event);
            break;

        case GameEventType.BATTLE:
            await handleBattle(event);
            break;

        case GameEventType.OWNERSHIP_CHANGE:
            await handleOwnershipChange(event);
            break;

        case GameEventType.OPPONENT_MOVE:
            await handleOpponentMove(event);
            break;

        case GameEventType.GAME_END:
            await handleGameEnd(event);
            break;

        case GameEventType.PROGRESS_SAVED:
            partyScreenState.progressSaved = true;
            break;

        default:
            console.warn('PartyScreen: Неизвестный тип события:', event.type);
    }

    // После обработки события отправляем актуальное состояние
    sendFieldStateToOrchestrator();
}

/**
 * Обработка смены хода
 */
async function handleTurnChange(event) {
    if (event.currentPlayer === 'player') {
        setScreenMode(PartyScreenMode.PLAYER_TURN);
        showMessage('Ваш ход! Перетащите карту на поле.');
    } else {
        setScreenMode(PartyScreenMode.EVENTS);
        showMessage('Ход соперника...');
    }
}

/**
 * Обработка боя между картами
 */
async function handleBattle(event) {
    const {
        attackerCellIndex,
        defenderCellIndex,
        attackLevel,
        attackType,
        defenseLevel,
        defenseType,
        winner
    } = event;

    setScreenMode(PartyScreenMode.BATTLE);

    // Подсвечиваем карты на поле
    const attackerCell = partyScreenState.fieldCells.find(c => c.index === attackerCellIndex);
    const defenderCell = partyScreenState.fieldCells.find(c => c.index === defenderCellIndex);

    if (attackerCell) attackerCell.element.classList.add('attacker-highlight');
    if (defenderCell) defenderCell.element.classList.add('defender-highlight');

    // Показываем оверлей боя
    const battleOverlay = document.getElementById('battleOverlay');
    battleOverlay.classList.remove('hidden');

    // Получаем данные карт
    const attackerData = partyScreenState.fieldCards.get(attackerCellIndex);
    const defenderData = partyScreenState.fieldCards.get(defenderCellIndex);

    // Отрисовываем карты в оверлее
    const attackerContainer = document.getElementById('attackerCard');
    const defenderContainer = document.getElementById('defenderCard');

    attackerContainer.innerHTML = '';
    defenderContainer.innerHTML = '';

    if (attackerData) {
        const attackerElement = window.cardRenderer.renderCard({
            cardTypeId: attackerData.cardTypeId,
            arrowTopLeft: attackerData.arrowTopLeft,
            arrowTop: attackerData.arrowTop,
            arrowTopRight: attackerData.arrowTopRight,
            arrowRight: attackerData.arrowRight,
            arrowBottomRight: attackerData.arrowBottomRight,
            arrowBottom: attackerData.arrowBottom,
            arrowBottomLeft: attackerData.arrowBottomLeft,
            arrowLeft: attackerData.arrowLeft,
            ownership: attackerData.owner === 'player' ? 'player' : 'rival',
            cardLevel: String(attackerData.cardLevel || 1),
            attackLevel: String(attackerData.attackLevel || 0),
            attackType: attackerData.attackType || 'P',
            mechanicalDefense: String(attackerData.mechanicalDefense || 0),
            electricalDefense: String(attackerData.electricalDefense || 0)
        });
        attackerContainer.appendChild(attackerElement);
    }

    if (defenderData) {
        const defenderElement = window.cardRenderer.renderCard({
            cardTypeId: defenderData.cardTypeId,
            arrowTopLeft: defenderData.arrowTopLeft,
            arrowTop: defenderData.arrowTop,
            arrowTopRight: defenderData.arrowTopRight,
            arrowRight: defenderData.arrowRight,
            arrowBottomRight: defenderData.arrowBottomRight,
            arrowBottom: defenderData.arrowBottom,
            arrowBottomLeft: defenderData.arrowBottomLeft,
            arrowLeft: defenderData.arrowLeft,
            ownership: defenderData.owner === 'player' ? 'player' : 'rival',
            cardLevel: String(defenderData.cardLevel || 1),
            attackLevel: String(defenderData.attackLevel || 0),
            attackType: defenderData.attackType || 'P',
            mechanicalDefense: String(defenderData.mechanicalDefense || 0),
            electricalDefense: String(defenderData.electricalDefense || 0)
        });
        defenderContainer.appendChild(defenderElement);
    }

    // Анимация отображения значений атаки
    const attackValueEl = document.getElementById('attackValue');
    const defenseValueEl = document.getElementById('defenseValue');

    attackValueEl.className = `attack-value type-${attackType}`;
    defenseValueEl.className = 'defense-value';

    // Анимация счётчика атаки
    await animateValue(attackValueEl, 0, attackLevel, 800);

    // Анимация счётчика защиты
    await animateValue(defenseValueEl, 0, defenseLevel, 800);

    // Показываем результат
    showMessage(winner === 'attacker' ? 'Атакующая карта победила!' : 'Защищающаяся карта устояла!', 2000);

    // Ждём и скрываем оверлей
    await delay(2000);

    battleOverlay.classList.add('hidden');

    if (attackerCell) attackerCell.element.classList.remove('attacker-highlight');
    if (defenderCell) defenderCell.element.classList.remove('defender-highlight');
}

/**
 * Анимация изменения числового значения
 */
function animateValue(element, start, end, duration) {
    return new Promise(resolve => {
        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            const currentValue = Math.floor(start + (end - start) * progress);
            element.textContent = currentValue;

            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                resolve();
            }
        }

        requestAnimationFrame(update);
    });
}

/**
 * Обработка смены владельца карт
 */
async function handleOwnershipChange(event) {
    const { changes } = event;

    setScreenMode(PartyScreenMode.OWNERSHIP_CHANGE);

    for (const change of changes) {
        const { cellIndex, newOwner } = change;
        const cell = partyScreenState.fieldCells.find(c => c.index === cellIndex);

        if (!cell) continue;

        const cardData = partyScreenState.fieldCards.get(cellIndex);
        if (!cardData) continue;

        // Анимация смены владельца
        cell.element.classList.add('ownership-changing');

        await delay(300);

        // Обновляем владельца
        cardData.owner = newOwner;
        partyScreenState.fieldCards.set(cellIndex, cardData);

        // Обновляем классы ячейки
        cell.element.classList.remove('player-owned', 'opponent-owned');
        cell.element.classList.add(newOwner === 'player' ? 'player-owned' : 'opponent-owned');

        // Перерисовываем карту с новым владельцем
        const cellInner = cell.element.querySelector('.cell-inner');
        cellInner.innerHTML = '';

        const cardElement = window.cardRenderer.renderCard({
            cardTypeId: cardData.cardTypeId,
            arrowTopLeft: cardData.arrowTopLeft,
            arrowTop: cardData.arrowTop,
            arrowTopRight: cardData.arrowTopRight,
            arrowRight: cardData.arrowRight,
            arrowBottomRight: cardData.arrowBottomRight,
            arrowBottom: cardData.arrowBottom,
            arrowBottomLeft: cardData.arrowBottomLeft,
            arrowLeft: cardData.arrowLeft,
            ownership: newOwner === 'player' ? 'player' : 'rival',
            cardLevel: String(cardData.cardLevel || 1),
            attackLevel: String(cardData.attackLevel || 0),
            attackType: cardData.attackType || 'P',
            mechanicalDefense: String(cardData.mechanicalDefense || 0),
            electricalDefense: String(cardData.electricalDefense || 0)
        });

        cellInner.appendChild(cardElement);

        await delay(300);

        cell.element.classList.remove('ownership-changing');
    }

    updateScore();
}

/**
 * Обработка хода оппонента
 */
async function handleOpponentMove(event) {
    const { cellIndex, cardData } = event;

    showMessage('Оппонент делает ход...');

    await delay(500);

    // Размещаем карту оппонента
    placeCardOnField(cellIndex, cardData, 'opponent');

    // Помечаем карту как использованную
    markCardAsUsed(cardData.id, partyScreenState.opponentHand);
    renderOpponentHand();

    updateScore();

    showMessage(`Оппонент разместил карту в ячейке ${cellIndex}`);
}

/**
 * Обработка завершения игры
 */
async function handleGameEnd(event) {
    const { winner, playerScore, opponentScore } = event;
    partyScreenState.progressSaved = false;

    setScreenMode(PartyScreenMode.GAME_END);

    const resultText = winner === 'player'
        ? `Победа! Счёт: ${playerScore}:${opponentScore}`
        : winner === 'opponent'
            ? `Поражение! Счёт: ${playerScore}:${opponentScore}`
            : `Ничья! Счёт: ${playerScore}:${opponentScore}`;

    showMessage(resultText);

    if (winner !== 'player') {
        clearPartyPayload();
    }
}

/**
 * Включение режима выбора карты для атаки
 */
function enableAttackSelection(selectableCells, callback) {
    setScreenMode(PartyScreenMode.SELECT_ATTACK);
    partyScreenState.selectionCallback = callback;

    selectableCells.forEach(cellIndex => {
        const cellData = partyScreenState.fieldCells.find(c => c.index === cellIndex);
        if (cellData) {
            cellData.element.classList.add('selectable');
        }
    });
}

/**
 * Включение режима выбора карты для взятия
 */
function enableWinnerSelection(selectableCells, callback) {
    setScreenMode(PartyScreenMode.SELECT_WINNER);
    partyScreenState.selectionCallback = callback;

    selectableCells.forEach(cellIndex => {
        const cellData = partyScreenState.fieldCells.find(c => c.index === cellIndex);
        if (cellData) {
            cellData.element.classList.add('selectable');
        }
    });
}

/**
 * Обработка выбора карты
 */
function handleCardSelection(cellIndex) {
    const wasWinnerSelection = partyScreenState.mode === PartyScreenMode.SELECT_WINNER;

    // Убираем выделение со всех ячеек
    partyScreenState.fieldCells.forEach(cellData => {
        cellData.element.classList.remove('selectable');
    });

    document.getElementById('selectionOverlay').classList.add('hidden');

    if (partyScreenState.selectionCallback) {
        partyScreenState.selectionCallback(cellIndex);
        partyScreenState.selectionCallback = null;
    }

    if (wasWinnerSelection) {
        clearPartyPayload();
        setScreenMode(PartyScreenMode.GAME_END);
    }
}

function highlightRewardCard(cellIndex, duration = 2000) {
    const cellData = partyScreenState.fieldCells.find(c => c.index === cellIndex);
    if (!cellData || !cellData.element) {
        return;
    }

    cellData.element.classList.add('reward-highlight');
}

/**
 * Вспомогательная функция задержки
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Получение текущего состояния экрана
 */
function getPartyScreenState() {
    return {
        mode: partyScreenState.mode,
        fieldCards: Object.fromEntries(partyScreenState.fieldCards),
        fieldCells: partyScreenState.fieldCells.map(c => ({
            index: c.index,
            row: c.row,
            col: c.col,
            isAvailable: c.isAvailable,
            card: partyScreenState.fieldCards.get(c.index) || null
        })),
        unavailableCells: partyScreenState.unavailableCells,
        playerScore: partyScreenState.playerScore,
        opponentScore: partyScreenState.opponentScore,
        playerHand: partyScreenState.playerHand,
        opponentHand: partyScreenState.opponentHand,
        opponentData: partyScreenState.opponentData
    };
}

/**
 * Главная функция инициализации экрана партии
 */
async function initPartyScreen() {
    console.log('PartyScreen: Инициализация экрана партии...');

    setScreenMode(PartyScreenMode.LOADING);
    showMessage('Загрузка партии...');

    const returnButton = document.getElementById('partyReturnButton');
    if (returnButton) {
        returnButton.addEventListener('click', () => {
            if (window.partyGameOrchestrator?.isSavingProgress?.()) {
                showMessage('Сохранение...');
                return;
            }

            function performReturn() {
                // Остановка GameplayAPI при нажатии "Вернуться"
                if (window.userCards?.stopGameplay) {
                    window.userCards.stopGameplay();
                }
                clearPartyPayload();
                window.location.href = 'index.html';
            }

            if (!window.userCards?.isRunningInVK?.()) {
                performReturn();
                return;
            }

            window.userCards.showInterstitialAd({
                onClose: function(wasShown) {
                    performReturn();
                },
                onError: function(error) {
                    console.error('PartyScreen: Ошибка полноэкранной рекламы:', error);
                    performReturn();
                }
            });
        });
    }

    const guideButton = document.getElementById('partyGuideButton');
    const guideModal = document.getElementById('guideModal');
    const guideModalClose = document.getElementById('guideModalClose');

    if (guideButton && guideModal && guideModalClose) {
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
    }

    try {
        // Получаем данные партии
        const payload = getPartyPayload();

        if (!payload) {
            showMessage('Ошибка: данные партии не найдены');
            console.error('PartyScreen: Данные партии не найдены');
            setScreenMode(PartyScreenMode.GAME_END);
            return;
        }

        console.log('PartyScreen: Данные партии получены:', payload);

        // Сохраняем данные
        partyScreenState.opponentId = payload.opponentId;
        partyScreenState.playerHand = payload.playerHand || [];
        partyScreenState.opponentHand = payload.opponentHand || [];

        // Инициализируем рендерер карт
        await window.cardRenderer.init();

        // Загружаем данные оппонента
        partyScreenState.opponentData = await getOpponentDataFromDb(payload.opponentId);

        // Обновляем отображение
        updateOpponentDisplay();

        // Инициализируем игровое поле
        const fieldData = initGameField();

        // Отрисовываем руки
        renderOpponentHand();
        renderPlayerHand();

        // Обновляем счёт
        updateScore();

        // Помечаем готовность
        partyScreenState.isReady = true;

        // Запускаем GameplayAPI сессию (если еще не запущена на экране настройки руки)
        if (window.userCards?.startGameplay) {
            window.userCards.startGameplay();
        }

        console.log('PartyScreen: Инициализация завершена');

        // Запускаем оркестратор партии (он управляет игрой)
        if (window.partyGameOrchestrator?.start) {
            partyScreenState.orchestratorActive = true;

            // Передаем состояние экрана оркестратору (без DOM-элементов)
            const screenState = {
                playerHand: partyScreenState.playerHand,
                opponentHand: partyScreenState.opponentHand,
                fieldCells: partyScreenState.fieldCells.map(c => ({
                    index: c.index,
                    row: c.row,
                    col: c.col,
                    isAvailable: c.isAvailable,
                    card: partyScreenState.fieldCards.get(c.index) || null
                })),
                unavailableCells: partyScreenState.unavailableCells,
                opponentData: partyScreenState.opponentData
            };

            await window.partyGameOrchestrator.start(screenState);
        } else {
            // Резервный режим без оркестратора
            console.warn('PartyScreen: Оркестратор недоступен, запуск в резервном режиме');
            showMessage('Партия началась! Ваш ход.');
            setScreenMode(PartyScreenMode.PLAYER_TURN);
        }

    } catch (error) {
        console.error('PartyScreen: Ошибка инициализации:', error);
        showMessage(`Ошибка загрузки: ${error.message}`);
    }
}

/**
 * Показ анимации повышения уровня карт
 */
async function showLevelUp(leveledUpCards) {
    if (!Array.isArray(leveledUpCards) || leveledUpCards.length === 0) {
        return;
    }

    showMessage(`Карты повысили уровень: ${leveledUpCards.length}!`);

    // Подсвечиваем карты на поле, которые получили level up
    for (const cardInfo of leveledUpCards) {
        const levelUpId = Number(cardInfo.id);
        const nextCardLevel = String(cardInfo.newLevel ?? 1);
        partyScreenState.playerHand = partyScreenState.playerHand.map(card => (
            Number(card.id) === levelUpId
                ? {
                    ...card,
                            cardLevel: nextCardLevel,
                    attackLevel: cardInfo.newStats?.attackLevel ?? card.attackLevel,
                    mechanicalDefense: cardInfo.newStats?.mechanicalDefense ?? card.mechanicalDefense,
                    electricalDefense: cardInfo.newStats?.electricalDefense ?? card.electricalDefense
                }
                : card
        ));

        // Находим ячейку с этой картой
        for (const [cellIndex, cardData] of partyScreenState.fieldCards.entries()) {
            if (Number(cardData.id) === levelUpId) {
                const cellData = partyScreenState.fieldCells.find(c => c.index === cellIndex);
                if (cellData && cellData.element) {
                    const updatedCard = {
                        ...cardData,
                        cardLevel: cardInfo.newLevel,
                        attackLevel: cardInfo.newStats?.attackLevel ?? cardData.attackLevel,
                        mechanicalDefense: cardInfo.newStats?.mechanicalDefense ?? cardData.mechanicalDefense,
                        electricalDefense: cardInfo.newStats?.electricalDefense ?? cardData.electricalDefense
                    };

                    partyScreenState.fieldCards.set(cellIndex, updatedCard);

                    const cellInner = cellData.element.querySelector('.cell-inner');
                    if (cellInner) {
                        cellInner.innerHTML = '';
                        const cardElement = window.cardRenderer.renderCard({
                            cardTypeId: cardInfo.cardTypeId ?? updatedCard.cardTypeId,
                            arrowTopLeft: updatedCard.arrowTopLeft,
                            arrowTop: updatedCard.arrowTop,
                            arrowTopRight: updatedCard.arrowTopRight,
                            arrowRight: updatedCard.arrowRight,
                            arrowBottomRight: updatedCard.arrowBottomRight,
                            arrowBottom: updatedCard.arrowBottom,
                            arrowBottomLeft: updatedCard.arrowBottomLeft,
                            arrowLeft: updatedCard.arrowLeft,
                            ownership: updatedCard.owner === 'player' ? 'player' : 'rival',
                            cardLevel: String(updatedCard.cardLevel || 0),
                            attackLevel: String(updatedCard.attackLevel || 0),
                            attackType: updatedCard.attackType || 'P',
                            mechanicalDefense: String(updatedCard.mechanicalDefense || 0),
                            electricalDefense: String(updatedCard.electricalDefense || 0)
                        });
                        cellInner.appendChild(cardElement);
                    }

                    cellData.element.classList.add('level-up-highlight');

                    // Убираем подсветку через 2 секунды
                    setTimeout(() => {
                        cellData.element.classList.remove('level-up-highlight');
                    }, 2000);
                }
                break;
            }
        }
    }

    renderPlayerHand();

    await delay(2000);
}

/**
 * Показ экрана выбора награды (карты противника)
 */
function showRewardSelection(candidateCards, callback) {
    const selectableCells = [];

    // Находим ячейки с картами противника
    for (const [cellIndex, cardData] of partyScreenState.fieldCards.entries()) {
        if (cardData.owner === 'opponent') {
            selectableCells.push(cellIndex);
        }
    }

    if (selectableCells.length > 0) {
        setScreenMode(PartyScreenMode.SELECT_WINNER);
        enableWinnerSelection(selectableCells, callback);
    } else if (callback) {
        callback(null);
        clearPartyPayload();
        setScreenMode(PartyScreenMode.GAME_END);
    }
}

// Экспортируем API экрана партии
window.partyScreen = {
    init: initPartyScreen,
    getState: getPartyScreenState,
    setMode: setScreenMode,
    showMessage: showMessage,
    handleEvent: handleGameEvent,
    placeCard: placeCardOnField,
    enableAttackSelection: enableAttackSelection,
    enableWinnerSelection: enableWinnerSelection,
    showLevelUp: showLevelUp,
    showRewardSelection: showRewardSelection,
    highlightRewardCard: highlightRewardCard,
    updateScore: updateScore,
    sendFieldState: sendFieldStateToOrchestrator,
    modes: PartyScreenMode,
    eventTypes: GameEventType
};

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', initPartyScreen);
