/**
 * Shop Screen Controller for Technomaster
 * Экран «Магазин» — приобретение наборов карт (блистеров)
 */

const SHOP_DB_PATH = 'public/data/cards.db';

/**
 * Типы транзакций на основе blister_price
 */
const TRANSACTION_TYPE = {
    INTERSTITIAL: 'interstitial',
    REWARDED: 'rewarded',
    PURCHASE: 'purchase'
};

/**
 * Состояние экрана магазина
 */
const shopScreenState = {
    db: null,
    blisters: [],
    payments: null,
    selectedBlister: null
};

/**
 * Определяет тип транзакции по цене блистера
 * @param {number} price
 * @returns {string}
 */
function getTransactionType(price) {
    if (price === -1) return TRANSACTION_TYPE.INTERSTITIAL;
    if (price === 0) return TRANSACTION_TYPE.REWARDED;
    return TRANSACTION_TYPE.PURCHASE;
}

/**
 * Проверяет, активна ли скидка для блистера на текущий момент
 * @param {object} blister
 * @returns {boolean}
 */
function isDiscountActive(blister) {
    if (!blister.discount || !blister.discount_start || !blister.discount_finish) return false;
    const parseRuDate = function(s) {
        var parts = s.split('.');
        return new Date(parts[2], parts[1] - 1, parts[0]);
    };
    var now = new Date();
    return parseRuDate(blister.discount_start) <= now && now < parseRuDate(blister.discount_finish);
}

/**
 * Возвращает HTML-содержимое кнопки цены
 * @param {number} price
 * @returns {string}
 */
function getPriceLabel(price) {
    const type = getTransactionType(price);
    if (type === TRANSACTION_TYPE.INTERSTITIAL) return 'Бесплатно';
    if (type === TRANSACTION_TYPE.REWARDED) return 'За видео';
    return price + ' <span class="shop-currency-symbol" aria-label="рублей">₽</span>';
}

/**
 * Возвращает CSS-класс кнопки цены
 * @param {number} price
 * @returns {string}
 */
function getPriceBtnClass(price) {
    const type = getTransactionType(price);
    if (type === TRANSACTION_TYPE.INTERSTITIAL) return 'shop-price-btn--free';
    if (type === TRANSACTION_TYPE.REWARDED) return 'shop-price-btn--video';
    return 'shop-price-btn--purchase';
}

/**
 * Возвращает HTML-содержимое CTA-кнопки для модального окна
 * @param {number} price
 * @returns {string}
 */
function getCtaLabel(price) {
    const type = getTransactionType(price);
    if (type === TRANSACTION_TYPE.INTERSTITIAL) return 'Смотреть рекламу';
    if (type === TRANSACTION_TYPE.REWARDED) return 'Смотреть видео';
    return 'Купить за ' + price + ' <span class="shop-currency-symbol" aria-label="рублей">₽</span>';
}

// ========================================
// Data Layer
// ========================================

/**
 * Инициализация базы данных
 * @returns {Promise<object>}
 */
async function initShopDatabase() {
    const SQL = await SqlLoader.init();

    const response = await fetch(SHOP_DB_PATH);
    const buffer = await response.arrayBuffer();
    const db = new SQL.Database(new Uint8Array(buffer));

    // Добавляем колонки скидки, если их ещё нет
    ['discount', 'discount_start', 'discount_finish'].forEach(function(col) {
        try { db.run('ALTER TABLE deck_rules ADD COLUMN ' + col + ' TEXT'); } catch (_) {}
    });

    return db;
}

/**
 * Загрузка блистеров из БД
 * @param {object} db
 * @returns {Array}
 */
function loadBlistersFromDb(db) {
    try {
        const result = db.exec(
            "SELECT * FROM deck_rules WHERE blister_name IS NOT NULL AND blister_name != '' ORDER BY blister_price ASC"
        );

        if (result.length === 0) return [];

        const columns = result[0].columns;
        return result[0].values.map(row => {
            const obj = {};
            columns.forEach((col, i) => {
                obj[col] = row[i];
            });
            return obj;
        });
    } catch (error) {
        console.error('ShopScreen: Ошибка загрузки блистеров:', error);
        return [];
    }
}

// ========================================
// UI Rendering
// ========================================

/**
 * Создание DOM-элемента карточки блистера
 * @param {object} blister
 * @returns {HTMLElement}
 */
