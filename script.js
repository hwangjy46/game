const gameContainer = document.getElementById('game-container');
const player = document.getElementById('player');
const scoreDisplay = document.getElementById('score');
const levelDisplay = document.getElementById('level'); // 'Stage'로 사용
const startButton = document.getElementById('startButton');

let playerX = gameContainer.offsetWidth / 2 - player.offsetWidth / 2;
player.style.left = `${playerX}px`;

let playerSpeed = 5;
let bulletSpeed = 15;
let enemySpeed = 2; // 기본 적 속도
let itemSpeed = 3;
let initialEnemySpawnInterval = 1500; // 초기 적 생성 간격
let enemySpawnInterval = initialEnemySpawnInterval; // 현재 적 생성 간격
let enemySpawnCount = 1; // 한 번에 생성되는 적의 수

let bullets = [];
let enemies = [];
let items = [];
let currentBoss = null; // 현재 등장한 보스 객체

let score = 0;
let stage = 1; // 'level' 대신 'stage' 사용
let gameRunning = false;
let gameLoopId;
let enemySpawnIntervalId; // 일반 적 생성 인터벌 ID

// 스테이지 업 및 보스 등장 기준 점수
const STAGE_UP_SCORE_THRESHOLD = 100; // 100점마다 스테이지 업
const BOSS_APPEAR_SCORE_THRESHOLD = 200; // 200점마다 보스 등장

// 플래그 변수: 스테이지/보스 등장 중복 방지
let lastStageUpScore = 0; // 마지막으로 스테이지 업이 발생한 점수
let lastBossScore = 0;    // 마지막으로 보스가 등장한 점수

// 아이템 상태 변수
let isDoubleShotActive = false;
let isRapidFireActive = false;
let rapidFireInterval = 200; // 일반 연사 간격 (0.2초)
let currentRapidFireInterval = rapidFireInterval;
let rapidFireTimer; // 연사 아이템 지속 시간 타이머

// 키보드 입력 상태 관리
const keys = {
    ArrowLeft: false,
    ArrowRight: false,
    a: false,
    d: false,
    ' ': false // 스페이스바
};

document.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.key)) {
        keys[e.key] = true;
    }
});

document.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key)) {
        keys[e.key] = false;
        if (e.key === ' ') {
            canShoot = true; // 스페이스바 뗄 때 다시 발사 가능
        }
    }
});

// 스페이스바 연사 방지 및 연사 아이템 처리
let canShoot = true;
let lastShotTime = 0;

startButton.addEventListener('click', startGame);

function startGame() {
    startButton.style.display = 'none';
    score = 0;
    stage = 1;
    lastStageUpScore = 0; // 초기화
    lastBossScore = 0;    // 초기화
    scoreDisplay.textContent = `Score: ${score}`;
    levelDisplay.textContent = `Stage: ${stage}`;
    gameRunning = true;

    // 아이템 상태 초기화
    isDoubleShotActive = false;
    isRapidFireActive = false;
    currentRapidFireInterval = rapidFireInterval;
    clearTimeout(rapidFireTimer);

    // 난이도 관련 변수 초기화
    enemySpeed = 2;
    enemySpawnInterval = initialEnemySpawnInterval;
    enemySpawnCount = 1;

    // 기존 요소 제거 및 배열 초기화
    bullets.forEach(b => b.remove());
    enemies.forEach(e => e.remove());
    items.forEach(i => i.remove());
    if (currentBoss) {
        currentBoss.element.remove();
        currentBoss = null;
    }
    bullets = [];
    enemies = [];
    items = [];

    // 플레이어 초기 위치 설정
    playerX = gameContainer.offsetWidth / 2 - player.offsetWidth / 2;
    player.style.left = `${playerX}px`;

    // 게임 루프 시작
    gameLoopId = requestAnimationFrame(gameLoop);
    // 일반 적 생성 시작
    clearInterval(enemySpawnIntervalId); // 혹시 모를 이전 인터벌 클리어
    enemySpawnIntervalId = setInterval(spawnRegularEnemies, enemySpawnInterval);
}

function endGame() {
    gameRunning = false;
    cancelAnimationFrame(gameLoopId);
    clearInterval(enemySpawnIntervalId);
    startButton.textContent = "Restart Game";
    startButton.style.display = 'block';
    alert(`Game Over! Your score: ${score}\nReached Stage: ${stage}`);
}

