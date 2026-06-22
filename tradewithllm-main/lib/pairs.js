export const PAIRS = {
  // Crypto
  'BTC/USDT': { base: 65000, dec: 1, cat: 'Crypto', vol: '2.14B', oi: '18.4B', liq: '24.1M' },
  'ETH/USDT': { base: 3200,  dec: 2, cat: 'Crypto', vol: '980M',  oi: '8.2B',  liq: '9.4M'  },
  'SOL/USDT': { base: 160,   dec: 3, cat: 'Crypto', vol: '420M',  oi: '2.1B',  liq: '3.2M'  },
  'BNB/USDT': { base: 580,   dec: 2, cat: 'Crypto', vol: '310M',  oi: '820M',  liq: '1.1M'  },
  'XRP/USDT': { base: 0.55,  dec: 4, cat: 'Crypto', vol: '680M',  oi: '1.5B',  liq: '2.1M'  },
  'AVAX/USDT':{ base: 34,    dec: 3, cat: 'L1',     vol: '180M',  oi: '710M',  liq: '960K'  },
  'LINK/USDT':{ base: 16,    dec: 3, cat: 'DeFi',   vol: '140M',  oi: '560M',  liq: '890K'  },
  'ARB/USDT': { base: 1.0,   dec: 4, cat: 'L2',     vol: '88M',   oi: '340M',  liq: '420K'  },
  'OP/USDT':  { base: 2.5,   dec: 3, cat: 'L2',     vol: '95M',   oi: '190M',  liq: '280K'  },
  'MATIC/USDT':{ base: 0.8,  dec: 4, cat: 'L2',     vol: '210M',  oi: '280M',  liq: '310K'  },
  'DOGE/USDT':{ base: 0.15,  dec: 4, cat: 'Meme',   vol: '520M',  oi: '1.2B',  liq: '1.8M'  },
  'INJ/USDT': { base: 24,    dec: 3, cat: 'DeFi',   vol: '120M',  oi: '310M',  liq: '440K'  },
  // Forex
  'EUR/USD':  { base: 1.07,  dec: 5, cat: 'Forex',  vol: '--', oi: '--', liq: '--' },
  'GBP/USD':  { base: 1.24,  dec: 5, cat: 'Forex',  vol: '--', oi: '--', liq: '--' },
  'USD/JPY':  { base: 148,   dec: 3, cat: 'Forex',  vol: '--', oi: '--', liq: '--' },
  'AUD/USD':  { base: 0.63,  dec: 5, cat: 'Forex',  vol: '--', oi: '--', liq: '--' },
  'USD/CHF':  { base: 0.88,  dec: 5, cat: 'Forex',  vol: '--', oi: '--', liq: '--' },
  'NZD/USD':  { base: 0.58,  dec: 5, cat: 'Forex',  vol: '--', oi: '--', liq: '--' },
  'USD/CAD':  { base: 1.33,  dec: 5, cat: 'Forex',  vol: '--', oi: '--', liq: '--' },
  'EUR/GBP':  { base: 0.84,  dec: 5, cat: 'Forex',  vol: '--', oi: '--', liq: '--' },
  'EUR/JPY':  { base: 160,   dec: 3, cat: 'Forex',  vol: '--', oi: '--', liq: '--' },
  // Commodities
  'XAU/USD':  { base: 2200,  dec: 2, cat: 'Commodity', vol: '--', oi: '--', liq: '--' },
  'XAG/USD':  { base: 25,    dec: 3, cat: 'Commodity', vol: '--', oi: '--', liq: '--' },
  'OIL/USD':  { base: 78,    dec: 2, cat: 'Commodity', vol: '--', oi: '--', liq: '--' },
  'GAS/USD':  { base: 2.0,   dec: 3, cat: 'Commodity', vol: '--', oi: '--', liq: '--' },
};

export const TOP_TABS = ['BTC/USDT', 'ETH/USDT', 'XAU/USD', 'EUR/USD', 'GBP/USD', 'SOL/USDT'];
export const CATEGORIES = ['Crypto', 'L1', 'L2', 'DeFi', 'Meme', 'Forex', 'Commodity'];
