let map;
let marker;
let score = 0;
const IRKUTSK_COORDS = [52.2896, 104.2806];
const INITIAL_ZOOM = 12;
let currentLocation = null;
let allowMapClick = true;
let currentSetCode = 'aaaaaa';
let selectedSetId = null;
let competitionMode = false;
let currentAttempt = 0;
let competitionScore = 0;
let competitionLocations = [];
let currentCompetitionLocationIndex = 0;
let competitionStartTime = 0;
let explorerMode = false;
let locationMarkers = [];
let competitionTimerInterval;
let competitionTimeElapsed = 0;
let gaveUp = false;



document.addEventListener('DOMContentLoaded', function() {
    initMap();
    loadNewChallenge();
    setupEventListeners();
});

function initMap() {
    map = L.map('map-container', {
        zoomControl: false,
        dragging: true,
        doubleClickZoom: false,
        scrollWheelZoom: true,
        touchZoom: false
    }).setView(IRKUTSK_COORDS, INITIAL_ZOOM);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    map.on('click', function(e) {
        if (!allowMapClick) return;

        if (!marker) {
            marker = L.marker(e.latlng).addTo(map);
        } else {
            marker.setLatLng(e.latlng);
        }
        document.getElementById('guess-btn').disabled = false;
    });
}

async function loadNewChallenge() {
    try {
        const url = currentSetCode === 'aaaaaa' 
            ? '/api/game' 
            : `/api/game?set_code=${encodeURIComponent(currentSetCode)}`;
            
        const response = await fetch(url);
        if (!response.ok) throw new Error('Network response was not ok');

        const data = await response.json();
        if (!data.location) throw new Error('No location data received');
        
        currentLocation = data.location;
        document.getElementById('image-container').innerHTML = 
            `<img src="/static/uploads/${data.location.image_filename}" alt="${data.location.title}">`;
        
        document.getElementById('description-panel').innerHTML = `
            <h3>${data.location.title}</h3>
            <div class="description-content">
                ${data.location.description || 'Нет описания для этой локации'}
            </div>
        `;
        
        if (marker) {
            map.removeLayer(marker);
            marker = null;
        }

        map.setView(IRKUTSK_COORDS, INITIAL_ZOOM);
        document.getElementById('guess-btn').disabled = true;
        
    } catch (error) {
        console.error('Error loading challenge:', error);
        alert('Не удалось загрузить новую локацию. Пожалуйста, попробуйте снова.');
    }
}
    
function setupEventListeners() {
    document.getElementById('guess-btn').addEventListener('click', makeGuess);
    document.getElementById('continue-btn').addEventListener('click', continueGame);
    document.getElementById('show-description-btn').addEventListener('click', function() {
        document.getElementById('description-panel').classList.toggle('show');
    });
    document.getElementById('settings-btn').addEventListener('click', openSettings);
    document.getElementById('map-wrapper').addEventListener('mouseenter', () => {
        setTimeout(() => { map.invalidateSize(); }, 300);
    });
    document.querySelector('.close-settings-x').addEventListener('click', closeSettings)
    document.querySelectorAll('.map-provider-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const provider = this.dataset.provider;
            changeMapProvider(provider);
            document.querySelectorAll('.map-provider-btn').forEach(b => {
                b.classList.remove('active');
            });  
            this.classList.add('active');
        });
    });
    document.getElementById('admin-btn').addEventListener('click', async function() {
        const authData = await checkAuthStatus();
        if (authData.authenticated && authData.is_admin) {
            window.location.href = '/admin';
        } else if (authData.authenticated) {
            window.location.href = '/user';
        } else {
            // Показать сообщение или открыть панель авторизации
            alert('Требуется авторизация');
            toggleAuthPanel();
        }
    });
    document.getElementById('auth-btn').addEventListener('click', toggleAuthPanel);
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            switchAuthTab(tabName);
        });
    });
    document.getElementById('select-set-btn').addEventListener('click', selectPublicSet);
    document.getElementById('apply-code-btn').addEventListener('click', applySetCode);
    document.getElementById('set-search-input').addEventListener('input', filterPublicSets);

    document.getElementById('login-btn').addEventListener('click', loginUser);
    document.getElementById('register-btn').addEventListener('click', registerUser);

    document.querySelector('.close-set-select-x').addEventListener('click', closeSetSelect);
    document.getElementById('set-select-btn').addEventListener('click', openSetSelect);
    document.getElementById('set-info-btn').addEventListener('click', showSetInfo);

    document.querySelector('.close-set-info-x').addEventListener('click', closeSetInfo);
    document.getElementById('start-competition-btn').addEventListener('click', startCompetition);

    document.getElementById('leaderboard-btn').addEventListener('click', showLeaderboard);
    document.querySelector('.close-leaderboard-x').addEventListener('click', closeLeaderboard);

    document.getElementById('logout-btn').addEventListener('click', async function() {
        try {
            const response = await fetch('/logout');
            if (response.ok) {
                document.getElementById('user-info-overlay').style.display = 'none';
                await checkAuthStatus();
            }
        } catch (error) {
            console.error('Logout error:', error);
        }
    });

    document.querySelectorAll('.close-auth-x').forEach(btn => {
        btn.addEventListener('click', function() {
            document.getElementById('auth-overlay').style.display = 'none';
            document.getElementById('user-info-overlay').style.display = 'none';
            allowMapClick = true;
        });
    });
    document.getElementById('explorer-mode-btn').addEventListener('click', toggleExplorerMode);
    document.getElementById('give-up-btn').addEventListener('click', giveUpCompetition);
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
}