// 스테이지 업 로직
function checkStageUp() {
    // 현재 점수가 다음 스테이지 업 점수보다 크거나 같고,
    // 이 점수대에서 아직 스테이지 업을 하지 않았다면 (플래그 사용)
    if (score >= (stage * STAGE_UP_SCORE_THRESHOLD) && score > lastStageUpScore) {
        stage++;
        levelDisplay.textContent = `Stage: ${stage}`;
        console.log(`Stage Up! Current Stage: ${stage}`);

        // 난이도 상승 (점수에 비례하여)
        enemySpeed += 0.2; // 적 속도 소폭 증가
        enemySpawnInterval = Math.max(500, initialEnemySpawnInterval - (stage - 1) * 50); // 적 생성 간격 감소 (최소 500ms)
        enemySpawnCount = Math.min(5, Math.floor(stage / 3) + 1); // 3스테이지마다 적 생성 수 증가 (최대 5개)

        clearInterval(enemySpawnIntervalId); // 기존 인터벌 클리어
        // 보스가 없다면 새로운 인터벌 설정, 보스가 있다면 보스 파괴 후 재개됨
        if (!currentBoss) { 
            enemySpawnIntervalId = setInterval(spawnRegularEnemies, enemySpawnInterval);
        }
        
        console.log(`Enemy Speed: ${enemySpeed.toFixed(1)}, Spawn Interval: ${enemySpawnInterval}ms, Spawn Count: ${enemySpawnCount}`);

        lastStageUpScore = score; // 스테이지 업이 발생한 점수 기록
    }
}

// 보스 등장 체크
function checkBossAppearance() {
    // 다음 보스 등장 점수 임계치 계산 (현재 점수를 기준으로 가장 가까운 BOSS_APPEAR_SCORE_THRESHOLD의 배수)
    const nextBossScoreThreshold = Math.ceil(score / BOSS_APPEAR_SCORE_THRESHOLD) * BOSS_APPEAR_SCORE_THRESHOLD;

    // 현재 점수가 보스 등장 임계치에 도달했거나 넘어섰고,
    // 아직 보스가 없고,
    // 이 임계치에서 보스가 한 번도 생성되지 않았다면 (플래그 사용)
    if (score >= nextBossScoreThreshold && !currentBoss && nextBossScoreThreshold > lastBossScore) {
        createBoss();
        lastBossScore = nextBossScoreThreshold; // 보스 등장 점수 기록

        // 보스가 등장할 때는 일반 적 생성을 일시 중단
        clearInterval(enemySpawnIntervalId);
    }
}

// 플레이어 이동
function movePlayer() {
    if (keys.ArrowLeft || keys.a) {
        playerX -= playerSpeed;
    }
    if (keys.ArrowRight || keys.d) {
        playerX += playerSpeed;
    }

    // 경계 처리
    if (playerX < 0) playerX = 0;
    if (playerX > gameContainer.offsetWidth - player.offsetWidth) {
        playerX = gameContainer.offsetWidth - player.offsetWidth;
    }
    player.style.left = `${playerX}px`;
}

// 미사일 생성
function createBullet(xOffset = 0) {
    const bullet = document.createElement('div');
    bullet.classList.add('bullet');
    bullet.style.left = `${playerX + player.offsetWidth / 2 - bullet.offsetWidth / 2 + xOffset}px`;
    bullet.style.bottom = `${player.offsetHeight}px`;
    gameContainer.appendChild(bullet);
    bullets.push(bullet);
}

// 총 발사 로직
function shoot() {
    const currentTime = Date.now();
    if (currentTime - lastShotTime < currentRapidFireInterval) {
        return; // 연사 속도에 따라 발사 제한
    }

    if (isDoubleShotActive) {
        createBullet(-10); // 왼쪽 미사일
        createBullet(10);  // 오른쪽 미사일
    } else {
        createBullet();
    }
    lastShotTime = currentTime;
}

// 일반 적 생성
function createEnemy() {
    if (!gameRunning) return;

    const enemy = document.createElement('div');
    enemy.classList.add('enemy');
    // 외계인 눈 추가
    const eye1 = document.createElement('div');
    eye1.classList.add('eye');
    const eye2 = document.createElement('div');
    eye2.classList.add('eye');
    enemy.appendChild(eye1);
    enemy.appendChild(eye2);

    enemy.style.left = `${Math.random() * (gameContainer.offsetWidth - 40)}px`;
    enemy.style.top = `0px`;
    gameContainer.appendChild(enemy);
    enemies.push(enemy);
}

