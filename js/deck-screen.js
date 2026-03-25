/**
 * Deck Screen Controller for Technomaster
 * Экран «Моя колода» — просмотр коллекции карт игрока
 */

const DECK_DB_PATH = 'public/data/cards.db';

/**
 * Названия уровней карт
 */
const CARD_LEVEL_NAMES = {
    0: 'Уровень 1: Обычная',
    1: 'Уровень 2: Крепкая',
    2: 'Уровень 3: Мощная'
};

/**
 * Расшифровки типов атак
 */
const ATTACK_TYPE_DESCRIPTIONS = {
    P: {
        name: 'Физическая',
        hint: 'Физическая атака. Бьет по Механической защите (3-й параметр).'
    },
    M: {
        name: 'Магическая',
        hint: 'Магическая атака. Бьет по Электрической защите (4-й параметр).'
    },
    E: {
        name: 'Электрическая',
        hint: 'Электрическая атака. Бьет по Электрической защите.'
    },
    X: {
        name: 'Гибкая',
        hint: 'Гибкая атака. Выбирает самую слабую защиту врага.'
    },
    A: {
        name: 'Штурмовая',
        hint: 'Штурмовая атака. Бьет по самому слабому числу на карте врага (даже по атаке!).'
    }
};

/**
 * Вычисляет реальный верхний предел силы атаки.
 * Бросок от 0 до level.
 * @param {number} level
 * @returns {number}
 */
function getAttackMaxValue(level) {
    return parseInt(level, 10) || 0;
}

/**
 * Состояние экрана
 */
const deckScreenState = {
    db: null,
    userData: null,
    cardTypesMap: new Map(),
    groups: null,
    cardGroups: []
};

/**
 * Инициализация базы данных
 * @returns {Promise<object>}
 */
async function initDeckDatabase() {
    const SQL = await SqlLoader.init();

    const response = await fetch(DECK_DB_PATH);
    const buffer = await response.arrayBuffer();
    return new SQL.Database(new Uint8Array(buffer));
}

/**
 * Загрузка данных типов карт из БД (id, name, image, description, group_id)
 * @param {object} db
 * @returns {Map<number, object>}
 */
function loadCardTypesFromDb(db) {
    const map = new Map();

    try {
        // Пробуем загрузить с description
        const result = db.exec(
            'SELECT ct.id, ct.name, ct.image, ct.group_id, cg.sequence FROM card_types ct ' +
            'LEFT JOIN card_groups cg ON ct.group_id = cg.id ORDER BY ct.id'
        );

        if (result.length > 0) {
            result[0].values.forEach(row => {
                map.set(row[0], {
                    id: row[0],
                    name: row[1],
                    image: row[2],
                    groupId: row[3],
                    groupSequence: row[4] || 1
                });
            });
        }
    } catch (error) {
        console.error('DeckScreen: Ошибка загрузки типов карт:', error);
    }

    // Пробуем загрузить описания, если колонка существует
    try {
        const descResult = db.exec('SELECT id, description FROM card_types');
        if (descResult.length > 0) {
            descResult[0].values.forEach(row => {
                const existing = map.get(row[0]);
                if (existing) {
                    existing.description = row[1] || '';
                }
            });
        }
    } catch (e) {
        // Колонка description может не существовать — не ошибка
        console.log('DeckScreen: Колонка description в card_types отсутствует.');
    }

    return map;
}

/**
 * Загрузка групп карт из БД
 * @param {object} db
 * @returns {Array<{id:number,name:string,sequence:number}>}
 */
function loadCardGroupsFromDb(db) {
    try {
        const result = db.exec('SELECT id, name, sequence FROM card_groups ORDER BY sequence ASC, id ASC');
        if (!result.length) {
            return [];
        }

        return result[0].values.map(row => ({
            id: row[0],
            name: row[1],
            sequence: row[2]
        }));
    } catch (error) {
        console.error('DeckScreen: Ошибка загрузки групп карт:', error);
        return [];
    }
}

/**
 * Получение карт игрока из userData
 * @param {object} userData
 * @returns {Array}
 */
