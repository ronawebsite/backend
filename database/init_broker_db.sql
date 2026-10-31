-- =====================================================================
-- FICHAIN PRO - COMPLETE DATABASE CREATION & SEED SCRIPT
-- Compatible with MySQL 5.7+ / MySQL 8.0+ / MariaDB 10.4+
-- Database: ddfichain
-- =====================================================================

-- If running standalone without a database pre-selected, you can uncomment:
-- CREATE DATABASE IF NOT EXISTS `ddfichain` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE `ddfichain`;

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- --------------------------------------------------------
-- Drop existing tables for a clean recreation
-- --------------------------------------------------------
DROP TABLE IF EXISTS `plan_candle_ticks`;
DROP TABLE IF EXISTS `investments`;
DROP TABLE IF EXISTS `investment_plans`;
DROP TABLE IF EXISTS `support_messages`;
DROP TABLE IF EXISTS `support_tickets`;
DROP TABLE IF EXISTS `broker_prompts`;
DROP TABLE IF EXISTS `bot_trade_logs`;
DROP TABLE IF EXISTS `user_bots`;
DROP TABLE IF EXISTS `trading_bots`;
DROP TABLE IF EXISTS `trades`;
DROP TABLE IF EXISTS `transactions`;
DROP TABLE IF EXISTS `virtual_cards`;
DROP TABLE IF EXISTS `kyc_documents`;
DROP TABLE IF EXISTS `user_wallets`;
DROP TABLE IF EXISTS `system_settings`;
DROP TABLE IF EXISTS `app_users`;

-- --------------------------------------------------------
-- 1. Table: app_users
-- Authentication, profiles, security PINs, and compliance
-- --------------------------------------------------------
CREATE TABLE `app_users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `account_id` VARCHAR(32) NOT NULL UNIQUE,
  `full_name` VARCHAR(255) NOT NULL,
  `username` VARCHAR(100) NOT NULL UNIQUE,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `transaction_pin` VARCHAR(10) DEFAULT '1234',
  `recovery_phrase` TEXT DEFAULT NULL,
  `role` ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  `kyc_status` ENUM('unverified', 'pending', 'approved', 'rejected') NOT NULL DEFAULT 'unverified',
  `email_verified` TINYINT(1) NOT NULL DEFAULT 1,
  `otp_code` VARCHAR(10) DEFAULT NULL,
  `phone` VARCHAR(50) DEFAULT '+1 (555) 019-2834',
  `country` VARCHAR(100) DEFAULT 'United States',
  `address` VARCHAR(255) DEFAULT 'Wall Street Financial District, NY',
  `avatar_url` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_users_email` (`email`),
  INDEX `idx_users_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 2. Table: user_wallets
-- Multi-asset balances (USD Fiat Buffer + Cryptocurrencies)
-- --------------------------------------------------------
CREATE TABLE `user_wallets` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `asset_symbol` VARCHAR(20) NOT NULL,
  `asset_name` VARCHAR(50) NOT NULL,
  `balance` DECIMAL(24, 8) NOT NULL DEFAULT 0.00000000,
  `locked_balance` DECIMAL(24, 8) NOT NULL DEFAULT 0.00000000,
  `deposit_address` VARCHAR(255) DEFAULT NULL,
  `network` VARCHAR(50) DEFAULT 'Mainnet',
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_user_asset` (`user_id`, `asset_symbol`),
  INDEX `idx_wallets_user` (`user_id`),
  CONSTRAINT `fk_wallets_user` FOREIGN KEY (`user_id`) REFERENCES `app_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 3. Table: trading_bots
-- Automated algorithmic quantitative trading strategies
-- --------------------------------------------------------
CREATE TABLE `trading_bots` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `slug` VARCHAR(50) NOT NULL UNIQUE,
  `strategy_type` ENUM('SMA_CROSSOVER', 'RSI_REVERSION', 'GRID_TRADING', 'MOMENTUM_SCALPER', 'ARBITRAGE', 'NEURAL_TREND') NOT NULL,
  `description` TEXT NOT NULL,
  `roi_min` DECIMAL(5, 2) NOT NULL DEFAULT 1.20,
  `roi_max` DECIMAL(5, 2) NOT NULL DEFAULT 5.50,
  `win_rate` INT NOT NULL DEFAULT 88,
  `min_investment` DECIMAL(15, 2) NOT NULL DEFAULT 100.00,
  `risk_level` VARCHAR(30) NOT NULL DEFAULT 'Medium',
  `default_params` JSON DEFAULT NULL,
  `icon` VARCHAR(50) NOT NULL DEFAULT 'bot',
  `badge_color` VARCHAR(30) NOT NULL DEFAULT 'indigo',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 4. Table: user_bots
-- Live instances of bots allocated by users
-- --------------------------------------------------------
CREATE TABLE `user_bots` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `bot_id` INT NOT NULL,
  `bot_name` VARCHAR(100) NOT NULL,
  `pair` VARCHAR(20) NOT NULL DEFAULT 'BTC/USDT',
  `allocated_capital` DECIMAL(20, 2) NOT NULL DEFAULT 500.00,
  `pay_method` VARCHAR(20) NOT NULL DEFAULT 'USDT',
  `strategy_params` JSON DEFAULT NULL,
  `status` ENUM('running', 'paused', 'stopped') NOT NULL DEFAULT 'running',
  `total_profit_loss` DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
  `win_trades` INT NOT NULL DEFAULT 0,
  `total_trades` INT NOT NULL DEFAULT 0,
  `started_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `stopped_at` TIMESTAMP NULL DEFAULT NULL,
  INDEX `idx_userbots_user` (`user_id`),
  CONSTRAINT `fk_userbots_user` FOREIGN KEY (`user_id`) REFERENCES `app_users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_userbots_bot` FOREIGN KEY (`bot_id`) REFERENCES `trading_bots` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 5. Table: bot_trade_logs
