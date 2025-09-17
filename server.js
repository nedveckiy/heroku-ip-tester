const express = require('express');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Конфігурація для тестування
const CONFIG = {
    testQuery: 'test search query site:example.com',
    delayBetweenRequests: 1000, // 1 секунда
    maxRequestsPerTest: 1,      // 1 запит
    logFile: 'ip_rotation_log.txt'
};

// Функція для отримання поточного IP
async function getCurrentIP() {
    try {
        const response = await axios.get('https://api.ipify.org?format=json', {
            timeout: 5000
        });
        return response.data.ip;
    } catch (error) {
        console.error('Помилка отримання IP:', error.message);
        return 'Unknown';
    }
}

// Функція для тестування Google Search (безпечний варіант)
async function testGoogleSearch(query, requestNumber) {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    ];

    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
    
    try {
        // Тестуємо на httpbin.org замість Google (безпечніше)
        const response = await axios.get('https://httpbin.org/ip', {
            headers: {
                'User-Agent': randomUA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            },
            timeout: 10000
        });

        return {
            success: true,
            statusCode: response.status,
            responseTime: Date.now(),
            blocked: false,
            data: response.data
        };

    } catch (error) {
        const isBlocked = error.response && (
            error.response.status === 429 || // Too Many Requests
            error.response.status === 403 || // Forbidden
            (error.response.status === 503 && error.response.data.includes('blocked'))
        );

        return {
            success: false,
            statusCode: error.response ? error.response.status : 'TIMEOUT',
            responseTime: Date.now(),
            blocked: isBlocked,
            error: error.message
        };
    }
}

// Функція для логування результатів
async function logResult(logEntry) {
    const logLine = `${new Date().toISOString()} | ${JSON.stringify(logEntry)}\n`;
    
    try {
        await fs.appendFile(CONFIG.logFile, logLine);
        console.log('✅ Записано в лог:', logEntry);
    } catch (error) {
        console.error('❌ Помилка запису в лог:', error.message);
    }
}

// Основна функція тестування
async function runIPRotationTest() {
    console.log('🚀 Початок тестування ротації IP на Heroku');
    
    const currentIP = await getCurrentIP();
    const testStartTime = Date.now();
    
    console.log(`🔍 Поточний IP: ${currentIP}`);
    console.log(`📝 Тестовий запит: "${CONFIG.testQuery}"`);
    
    const results = {
        startTime: new Date().toISOString(),
        initialIP: currentIP,
        requests: [],
        summary: {}
    };

    for (let i = 1; i <= CONFIG.maxRequestsPerTest; i++) {
        console.log(`\n📊 Запит ${i}/${CONFIG.maxRequestsPerTest}`);
        
        const requestStartTime = Date.now();
        const testResult = await testGoogleSearch(CONFIG.testQuery, i);
        const requestEndTime = Date.now();
        
        const logEntry = {
            requestNumber: i,
            ip: currentIP,
            timestamp: new Date().toISOString(),
            ...testResult,
            responseTime: requestEndTime - requestStartTime
        };
        
        results.requests.push(logEntry);
        await logResult(logEntry);
        
        // Перевіряємо чи заблоковані
        if (testResult.blocked) {
            console.log('🚫 ЗАБЛОКОВАНО! IP потребує ротації');
            break;
        }
        
        // Затримка між запитами
        if (i < CONFIG.maxRequestsPerTest) {
            console.log(`⏱️  Очікування ${CONFIG.delayBetweenRequests}ms...`);
            await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenRequests));
        }
    }
    
    // Аналіз результатів
    const successfulRequests = results.requests.filter(r => r.success).length;
    const blockedRequests = results.requests.filter(r => r.blocked).length;
    
    results.summary = {
        totalRequests: results.requests.length,
        successfulRequests,
        blockedRequests,
        successRate: (successfulRequests / results.requests.length * 100).toFixed(2),
        testDuration: Date.now() - testStartTime
    };
    
    console.log('\n📈 РЕЗУЛЬТАТИ ТЕСТУВАННЯ:');
    console.log(`✅ Успішних запитів: ${successfulRequests}/${results.requests.length}`);
    console.log(`🚫 Заблокованих: ${blockedRequests}`);
    console.log(`📊 Успішність: ${results.summary.successRate}%`);
    console.log(`⏱️  Тривалість: ${results.summary.testDuration}ms`);
    
    // Зберігаємо повний звіт
    await fs.writeFile('test_results.json', JSON.stringify(results, null, 2));
    
    return results;
}

// API endpoints
app.get('/', (req, res) => {
    res.send(`
        <h1>🔄 Heroku IP Rotation Tester</h1>
        <p><strong>Поточний час:</strong> ${new Date().toLocaleString()}</p>
        <h2>Доступні ендпоінти:</h2>
        <ul>
            <li><a href="/test">GET /test</a> - Запустити тест</li>
            <li><a href="/ip">GET /ip</a> - Перевірити поточний IP</li>
            <li><a href="/logs">GET /logs</a> - Переглянути логи</li>
            <li><a href="/results">GET /results</a> - Останні результати</li>
            <li><a href="/stress-test">GET /stress-test</a> - Стрес-тест (запити кожну секунду)</li>
            <li><a href="/crash-report">GET /crash-report</a> - Звіт про крах системи</li>
            <li><a href="/restart-hint">GET /restart-hint</a> - Інструкції для ротації IP</li>
        </ul>
    `);
});