function makeGuess() {
    if (!marker || !currentLocation) return;

    allowMapClick = false;
    const guessLatLng = marker.getLatLng();
    const distance = calculateDistance(
        guessLatLng.lat,
        guessLatLng.lng,
        parseFloat(currentLocation.lat),
        parseFloat(currentLocation.lng)
    );
    
    let points = 0;
    const maxDistance = 3000;
        
    if (distance <= maxDistance) {
        const k = 5;
        points = Math.round(1000 * Math.exp(-k * distance / maxDistance));
    }
    
    if (competitionMode) {
        competitionScore += points;
    } else {
        score += points;
    }

    const correctMarker = L.marker([currentLocation.lat, currentLocation.lng], {
        icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34]
        })
    }).addTo(map);
    
    const line = L.polyline([guessLatLng, [currentLocation.lat, currentLocation.lng]], {
        color: 'red',
        weight: 2
    }).addTo(map);
    
    const mapWrapper = document.getElementById('map-wrapper');
    mapWrapper.classList.add('fullscreen');

    

    setTimeout(() => {
        map.invalidateSize();
    }, 300);

    const bounds = L.latLngBounds(guessLatLng, [currentLocation.lat, currentLocation.lng]);
    map.fitBounds(bounds, {padding: [50, 50]});
    
    const distanceKm = (distance / 1000).toFixed(2);
    document.getElementById('distance-cell').textContent = distanceKm;
    
    let comment = '';
    if (distance < 100) comment = 'Просто угадал';
    else if (distance < 500) comment = 'Это было близко';
    else if (distance < 1000) comment = 'Пон';
    else comment = 'Далеко...';
    
    document.getElementById('comment-cell').textContent = comment;
    document.getElementById('points-cell').textContent = points;
    document.getElementById('result-overlay').style.display = 'block';
    document.getElementById('guess-btn').style.display = 'none';
    document.getElementById('continue-btn').style.display = 'block';
    if (competitionMode) {
        document.getElementById('continue-btn').onclick = continueCompetition;
    } else {
        document.getElementById('continue-btn').onclick = continueGame;
    }
}

function continueGame() {
    allowMapClick = true;
    const mapWrapper = document.getElementById('map-wrapper');
    const guessBtn = document.getElementById('guess-btn');

    // Запрещаем перемещение карты
    map.dragging.disable();
    
    loadNewChallenge();    
    mapWrapper.classList.add('animating');
    mapWrapper.classList.remove('fullscreen');
    guessBtn.style.display = 'block';
    guessBtn.disabled = true;
    document.getElementById('continue-btn').style.display = 'none';
    
    setTimeout(() => {
        mapWrapper.classList.remove('animating');
        map.invalidateSize();
        
        document.getElementById('result-overlay').style.display = 'none';
        
        if (marker) {
            map.removeLayer(marker);
            marker = null;
        }
        map.eachLayer(layer => {
            if (layer instanceof L.Marker || layer instanceof L.Polyline) {
                map.removeLayer(layer);
            }
        });
        
        map.setView(IRKUTSK_COORDS, INITIAL_ZOOM);
        
        // Включаем перемещение карты обратно после анимации
        map.dragging.enable();

    }, 500);
}