function getPlayerCards(userData) {
    if (!userData || !Array.isArray(userData.cards) || !Array.isArray(userData.cardholders)) {
        return [];
    }

    const playerCardholder = userData.cardholders.find(ch => ch.player === true);
    if (!playerCardholder) return [];

    return userData.cards.filter(card => card.cardholder_id === playerCardholder.id);
}

/**
 * Группировка карт по cardTypeId
 * @param {Array} playerCards
 * @param {Map} cardTypesMap
 * @returns {object}
 */
function prepareCollectionData(playerCards, cardTypesMap) {
    const groups = {};

    playerCards.forEach(card => {
        const typeId = card.cardTypeId;
        if (!groups[typeId]) {
            groups[typeId] = {
                meta: cardTypesMap.get(typeId) || { id: typeId, name: `Тип #${typeId}`, groupSequence: 1 },
                instances: []
            };
        }
        groups[typeId].instances.push(card);
    });

    // Сортировка внутри групп: сначала самые сильные (уровень, затем атака)
    for (const key in groups) {
        groups[key].instances.sort((a, b) => {
            const levelA = parseInt(a.cardLevel, 10) || 0;
            const levelB = parseInt(b.cardLevel, 10) || 0;
            if (levelB !== levelA) return levelB - levelA;

            const attackA = parseInt(a.attackLevel, 10) || 0;
            const attackB = parseInt(b.attackLevel, 10) || 0;
            return attackB - attackA;
        });
    }

    return groups;
}

/**
 * Сортировка групп: по убыванию редкости (groupSequence 4 -> 1), затем по ID типа
 * @param {object} groups
 * @returns {Array<[string, object]>}
 */
function sortGroups(groups) {
    return Object.entries(groups).sort((a, b) => {
        const seqA = a[1].meta.groupSequence || 1;
        const seqB = b[1].meta.groupSequence || 1;
        if (seqB !== seqA) return seqB - seqA;
        return Number(a[0]) - Number(b[0]);
    });
}

/**
 * Создание DOM-элемента слота коллекции
 * @param {string} typeId
 * @param {object} group
 * @returns {HTMLElement}
 */
function createCollectionSlot(typeId, group) {
    const bestCard = group.instances[0];
    const count = group.instances.length;

    const slot = document.createElement('div');
    slot.className = 'deck-collection-slot';
    slot.dataset.typeId = typeId;

    // Обертка для карты
    const cardWrap = document.createElement('div');
    cardWrap.className = 'deck-slot-card-wrap';

    // Рендерим лучшую карту
    const renderParams = {
        cardTypeId: bestCard.cardTypeId,
        arrowTopLeft: bestCard.arrowTopLeft || false,
        arrowTop: bestCard.arrowTop || false,
        arrowTopRight: bestCard.arrowTopRight || false,
        arrowRight: bestCard.arrowRight || false,
        arrowBottomRight: bestCard.arrowBottomRight || false,
        arrowBottom: bestCard.arrowBottom || false,
        arrowBottomLeft: bestCard.arrowBottomLeft || false,
        arrowLeft: bestCard.arrowLeft || false,
        ownership: 'player',
        cardLevel: String(bestCard.cardLevel),
        attackLevel: String(bestCard.attackLevel),
        attackType: bestCard.attackType || 'P',
        mechanicalDefense: String(bestCard.mechanicalDefense),
        electricalDefense: String(bestCard.electricalDefense)
    };

    const cardElement = window.cardRenderer.renderCard(renderParams);
    cardWrap.appendChild(cardElement);

    // Бейдж количества
    if (count > 1) {
        const badge = document.createElement('span');
        badge.className = 'deck-slot-count';
        badge.textContent = `x${count}`;
        cardWrap.appendChild(badge);
    }

    slot.appendChild(cardWrap);

    // Название под картой
    const nameLabel = document.createElement('div');
    nameLabel.className = 'deck-slot-name';
    nameLabel.textContent = group.meta.name;
    slot.appendChild(nameLabel);

    // Обработчик клика: если одна карта — сразу детали, иначе список экземпляров
    slot.addEventListener('click', () => {
        if (count === 1) {
            showCardDetail(bestCard, group.meta);
        } else {
            showInstances(typeId, group);
        }
    });

    return slot;
}