// 보스 생성
function createBoss() {
    if (!gameRunning || currentBoss) return; // 이미 보스가 있으면 생성 안함

    const bossElement = document.createElement('div');
    bossElement.classList.add('boss');
    bossElement.style.left = `${gameContainer.offsetWidth / 2 - 50}px`; // 보스 중앙 배치
    bossElement.style.top = `0px`;
    gameContainer.appendChild(bossElement);

    const bossHealthDisplay = document.createElement('span');
    bossElement.appendChild(bossHealthDisplay);

    currentBoss = {
        element: bossElement,
        health: 10 + (stage * 10), // 스테이지에 따라 보스 체력 증가
        speed: 1, // 보스는 느리게 이동
        healthDisplay: bossHealthDisplay
    };
    currentBoss.healthDisplay.textContent = `HP: ${currentBoss.health}`;
    console.log("Boss appeared!");
}

// 아이템 생성 (적 파괴 시 일정 확률로)
function createItem(x, y) {
    const item = document.createElement('div');
    // 여기에 아이템 타입을 정확히 명시했습니다.
    const itemTypes = ['double', 'rapid']; // 이제 'double'과 'rapid'만 포함됩니다.
    const randomType = itemTypes[Math.floor(Math.random() * itemTypes.length)]; // 무작위 선택

    item.classList.add('item', randomType);
    item.textContent = randomType[0].toUpperCase(); // 아이템 종류 첫 글자 표시 (D, R)
    item.dataset.type = randomType; // 아이템 타입을 데이터 속성으로 저장

    item.style.left = `${x}px`;
    item.style.top = `${y}px`;
    gameContainer.appendChild(item);
    items.push(item);
}

// 아이템 효과 적용
function applyItemEffect(type) {
    const itemDuration = 5000; // 아이템 지속 시간 (5초)

    switch (type) {
        case 'double':
            isDoubleShotActive = true;
            setTimeout(() => {
                isDoubleShotActive = false;
            }, itemDuration);
            break;
        case 'rapid':
            isRapidFireActive = true;
            currentRapidFireInterval = 100; // 연사 속도 빠르게 (0.1초마다)
            clearTimeout(rapidFireTimer); // 기존 타이머 초기화
            rapidFireTimer = setTimeout(() => {
                isRapidFireActive = false;
                currentRapidFireInterval = rapidFireInterval; // 원래 속도로 복구
            }, itemDuration);
            break;
    }
}

// 일반 적만 주기적으로 생성하는 함수
function spawnRegularEnemies() {
    // 게임 중이 아니거나 보스가 등장해 있다면 일반 적 생성하지 않음
    if (!gameRunning || currentBoss) return; 

    for (let i = 0; i < enemySpawnCount; i++) {
        createEnemy();
    }
}