function updateScore() {
    document.getElementById('current-score').textContent = score;
}

function openSettings() {
    document.getElementById('settings-overlay').style.display = 'flex';
    allowMapClick = false; // Блокируем клики по карте при открытых настройках
}

function closeSettings() {
    console.log('Закрытие настроек');
    document.getElementById('settings-overlay').style.display = 'none';
    allowMapClick = true;
    
    const settingsPanel = document.querySelector('.settings-panel');
    settingsPanel.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => {
        settingsPanel.style.animation = '';
    }, 300);
}


function changeMapProvider(provider) {
    map.eachLayer(layer => {
        if (layer instanceof L.TileLayer) {
            map.removeLayer(layer);
        }
    });
    
    switch(provider) {
        case 'satellite':
            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            }).addTo(map);
            break;
        case 'dark':
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>'
            }).addTo(map);
            break;
        default:
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            }).addTo(map);
    }
}

function changeVolume() {
    const volume = document.getElementById('volume-control').value / 100;
    // Если у вас есть аудио на странице, раскомментируйте:
    // const audio = document.getElementById('background-music');
    // if (audio) audio.volume = volume;
}

checkAuthStatus();

async function toggleAuthPanel() {
    const authData = await checkAuthStatus();
    
    if (authData.authenticated) {
        // Показываем информацию о пользователе
        document.getElementById('user-info-username').textContent = authData.username;
        document.getElementById('user-info-role').textContent = authData.is_admin ? 'Администратор' : 'Пользователь';
        document.getElementById('user-info-email').textContent = authData.email || 'Не указана';
        
        document.getElementById('user-info-overlay').style.display = 'flex';
        document.getElementById('user-info-overlay').style.animation = 'fadeIn 0.3s ease';
    } else {
        // Показываем стандартную панель авторизации
        document.getElementById('auth-overlay').style.display = 'flex';
        document.getElementById('auth-overlay').style.animation = 'fadeIn 0.3s ease';
    }
    allowMapClick = false;
}

async function loginUser() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const status = document.getElementById('auth-status');
    
    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
        });
        
        const data = await response.json();
        
        if (data.error) {
            status.textContent = data.error;
        } else {
            status.textContent = '';
            
            // Закрываем обе панели
            document.getElementById('auth-overlay').style.display = 'none';
            document.getElementById('user-info-overlay').style.display = 'none';
            allowMapClick = true;
            
            // Обновляем статус авторизации (например, меняем иконку)
            await checkAuthStatus();
        }
    } catch (error) {
        status.textContent = 'Ошибка соединения';
    }
}


async function registerUser() {
    const email = document.getElementById('register-email').value;
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;
    const status = document.getElementById('auth-status');
    
    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `email=${encodeURIComponent(email)}&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&confirm_password=${encodeURIComponent(confirm)}`
        });
        
        const data = await response.json();
        
        if (data.error) {
            status.textContent = data.error;
        } else {
            status.textContent = '';
            toggleAuthPanel();
            checkAuthStatus();
        }
    } catch (error) {
        status.textContent = 'Ошибка соединения';
    }
}

async function checkAuthStatus() {
    const response = await fetch('/check_auth');
    const data = await response.json();
    
    const authBtn = document.getElementById('auth-btn');
    if (data.authenticated) {
        authBtn.textContent = `❤️`;
    } else {
        authBtn.textContent = '👤';
    }
    
    return data;
}


function switchAuthTab(tabName) {
    const tabs = document.querySelectorAll('.auth-tab');
    const forms = document.querySelectorAll('.auth-form');
    const currentActiveTab = document.querySelector('.auth-tab.active');
    const newActiveTab = document.querySelector(`.auth-tab[data-tab="${tabName}"]`);
    const currentActiveForm = document.querySelector('.auth-form.active');
    const newActiveForm = document.getElementById(`${tabName}-form`);

    if (currentActiveTab === newActiveTab) return;

    // Обновляем активные вкладки
    tabs.forEach(tab => tab.classList.remove('active'));
    newActiveTab.classList.add('active');

    // Анимация перехода
    if (currentActiveForm) {
        currentActiveForm.classList.remove('active');
        currentActiveForm.classList.add('leaving');
    }

    newActiveForm.classList.add('active');
    
    // Очищаем статус
    document.getElementById('auth-status').textContent = '';
    
    // Убираем класс leaving после анимации
    setTimeout(() => {
        if (currentActiveForm) {
            currentActiveForm.classList.remove('leaving');
        }
    }, 300);
}