/**
 * Отображение экземпляров карт данного типа
 * @param {string} typeId
 * @param {object} group
 */
function showInstances(typeId, group) {
    const overlay = document.getElementById('deckInstancesOverlay');
    const title = document.getElementById('instancesTitle');
    const grid = document.getElementById('deckInstancesGrid');

    title.textContent = group.meta.name;
    grid.innerHTML = '';

    group.instances.forEach(card => {
        const cardWrap = document.createElement('div');
        cardWrap.className = 'deck-instance-card';

        const renderParams = {
            cardTypeId: card.cardTypeId,
            arrowTopLeft: card.arrowTopLeft || false,
            arrowTop: card.arrowTop || false,
            arrowTopRight: card.arrowTopRight || false,
            arrowRight: card.arrowRight || false,
            arrowBottomRight: card.arrowBottomRight || false,
            arrowBottom: card.arrowBottom || false,
            arrowBottomLeft: card.arrowBottomLeft || false,
            arrowLeft: card.arrowLeft || false,
            ownership: 'player',
            cardLevel: String(card.cardLevel),
            attackLevel: String(card.attackLevel),
            attackType: card.attackType || 'P',
            mechanicalDefense: String(card.mechanicalDefense),
            electricalDefense: String(card.electricalDefense)
        };

        const cardElement = window.cardRenderer.renderCard(renderParams);
        cardWrap.appendChild(cardElement);

        // Клик по конкретной карте — открыть модальное окно
        cardWrap.addEventListener('click', (e) => {
            e.stopPropagation();
            showCardDetail(card, group.meta);
        });

        grid.appendChild(cardWrap);
    });

    overlay.classList.remove('hidden');
}

/**
 * Скрытие панели экземпляров
 */
function hideInstances() {
    const overlay = document.getElementById('deckInstancesOverlay');
    overlay.classList.add('hidden');
}

/**
 * Отображение модального окна характеристик карты
 * @param {object} card
 * @param {object} meta
 */
