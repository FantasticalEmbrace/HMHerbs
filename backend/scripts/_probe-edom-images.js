const axios = require('axios');
const urls = [
    'https://edomlaboratories.com/products/chiro-klenz%C2%AE-colon-tea-regular',
    'https://edomlaboratories.com/products/chiro-klenz%C2%AE-colon-tea-cinnamon',
    'https://edomlaboratories.com/products/chiro-klenz%C2%AE-colon-tea-lemon',
    'https://edomlaboratories.com/products/chiro-klenz%C2%AE-green-tea'
];
(async () => {
    for (const u of urls) {
        const r = await axios.get(u, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' },
            timeout: 30000,
            validateStatus: (s) => s < 500
        });
        const h = r.data;
        const og = h.match(/property="og:image"\s+content="([^"]+)"/);
        console.log('\nURL:', u, 'status', r.status);
        console.log('og:image:', og ? og[1] : '(none)');
    }
})().catch((e) => console.error(e));
