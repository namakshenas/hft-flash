import axios from 'axios';
import chalk from 'chalk';
import moment from 'moment-timezone';
import fs from 'fs';

// Initialize
const logs = [];
if (!fs.existsSync('./logs')) fs.mkdirSync('./logs');

// Logger
function createLogger(userKey) {
    return {
        info: (msg) => logMessage('cyan', userKey, msg),
        success: (msg) => logMessage('green', userKey, msg),
        error: (msg) => logMessage('red', userKey, msg)
    };
}

function logMessage(color, userKey, msg) {
    const timestamp = moment().tz('Asia/Tehran').format('HH:mm:ss.SSS');
    const log = `[${timestamp}] [${userKey}] ${msg}`;
    console.log(chalk[color](log));
    logs.push(log);
}

// Time utilities
function parseTime(timeStr) {
    const [h, m, s, ms] = timeStr.split('.').map(Number);
    return moment().tz('Asia/Tehran')
        .set({ hours: h, minutes: m, seconds: s, milliseconds: ms });
}

// Validation
function validateConfig(config) {
    const requiredFields = [
        'USER_NAME', 'PASS_WORD', 'REQUEST_INTERVAL', 'ISIN',
        'QUANTITY', 'PRICE', 'ORDER_SIDE', 'ORDER_START_TIME',
        'ORDER_STOP_TIME', 'LOGIN_URL', 'ORDER_URL', 'MAX_QUANTITY',
        'MIN_TOTAL_COST'
    ];

    requiredFields.forEach(field => {
        if (!(field in config)) throw new Error(`Missing ${field}`);
    });

    const quantity = Number(config.QUANTITY);
    const price = Number(config.PRICE);
    const totalCost = quantity * price;

    if (quantity > Number(config.MAX_QUANTITY)) {
        throw new Error('Quantity exceeds maximum allowed');
    }

    if (totalCost < Number(config.MIN_TOTAL_COST)) {
        throw new Error('Total cost below minimum required');
    }
}

// API functions
async function getAuthToken(config) {
    try {
        const { data } = await axios.post(config.LOGIN_URL, {
            username: config.USER_NAME,
            password: config.PASS_WORD
        });
        return data.data.accessToken;
    } catch (error) {
        throw new Error(`Authentication failed: ${error.response?.data?.message || error.message}`);
    }
}

async function sendOrder(token, config) {
    try {
        const response = await axios.post(config.ORDER_URL, {
            isin: config.ISIN,
            quantity: Number(config.QUANTITY),
            price: Number(config.PRICE),
            validityType: 1,
            validityDate: null,
            orderSide: Number(config.ORDER_SIDE)
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response;
    } catch (error) {
        throw new Error(`Order failed: ${error.response?.data?.message || error.message}`);
    }
}

// Execution core
// Execution core
async function runUser(userKey, config) {
    const logger = createLogger(userKey);

    return new Promise(async (resolve) => {
        try {
            logger.info('Initializing trader');
            validateConfig(config);

            // Authentication
            const token = await getAuthToken(config);
            logger.success('Authentication successful');

            // Parse times
            const startTime = parseTime(config.ORDER_START_TIME).valueOf();
            const stopTime = parseTime(config.ORDER_STOP_TIME).valueOf();
            const interval = Number(config.REQUEST_INTERVAL);

            // Wait until start time
            logger.info(`Waiting until ${moment(startTime).format('HH:mm:ss.SSS')}`);
            while (moment().tz('Asia/Tehran').valueOf() < startTime) {
                const remaining = startTime - moment().tz('Asia/Tehran').valueOf();
                // Start with 100ms intervals, then tighten as we approach
                const delay = remaining > 1000 ? 100 : 
                              remaining > 100 ? 10 : 
                              remaining > 5 ? 2 : 1;
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            // Trading loop
            let isTradingActive = true;
            const executeTrade = async () => {
                const now = moment().tz('Asia/Tehran').valueOf();
                if (now >= stopTime) {
                    isTradingActive = false;
                    return false;
                }

                try {
                    const response = await sendOrder(token, config);
                    logger.success(`Order executed at ${moment(now).format('HH:mm:ss.SSS')} | ${JSON.stringify(response.data)}`);
                    return true;
                } catch (err) {
                    logger.error(`Order error: ${err.message}`);
                    return false;
                }
            };

            // Immediate first execution
            await executeTrade();

            // Interval execution
            const tradingInterval = setInterval(async () => {
                if (!isTradingActive) {
                    clearInterval(tradingInterval);
                    return;
                }
                await executeTrade();
            }, interval);

            // Stop timer
            const timeRemaining = stopTime - moment().tz('Asia/Tehran').valueOf();
            setTimeout(() => {
                isTradingActive = false;
                clearInterval(tradingInterval);
                logger.info('Trading period ended');
                resolve(); // Resolve the promise here
            }, timeRemaining > 0 ? timeRemaining : 0);

        } catch (err) {
            logger.error(`Fatal error: ${err.message}`);
            resolve();
        }
    });
}

// Main
async function run() {
    let timeDisplay;
    try {
        // Time display
        timeDisplay = setInterval(() => {
            const time = moment().tz('Asia/Tehran').format('HH:mm:ss.SSS');
            process.stdout.write(`\r${chalk.yellow(`[SYSTEM TIME] ${time}`)}    `);
        }, 1000);

        // Load config
        const users = JSON.parse(fs.readFileSync('./users.json', 'utf8'));

        // Execute traders
        await Promise.all(
            Object.entries(users).map(([key, config]) =>
                runUser(key, config).catch(e =>
                    console.error(chalk.red(`User ${key} failed: ${e.message}`)))
            )
        );

    } catch (err) {
        console.error(chalk.red('Critical error:'), err);
    } finally {
        clearInterval(timeDisplay);
        // Add newline after last time display
        process.stdout.write('\n');
        // Save logs
        const logTime = moment().tz('Asia/Tehran').format('YYYYMMDD-HHmmss');
        fs.writeFileSync(`./logs/trade-${logTime}.log`, logs.join('\n'));
    }
}

run();
