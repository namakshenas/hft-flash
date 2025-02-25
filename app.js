import axios from 'axios';
import chalk from 'chalk';
import dotenv from 'dotenv';
import moment from 'moment-timezone';
import fs from 'fs';

dotenv.config();

// Configure logging
const logs = [];
const logger = {
  info: (msg) => {
    const log = `[${moment().tz('Asia/Tehran').format('HH:mm:ss.SSS')}] ${msg}`;
    console.log(chalk.cyan(log));
    logs.push(log);
  },
  success: (msg) => {
    const log = `[${moment().tz('Asia/Tehran').format('HH:mm:ss.SSS')}] ${msg}`;
    console.log(chalk.green(log));
    logs.push(log);
  },
  error: (msg) => {
    const log = `[${moment().tz('Asia/Tehran').format('HH:mm:ss.SSS')}] ${msg}`;
    console.log(chalk.red(log));
    logs.push(log);
  }
};

// Display current system time every second
function displayCurrentTime() {
  return setInterval(() => {
    const currentTime = moment().tz('Asia/Tehran').format('HH:mm:ss.SSS');
    console.log(chalk.yellow(`Current system time: ${currentTime}`));
  }, 1000);
}

// Validate environment variables
function validateConfig() {
  const totalCost = parseInt(process.env.QUANTITY) * parseInt(process.env.PRICE);
  
  if (parseInt(process.env.QUANTITY) > parseInt(process.env.MAX_QUANTITY)) {
    throw new Error('Quantity exceeds maximum allowed');
  }
  
  if (totalCost < parseInt(process.env.MIN_TOTAL_COST)) {
    throw new Error('Total cost below minimum required');
  }
}

// Authentication
async function getAuthToken() {
  try {
    const { data } = await axios.post(process.env.LOGIN_URL, {
      username: process.env.USER_NAME,
      password: process.env.PASS_WORD
    });
    return data.data.accessToken;
  } catch (error) {
    throw new Error('Authentication failed');
  }
}

// Order sending
async function sendOrder(token) {
  const payload = {
    isin: process.env.ISIN,
    quantity: parseInt(process.env.QUANTITY),
    price: parseInt(process.env.PRICE),
    validityType: 1,
    validityDate: null,
    orderSide: parseInt(process.env.ORDER_SIDE)
  };

  return axios.post(process.env.ORDER_URL, payload, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// Time handling
function parseTime(timeStr) {
  const [h, m, s, ms] = timeStr.split('.').map(Number);
  return moment().tz('Asia/Tehran').set({ h, m, s, ms });
}

// Main logic
async function run() {
  let timeDisplayIntervalId;
  try {
    logger.info('Starting application');
    timeDisplayIntervalId = displayCurrentTime();
    validateConfig();
    
    const token = await getAuthToken();
    logger.success('Authenticated successfully');
    
    const startTime = parseTime(process.env.ORDER_START_TIME);
    const stopTime = parseTime(process.env.ORDER_STOP_TIME);
    const interval = parseInt(process.env.REQUEST_INTERVAL);

    logger.info(`Scheduled to start at ${startTime.format('HH:mm:ss.SSS')}`);
    // Wait until start time
    while (moment().tz('Asia/Tehran').isBefore(startTime)) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Send orders
    const intervalId = setInterval(async () => {
      if (moment().tz('Asia/Tehran').isAfter(stopTime)) {
        clearInterval(intervalId);
        clearInterval(timeDisplayIntervalId);
        logger.info('Reached stop time');
        fs.writeFileSync(`./logs/${Date.now()}.log`, logs.join('\n'));
        process.exit(0);
        return;
      }

      try {
        const response = await sendOrder(token);
        logger.success(`Order sent successfully ${JSON.stringify(response.data)}`);
      } catch (err) {
        logger.error(`Order failed: ${err.message}`);
      }
    }, interval);

  } catch (err) {
    logger.error(err.message);
    fs.writeFileSync(`./logs/${Date.now()}_error.log`, logs.join('\n'));
    if (timeDisplayIntervalId) {
      clearInterval(timeDisplayIntervalId);
    }
    process.exit(1);
  }
}

// Initialize
if (!fs.existsSync('./logs')) fs.mkdirSync('./logs');
run();
