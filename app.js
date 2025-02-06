import dotenv from 'dotenv';
import axios from 'axios';
import colors from 'colors';
import fs from 'fs';
import stripAnsi from 'strip-ansi';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

// Configure colors
colors.setTheme({
  info: 'green',
  warn: 'yellow',
  error: 'red',
  debug: 'blue'
});

// Log storage and formatting
const logs = [];
const log = (level, message) => {
  const now = new Date();
  const datePart = now.toLocaleDateString();
  const timePart = now.toLocaleTimeString('en-US', { hour12: false }); // Use 24-hour format to exclude AM/PM
  const milliseconds = now.getMilliseconds().toString().padStart(3, '0');
  const timestamp = `${datePart} ${timePart}.${milliseconds}`.yellow; // Combine date, time, and milliseconds
  const levelStr = `[${level.toUpperCase()}]`; // Change the color of the level
  const formatted = `${levelStr} ${timestamp} - ${message}`;
  logs.push(stripAnsi(formatted)); // Strip ANSI codes before saving
  console.log(formatted);
};

// Environment validation
const validateEnv = () => {
  const required = [
    'ORDER_URL', 'MARKET_TIME_URL', 'LOGIN_URL',
    'REQUEST_INTERVAL', 'MARKET_CHECK_INTERVAL',
    'ISIN', 'QUANTITY', 'PRICE', 'ORDER_SIDE',
    'MAX_QUANTITY', 'MIN_TOTAL_PRICE',
    'ORDER_START_TIME', 'ORDER_STOP_TIME',
    'USERNAME', 'PASSWORD'
  ];

  required.forEach(varName => {
    if (!process.env[varName]) throw new Error(`Missing ${varName} in .env`);
  });

  const totalPrice = parseInt(process.env.QUANTITY) * parseInt(process.env.PRICE);
  if (totalPrice < parseInt(process.env.MIN_TOTAL_PRICE)) {
    throw new Error('Total price below minimum');
  }
  if (parseInt(process.env.QUANTITY) > parseInt(process.env.MAX_QUANTITY)) {
    throw new Error('Quantity exceeds maximum');
  }
};

// Time conversion utilities
const parseTimeNumber = timeStr => {
  const padded = String(timeStr).padStart(9, '0');
  return {
    hours: parseInt(padded.substring(0, 2)),
    minutes: parseInt(padded.substring(2, 4)),
    seconds: parseInt(padded.substring(4, 6)),
    ms: parseInt(padded.substring(6, 9))
  };
};

const getCurrentMarketTime = async () => {
  try {
    const response = await axios.get(process.env.MARKET_TIME_URL);
    const timestamp = parseInt(response.data.data.time);
    const date = new Date(timestamp);
    // Convert to local time
    const localTime = date.toLocaleString();
    const localDate = new Date(localTime);
    return {
      hours: localDate.getHours(),
      minutes: localDate.getMinutes(),
      seconds: localDate.getSeconds(),
      ms: localDate.getMilliseconds()
    };
  } catch (error) {
    log('error', `Market time check failed: ${error.message}`);
    return null;
  }
};

// Main application logic
const runApp = async () => {
  validateEnv();
  log('info', 'Application started');

  // Login to get token
  let authToken;
  try {
    const response = await axios.post(process.env.LOGIN_URL, {
      username: process.env.USERNAME,
      password: process.env.PASSWORD
    });
    authToken = response.data.data.accessToken;
    log('info', `Authentication successful username: ${process.env.USERNAME}`);
  } catch (error) {
    log('error', `Login failed: ${error.message}`);
    process.exit(1);
  }

  // Time configuration
  const startTime = parseTimeNumber(process.env.ORDER_START_TIME);
  const stopTime = parseTimeNumber(process.env.ORDER_STOP_TIME);
  let orderInterval;

  // Log if the start time has not been reached every second
  setInterval(async () => {
    const current = await getCurrentMarketTime();
    if (!current) return;

    const currentTotal = current.hours * 3600 + current.minutes * 60 + current.seconds;
    const startTotal = startTime.hours * 3600 + startTime.minutes * 60 + startTime.seconds;

    if (currentTotal < startTotal) {
      log('info', 'The start time has not been reached yet');
    }
  }, 1000); // Log every second

  // Market time checker
  const marketChecker = setInterval(async () => {
    const current = await getCurrentMarketTime();
    if (!current) return;

    const currentTotal = current.hours * 3600 + current.minutes * 60 + current.seconds;
    const startTotal = startTime.hours * 3600 + startTime.minutes * 60 + startTime.seconds;
    const stopTotal = stopTime.hours * 3600 + stopTime.minutes * 60 + stopTime.seconds;

    // Start orders
    if (!orderInterval && currentTotal >= startTotal) {
      log('info', 'Starting order sequence');
      orderInterval = setInterval(sendOrder, process.env.REQUEST_INTERVAL);
    }

    // Stop orders
    if (orderInterval && currentTotal >= stopTotal) {
      clearInterval(orderInterval);
      log('info', 'Order sequence stopped by STOP time');
      saveLogs();
      process.exit(0);
    }
  }, process.env.MARKET_CHECK_INTERVAL);

  // Order sending function
  let orderCounter = 0; // Initialize order counter

  const sendOrder = async () => {
    try {
      orderCounter++; // Increment order counter
      const orderNumber = String(orderCounter).padStart(4, '0'); // Format order number
  
      const payload = {
        isin: process.env.ISIN,
        quantity: parseInt(process.env.QUANTITY),
        price: parseInt(process.env.PRICE),
        validityType: 1,
        validityDate: null,
        orderSide: parseInt(process.env.ORDER_SIDE)
      };
  
      const response = await axios.post(process.env.ORDER_URL, payload, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
  
      log('info', `Order #${orderNumber} sent: ${JSON.stringify(payload)}`);
      log('info', `Broker response for Order #${orderNumber}: ${JSON.stringify(response.data)}`);
    } catch (error) {
      log('error', `Order #${orderNumber} failed: ${error.message}`);
    }
  };

  // Handle process termination
  const saveLogs = () => {
    const logDir = join(__dirname, 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
    
    const logFile = join(logDir, `orders_${Date.now()}.log`);
    fs.writeFileSync(logFile, logs.join('\n'));
    log('info', `Logs saved to ${logFile}`);
  };

  process.on('SIGINT', () => {
    log('info', 'Process interrupted');
    clearInterval(marketChecker);
    if (orderInterval) clearInterval(orderInterval);
    saveLogs();
    process.exit(0);
  });
};

runApp();