function createBlisterCard(blister) {
    const card = document.createElement('div');
    card.className = 'shop-blister-card';
    card.dataset.id = blister.id;

    // Изображение блистера
    const imgWrap = document.createElement('div');
    imgWrap.className = 'shop-blister-image-wrap';

    const img = document.createElement('img');
    img.className = 'shop-blister-image';
    img.src = 'public/img/blisters/' + blister.blister_image;
    img.alt = blister.blister_name;
    imgWrap.appendChild(img);

    if (isDiscountActive(blister)) {
        const badge = document.createElement('div');
        badge.className = 'shop-discount-badge';
        badge.textContent = '-' + blister.discount + '%';
        imgWrap.appendChild(badge);
    }

    card.appendChild(imgWrap);

    // Название
    const name = document.createElement('div');
    name.className = 'shop-blister-name';
    name.textContent = blister.blister_name;
    card.appendChild(name);

    // Количество карт
    const cardCount = document.createElement('div');
    cardCount.className = 'shop-blister-count';
    cardCount.textContent = blister.deck_size + ' карт';
    card.appendChild(cardCount);

    // Кнопка цены
    const priceBtn = document.createElement('button');
    priceBtn.className = 'shop-price-btn ' + getPriceBtnClass(blister.blister_price);
    priceBtn.type = 'button';

    if (isDiscountActive(blister)) {
        var newPrice = Math.floor(blister.blister_price * (1 - blister.discount / 100));
        priceBtn.innerHTML =
            newPrice + ' <span class="shop-currency-symbol" aria-label="рублей">₽</span>' +
            ' <span class="shop-price-old">' + blister.blister_price + ' ₽</span>';
    } else {
        priceBtn.innerHTML = getPriceLabel(blister.blister_price);
    }

    card.appendChild(priceBtn);

    // Клик открывает модальное окно
    card.addEventListener('click', () => {
        openProductModal(blister);
    });

    return card;
}

/**
 * Отрисовка сетки блистеров
 * @param {Array} blisters
 */
function renderShopGrid(blisters) {
    const grid = document.getElementById('shopGrid');
    if (!grid) return;

    grid.innerHTML = '';

    if (blisters.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-message';
        empty.textContent = 'Нет доступных товаров.';
        grid.appendChild(empty);
        return;
    }

    blisters.forEach(blister => {
        const card = createBlisterCard(blister);
        grid.appendChild(card);
    });
}

// ========================================
// Product Modal
// ========================================

/**
 * Открытие модального окна товара
 * @param {object} blister
 */
function openProductModal(blister) {
    shopScreenState.selectedBlister = blister;

    const modal = document.getElementById('shopProductModal');
    const imageWrap = document.getElementById('productImageWrap');
    const nameEl = document.getElementById('productName');
    const marketingEl = document.getElementById('productMarketing');
    const techEl = document.getElementById('productTech');
    const ctaBtn = document.getElementById('productCtaBtn');
    const spinner = document.getElementById('shopSpinner');

    // Изображение
    imageWrap.innerHTML = '';
    const img = document.createElement('img');
    img.className = 'shop-product-image';
    img.src = 'public/img/blisters/' + blister.blister_image;
    img.alt = blister.blister_name;
    imageWrap.appendChild(img);

    var discountActive = isDiscountActive(blister);
    if (discountActive) {
        var modalBadge = document.createElement('div');
        modalBadge.className = 'shop-discount-badge shop-discount-badge--modal';
        modalBadge.textContent = '-' + blister.discount + '%';
        imageWrap.appendChild(modalBadge);
    }

    // Текстовые данные
    nameEl.textContent = blister.blister_name;
    marketingEl.textContent = blister.blister_description || '';
    var techParts = [];
    techParts.push(blister.deck_size + ' карт');
    if (blister.description) techParts.push(blister.description);
    techEl.textContent = techParts.join(' \u2022 ');

    // CTA
    var effectivePrice = discountActive
        ? Math.floor(blister.blister_price * (1 - blister.discount / 100))
        : blister.blister_price;
    ctaBtn.innerHTML = getCtaLabel(effectivePrice);
    ctaBtn.className = 'shop-product-cta ' + getPriceBtnClass(blister.blister_price);
    ctaBtn.disabled = false;

    // Скрыть спиннер
    spinner.classList.add('hidden');

    modal.classList.remove('hidden');
}

/**
 * Закрытие модального окна товара
 */
function closeProductModal() {
    const modal = document.getElementById('shopProductModal');
    modal.classList.add('hidden');
    shopScreenState.selectedBlister = null;
}

/**
 * Показать/скрыть спиннер загрузки в модальном окне
 * @param {boolean} show
 */
function setModalLoading(show) {
    const spinner = document.getElementById('shopSpinner');
    const ctaBtn = document.getElementById('productCtaBtn');

    if (show) {
        spinner.classList.remove('hidden');
        ctaBtn.disabled = true;
    } else {
        spinner.classList.add('hidden');
        ctaBtn.disabled = false;
    }
}

// ========================================
// Transaction Logic
// ========================================

/**
 * Обработка нажатия CTA-кнопки
 */