function closeSetSelect() {
    document.getElementById('set-select-overlay').style.display = 'none';
    allowMapClick = true;
}

async function applySetCode() {
    const code = document.getElementById('set-code-input').value.trim();
    if (!code) {
        alert('Пожалуйста, введите код набора');
        return;
    }
    
    try {
        const response = await fetch(`/api/set_exists?code=${encodeURIComponent(code)}`);
        if (!response.ok) throw new Error('Ошибка проверки набора');
        
        const data = await response.json();
        if (!data.exists) {
            alert('Набор с таким кодом не найден');
            return;
        }
        
        disableExplorerMode(); // Отключаем режим исследователя
        currentSetCode = code;
        closeSetSelect();
        loadNewChallenge();
    } catch (error) {
        console.error('Error checking set:', error);
        alert('Ошибка при проверке набора');
    }
}


function resetSetCode() {
    disableExplorerMode(); // Отключаем режим исследователя
    currentSetCode = 'aaaaaa';
    document.getElementById('set-code-input').value = currentSetCode;
    loadNewChallenge();
}

async function openSetSelect() {
    document.getElementById('set-select-overlay').style.display = 'flex';
    allowMapClick = false;
    selectedSetId = null;
    document.getElementById('select-set-btn').disabled = true;
    
    try {
        const response = await fetch('/api/public_sets');
        if (!response.ok) throw new Error('Failed to fetch public sets');
        
        const publicSets = await response.json();
        renderPublicSets(publicSets);
    } catch (error) {
        console.error('Error loading public sets:', error);
        alert('Не удалось загрузить общественные наборы');
    }
}

function renderPublicSets(sets) {
    const container = document.getElementById('public-sets-list');
    container.innerHTML = '';
    
    sets.forEach(set => {
        const setElement = document.createElement('div');
        setElement.className = 'public-set-item';
        setElement.dataset.setId = set.id;
        
        setElement.innerHTML = `
            <div class="set-header">
                <span class="set-name">${set.name}</span>
                <span class="set-code">${set.code}</span>
                <span class="set-competition-count">${set.competition_count}</span>
                ${set.sample_images.map(img => 
                    `<img src="/static/uploads/${img}" class="set-image">`
                ).join('')}
        `;
        
        setElement.addEventListener('click', () => {
            document.querySelectorAll('.public-set-item').forEach(item => {
                item.classList.remove('selected');
            });
            setElement.classList.add('selected');
            selectedSetId = set.id;
            document.getElementById('select-set-btn').disabled = false;
        });
        
        container.appendChild(setElement);
    });
}

function filterPublicSets() {
    const searchTerm = document.getElementById('set-search-input').value.toLowerCase();
    document.querySelectorAll('.public-set-item').forEach(item => {
        const setName = item.querySelector('.set-name').textContent.toLowerCase();
        item.style.display = setName.includes(searchTerm) ? 'block' : 'none';
    });
}

async function selectPublicSet() {
    if (!selectedSetId) return;
    
    try {
        const response = await fetch(`/api/set_info?id=${selectedSetId}`);
        if (!response.ok) throw new Error('Failed to fetch set info');
        
        const setInfo = await response.json();
        disableExplorerMode(); // Отключаем режим исследователя
        currentSetCode = setInfo.code;
        closeSetSelect();
        loadNewChallenge();
    } catch (error) {
        console.error('Error selecting set:', error);
        alert('Ошибка при выборе набора');
    }
}