function showCardDetail(card, meta) {
    const modal = document.getElementById('deckDetailModal');

    // Рендерим крупную карту
    const container = document.getElementById('detailCardContainer');
    container.innerHTML = '';

    const renderParams = {
        cardTypeId: card.cardTypeId,
        arrowTopLeft: card.arrowTopLeft || false,
        arrowTop: card.arrowTop || false,
        arrowTopRight: card.arrowTopRight || false,
        arrowRight: card.arrowRight || false,
        arrowBottomRight: card.arrowBottomRight || false,
        arrowBottom: card.arrowBottom || false,
        arrowBottomLeft: card.arrowBottomLeft || false,
        arrowLeft: card.arrowLeft || false,
        ownership: 'player',
        cardLevel: String(card.cardLevel),
        attackLevel: String(card.attackLevel),
        attackType: card.attackType || 'P',
        mechanicalDefense: String(card.mechanicalDefense),
        electricalDefense: String(card.electricalDefense)
    };

    const cardElement = window.cardRenderer.renderCard(renderParams);
    container.appendChild(cardElement);

    // Заполняем данные
    const cardLevel = parseInt(card.cardLevel, 10) || 0;
    document.getElementById('detailName').textContent = meta.name;
    document.getElementById('detailLevel').textContent = CARD_LEVEL_NAMES[cardLevel] || `Уровень ${cardLevel + 1}`;

    const descEl = document.getElementById('detailDescription');
    if (meta.description) {
        descEl.textContent = meta.description;
        descEl.style.display = '';
    } else {
        descEl.style.display = 'none';
    }

    // Группа карты
    const currentGroup = deckScreenState.cardGroups.find(group => group.id === meta.groupId);
    document.getElementById('ruleGroupValue').textContent = currentGroup?.name || `Группа #${meta.groupId || '?'}`;

    const groupHintEl = document.getElementById('ruleGroupHint');
    groupHintEl.innerHTML = '';

    if (currentGroup) {
        const currentLine = document.createElement('p');
        currentLine.className = 'rule-hint rule-hint--current';
        currentLine.textContent = `Текущая группа: ${currentGroup.name}.`;
        groupHintEl.appendChild(currentLine);
    }

    const otherGroups = deckScreenState.cardGroups.filter(group => group.id !== meta.groupId);
    if (otherGroups.length > 0) {
        const otherTitle = document.createElement('p');
        otherTitle.className = 'rule-hint rule-hint--other-title';
        otherTitle.textContent = 'Другие группы в игре:';
        groupHintEl.appendChild(otherTitle);

        otherGroups.forEach(group => {
            const line = document.createElement('p');
            line.className = 'rule-hint';
            line.textContent = group.name;
            groupHintEl.appendChild(line);
        });
    }

    // Атака
    const attackVal = parseInt(card.attackLevel, 10) || 0;
    const attackMax = getAttackMaxValue(attackVal);
    document.getElementById('ruleAttackValue').textContent = attackVal;
    document.getElementById('ruleAttackHint').textContent =
        `Уровень атаки ${attackVal} — в бою сила удара рассчитывается случайно от 0 до ${attackMax} ед. Защита противника рассчитывается так же. Чем выше уровень, тем больше шанс пробить защиту врага.`;

    // Тип атаки
    const atkType = card.attackType || 'P';
    const typeInfo = ATTACK_TYPE_DESCRIPTIONS[atkType] || { name: atkType, hint: '' };
    document.getElementById('ruleTypeIcon').textContent = atkType;
    document.getElementById('ruleTypeValue').textContent = typeInfo.name;

    // Собираем подсказку: сначала текущий тип, затем остальные
    const typeHintEl = document.getElementById('ruleTypeHint');
    typeHintEl.innerHTML = '';

    const currentLine = document.createElement('p');
    currentLine.className = 'rule-hint rule-hint--current';
    currentLine.textContent = typeInfo.hint;
    typeHintEl.appendChild(currentLine);

    const otherTypes = Object.entries(ATTACK_TYPE_DESCRIPTIONS).filter(([key]) => key !== atkType);
    if (otherTypes.length > 0) {
        const otherTitle = document.createElement('p');
        otherTitle.className = 'rule-hint rule-hint--other-title';
        otherTitle.textContent = 'Другие типы атак:';
        typeHintEl.appendChild(otherTitle);

        otherTypes.forEach(([key, info]) => {
            const line = document.createElement('p');
            line.className = 'rule-hint';
            line.textContent = `${key} — ${info.hint}`;
            typeHintEl.appendChild(line);
        });
    }

    // Защиты
    document.getElementById('ruleMechDefValue').textContent = card.mechanicalDefense;
    document.getElementById('ruleElecDefValue').textContent = card.electricalDefense;

    modal.classList.remove('hidden');
}

/**
 * Скрытие модального окна
 */
function hideCardDetail() {
    const modal = document.getElementById('deckDetailModal');
    modal.classList.add('hidden');
}

/**
 * Основная функция рендеринга экрана колоды
 * @param {object} userData
 */
function renderDeckScreen(userData) {
    const grid = document.getElementById('deckCollectionGrid');
    const counter = document.getElementById('deckCardCounter');

    if (!grid) return;

    const playerCards = getPlayerCards(userData);
    counter.textContent = `Карты: ${playerCards.length} / 100`;

    grid.innerHTML = '';

    if (playerCards.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-message';
        empty.textContent = 'У вас пока нет карт. Начните игру, чтобы получить первые карты!';
        grid.appendChild(empty);
        return;
    }

    const groups = prepareCollectionData(playerCards, deckScreenState.cardTypesMap);
    deckScreenState.groups = groups;

    const sortedGroups = sortGroups(groups);

    sortedGroups.forEach(([typeId, group]) => {
        const slot = createCollectionSlot(typeId, group);
        grid.appendChild(slot);
    });
}