function handleCtaClick() {
    const blister = shopScreenState.selectedBlister;
    if (!blister) return;

    const type = getTransactionType(blister.blister_price);

    if (type === TRANSACTION_TYPE.INTERSTITIAL) {
        handleInterstitialAd(blister);
    } else if (type === TRANSACTION_TYPE.REWARDED) {
        handleRewardedVideo(blister);
    } else {
        handlePurchase(blister);
    }
}

/**
 * Сценарий: Полноэкранная реклама (price == -1)
 * @param {object} blister
 */
function handleInterstitialAd(blister) {
    const ysdk = window.userCards.getCachedYsdk();

    if (!ysdk) {
        // Не на Яндекс Играх — выдаём сразу
        console.log('ShopScreen: SDK недоступен, выдаём блистер без рекламы.');
        processBlisterPurchase(blister);
        return;
    }

    setModalLoading(true);

    ysdk.adv.showFullscreenAdv({
        callbacks: {
            onClose: function(wasShown) {
                setModalLoading(false);
                processBlisterPurchase(blister);
            },
            onError: function(error) {
                setModalLoading(false);
                console.error('ShopScreen: Ошибка рекламы:', error);
                alert('Не удалось загрузить рекламу. Попробуйте позже.');
            }
        }
    });
}

/**
 * Сценарий: Видео за вознаграждение (price == 0)
 * @param {object} blister
 */
function handleRewardedVideo(blister) {
    const ysdk = window.userCards.getCachedYsdk();

    if (!ysdk) {
        // Не на Яндекс Играх — выдаём сразу
        console.log('ShopScreen: SDK недоступен, выдаём блистер без видео.');
        processBlisterPurchase(blister);
        return;
    }

    setModalLoading(true);
    var isRewardEarned = false;

    ysdk.adv.showRewardedVideo({
        callbacks: {
            onOpen: function() {
                // Приостановить звуки (если есть)
            },
            onRewarded: function() {
                isRewardEarned = true;
            },
            onClose: function() {
                setModalLoading(false);
                if (isRewardEarned) {
                    processBlisterPurchase(blister);
                }
            },
            onError: function(error) {
                setModalLoading(false);
                console.error('ShopScreen: Ошибка видео:', error);
                alert('Не удалось загрузить видео. Попробуйте позже.');
            }
        }
    });
}

/**
 * Сценарий: Инап-покупка (price > 0)
 * @param {object} blister
 */
async function handlePurchase(blister) {
    const payments = shopScreenState.payments;

    if (!payments) {
        console.warn('ShopScreen: Покупки недоступны.');
        alert('Покупки недоступны в данном окружении.');
        return;
    }

    setModalLoading(true);

    try {
        var productId = 'blister_' + blister.id + (isDiscountActive(blister) ? '_discount' : '');
        var purchase = await payments.purchase({ id: productId });

        // Покупка совершена — consumируем
        try {
            await payments.consumePurchase(purchase.purchaseToken);
            setModalLoading(false);
            processBlisterPurchase(blister);
        } catch (consumeErr) {
            setModalLoading(false);
            console.error('ShopScreen: Ошибка consume:', consumeErr);
            alert('Покупка прошла, но произошла ошибка обработки. Товар будет выдан при следующем запуске.');
        }
    } catch (err) {
        setModalLoading(false);
        console.log('ShopScreen: Покупка отменена или ошибка:', err);
    }
}

/**
 * Проверка необработанных покупок при старте
 */
async function checkPendingPurchases() {
    const payments = shopScreenState.payments;
    if (!payments) return;

    try {
        var purchases = await payments.getPurchases();
        if (!purchases || purchases.length === 0) return;

        for (var i = 0; i < purchases.length; i++) {
            var p = purchases[i];
            if (p.productID && p.productID.startsWith('blister_')) {
                var deckRuleId = parseInt(p.productID.replace('blister_', ''), 10);
                if (isNaN(deckRuleId)) continue;

                // Найти блистер по id
                var blister = shopScreenState.blisters.find(function(b) { return b.id === deckRuleId; });
                if (!blister) continue;

                try {
                    await payments.consumePurchase(p.purchaseToken);
                    console.log('ShopScreen: Обработана зависшая покупка:', p.productID);
                    await generateAndSaveBlister(blister);
                } catch (consumeErr) {
                    console.error('ShopScreen: Ошибка consume зависшей покупки:', consumeErr);
                }
            }
        }
    } catch (err) {
        console.error('ShopScreen: Ошибка проверки зависших покупок:', err);
    }
}

// ========================================
// Blister Purchase Stub Logic
// ========================================

/**
 * Обработка успешного получения блистера
 * @param {object} blister
 */
async function processBlisterPurchase(blister) {
    closeProductModal();
    await generateAndSaveBlister(blister);
}