async function showSetInfo() {
    try {
        const response = await fetch(`/api/set_info?code=${encodeURIComponent(currentSetCode)}`);
        if (!response.ok) throw new Error('Failed to fetch set info');
        
        const setInfo = await response.json();
        
        // Проверяем, есть ли у пользователя уже результаты для этого набора
        const userResults = await fetchUserCompetitionResults(setInfo.id);
        const attemptsUsed = userResults ? userResults.attempts : 0;
        const attemptsLeft = Math.max(0, setInfo.max_attempts - attemptsUsed);
        
        document.getElementById('attempts-count').textContent = attemptsLeft;
        document.getElementById('locations-count').textContent = setInfo.competition_count;
        document.getElementById('max-attempts').textContent = setInfo.max_attempts;
        
        // Показываем или скрываем кнопку старта в зависимости от оставшихся попыток
        const startBtn = document.getElementById('start-competition-btn');
        startBtn.style.display = attemptsLeft > 0 ? 'block' : 'none';
        startBtn.disabled = attemptsLeft <= 0;
        
        document.getElementById('set-info-overlay').style.display = 'flex';
        allowMapClick = false;
    } catch (error) {
        console.error('Error fetching set info:', error);
        alert('Не удалось загрузить информацию о наборе');
    }
}


function closeSetInfo() {
    document.getElementById('set-info-overlay').style.display = 'none';
    allowMapClick = true;
}

async function fetchUserCompetitionResults(setId) {
    try {
        const response = await fetch(`/api/user_competition_results?set_id=${setId}`);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error('Error fetching user results:', error);
        return null;
    }
}

async function startCompetition() {
    if (competitionMode) {
        alert('Соревнование уже идет!');
        return;
    }
    
    if (explorerMode) {
        alert('Пожалуйста, выключите режим исследователя перед началом соревнования!');
        return;
    }
    try {
        gaveUp = false;
        // Получаем информацию о наборе
        const setResponse = await fetch(`/api/set_info?code=${encodeURIComponent(currentSetCode)}`);
        if (!setResponse.ok) throw new Error('Failed to fetch set info');
        const setInfo = await setResponse.json();
        
        // Проверяем попытки
        const userResults = await fetchUserCompetitionResults(setInfo.id);
        const attemptsUsed = userResults ? userResults.attempts : 0;
        
        // Если попытки исчерпаны, выходим
        if (attemptsUsed >= setInfo.max_attempts) {
            alert('У вас больше нет попыток для этого набора');
            closeSetInfo();
            return;
        }
        
        // Получаем все локации для соревнования
        const locationsResponse = await fetch(`/api/competition_locations?set_id=${setInfo.id}&count=${setInfo.competition_count}`);
        if (!locationsResponse.ok) throw new Error('Failed to fetch competition locations');
        competitionLocations = await locationsResponse.json();
        
        if (!competitionLocations || competitionLocations.length === 0) {
            throw new Error('No locations available for competition');
        }
        
        // Инициализируем соревнование
        document.getElementById('set-info-btn').classList.add('competition-active');
        document.getElementById('give-up-btn').style.display = 'block';
        competitionMode = true;
        currentCompetitionLocationIndex = 0;
        competitionScore = 0;
        competitionStartTime = Date.now();
        currentAttempt = attemptsUsed + 1; // Увеличиваем счетчик попыток
        
        // Загружаем первую локацию
        startCompetitionTimer();
        loadCompetitionLocation();
        closeSetInfo();
        
    } catch (error) {
        console.error('Error starting competition:', error);
        alert('Ошибка при запуске соревнования');
    }
}

async function giveUpCompetition() {
    if (!confirm('Вы уверены, что хотите сдаться? Текущая попытка будет засчитана, но результаты не попадут в таблицу лидеров.')) {
        return;
    }
    
    gaveUp = true;
    endCompetition();
}

function loadCompetitionLocation() {
    if (!competitionMode || currentCompetitionLocationIndex >= competitionLocations.length) {
        endCompetition();
        return;
    }
    
    currentLocation = competitionLocations[currentCompetitionLocationIndex];
    
    document.getElementById('image-container').innerHTML = 
        `<img src="/static/uploads/${currentLocation.image_filename}" alt="${currentLocation.title}">`;
    
    document.getElementById('description-panel').innerHTML = `
        <h3>${currentLocation.title}</h3>
        <div class="description-content">
            ${currentLocation.description || 'Нет описания для этой локации'}
        </div>
    `;
    
    if (marker) {
        map.removeLayer(marker);
        marker = null;
    }
    
    map.setView(IRKUTSK_COORDS, INITIAL_ZOOM);
    document.getElementById('guess-btn').disabled = true;
    
}