/**
 * Инициализация экрана колоды
 */
async function initDeckScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    const loadingError = document.getElementById('loadingError');
    const loadingText = document.getElementById('loadingText');

    try {
        console.log('DeckScreen: Начинаю инициализацию...');

        // Ждём готовности контроллера хранилища
        if (window.userCards?.whenReady) {
            await window.userCards.whenReady();
        }

        // Инициализируем рендерер карт и БД параллельно
        const [db] = await Promise.all([
            initDeckDatabase(),
            window.cardRenderer.init()
        ]);

        deckScreenState.db = db;

        // Загружаем справочники из БД
        deckScreenState.cardTypesMap = loadCardTypesFromDb(db);
        deckScreenState.cardGroups = loadCardGroupsFromDb(db);

        // Получаем данные пользователя
        const userData = await window.userCards.getUserData();
        deckScreenState.userData = userData;

        // Рендерим
        renderDeckScreen(userData);

        // Привязываем обработчики
        setupDeckEventHandlers();

        // На Одноклассниках возвращаемся в полноэкранный режим при входе на экран колоды
        // (после выхода из магазина, где fullscreen был отключён для стабильной рекламы).
        if (window.userCards.isRunningInOK()) {
            console.log('DeckScreen: Платформа OK — возврат в полноэкранный режим.');
            window.userCards?.requestFullscreen();
        }

        console.log('DeckScreen: Инициализация завершена.');

        if (loadingScreen) {
            // Ждем два кадра, чтобы браузер успел отрисовать изменения в DOM
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    loadingScreen.classList.add('hidden');
                });
            });
        }
    } catch (error) {
        console.error('DeckScreen: Ошибка инициализации:', error);

        if (loadingError) {
            loadingError.textContent = 'Ошибка загрузки: ' + (error?.message || 'Неизвестная ошибка');
            loadingError.classList.add('visible');
        }
        if (loadingText) loadingText.style.display = 'none';

        const spinner = loadingScreen?.querySelector('.loading-spinner');
        if (spinner) spinner.style.display = 'none';

        const grid = document.getElementById('deckCollectionGrid');
        if (grid) {
            grid.innerHTML = '<p class="error">Не удалось загрузить коллекцию карт.</p>';
        }
    }
}

/**
 * Привязка обработчиков событий
 */
function setupDeckEventHandlers() {
    // Кнопка «Назад»
    const backBtn = document.getElementById('deckBackBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }

    // Кнопка «Получить ещё карты»
    const shopBtn = document.getElementById('deckShopBtn');
    if (shopBtn) {
        shopBtn.addEventListener('click', () => {
            window.location.href = 'shop.html';
        });
    }

    // Кнопка «Уровень коллекционера»
    const collectorBtn = document.getElementById('deckCollectorBtn');
    if (collectorBtn) {
        collectorBtn.addEventListener('click', () => {
            window.location.href = 'collector.html';
        });
    }

    // Кнопка «Назад» из списка экземпляров
    const instancesBackBtn = document.getElementById('instancesBackBtn');
    if (instancesBackBtn) {
        instancesBackBtn.addEventListener('click', hideInstances);
    }

    // Клик по оверлею экземпляров (вне панели) — закрыть
    const instancesOverlay = document.getElementById('deckInstancesOverlay');
    if (instancesOverlay) {
        instancesOverlay.addEventListener('click', (e) => {
            if (e.target === instancesOverlay) {
                hideInstances();
            }
        });
    }

    // Кнопка «Закрыть» модальное окно
    const detailCloseBtn = document.getElementById('detailCloseBtn');
    if (detailCloseBtn) {
        detailCloseBtn.addEventListener('click', hideCardDetail);
    }

    // Клик по фону модального окна — закрыть
    const detailModal = document.getElementById('deckDetailModal');
    if (detailModal) {
        detailModal.addEventListener('click', (e) => {
            if (e.target === detailModal) {
                hideCardDetail();
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', initDeckScreen);