/**
 * Генерация карт из блистера и сохранение в userData
 * @param {object} blister
 */
async function generateAndSaveBlister(blister) {
    try {
        // Инициализируем рендерер если нужно
        await window.cardRenderer.init();

        // Генерируем колоду по правилам блистера
        var deckParams = {
            deck_size: blister.deck_size,
            level_min: blister.level_min,
            level_max: blister.level_max,
            group_1_weight: blister.group_1_weight,
            group_2_weight: blister.group_2_weight,
            group_3_weight: blister.group_3_weight,
            group_4_weight: blister.group_4_weight
        };

        var generatedCards = window.cardRenderer.generateDeck(deckParams);

        // Получаем userData
        var userData = await window.userCards.getUserData();
        if (!userData) {
            userData = window.userCards.createInitialUserDataStructure();
        }

        // Находим cardholder игрока
        var playerCardholder = userData.cardholders.find(function(ch) { return ch.player === true; });
        if (!playerCardholder) {
            playerCardholder = { id: 1, player: true, opponent_id: null };
            userData.cardholders.push(playerCardholder);
        }

        // Генерируем ID для новых карт
        var maxCardId = userData.cards.reduce(function(max, card) {
            return Math.max(max, card.id || 0);
        }, 0);

        var newCards = generatedCards.map(function(generated) {
            maxCardId++;
            var rp = generated.renderParams;
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

        // Показываем результат
        showReceivedCards(newCards, blister.blister_name);

        console.log('ShopScreen: Выдано ' + newCards.length + ' карт из блистера "' + blister.blister_name + '"');
    } catch (error) {
        console.error('ShopScreen: Ошибка генерации блистера:', error);
        alert('Произошла ошибка при открытии набора. Попробуйте ещё раз.');
    }
}

/**
 * Показывает экран полученных карт
 * @param {Array} cards
 * @param {string} blisterName
 */
function showReceivedCards(cards, blisterName) {
    // Создаём оверлей с полученными картами
    var overlay = document.createElement('div');
    overlay.className = 'shop-received-overlay';

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

    // Клик по фону закрывает
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            overlay.remove();
        }
    });

    document.querySelector('.shop-screen-frame').appendChild(overlay);
}

// ========================================
// Initialization
// ========================================

/**
 * Инициализация экрана магазина
 */
async function initShopScreen() {
    try {
        console.log('ShopScreen: Начинаю инициализацию...');

        // Ждём готовности контроллера хранилища
        if (window.userCards && window.userCards.whenReady) {
            await window.userCards.whenReady();
        }

        // Инициализируем рендерер карт и БД параллельно
        var results = await Promise.all([
            initShopDatabase(),
            window.cardRenderer.init()
        ]);

        var db = results[0];
        shopScreenState.db = db;

        // Загружаем блистеры из БД
        shopScreenState.blisters = loadBlistersFromDb(db);

        // Инициализируем покупки (если на Яндексе)
        await initPayments();

        // Проверяем зависшие покупки
        await checkPendingPurchases();

        // Рендерим сетку
        renderShopGrid(shopScreenState.blisters);

        // Привязываем обработчики
        setupShopEventHandlers();

        console.log('ShopScreen: Инициализация завершена. Блистеров: ' + shopScreenState.blisters.length);
    } catch (error) {
        console.error('ShopScreen: Ошибка инициализации:', error);
        var grid = document.getElementById('shopGrid');
        if (grid) {
            grid.innerHTML = '<p class="error">Не удалось загрузить магазин.</p>';
        }
    }
}

/**
 * Инициализация системы покупок
 */
async function initPayments() {
    var ysdk = window.userCards.getCachedYsdk();
    if (!ysdk) {
        console.log('ShopScreen: SDK недоступен, покупки отключены.');
        return;
    }

    try {
        shopScreenState.payments = await ysdk.getPayments({ signed: false });
        console.log('ShopScreen: Система покупок инициализирована.');
    } catch (err) {
        console.warn('ShopScreen: Не удалось инициализировать покупки:', err);
        shopScreenState.payments = null;
    }
}

/**
 * Привязка обработчиков событий
 */
function setupShopEventHandlers() {
    // Кнопка «Назад»
    var backBtn = document.getElementById('shopBackBtn');
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            window.location.href = 'deck.html';
        });
    }

    // Кнопка «Закрыть» модальное окно
    var closeBtn = document.getElementById('productCloseBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeProductModal);
    }

    // Клик по фону модального окна — закрыть
    var modal = document.getElementById('shopProductModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeProductModal();
            }
        });
    }

    // CTA кнопка
    var ctaBtn = document.getElementById('productCtaBtn');
    if (ctaBtn) {
        ctaBtn.addEventListener('click', handleCtaClick);
    }
}

document.addEventListener('DOMContentLoaded', initShopScreen);