-- Trade history executed by quantitative bots
-- --------------------------------------------------------
CREATE TABLE `bot_trade_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_bot_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `pair` VARCHAR(20) NOT NULL,
  `side` ENUM('BUY', 'SELL') NOT NULL,
  `price` DECIMAL(20, 8) NOT NULL,
  `amount` DECIMAL(20, 8) NOT NULL,
  `profit_loss` DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
  `signal_reason` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_botlogs_userbot` (`user_bot_id`),
  CONSTRAINT `fk_botlogs_bot` FOREIGN KEY (`user_bot_id`) REFERENCES `user_bots` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_botlogs_user` FOREIGN KEY (`user_id`) REFERENCES `app_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 6. Table: trades
-- Manual trades, Paper trading, and Admin Managed Trades
-- --------------------------------------------------------
CREATE TABLE `trades` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `pair` VARCHAR(20) NOT NULL,
  `side` ENUM('BUY', 'SELL') NOT NULL,
  `order_type` ENUM('MARKET', 'LIMIT') NOT NULL,
  `price` DECIMAL(20, 8) NOT NULL,
  `amount` DECIMAL(20, 8) NOT NULL,
  `filled_amount` DECIMAL(20, 8) NOT NULL DEFAULT 0.00000000,
  `total_value` DECIMAL(20, 2) NOT NULL,
  `fee` DECIMAL(15, 4) NOT NULL DEFAULT 0.0000,
  `realized_pnl` DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
  `status` ENUM('OPEN', 'FILLED', 'CANCELLED', 'REJECTED') NOT NULL DEFAULT 'OPEN',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `filled_at` TIMESTAMP NULL DEFAULT NULL,
  `is_managed` TINYINT(1) NOT NULL DEFAULT 0,
  `current_profit` DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
  `target_outcome` VARCHAR(50) NOT NULL DEFAULT 'IN_PROGRESS',
  `admin_notes` VARCHAR(255) DEFAULT NULL,
  `intervention_at` TIMESTAMP NULL DEFAULT NULL,
  INDEX `idx_trades_user` (`user_id`),
  INDEX `idx_trades_pair` (`pair`),
  CONSTRAINT `fk_trades_user` FOREIGN KEY (`user_id`) REFERENCES `app_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 7. Table: broker_prompts
-- Admin customizable capital top-up alerts sent to investors
-- --------------------------------------------------------
CREATE TABLE `broker_prompts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT NOT NULL,
  `target_amount` DECIMAL(20, 2) DEFAULT NULL,
  `expected_payout` DECIMAL(20, 2) DEFAULT NULL,
  `urgency` VARCHAR(50) NOT NULL DEFAULT 'opportunity',
  `status` VARCHAR(50) NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `dismissed_at` TIMESTAMP NULL DEFAULT NULL,
  INDEX `idx_prompts_user` (`user_id`),
  CONSTRAINT `fk_prompts_user` FOREIGN KEY (`user_id`) REFERENCES `app_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 8. Table: transactions
-- Institutional deposits, withdrawals, payouts, & transfers
-- --------------------------------------------------------
CREATE TABLE `transactions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `type` VARCHAR(50) NOT NULL DEFAULT 'deposit',
  `asset_symbol` VARCHAR(20) NOT NULL,
  `network` VARCHAR(50) DEFAULT 'Native',
  `amount` DECIMAL(24, 8) NOT NULL,
  `amount_usd` DECIMAL(20, 2) NOT NULL,
  `fee` DECIMAL(15, 4) NOT NULL DEFAULT 0.0000,
  `status` ENUM('pending', 'completed', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',
  `tx_hash` VARCHAR(255) DEFAULT NULL,
  `destination_address` VARCHAR(255) DEFAULT NULL,
  `withdrawal_pin` VARCHAR(10) DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_tx_user` (`user_id`),
  INDEX `idx_tx_type` (`type`),
  CONSTRAINT `fk_tx_user` FOREIGN KEY (`user_id`) REFERENCES `app_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 9. Table: virtual_cards
-- Interactive 3D Virtual Visa/Mastercard Ledger
-- --------------------------------------------------------
CREATE TABLE `virtual_cards` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `card_holder_name` VARCHAR(255) NOT NULL,
  `card_number` VARCHAR(25) NOT NULL,
  `cvv` VARCHAR(4) NOT NULL,
  `expiry` VARCHAR(10) NOT NULL,
  `card_type` ENUM('Visa', 'Mastercard') NOT NULL DEFAULT 'Visa',
  `card_tier` VARCHAR(50) NOT NULL DEFAULT 'Platinum World Elite',
  `status` ENUM('active', 'frozen', 'pending', 'terminated') NOT NULL DEFAULT 'active',
  `balance` DECIMAL(15, 2) NOT NULL DEFAULT 2500.00,
  `spending_limit` DECIMAL(15, 2) NOT NULL DEFAULT 10000.00,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_cards_user` (`user_id`),
  CONSTRAINT `fk_cards_user` FOREIGN KEY (`user_id`) REFERENCES `app_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 10. Table: kyc_documents
-- AML / KYC Regulatory Compliance Documents
-- --------------------------------------------------------
CREATE TABLE `kyc_documents` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `document_type` VARCHAR(50) NOT NULL DEFAULT 'National ID / Passport',
  `front_image` VARCHAR(255) NOT NULL,
  `back_image` VARCHAR(255) DEFAULT NULL,
  `selfie_image` VARCHAR(255) DEFAULT NULL,
  `status` ENUM('unverified', 'pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  `admin_notes` TEXT DEFAULT NULL,
  `submitted_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_at` TIMESTAMP NULL DEFAULT NULL,
  INDEX `idx_kyc_user` (`user_id`),
  CONSTRAINT `fk_kyc_user` FOREIGN KEY (`user_id`) REFERENCES `app_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 11. Table: system_settings
-- Platform global parameters & toggles
-- --------------------------------------------------------
CREATE TABLE `system_settings` (
  `id` INT PRIMARY KEY DEFAULT 1,
  `sitename` VARCHAR(255) NOT NULL DEFAULT 'Fichain Pro Institutional',
  `siteurl` VARCHAR(255) NOT NULL DEFAULT 'http://localhost:4200',
  `enable_email_verification` TINYINT(1) NOT NULL DEFAULT 0,
  `enable_pin_on_login` TINYINT(1) NOT NULL DEFAULT 0,
  `enable_kyc_for_withdrawal` TINYINT(1) NOT NULL DEFAULT 0,
  `enable_mock_trading` TINYINT(1) NOT NULL DEFAULT 1,
  `min_deposit_usd` DECIMAL(10, 2) NOT NULL DEFAULT 10.00,
  `min_withdrawal_usd` DECIMAL(10, 2) NOT NULL DEFAULT 20.00,
  `trading_fee_percent` DECIMAL(5, 4) NOT NULL DEFAULT 0.0010,
  `simulated_liquidity_usd` DECIMAL(20, 2) NOT NULL DEFAULT 50000000.00,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 12. Table: support_tickets
-- Support inquiries and formal trade disputes
-- --------------------------------------------------------
CREATE TABLE `support_tickets` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `ticket_number` VARCHAR(32) NOT NULL UNIQUE,
  `user_id` INT NOT NULL,
  `subject` VARCHAR(255) NOT NULL,
  `category` ENUM('TRADE_DISPUTE', 'DEPOSIT_ISSUE', 'WITHDRAWAL_STATUS', 'ACCOUNT_SECURITY', 'GENERAL_SUPPORT') NOT NULL DEFAULT 'GENERAL_SUPPORT',
  `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
  `status` ENUM('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
  `is_dispute` TINYINT(1) NOT NULL DEFAULT 0,
  `related_trade_id` INT DEFAULT NULL,
  `source` ENUM('USER_SUBMITTED', 'AI_BOT_ESCALATED', 'EMAIL') NOT NULL DEFAULT 'USER_SUBMITTED',
  `ai_summary` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_ticket_user` (`user_id`),
  INDEX `idx_ticket_status` (`status`),
  INDEX `idx_ticket_dispute` (`is_dispute`),
  CONSTRAINT `fk_ticket_user` FOREIGN KEY (`user_id`) REFERENCES `app_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 13. Table: support_messages
-- Threaded messaging with email dispatch tracking
-- --------------------------------------------------------
CREATE TABLE `support_messages` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `ticket_id` INT NOT NULL,
  `sender_id` INT DEFAULT NULL,
  `sender_role` ENUM('USER', 'ADMIN', 'AI_ASSISTANT') NOT NULL,
  `sender_name` VARCHAR(255) NOT NULL,
  `sender_email` VARCHAR(255) DEFAULT NULL,
  `message` TEXT NOT NULL,
  `is_email_dispatched` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_msg_ticket` (`ticket_id`),
  CONSTRAINT `fk_msg_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 14. Table: investment_plans
-- Admin-customizable growth plans with target ROI
-- --------------------------------------------------------
CREATE TABLE `investment_plans` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `min_deposit` DECIMAL(15, 2) NOT NULL DEFAULT 500.00,
  `roi` DECIMAL(5, 2) NOT NULL DEFAULT 150.00,
  `duration` INT NOT NULL DEFAULT 7,
  `risk_level` VARCHAR(50) NOT NULL DEFAULT 'Low Risk',
  `description` TEXT NOT NULL,
  `icon` VARCHAR(50) NOT NULL DEFAULT 'chart-line',
  `color` VARCHAR(50) NOT NULL DEFAULT 'teal',
  `roi_type` VARCHAR(50) DEFAULT 'Guaranteed Target',
  `max_deposit` DECIMAL(18, 2) DEFAULT 100000.00,
  `initial_amount` DECIMAL(18, 2) NOT NULL DEFAULT 1000.00,
  `target_amount` DECIMAL(18, 2) NOT NULL DEFAULT 2500.00,
  `duration_days` INT NOT NULL DEFAULT 7,
  `duration_seconds` INT NOT NULL DEFAULT 604800,
  `roi_percentage` DECIMAL(10, 2) DEFAULT 150.00,
  `badge` VARCHAR(50) DEFAULT 'Popular',
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 15. Table: investments
-- Active user plan subscriptions with Brownian Bridge state
-- --------------------------------------------------------
CREATE TABLE `investments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `plan_name` VARCHAR(100) NOT NULL,
  `amount` DECIMAL(15, 2) NOT NULL,
  `pay_method` VARCHAR(20) NOT NULL DEFAULT 'USDT',
  `roi_percent` DECIMAL(5, 2) NOT NULL DEFAULT 150.00,
  `status` VARCHAR(20) NOT NULL DEFAULT 'active',
  `start_date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `end_date` DATETIME DEFAULT NULL,
  `current_profit` DECIMAL(18, 2) DEFAULT 0.00,
  `plan_id` INT DEFAULT NULL,
  `invested_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
  `target_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
  `current_value` DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
  `duration_days` INT NOT NULL DEFAULT 7,
  `duration_seconds` INT NOT NULL DEFAULT 604800,
  `payout_credited` TINYINT(1) DEFAULT 0,
  `last_tick_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_inv_user` (`user_id`),
  CONSTRAINT `fk_inv_user` FOREIGN KEY (`user_id`) REFERENCES `app_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 16. Table: plan_candle_ticks
-- Real-time 15s Binance candlestick stream for growth charts
-- --------------------------------------------------------
CREATE TABLE `plan_candle_ticks` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `investment_id` INT NOT NULL,
  `time` INT NOT NULL,
  `open` DECIMAL(18, 2) NOT NULL,
  `high` DECIMAL(18, 2) NOT NULL,
  `low` DECIMAL(18, 2) NOT NULL,
  `close` DECIMAL(18, 2) NOT NULL,
  `volume` DECIMAL(18, 4) NOT NULL DEFAULT 1.0000,
  INDEX `idx_inv_time` (`investment_id`, `time`),
  CONSTRAINT `fk_ticks_investment` FOREIGN KEY (`investment_id`) REFERENCES `investments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- INITIAL SEED DATA
-- Default accounts, wallets, quantitative bots, and growth plans
-- Passwords: hash of '123456' ($2a$10$wEkgKq/9hGk3yYg1mN9lE.o2y7H07lRjV99818)
-- =====================================================================

-- 1. App Users (Admin & Trader)
INSERT INTO `app_users` (`id`, `account_id`, `full_name`, `username`, `email`, `password_hash`, `transaction_pin`, `recovery_phrase`, `role`, `kyc_status`, `email_verified`, `country`, `phone`)
VALUES
(1, 'ADM-99001', 'Chief Compliance & Risk Admin', 'superadmin', 'admin@mail.com', '$2a$10$Q7eYqXyv6p4a1uGvG3q7Ce6rUv9l2R5jK0hL7nC4kK4pT0bZ6v912', '1234', 'alpha bravery castle delta echo foxtrot golf hotel india juliet kilo lima', 'admin', 'approved', 1, 'United States', '+1 (212) 555-0100'),
(2, 'USR-77001', 'Alexander Vance (Pro Trader)', 'alexvance', 'user@mail.com', '$2a$10$Q7eYqXyv6p4a1uGvG3q7Ce6rUv9l2R5jK0hL7nC4kK4pT0bZ6v912', '1234', 'comet mike quebec secure orbit uniform papa elephant sierra victor galaxy quick', 'user', 'approved', 1, 'United States', '+1 (212) 555-0199');

-- 2. System Settings
INSERT INTO `system_settings` (`id`, `sitename`, `siteurl`, `enable_email_verification`, `enable_pin_on_login`, `enable_kyc_for_withdrawal`, `enable_mock_trading`, `min_deposit_usd`, `min_withdrawal_usd`, `trading_fee_percent`, `simulated_liquidity_usd`)
VALUES (1, 'Fichain Pro Institutional', 'http://localhost:4200', 0, 0, 0, 1, 10.00, 20.00, 0.0010, 50000000.00);

-- 3. Multi-Asset Wallets for Demo Trader (User #2)
INSERT INTO `user_wallets` (`user_id`, `asset_symbol`, `asset_name`, `balance`, `locked_balance`, `deposit_address`, `network`)
VALUES
(2, 'USD', 'US Dollar (Fiat Buffer)', 25450.00000000, 0.00000000, 'USD-ACCOUNT-FEDERAL-WIRE-992', 'Federal Wire'),
(2, 'USDT', 'Tether USD (ERC20 / TRC20)', 14850.00000000, 0.00000000, '0x71C8fb861337577648bf4A36b69D0388A152fC3b', 'ERC20 / TRC20'),
(2, 'BTC', 'Bitcoin (Layer 1)', 1.84500000, 0.00000000, 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', 'Bitcoin Mainnet'),
(2, 'ETH', 'Ethereum Mainnet', 14.52000000, 0.00000000, '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 'Ethereum ERC20'),
(2, 'SOL', 'Solana High-Throughput', 185.00000000, 0.00000000, 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH', 'Solana SPL'),
(2, 'BNB', 'BNB Smart Chain', 35.60000000, 0.00000000, '0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97', 'BSC BEP20'),
(2, 'XRP', 'Ripple Ledger', 4200.00000000, 0.00000000, 'rEb8TK3gBgk5auZyyb6MfCEmOMtdVYS556', 'XRPL'),
(2, 'ADA', 'Cardano Settlement Layer', 6500.00000000, 0.00000000, 'addr1q9d479w6v2s5x4q8e2h7k8m3n2p5v6x9', 'Cardano ADA'),
(2, 'DOGE', 'Dogecoin Network', 15000.00000000, 0.00000000, 'DMqRV5v7L3nFz9Qp4X2w7Y8k6M5N1B3V4C', 'Dogecoin Native'),
(2, 'TRX', 'TRON High-Speed Network', 22000.00000000, 0.00000000, 'TNDF57bTf4nK9m2q5x8v7h6y5r4e3w2q1a', 'TRON TRC20');

-- 4. Virtual Debit Card for User #2
INSERT INTO `virtual_cards` (`user_id`, `card_holder_name`, `card_number`, `cvv`, `expiry`, `card_type`, `card_tier`, `status`, `balance`, `spending_limit`)
VALUES (2, 'ALEXANDER VANCE', '4829 9104 2281 7719', '842', '09/29', 'Visa', 'Platinum World Elite', 'active', 5450.00, 25000.00);

-- 5. Quantitative Trading Strategies (Bots)
INSERT INTO `trading_bots` (`id`, `name`, `slug`, `strategy_type`, `description`, `roi_min`, `roi_max`, `win_rate`, `min_investment`, `risk_level`, `icon`, `badge_color`, `is_active`)
VALUES
(1, 'Alpha Genesis AI Scalper', 'alpha-genesis-ai', 'MOMENTUM_SCALPER', 'High-frequency institutional momentum scalping bot leveraging sub-second order book imbalances.', 2.10, 6.80, 91, 500.00, 'Medium', 'lightning', 'emerald', 1),
(2, 'Volatility Grid Matrix', 'volatility-grid', 'GRID_TRADING', 'Automated grid trading matrix executing mean-reversion limit orders across market swings.', 1.40, 4.20, 86, 250.00, 'Low', 'grid', 'indigo', 1),
(3, 'Neural RSI Quant Engine', 'neural-rsi-quant', 'RSI_REVERSION', 'Dynamic algorithmic divergence detector capturing extreme statistical overbought/oversold levels.', 2.50, 7.50, 89, 1000.00, 'Medium-High', 'activity', 'purple', 1),
(4, 'Institutional Arbitrage Core', 'institutional-arbitrage', 'ARBITRAGE', 'Latency-optimized cross-exchange spatial arbitrage algorithm exploiting micro-spreads.', 1.10, 3.20, 97, 2500.00, 'Very Low', 'shield-check', 'teal', 1),
(5, 'DeepTrend Transformer', 'deeptrend-transformer', 'NEURAL_TREND', 'Multi-layer neural network forecasting macro breakouts with dynamic volatility stop-losses.', 3.20, 9.40, 84, 500.00, 'High', 'trending-up', 'amber', 1);

-- 6. Growth Investment Plans (Guaranteed Target Convergence Plans)
INSERT INTO `investment_plans` (`id`, `name`, `min_deposit`, `roi`, `duration`, `risk_level`, `description`, `icon`, `color`, `roi_type`, `max_deposit`, `initial_amount`, `target_amount`, `duration_days`, `duration_seconds`, `roi_percentage`, `badge`, `is_active`)
VALUES
(1, '24-Hour Express Sprint Plan', 250.00, 30.00, 1, 'Low Risk', 'Rapid short-term guaranteed capital growth targeting +30% ROI in 24 hours.', 'bolt', 'emerald', 'Guaranteed Target', 5000.00, 250.00, 325.00, 1, 86400, 30.00, 'Fast Yield', 1),
(2, '3-Day Institutional Momentum Plan', 500.00, 75.00, 3, 'Low-Medium', 'Dynamic 3-day algorithmic allocation with guaranteed target payout.', 'rocket', 'teal', 'Guaranteed Target', 15000.00, 500.00, 875.00, 3, 259200, 75.00, 'Hot', 1),
(3, '7-Day Alpha Quantum Yield Plan', 1000.00, 150.00, 7, 'Medium Risk', 'Institutional multi-asset yield plan designed to grow $1,000 capital into $2,500.', 'chart-line', 'indigo', 'Guaranteed Target', 50000.00, 1000.00, 2500.00, 7, 604800, 150.00, 'Most Popular', 1),
(4, '14-Day Wealth Compounder Plan', 2500.00, 280.00, 14, 'Medium Risk', 'Longer horizon compounder plan growing $2,500 into $9,500 guaranteed outcome.', 'gem', 'purple', 'Guaranteed Target', 100000.00, 2500.00, 9500.00, 14, 1209600, 280.00, 'High Return', 1),
(5, '30-Day Sovereign Whale Vault', 5000.00, 500.00, 30, 'Institutional', 'Premier institutional hedge fund strategy multiplying capital by 5x in 30 days.', 'crown', 'amber', 'Guaranteed Target', 250000.00, 5000.00, 30000.00, 30, 2592000, 500.00, 'Exclusive', 1);

-- 7. Sample Initial Dispute & Support Ticket for Demonstration
INSERT INTO `support_tickets` (`id`, `ticket_number`, `user_id`, `subject`, `category`, `priority`, `status`, `is_dispute`, `source`, `ai_summary`)
VALUES
(1, 'DISPUTE-882194', 2, 'Inquiry on managed trade closing price on BTC/USDT', 'TRADE_DISPUTE', 'HIGH', 'IN_REVIEW', 1, 'USER_SUBMITTED', 'Client requested verification of execution price on managed BTC allocation.'),
(2, 'TIC-301928', 2, 'Assistance with virtual debit card international limits', 'GENERAL_SUPPORT', 'MEDIUM', 'OPEN', 0, 'USER_SUBMITTED', 'Client asking how to increase daily online spending limits.');

INSERT INTO `support_messages` (`ticket_id`, `sender_id`, `sender_role`, `sender_name`, `sender_email`, `message`, `is_email_dispatched`)
VALUES
(1, 2, 'USER', 'Alexander Vance', 'user@mail.com', 'Hello supervisor, I noticed the latest managed trade had an adjustment. Could you explain the payout date?', 1),
(1, 1, 'ADMIN', 'Chief Compliance Admin', 'admin@mail.com', 'Hello Alexander. Your managed trade is currently tracking on schedule with targeted profit. Settlement will be executed upon plan target maturation.', 1),
(2, 2, 'USER', 'Alexander Vance', 'user@mail.com', 'Hi, I would like to expand my daily virtual card limit from $10,000 to $25,000 for travel.', 1);

SET FOREIGN_KEY_CHECKS = 1;