app.get('/test', async (req, res) => {
    try {
        console.log('🎯 Отримано запит на тестування');
        const results = await runIPRotationTest();
        res.json(results);
    } catch (error) {
        console.error('❌ Помилка під час тестування:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/ip', async (req, res) => {
    const ip = await getCurrentIP();
    res.json({ 
        ip: ip,
        timestamp: new Date().toISOString(),
        heroku_dyno: process.env.DYNO || 'local'
    });
});

app.get('/logs', async (req, res) => {
    try {
        const logs = await fs.readFile(CONFIG.logFile, 'utf-8');
        res.type('text/plain');
        res.send(logs);
    } catch (error) {
        res.status(404).json({ error: 'Логи не знайдені' });
    }
});

app.get('/results', async (req, res) => {
    try {
        const results = await fs.readFile('test_results.json', 'utf-8');
        res.json(JSON.parse(results));
    } catch (error) {
        res.status(404).json({ error: 'Результати не знайдені' });
    }
});

app.get('/restart-hint', (req, res) => {
    res.json({
        message: 'Для ротації IP на Heroku:',
        methods: [
            'heroku restart --app YOUR_APP_NAME',
            'heroku ps:restart --app YOUR_APP_NAME', 
            'Через Heroku Dashboard -> More -> Restart all dynos'
        ],
        note: 'Після рестарту IP адреса зміниться'
    });
});

// Глобальна змінна для контролю стрес-тесту
let stressTestRunning = false;

// Стрес-тест: запити кожну секунду до падіння
app.get('/stress-test', async (req, res) => {
    if (stressTestRunning) {
        return res.json({ 
            error: 'Стрес-тест вже запущений!', 
            message: 'Дочекайтесь завершення або рестартуйте dyno' 
        });
    }
    
    stressTestRunning = true;
    console.log('🔥 Початок стрес-тесту');
    
    const results = {
        startTime: new Date().toISOString(),
        initialIP: await getCurrentIP(),
        requests: [],
        isRunning: true
    };
    
    res.json({ message: 'Стрес-тест запущений. Дивіться логи.', initialIP: results.initialIP });
    
    let requestCount = 0;
    const stressInterval = setInterval(async () => {
        if (!results.isRunning) {
            clearInterval(stressInterval);
            return;
        }
        
        requestCount++;
        console.log(`🚀 Стрес-запит #${requestCount}`);
        
        try {
            const testResult = await testGoogleSearch('stress test', requestCount);
            const logEntry = {
                requestNumber: requestCount,
                ip: results.initialIP,
                timestamp: new Date().toISOString(),
                ...testResult
            };
            
            results.requests.push(logEntry);
            await logResult(logEntry);
            
            if (!testResult.success) {
                console.log(`💥 Перший провал на запиті #${requestCount}`);
            }
            
        } catch (error) {
            console.log(`💀 КРИТИЧНА ПОМИЛКА на запиті #${requestCount}:`, error.message);
            results.isRunning = false;
            stressTestRunning = false; // Скидаємо глобальний флаг
            clearInterval(stressInterval);
            
            // Записуємо результати краху
            const crashReport = {
                ...results,
                crashedAt: requestCount,
                crashTime: new Date().toISOString(),
                error: error.message
            };
            
            await fs.writeFile('crash_report.json', JSON.stringify(crashReport, null, 2));
            console.log('📄 Звіт про крах збережено в crash_report.json');
        }
    }, 1000); // Кожну секунду
    
    // Автоматичне зупинення через 10 хвилин якщо не впаде
    setTimeout(() => {
        if (results.isRunning) {
            results.isRunning = false;
            stressTestRunning = false; // Скидаємо глобальний флаг
            clearInterval(stressInterval);
            console.log('⏰ Стрес-тест зупинений через 10 хвилин');
        }
    }, 600000);
});

app.get('/stop-stress', (req, res) => {
    stressTestRunning = false;
    res.json({ message: 'Стрес-тест зупинений примусово' });
});

app.get('/crash-report', async (req, res) => {
    try {
        const report = await fs.readFile('crash_report.json', 'utf-8');
        res.json(JSON.parse(report));
    } catch (error) {
        res.status(404).json({ error: 'Звіт про крах не знайдено' });
    }
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🌐 Сервер запущений на порту ${PORT}`);
    console.log(`🔍 Перевірте IP: http://localhost:${PORT}/ip`);
    console.log(`🧪 Запустити тест: http://localhost:${PORT}/test`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('👋 Сервер зупиняється...');
    process.exit(0);
});
