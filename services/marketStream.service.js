const WebSocket = require('ws');
const axios = require('axios');
const EventEmitter = require('events');
const logger = require('../config/logger');

class MarketStreamService extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.reconnectTimer = null;
    this.fallbackTimer = null;
    this.isAlive = false;

    // Supported asset symbols mapped to Binance tickers
    this.supportedPairs = [
      'BTCUSDT',
      'ETHUSDT',
      'SOLUSDT',
      'BNBUSDT',
      'TRXUSDT',
      'DOGEUSDT',
      'LTCUSDT',
      'MATICUSDT',
      'XRPUSDT',
      'ADAUSDT'
    ];

    // Current price store with fallback base defaults
    this.tickers = {
      'BTC/USDT': { pair: 'BTC/USDT', symbol: 'BTC', price: 68500.00, change24h: 2.85, high24h: 69200.00, low24h: 66800.00, volume24h: 28450.25, timestamp: Date.now() },
      'ETH/USDT': { pair: 'ETH/USDT', symbol: 'ETH', price: 2650.00, change24h: 1.95, high24h: 2710.00, low24h: 2580.00, volume24h: 154200.50, timestamp: Date.now() },
      'SOL/USDT': { pair: 'SOL/USDT', symbol: 'SOL', price: 182.50, change24h: 4.12, high24h: 188.00, low24h: 174.50, volume24h: 890000.00, timestamp: Date.now() },
      'BNB/USDT': { pair: 'BNB/USDT', symbol: 'BNB', price: 595.00, change24h: 0.85, high24h: 605.00, low24h: 588.00, volume24h: 42000.00, timestamp: Date.now() },
      'TRX/USDT': { pair: 'TRX/USDT', symbol: 'TRX', price: 0.1625, change24h: 1.15, high24h: 0.1680, low24h: 0.1590, volume24h: 12500000.00, timestamp: Date.now() },
      'DOGE/USDT': { pair: 'DOGE/USDT', symbol: 'DOGE', price: 0.1420, change24h: -1.25, high24h: 0.1490, low24h: 0.1380, volume24h: 35000000.00, timestamp: Date.now() },
      'LTC/USDT': { pair: 'LTC/USDT', symbol: 'LTC', price: 72.50, change24h: 0.50, high24h: 74.80, low24h: 71.20, volume24h: 98000.00, timestamp: Date.now() },
      'MATIC/USDT': { pair: 'MATIC/USDT', symbol: 'MATIC', price: 0.3850, change24h: 2.10, high24h: 0.4020, low24h: 0.3750, volume24h: 1800000.00, timestamp: Date.now() },
      'XRP/USDT': { pair: 'XRP/USDT', symbol: 'XRP', price: 0.5480, change24h: -0.45, high24h: 0.5620, low24h: 0.5390, volume24h: 4200000.00, timestamp: Date.now() },
      'ADA/USDT': { pair: 'ADA/USDT', symbol: 'ADA', price: 0.3550, change24h: 1.75, high24h: 0.3680, low24h: 0.3470, volume24h: 8900000.00, timestamp: Date.now() }
    };

    this.orderBooks = {};
    this.candleHistory = {};
    this.initHistoricalCandles();
  }

  initHistoricalCandles() {
    // Generate realistic multi-timeframe historical candlestick series for charts
    for (const [pair, ticker] of Object.entries(this.tickers)) {
      this.candleHistory[pair] = this.generateCandleSeries(ticker.price, 120);
    }
  }

  generateCandleSeries(basePrice, count) {
    const candles = [];
    let current = basePrice * 0.95;
    const now = Math.floor(Date.now() / 1000);
    const intervalSeconds = 300; // 5-minute candles

    for (let i = count; i >= 0; i--) {
      const time = now - i * intervalSeconds;
      const volatility = current * 0.008;
      const open = current;
      const change = (Math.random() - 0.49) * volatility;
      const close = Math.max(0.0001, open + change);
      const high = Math.max(open, close) + Math.random() * (volatility * 0.5);
      const low = Math.min(open, close) - Math.random() * (volatility * 0.5);
      const volume = Math.floor(Math.random() * 50 + 10);

      candles.push({
        time,
        open: parseFloat(open.toFixed(4)),
        high: parseFloat(high.toFixed(4)),
        low: parseFloat(low.toFixed(4)),
        close: parseFloat(close.toFixed(4)),
        volume
      });
      current = close;
    }
    return candles;
  }

  start() {
    this.connectBinance();
    // Also start a periodic simulated tick fluctuation (ensures charts stay live even if Binance WS drops)
    setInterval(() => this.simulateMicroTick(), 1500);
  }

  connectBinance() {
    try {
      // Connect to Binance multi-stream for real-time mini-tickers
      const streams = this.supportedPairs.map(p => `${p.toLowerCase()}@miniTicker`).join('/');
      const wsUrl = `wss://stream.binance.com:9443/ws/${streams}`;

      logger.info(`[MarketStream] Connecting to Binance WebSocket stream: ${wsUrl}`);
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        logger.info('[MarketStream] Connected to Binance Live Market Stream');
        this.isAlive = true;
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          this.handleBinanceTicker(msg);
        } catch (err) {
          // ignore parse errors
        }
      });

      this.ws.on('error', (err) => {
        logger.warn(`[MarketStream] Binance WS error: ${err.message}. Retrying...`);
        this.reconnect();
      });

      this.ws.on('close', () => {
        logger.warn('[MarketStream] Binance WS closed. Reconnecting in 5s...');
        this.reconnect();
      });
    } catch (err) {
      logger.error(`[MarketStream] Error creating WebSocket: ${err.message}`);
      this.reconnect();
    }
  }

  handleBinanceTicker(tick) {
    if (!tick || !tick.s) return;
    const rawSymbol = tick.s; // e.g. 'BTCUSDT'
    const baseAsset = rawSymbol.replace('USDT', '');
    const standardPair = `${baseAsset}/USDT`;

    const closePrice = parseFloat(tick.c);
    const openPrice = parseFloat(tick.o);
    const highPrice = parseFloat(tick.h);
    const lowPrice = parseFloat(tick.l);
    const volume = parseFloat(tick.v);
    const change24h = openPrice > 0 ? parseFloat((((closePrice - openPrice) / openPrice) * 100).toFixed(2)) : 0;

    const tickerData = {
      pair: standardPair,
      symbol: baseAsset,
      price: closePrice,
      change24h,
      high24h: highPrice,
      low24h: lowPrice,
      volume24h: volume,
      timestamp: Date.now()
    };

    this.tickers[standardPair] = tickerData;
    this.updateLatestCandle(standardPair, closePrice);
    this.emit('ticker', tickerData);
  }

  simulateMicroTick() {
    // Generate organic micro-variance (+/- 0.05%) to keep UI order books & charts dynamic
    for (const [pair, ticker] of Object.entries(this.tickers)) {
      const variance = (Math.random() - 0.5) * 0.001 * ticker.price;
      const newPrice = Math.max(0.0001, parseFloat((ticker.price + variance).toFixed(pair.includes('BTC') || pair.includes('ETH') ? 2 : 4)));
      ticker.price = newPrice;
      ticker.timestamp = Date.now();

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
      // Update existing candle
      lastCandle.close = currentPrice;
      if (currentPrice > lastCandle.high) lastCandle.high = currentPrice;
      if (currentPrice < lastCandle.low) lastCandle.low = currentPrice;
      lastCandle.volume += 1;
    } else {
      // Start a new 5-minute candle
      const newCandle = {
        time: nowSec,
        open: currentPrice,
        high: currentPrice,
        low: currentPrice,
        close: currentPrice,
        volume: 1
      };
      series.push(newCandle);
      if (series.length > 300) series.shift();
    }
  }

  reconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connectBinance();
    }, 5000);
  }

  getTicker(pair) {
    const formatted = pair.includes('/') ? pair : `${pair}/USDT`;
    return this.tickers[formatted] || this.tickers['BTC/USDT'];
  }

  getAllTickers() {
    return Object.values(this.tickers);
  }

  getOrderBook(pair) {
    const ticker = this.getTicker(pair);
    const price = ticker.price;
    const spread = price * 0.0004;

    const asks = [];
    const bids = [];

    for (let i = 1; i <= 8; i++) {
      const askPrice = price + (spread * i);
      const bidPrice = price - (spread * i);
      const askVol = parseFloat((Math.random() * (pair.includes('BTC') ? 1.5 : 25) + 0.1).toFixed(4));
      const bidVol = parseFloat((Math.random() * (pair.includes('BTC') ? 1.5 : 25) + 0.1).toFixed(4));

      asks.push({ price: parseFloat(askPrice.toFixed(4)), amount: askVol, total: parseFloat((askPrice * askVol).toFixed(2)) });
      bids.push({ price: parseFloat(bidPrice.toFixed(4)), amount: bidVol, total: parseFloat((bidPrice * bidVol).toFixed(2)) });
    }

    return { pair: ticker.pair, asks, bids, timestamp: Date.now() };
  }

  getCandles(pair, timeframe = '24H') {
    const standard = pair.includes('/') ? pair : `${pair}/USDT`;
    const fullSeries = this.candleHistory[standard] || this.generateCandleSeries(100, 100);

    // Filter or adjust based on timeframe
    let sliceCount = 60;
    if (timeframe === '1H') sliceCount = 20;
    else if (timeframe === '24H') sliceCount = 80;
    else if (timeframe === '7D') sliceCount = 150;
    else sliceCount = 250;

    return fullSeries.slice(-sliceCount);
  }
}

// Singleton export
const marketStream = new MarketStreamService();
marketStream.start();

module.exports = marketStream;
