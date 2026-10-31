const EventEmitter = require('events');
const logger = require('../config/logger');

class StockStreamService extends EventEmitter {
  constructor() {
    super();

    // 10 Core US Equities & Benchmark ETFs
    this.tickers = {
      'AAPL/USD': {
        pair: 'AAPL/USD',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        market: 'NASDAQ',
        price: 234.80,
        change24h: 1.45,
        high24h: 236.40,
        low24h: 232.10,
        volume24h: 48920000,
        marketCap: '3.58T',
        peRatio: 34.2,
        timestamp: Date.now()
      },
      'TSLA/USD': {
        pair: 'TSLA/USD',
        symbol: 'TSLA',
        name: 'Tesla Inc.',
        market: 'NASDAQ',
        price: 218.40,
        change24h: 3.82,
        high24h: 222.50,
        low24h: 212.80,
        volume24h: 76500000,
        marketCap: '698B',
        peRatio: 62.4,
        timestamp: Date.now()
      },
      'NVDA/USD': {
        pair: 'NVDA/USD',
        symbol: 'NVDA',
        name: 'NVIDIA Corporation',
        market: 'NASDAQ',
        price: 139.60,
        change24h: 2.75,
        high24h: 141.20,
        low24h: 136.90,
        volume24h: 62400000,
        marketCap: '3.42T',
        peRatio: 58.1,
        timestamp: Date.now()
      },
      'MSFT/USD': {
        pair: 'MSFT/USD',
        symbol: 'MSFT',
        name: 'Microsoft Corporation',
        market: 'NASDAQ',
        price: 428.30,
        change24h: 0.95,
        high24h: 431.10,
        low24h: 425.60,
        volume24h: 19800000,
        marketCap: '3.18T',
        peRatio: 36.8,
        timestamp: Date.now()
      },
      'AMZN/USD': {
        pair: 'AMZN/USD',
        symbol: 'AMZN',
        name: 'Amazon.com Inc.',
        market: 'NASDAQ',
        price: 187.20,
        change24h: 1.80,
        high24h: 189.40,
        low24h: 184.90,
        volume24h: 34200000,
        marketCap: '1.96T',
        peRatio: 44.2,
        timestamp: Date.now()
      },
      'GOOGL/USD': {
        pair: 'GOOGL/USD',
        symbol: 'GOOGL',
        name: 'Alphabet Inc. (Google)',
        market: 'NASDAQ',
        price: 165.75,
        change24h: -0.45,
        high24h: 167.30,
        low24h: 164.20,
        volume24h: 22400000,
        marketCap: '2.05T',
        peRatio: 23.9,
        timestamp: Date.now()
      },
      'META/USD': {
        pair: 'META/USD',
        symbol: 'META',
        name: 'Meta Platforms Inc.',
        market: 'NASDAQ',
        price: 586.40,
        change24h: 2.15,
        high24h: 591.20,
        low24h: 580.10,
        volume24h: 14800000,
        marketCap: '1.48T',
        peRatio: 28.6,
        timestamp: Date.now()
      },
      'SPY/USD': {
        pair: 'SPY/USD',
        symbol: 'SPY',
        name: 'SPDR S&P 500 ETF Trust',
        market: 'NYSE Arca',
        price: 582.60,
        change24h: 0.72,
        high24h: 584.20,
        low24h: 579.80,
        volume24h: 58900000,
        marketCap: '580B',
        peRatio: 27.5,
        timestamp: Date.now()
      },
      'QQQ/USD': {
        pair: 'QQQ/USD',
        symbol: 'QQQ',
        name: 'Invesco QQQ Trust (Nasdaq 100)',
        market: 'NASDAQ',
        price: 493.50,
        change24h: 1.35,
        high24h: 496.10,
        low24h: 489.20,
        volume24h: 38200000,
        marketCap: '290B',
        peRatio: 31.2,
        timestamp: Date.now()
      },
      'AMD/USD': {
        pair: 'AMD/USD',
        symbol: 'AMD',
        name: 'Advanced Micro Devices Inc.',
        market: 'NASDAQ',
        price: 156.90,
        change24h: -1.15,
        high24h: 160.40,
        low24h: 154.80,
        volume24h: 41200000,
        marketCap: '254B',
        peRatio: 112.5,
        timestamp: Date.now()
      }
    };

    this.candleHistory = {};
    this.initHistoricalCandles();
  }

  initHistoricalCandles() {
    for (const [pair, ticker] of Object.entries(this.tickers)) {
      this.candleHistory[pair] = this.generateCandleSeries(ticker.price, 120);
    }
  }

