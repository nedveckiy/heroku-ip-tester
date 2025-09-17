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
        
        // Затримка між запитами - точно 1 секунда
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
        <!DOCTYPE html>
        <html lang="uk">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>🔄 Heroku IP Rotation Tester</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #f5f5f5;
                }
                .container {
                    background: white;
                    padding: 30px;
                    border-radius: 10px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                h1 {
                    color: #333;
                    text-align: center;
                }
                .status {
                    text-align: center;
                    background: #e3f2fd;
                    padding: 15px;
                    border-radius: 5px;
                    margin: 20px 0;
                }
                .buttons {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 15px;
                    margin: 30px 0;
                }
                .btn {
                    padding: 15px 20px;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 16px;
                    text-decoration: none;
                    display: inline-block;
                    text-align: center;
                    transition: background-color 0.3s;
                }
                .btn-primary { background: #2196F3; color: white; }
                .btn-success { background: #4CAF50; color: white; }
                .btn-warning { background: #FF9800; color: white; }
                .btn-danger { background: #f44336; color: white; }
                .btn-info { background: #17a2b8; color: white; }
                .btn-secondary { background: #6c757d; color: white; }
                .btn:hover {
                    opacity: 0.9;
                    transform: translateY(-2px);
                }
                .stress-controls {
                    background: #fff3cd;
                    padding: 20px;
                    border-radius: 5px;
                    margin: 20px 0;
                    border-left: 4px solid #ffc107;
                }
                .stress-controls h3 {
                    margin-top: 0;
                    color: #856404;
                }
                ul {
                    list-style: none;
                    padding: 0;
                }
                li {
                    margin: 10px 0;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🔄 Heroku IP Rotation Tester</h1>
                
                <div class="status">
                    <strong>🕐 Поточний час:</strong> ${new Date().toLocaleString('uk-UA')}<br>
                    <strong>⚡ Статус:</strong> <span id="server-status">Активний</span>
                </div>

                <div class="buttons">
                    <a href="/ip" class="btn btn-primary">🌐 Перевірити IP</a>
                    <a href="/logs" class="btn btn-info">📋 Переглянути логи</a>
                </div>

                <div class="stress-controls">
                    <h3>⚠️ Стрес-тестування</h3>
                    <p>Запити кожну секунду з затримкою 1000мс до краху системи</p>
                    <div class="buttons">
                        <a href="/stress-test" class="btn btn-warning">🔥 Запустити стрес-тест</a>
                        <button onclick="stopStressTest()" class="btn btn-danger">🛑 STOP Стрес-тест</button>
                    </div>
                    <div class="buttons">
                        <a href="/crash-report" class="btn btn-secondary">📄 Звіт про крах</a>
                        <a href="/restart-hint" class="btn btn-info">🔄 Як ротувати IP</a>
                    </div>
                </div>
            </div>

            <script>
                async function stopStressTest() {
                    try {
                        const response = await fetch('/stop-stress');
                        const result = await response.json();
                        alert('✅ ' + result.message);
                        
                        // Оновлюємо статус
                        document.getElementById('server-status').textContent = 'Стрес-тест зупинено';
                        document.getElementById('server-status').style.color = '#28a745';
                        
                    } catch (error) {
                        alert('❌ Помилка: ' + error.message);
                    }
                }

                // Перевірка статусу стрес-тесту кожні 5 секунд
                setInterval(async () => {
                    try {
                        const response = await fetch('/stress-status');
                        const status = await response.json();
                        const statusElement = document.getElementById('server-status');
                        
                        if (status.running) {
                            statusElement.textContent = 'Стрес-тест активний (' + status.requestCount + ' запитів)';
                            statusElement.style.color = '#dc3545';
                        } else {
                            statusElement.textContent = 'Активний';
                            statusElement.style.color = '#28a745';
                        }
                    } catch (error) {
                        // Ігноруємо помилки статусу
                    }
                }, 5000);
            </script>
        </body>
        </html>
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

// Глобальні змінні для контролю стрес-тесту
let stressTestRunning = false;
let stressRequestCount = 0;
// Видаляємо stressTestInterval - більше не потрібен

// Стрес-тест: ПОСЛІДОВНІ запити без race conditions
app.get('/stress-test', async (req, res) => {
    if (stressTestRunning) {
        return res.json({ 
            error: 'Стрес-тест вже запущений!', 
            message: 'Дочекайтесь завершення або натисніть STOP',
            currentCount: stressRequestCount
        });
    }
    
    stressTestRunning = true;
    stressRequestCount = 0;
    console.log('🔥 Початок ПОСЛІДОВНОГО стрес-тесту (БЕЗ race conditions)');
    
    const results = {
        startTime: new Date().toISOString(),
        initialIP: await getCurrentIP(),
        requests: [],
        isRunning: true
    };
    
    res.json({ 
        message: 'ПОСЛІДОВНИЙ стрес-тест запущений. 1 запит -> затримка 1сек -> наступний запит.', 
        initialIP: results.initialIP,
        interval: 'Послідовно з затримкою 1000ms'
    });
    
    // ПОСЛІДОВНА функція без race conditions
    async function sequentialStressTest() {
        if (!stressTestRunning) {
            return;
        }
        
        // Інкрементуємо ПЕРЕД запитом
        stressRequestCount++;
        const currentRequestNumber = stressRequestCount;
        
        console.log(`🚀 Послідовний запит #${currentRequestNumber} [${new Date().toISOString()}]`);
        
        try {
            // Виконуємо запит СИНХРОННО
            const testResult = await testGoogleSearch('stress test', currentRequestNumber);
            const logEntry = {
                requestNumber: currentRequestNumber,
                ip: results.initialIP,
                timestamp: new Date().toISOString(),
                ...testResult
            };
            
            results.requests.push(logEntry);
            await logResult(logEntry);
            
            if (!testResult.success) {
                console.log(`💥 Перший провал на запиті #${currentRequestNumber}`);
            }
            
            console.log(`✅ Запит #${currentRequestNumber} завершено, чекаємо 1 секунду...`);
            
            // Чекаємо ТОЧНО 1 секунду перед наступним запитом
            setTimeout(sequentialStressTest, 1000);
            
        } catch (error) {
            console.log(`💀 КРИТИЧНА ПОМИЛКА на запиті #${currentRequestNumber}:`, error.message);
            
            // Зупиняємо тест
            stressTestRunning = false;
            
            // Записуємо результати краху
            const crashReport = {
                ...results,
                crashedAt: currentRequestNumber,
                crashTime: new Date().toISOString(),
                error: error.message,
                totalRequests: currentRequestNumber
            };
            
            try {
                await fs.writeFile('crash_report.json', JSON.stringify(crashReport, null, 2));
                console.log('📄 Звіт про крах збережено в crash_report.json');
            } catch (writeError) {
                console.error('❌ Не вдалося записати звіт про крах:', writeError.message);
            }
        }
    }
    
    // Запускаємо перший запит
    setTimeout(sequentialStressTest, 1000);
    
    // Автоматичне зупинення через 10 хвилин якщо не впаде
    setTimeout(() => {
        if (stressTestRunning) {
            stressTestRunning = false;
            console.log(`⏰ Стрес-тест зупинений через 10 хвилин. Виконано ${stressRequestCount} запитів`);
        }
    }, 600000); // 10 хвилин
});

app.get('/stop-stress', (req, res) => {
    if (stressTestRunning) {
        stressTestRunning = false;
        // Видаляємо stressTestInterval - тепер не використовується
        console.log(`🛑 ПОСЛІДОВНИЙ стрес-тест зупинений примусово після ${stressRequestCount} запитів`);
        res.json({ 
            message: `Стрес-тест зупинений після ${stressRequestCount} запитів`,
            totalRequests: stressRequestCount,
            method: 'sequential'
        });
    } else {
        res.json({ message: 'Стрес-тест не запущений' });
    }
});

// Новий ендпоінт для перевірки статусу
app.get('/stress-status', (req, res) => {
    res.json({
        running: stressTestRunning,
        requestCount: stressRequestCount,
        startTime: stressTestRunning ? new Date().toISOString() : null
    });
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
    console.log(`🔍 Дашборд: http://localhost:${PORT}/`);
    console.log(`🔍 Перевірте IP: http://localhost:${PORT}/ip`);
    console.log(`🧪 Запустити тест: http://localhost:${PORT}/test`);
    console.log(`⏱️  Стрес-тест: точно 1000мс між запитами`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('👋 Сервер зупиняється...');
    
    // Зупиняємо стрес-тест якщо запущений
    if (stressTestRunning) {
        stressTestRunning = false;
        console.log(`🛑 ПОСЛІДОВНИЙ стрес-тест зупинений через SIGTERM після ${stressRequestCount} запитів`);
    }
    
    process.exit(0);
});