async function endCompetition() {
    competitionMode = false;
    const duration = (Date.now() - competitionStartTime) / 1000;
    
    // Останавливаем таймер
    clearInterval(competitionTimerInterval);
    
    // Удаляем таймер и подсветку кнопки
    const timerElement = document.getElementById('competition-timer');
    if (timerElement) timerElement.remove();
    document.getElementById('set-info-btn').classList.remove('competition-active');
    
    // Скрываем кнопку "Сдаться"
    document.getElementById('give-up-btn').style.display = 'none';
    
    try {
        // Получаем информацию о наборе
        const setResponse = await fetch(`/api/set_info?code=${encodeURIComponent(currentSetCode)}`);
        if (!setResponse.ok) throw new Error('Failed to fetch set info');
        const setInfo = await setResponse.json();
        
        // Сохраняем результат только если не сдались
        if (!gaveUp) {
            const saveResponse = await fetch('/api/save_competition_result', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    set_id: setInfo.id,
                    score: competitionScore,
                    duration_seconds: duration,
                    attempts: currentAttempt
                })
            });
            
            if (!saveResponse.ok) throw new Error('Failed to save competition result');
            
            // Показываем результаты только если не сдались
            alert(`Соревнование завершено! Ваш результат: ${competitionScore} очков за ${Math.round(duration)} секунд`);
        } else {
            // Сохраняем только факт использования попытки
            const saveAttemptResponse = await fetch('/api/save_competition_attempt', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    set_id: setInfo.id,
                    attempts: currentAttempt
                })
            });
            
            if (!saveAttemptResponse.ok) throw new Error('Failed to save competition attempt');
            
            alert('Вы сдались. Попытка засчитана, но результаты не сохранены.');
        }
        
    } catch (error) {
        console.error('Error ending competition:', error);
        alert('Ошибка при завершении соревнования');
    }
    
    // Возвращаемся в обычный режим
    loadNewChallenge();
}


function continueCompetition() {
    currentCompetitionLocationIndex++;
    if (currentCompetitionLocationIndex < competitionLocations.length) {
        loadCompetitionLocation();
        
        // Сбрасываем UI для следующей локации
        const mapWrapper = document.getElementById('map-wrapper');
        mapWrapper.classList.remove('fullscreen');
        document.getElementById('result-overlay').style.display = 'none';
        document.getElementById('guess-btn').style.display = 'block';
        document.getElementById('continue-btn').style.display = 'none';
        
        if (marker) {
            map.removeLayer(marker);
            marker = null;
        }
        map.eachLayer(layer => {
            if (layer instanceof L.Marker || layer instanceof L.Polyline) {
                map.removeLayer(layer);
            }
        });
        
        map.setView(IRKUTSK_COORDS, INITIAL_ZOOM);
        allowMapClick = true;
    } else {
        endCompetition();
    }
}

async function showLeaderboard() {
    try {
        // Получаем информацию о текущем наборе
        const setResponse = await fetch(`/api/set_info?code=${encodeURIComponent(currentSetCode)}`);
        if (!setResponse.ok) throw new Error('Failed to fetch set info');
        const setInfo = await setResponse.json();
        
        // Получаем таблицу лидеров
        const leaderboardResponse = await fetch(`/api/set_leaderboard?set_id=${setInfo.id}`);
        if (!leaderboardResponse.ok) throw new Error('Failed to fetch leaderboard');
        const leaderboard = await leaderboardResponse.json();
        
        // Рендерим таблицу
        renderLeaderboard(leaderboard);
        
        // Показываем окно
        document.getElementById('leaderboard-overlay').style.display = 'flex';
        allowMapClick = false;
    } catch (error) {
        console.error('Error showing leaderboard:', error);
        alert('Не удалось загрузить таблицу лидеров');
    }
}

function closeLeaderboard() {
    document.getElementById('leaderboard-overlay').style.display = 'none';
    allowMapClick = true;
}

