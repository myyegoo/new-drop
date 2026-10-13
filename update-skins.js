const fs = require('fs');

const CURRENCY = 'RUB';

async function main() {
    const [skinsRes, pricesRes] = await Promise.all([
        fetch('https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins_not_grouped.json'),
        fetch(`https://api.skinport.com/v1/items?app_id=730&currency=${CURRENCY}&tradable=true`, {
            headers: { 'Accept-Encoding': 'br' } // Skinport требует Brotli
        })
    ]);

    if (!skinsRes.ok || !pricesRes.ok) {
        throw new Error(`Ошибка загрузки: ${skinsRes.status} / ${pricesRes.status}`);
    }

    const skins = await skinsRes.json();
    const prices = await pricesRes.json();

    const priceMap = new Map();
    for (const item of prices) {
        if (item.min_price) priceMap.set(item.market_hash_name, item.min_price);
    }

    const result = skins
        .filter(s => s.market_hash_name && priceMap.has(s.market_hash_name))
        .map(s => ({
            name: s.market_hash_name,
            image: s.image,
            rarity: s.rarity?.name,
            price: priceMap.get(s.market_hash_name)
        }))
        .sort((a, b) => a.price - b.price);

    fs.writeFileSync('skins.json', JSON.stringify(result));
    console.log(`Сохранено скинов: ${result.length}`);
}

main().catch(console.error);