  generateCandleSeries(basePrice, count) {
    const candles = [];
    let current = basePrice * 0.94;
    const now = Math.floor(Date.now() / 1000);
    const intervalSeconds = 300; // 5-minute candles

    for (let i = count; i >= 0; i--) {
      const time = now - i * intervalSeconds;
      const volatility = current * 0.005; // realistic stock volatility
      const open = current;
      const change = (Math.random() - 0.48) * volatility;
      const close = Math.max(1.0, open + change);
      const high = Math.max(open, close) + Math.random() * (volatility * 0.4);
      const low = Math.min(open, close) - Math.random() * (volatility * 0.4);
      const volume = Math.floor(Math.random() * 4000 + 800);

      candles.push({
        time,
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume
      });
      current = close;
    }
    return candles;
  }

  start() {
    logger.info('[StockStream] Initialized Wall Street Stock Equities Stream (10 Equities & ETFs)');
    setInterval(() => this.simulateMicroTick(), 2000);
  }

  simulateMicroTick() {
    for (const [pair, ticker] of Object.entries(this.tickers)) {
      // Stock micro-drift: +/- 0.03%
      const drift = (Math.random() - 0.49) * 0.0006 * ticker.price;
      const newPrice = Math.max(0.50, parseFloat((ticker.price + drift).toFixed(2)));
      ticker.price = newPrice;
      ticker.timestamp = Date.now();

      if (newPrice > ticker.high24h) ticker.high24h = newPrice;
      if (newPrice < ticker.low24h) ticker.low24h = newPrice;

      this.updateLatestCandle(pair, newPrice);
      this.emit('ticker', ticker);
    }
  }

  updateLatestCandle(pair, currentPrice) {
    if (!this.candleHistory[pair]) {
      this.candleHistory[pair] = this.generateCandleSeries(currentPrice, 100);
    }

    const series = this.candleHistory[pair];
    const nowSec = Math.floor(Date.now() / 1000);
    const lastCandle = series[series.length - 1];

    if (lastCandle && (nowSec - lastCandle.time) < 300) {
      lastCandle.close = currentPrice;
      if (currentPrice > lastCandle.high) lastCandle.high = currentPrice;
      if (currentPrice < lastCandle.low) lastCandle.low = currentPrice;
      lastCandle.volume += Math.floor(Math.random() * 10 + 1);
    } else {
      const newCandle = {
        time: nowSec,
        open: currentPrice,
        high: currentPrice,
        low: currentPrice,
        close: currentPrice,
        volume: 50
      };
      series.push(newCandle);
      if (series.length > 300) series.shift();
    }
  }

  getTicker(pairOrSymbol) {
    if (!pairOrSymbol) return this.tickers['AAPL/USD'];
    const formatted = pairOrSymbol.includes('/') ? pairOrSymbol : `${pairOrSymbol}/USD`;
    return this.tickers[formatted] || this.tickers['AAPL/USD'];
  }

  getAllTickers() {
    return Object.values(this.tickers);
  }

  getOrderBook(pairOrSymbol) {
    const ticker = this.getTicker(pairOrSymbol);
    const price = ticker.price;
    const spread = price * 0.0003;

    const asks = [];
    const bids = [];

    for (let i = 1; i <= 8; i++) {
      const askPrice = price + (spread * i);
      const bidPrice = price - (spread * i);
      const askVol = Math.floor(Math.random() * 250 + 20);
      const bidVol = Math.floor(Math.random() * 250 + 20);

      asks.push({
        price: parseFloat(askPrice.toFixed(2)),
        amount: askVol,
        total: parseFloat((askPrice * askVol).toFixed(2))
      });
      bids.push({
        price: parseFloat(bidPrice.toFixed(2)),
        amount: bidVol,
        total: parseFloat((bidPrice * bidVol).toFixed(2))
      });
    }

    return { pair: ticker.pair, symbol: ticker.symbol, asks, bids, timestamp: Date.now() };
  }

  getCandles(pairOrSymbol, timeframe = '24H') {
    const formatted = pairOrSymbol.includes('/') ? pairOrSymbol : `${pairOrSymbol}/USD`;
    const fullSeries = this.candleHistory[formatted] || this.generateCandleSeries(200, 100);

    let sliceCount = 60;
    if (timeframe === '1H') sliceCount = 20;
    else if (timeframe === '24H') sliceCount = 80;
    else if (timeframe === '7D') sliceCount = 150;
    else sliceCount = 250;

    return fullSeries.slice(-sliceCount);
  }
}

const stockStream = new StockStreamService();
stockStream.start();

module.exports = stockStream;