function renderLeaderboard(leaderboard) {
    const tbody = document.querySelector('#leaderboard-table tbody');
    tbody.innerHTML = '';
    
    if (leaderboard.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">Пока нет результатов</td></tr>';
        return;
    }
    
    // Рассчитываем рейтинг на основе комбинации счета и времени
    leaderboard.forEach((entry, index) => {
        const row = document.createElement('tr');
        
        // Рассчитываем рейтинг (чем больше очки и меньше время - тем лучше)
        const ratingScore = entry.score * (1 - (entry.duration_seconds / 3600)); // Нормализуем время
        
        // Форматируем время в минуты:секунды
        const minutes = Math.floor(entry.duration_seconds / 60);
        const seconds = Math.floor(entry.duration_seconds % 60);
        const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // Создаем звезды рейтинга (1-5 звезд)
        const stars = Math.min(5, Math.max(1, Math.floor(ratingScore / 200)));
        const starsHtml = '★'.repeat(stars) + '☆'.repeat(5 - stars);
        
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${entry.username}</td>
            <td>${entry.score}</td>
            <td>${timeStr}</td>
            <td class="rating-star">${starsHtml}</td>
        `;
        
        tbody.appendChild(row);
    });
}


async function toggleExplorerMode() {
    if (competitionMode) {
        alert('Нельзя включить режим исследователя во время соревнования!');
        return;
    }
    
    explorerMode = !explorerMode;
    const btn = document.getElementById('explorer-mode-btn');
    
    if (explorerMode) {
        btn.classList.add('active');
        allowMapClick = false;
        document.getElementById('guess-btn').disabled = true;
        
        // Загружаем все локации текущего набора
        try {
            const response = await fetch(`/api/set_locations?code=${encodeURIComponent(currentSetCode)}`);
            if (!response.ok) throw new Error('Failed to fetch set locations');
            
            const locations = await response.json();
            showAllLocations(locations);
        } catch (error) {
            console.error('Error loading set locations:', error);
            alert('Не удалось загрузить локации набора');
            explorerMode = false;
            btn.classList.remove('active');
        }
    } else {
        btn.classList.remove('active');
        allowMapClick = true;
        clearAllLocationMarkers();
    }
}

// Функция для отображения всех локаций набора
function showAllLocations(locations) {
    clearAllLocationMarkers();
    
    locations.forEach(location => {
        // Создаем маркер с иконкой
        const marker = L.marker([location.lat, location.lng], {
            icon: L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34]
            })
        }).addTo(map);
        
        // Создаем подпись над маркером
        const label = L.marker([location.lat, location.lng], {
            icon: L.divIcon({
                className: 'location-label',
                html: `<div>${location.title}</div>`,
                iconSize: [150, 20],  // Ширина достаточная для текста
                iconAnchor: [75, -15]  // Центрируем по горизонтали и поднимаем выше маркера
            }),
            zIndexOffset: 1000  // Чтобы подпись была поверх маркера
        }).addTo(map);
        
        // Обработчик клика на маркере
        marker.on('click', async function() {
            if (explorerMode) {
                currentLocation = location;
                document.getElementById('image-container').innerHTML = 
                    `<img src="/static/uploads/${location.image_filename}" alt="${location.title}">`;
                
                document.getElementById('description-panel').innerHTML = `
                    <h3>${location.title}</h3>
                    <div class="description-content">
                        ${location.description || 'Нет описания для этой локации'}
                    </div>
                `;
                
                map.setView([location.lat, location.lng], 15);
            }
        });
        
        locationMarkers.push(marker);
        locationMarkers.push(label);
    });
}

// Функция для очистки всех маркеров локаций
function clearAllLocationMarkers() {
    locationMarkers.forEach(marker => {
        map.removeLayer(marker);
    });
    locationMarkers = [];
}

function disableExplorerMode() {
    if (explorerMode) {
        explorerMode = false;
        document.getElementById('explorer-mode-btn').classList.remove('active');
        clearAllLocationMarkers();
        allowMapClick = true;
    }
}

function startCompetitionTimer() {
    competitionTimeElapsed = 0;
    updateTimerDisplay();
    competitionTimerInterval = setInterval(() => {
        competitionTimeElapsed++;
        updateTimerDisplay();
    }, 1000);
}

function updateTimerDisplay() {
    const minutes = Math.floor(competitionTimeElapsed / 60);
    const seconds = competitionTimeElapsed % 60;
    const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // Создаем или обновляем элемент таймера
    let timerElement = document.getElementById('competition-timer');
    if (!timerElement) {
        timerElement = document.createElement('div');
        timerElement.id = 'competition-timer';
        document.querySelector('.top-controls2').appendChild(timerElement);
    }
    timerElement.textContent = timeStr;
}