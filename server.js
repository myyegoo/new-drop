const express = require('express');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => res.redirect('/cases.html'));

const MIN_CHANCE = 1;
const MAX_CHANCE = 95;
const HOUSE_FACTOR = 1; // 0.95 = сайт оставляет себе 5%

if (!fs.existsSync('skins.json')) {
    console.error('Нет файла skins.json. Сначала выполните: node update-skins.js');
    process.exit(1);
}

// каталог: id скина = его номер в списке (список отсортирован по цене)
const allSkins = JSON.parse(fs.readFileSync('skins.json', 'utf8'))
    .map((s, i) => ({ id: i, ...s }));

/* ---------- демо-инвентарь (один на всех, хранится в памяти) ---------- */

let inventory = [];
let nextItemId = 1;

function giveSkin(skin) {
    inventory.push({ itemId: nextItemId++, ...skin });
}

function makeDemoInventory() {
    const from = Math.floor(allSkins.length * 0.2);
    const to = Math.floor(allSkins.length * 0.5);
    for (let i = 0; i < 12; i++) {
        giveSkin(allSkins[crypto.randomInt(from, to)]);
    }
}
makeDemoInventory();

/* ---------- вспомогательные функции ---------- */

function calcChance(stake, targetPrice) {
    return Math.round((stake / targetPrice) * 100 * HOUSE_FACTOR * 100) / 100;
}

// находит скины в инвентаре по номерам; если что-то не так, возвращает null
function itemsFromIds(ids) {
    const unique = [...new Set(ids.map(Number))];
    const items = unique.map(id => inventory.find(i => i.itemId === id));
    if (!items.length || items.length > 10 || items.some(i => !i)) return null;
    return items;
}

/* ---------- API ---------- */

app.get('/api/inventory', (req, res) => {
    res.json(inventory);
});

// цели, доступные для выбранной ставки
app.get('/api/targets', (req, res) => {
    const items = itemsFromIds(String(req.query.items || '').split(','));
    if (!items) return res.status(400).json({ error: 'Неверные скины' });

    const stake = items.reduce((sum, i) => sum + i.price, 0);
    const mult = Number(req.query.mult) || 0;
    const pct = Number(req.query.chance) || 0;

    // цена цели, при которой шанс попадает в диапазон от MIN_CHANCE до MAX_CHANCE
    let min = (stake * HOUSE_FACTOR * 100) / MAX_CHANCE;
    let max = (stake * HOUSE_FACTOR * 100) / MIN_CHANCE;

    // множитель сужает диапазон до цен около ставка × множитель
    if (mult > 0) {
        min = Math.max(min, stake * mult * 0.85);
        max = Math.min(max, stake * mult * 1.15);
    }

    // быстрый подбор по проценту: цены около той, что даёт нужный шанс
    if (pct > 0) {
        const center = (stake * HOUSE_FACTOR * 100) / pct;
        min = Math.max(min, center * 0.9);
        max = Math.min(max, center * 1.1);
    }

    const list = allSkins
        .filter(s => s.price >= min && s.price <= max)
        .slice(0, 60)
        .map(s => ({ ...s, chance: calcChance(stake, s.price) }));

    res.json(list);
});

// улучшение: результат решает сервер
app.post('/api/upgrade', (req, res) => {
    const { itemIds, targetId } = req.body;

    if (!Array.isArray(itemIds)) {
        return res.status(400).json({ error: 'Неверный запрос' });
    }
    const items = itemsFromIds(itemIds);
    const target = allSkins[Number(targetId)];

    if (!items || !target) {
        return res.status(400).json({ error: 'Неверные скины' });
    }

    const stake = items.reduce((sum, i) => sum + i.price, 0);
    const chance = calcChance(stake, target.price);

    if (chance < MIN_CHANCE || chance > MAX_CHANCE) {
        return res.status(400).json({ error: 'Шанс вне допустимого диапазона' });
    }

    const win = crypto.randomInt(0, 10000) < Math.round(chance * 100);

    // угол остановки стрелки (0° сверху, по часовой стрелке).
    // Заливка стоит по центру снизу (180°), оставшаяся дуга сверху.
    const width = chance * 3.6; // ширина заливки в градусах
    const half = width / 2;
    const margin = Math.min(1, width / 4, (360 - width) / 4);
    let angle;
    if (win) {
        // внутрь заливки
        angle = 180 + (Math.random() * 2 - 1) * (half - margin);
    } else {
        // вне заливки: в дугу сверху, симметрично вокруг 0°
        const free = 180 - half;
        angle = (Math.random() * 2 - 1) * (free - margin);
        angle = (angle + 360) % 360;
    }

    // списываем ставку, при победе выдаём цель
    inventory = inventory.filter(i => !items.includes(i));
    if (win) giveSkin(target);
    if (inventory.length === 0) makeDemoInventory();

    res.json({
        win,
        angle,
        chance,
        target: { name: target.name, image: target.image, price: target.price, rarity: target.rarity },
        inventory
    });
});

app.listen(3000, () => console.log('Сайт: http://localhost:3000'));