// 게임 업데이트 루프
function gameLoop() {
    if (!gameRunning) return;

    movePlayer(); // 플레이어 이동 업데이트

    // 스페이스바 누르고 있으면 발사
    if (keys[' ']) {
        shoot();
    }

    // 미사일 이동 및 충돌 체크
    // 역방향 루프를 사용하여 배열에서 요소를 안전하게 제거합니다.
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        let bulletY = parseInt(bullet.style.bottom);
        bulletY += bulletSpeed;
        bullet.style.bottom = `${bulletY}px`;

        // 미사일이 화면을 벗어나면 제거
        if (bulletY > gameContainer.offsetHeight) {
            bullet.remove();
            bullets.splice(i, 1);
            continue;
        }

        let hitSomething = false; // 미사일이 무언가에 맞았는지 확인

        // 보스와 미사일 충돌 체크
        if (currentBoss) {
            const bossRect = currentBoss.element.getBoundingClientRect();
            const bulletRect = bullet.getBoundingClientRect();

            if (
                bulletRect.left < bossRect.right &&
                bulletRect.right > bossRect.left &&
                bulletRect.top < bossRect.bottom &&
                bulletRect.bottom > bossRect.top
            ) {
                bullet.remove();
                bullets.splice(i, 1);
                currentBoss.health--;
                currentBoss.healthDisplay.textContent = `HP: ${currentBoss.health}`;
                if (currentBoss.health <= 0) {
                    currentBoss.element.remove();
                    currentBoss = null;
                    score += 500; // 보스 파괴 시 높은 점수
                    scoreDisplay.textContent = `Score: ${score}`;
                    checkStageUp(); // 보스 잡고 스테이지 업 체크
                    // 보스 파괴 후 다시 일반 적 생성 인터벌 시작
                    clearInterval(enemySpawnIntervalId);
                    enemySpawnIntervalId = setInterval(spawnRegularEnemies, enemySpawnInterval);
                }
                hitSomething = true;
            }
        }

        if (hitSomething) continue; // 보스에 맞았으면 다음 미사일로 넘어감

        // 일반 적과 미사일 충돌 체크 (보스에게 맞지 않았을 경우에만)
        for (let j = enemies.length - 1; j >= 0; j--) {
            const enemy = enemies[j];
            const enemyRect = enemy.getBoundingClientRect();
            const bulletRect = bullet.getBoundingClientRect();

            if (
                bulletRect.left < enemyRect.right &&
                bulletRect.right > enemyRect.left &&
                bulletRect.top < enemyRect.bottom &&
                bulletRect.bottom > enemyRect.top
            ) {
                bullet.remove();
                bullets.splice(i, 1);
                enemy.remove();
                enemies.splice(j, 1);
                score += 10;
                scoreDisplay.textContent = `Score: ${score}`;
                checkStageUp();       // 스테이지 업 체크
                checkBossAppearance(); // 보스 등장 체크
                 // 30% 확률로 아이템 드롭
                 if (Math.random() < 0.3) { 
                    createItem(enemyRect.left - gameContainer.getBoundingClientRect().left, enemyRect.top - gameContainer.getBoundingClientRect().top);
                }
                hitSomething = true; // 적에게 맞았음을 표시
                break; // 한 미사일은 하나의 적만 파괴
            }
        }
    }

    // 적 이동 및 플레이어와의 충돌 체크
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        let enemyY = parseInt(enemy.style.top);
        enemyY += enemySpeed; // 현재 스테이지에 맞는 적 속도 적용
        enemy.style.top = `${enemyY}px`;

        const playerRect = player.getBoundingClientRect();
        const enemyRect = enemy.getBoundingClientRect();

        if (enemyY > gameContainer.offsetHeight || // 적이 화면 밖으로 나가거나
            (playerRect.left < enemyRect.right &&   // 플레이어와 충돌하면
             playerRect.right > enemyRect.left &&
             playerRect.top < enemyRect.bottom &&
             playerRect.bottom > enemyRect.top)) {
            
            enemy.remove();
            enemies.splice(i, 1);
            endGame(); // 게임 오버
            return; // 게임 종료 후 루프 중단
        }
    }

    // 보스 이동 및 플레이어와의 충돌 체크
    if (currentBoss) {
        let bossY = parseInt(currentBoss.element.style.top);
        bossY += currentBoss.speed;
        currentBoss.element.style.top = `${bossY}px`;

        const playerRect = player.getBoundingClientRect();
        const bossRect = currentBoss.element.getBoundingClientRect();

        if (bossY > gameContainer.offsetHeight || // 보스가 화면 밖으로 나가거나
            (playerRect.left < bossRect.right &&   // 플레이어와 충돌하면
             playerRect.right > bossRect.left &&
             playerRect.top < bossRect.bottom &&
             playerRect.bottom > bossRect.top)) {
            
            currentBoss.element.remove();
            currentBoss = null;
            endGame(); // 게임 오버
            return; // 게임 종료 후 루프 중단
        }
    }

    // 아이템 이동 및 플레이어와의 충돌 체크
    for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        let itemY = parseInt(item.style.top);
        itemY += itemSpeed;
        item.style.top = `${itemY}px`;

        const playerRect = player.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();

        if (itemY > gameContainer.offsetHeight) { // 아이템이 화면을 벗어나면 제거
            item.remove();
            items.splice(i, 1);
            continue;
        }

        if (
            playerRect.left < itemRect.right &&
            playerRect.right > itemRect.left &&
            playerRect.top < itemRect.bottom &&
            playerRect.bottom > itemRect.top
        ) {
            item.remove();
            items.splice(i, 1);
            applyItemEffect(item.dataset.type); // 아이템 효과 적용
        }
    }

    gameLoopId = requestAnimationFrame(gameLoop);
}