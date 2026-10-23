var canvas = document.getElementById('game');
var ctx = canvas.getContext('2d');
var W, H;

function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

var saveData = { coins: 0, unlockedLevel: 1, currentShip: 0, ownedShips: [0], highScore: 0 };

function loadProgress() {
  try {
    var saved = localStorage.getItem('spaceInvadersSave');
    if (saved) saveData = JSON.parse(saved);
  } catch(e) {}
}

function saveProgress() {
  try { localStorage.setItem('spaceInvadersSave', JSON.stringify(saveData)); } catch(e) {}
}

loadProgress();

var ships = [
  { name: 'Стандарт', cost: 0, color: '#00f0ff', damage: 1 },
  { name: 'Ниндзя', cost: 50, color: '#ff00e0', damage: 1 },
  { name: 'Звездный', cost: 150, color: '#ffd700', damage: 2 },
  { name: 'Разрушитель', cost: 500, color: '#ff2d6f', damage: 3 },
  { name: 'Легенда', cost: 5000, color: '#ffffff', damage: 5, isLegend: true }
];

var score = 0;
var currentLevel = 1;
var currentWave = 1;
var maxWaves = 1;
var gameState = 'menu';
var animationId = null;
var sessionCoins = 0;

var player = { x: 0, y: 0, w: 35, h: 25, speed: 8, cooldown: 0, maxCooldown: 4, damage: 1 };
var bullets = [];
var enemies = [];
var enemyBullets = [];
var particles = [];
var stars = [];
var keys = { ArrowLeft: false, ArrowRight: false, Space: false };
var touchX = null;

function showScreen(id) {
  var screens = document.querySelectorAll('.screen');
  for(var i=0; i<screens.length; i++) { screens[i].classList.remove('active'); }
  document.getElementById('gameUI').classList.remove('active');
  
  if (id) { document.getElementById(id).classList.add('active'); }
  
  if (id === 'mainMenu') {
    document.getElementById('menuCoins').textContent = saveData.coins;
    drawBackground();
  }
  if (id === 'shopScreen') {
    document.getElementById('shopCoins').textContent = saveData.coins;
    renderShop();
  }
  if (id === 'levelSelectScreen') { renderLevels(); }
}

function renderShop() {
  var grid = document.getElementById('shopGrid');
  grid.innerHTML = '';
  
  for (var i = 0; i < ships.length; i++) {
    var ship = ships[i];
    var isOwned = saveData.ownedShips.indexOf(i) !== -1;
    var isEquipped = saveData.currentShip === i;
    var btnText = isEquipped ? 'Выбран' : (isOwned ? 'Выбрать' : ship.cost + ' 🪙');
    var btnColor = isEquipped ? '#555' : (isOwned ? '#00f0ff' : '#ffd700');
    
    grid.innerHTML += 
      '<div class="shop-item" style="border-color:' + (isEquipped ? '#7cff6b' : '#333') + '; ' + (ship.isLegend ? 'background: linear-gradient(45deg, rgba(255,0,224,0.2), rgba(0,240,255,0.2));' : '') + '">' +
        '<div style="width:30px; height:20px; background:' + ship.color + '; clip-path: polygon(50% 0%, 100% 100%, 50% 80%, 0% 100%); margin-bottom:10px;"></div>' +
        '<h3 style="color:' + ship.color + '">' + ship.name + '</h3>' +
        '<button class="btn" style="background:' + btnColor + '; padding: 5px 10px; font-size: 0.8rem; min-width: 80px;" onclick="buyOrEquip(' + i + ')">' + btnText + '</button>' +
      '</div>';
  }
}

function buyOrEquip(index) {
  if (saveData.ownedShips.indexOf(index) !== -1) {
    saveData.currentShip = index;
  } else {
    if (saveData.coins >= ships[index].cost) {
      saveData.coins -= ships[index].cost;
      saveData.ownedShips.push(index);
      saveData.currentShip = index;
    } else { alert("Недостаточно монет!"); return; }
  }
  saveProgress();
  renderShop();
  document.getElementById('shopCoins').textContent = saveData.coins;
}

function renderLevels() {
  var grid = document.getElementById('levelsGrid');
  grid.innerHTML = '';
  for (var i = 1; i <= 30; i++) {
    var locked = i > saveData.unlockedLevel;
    var cls = locked ? 'level-btn locked' : 'level-btn';
    var click = locked ? '' : 'onclick="startLevel(' + i + ')"';
    grid.innerHTML += '<div class="' + cls + '" ' + click + '>' + i + '</div>';
  }
}

function getLevelConfig(level) {
  var rows = 2 + Math.floor(level / 3); if (rows > 6) rows = 6;
  var cols = 4 + Math.floor(level / 6); if (cols > 8) cols = 8;
  maxWaves = 1 + Math.floor(level / 5); if (maxWaves > 4) maxWaves = 4;

  var enemySpeed = 1.2 + (level * 0.1);
  var enemyFireRate = 0.005 + (level * 0.0015); 
  var enemyBulletSpeed = 4 + (level * 0.1);
  
  player.speed = 8 + Math.floor(level / 5) * 1.5;
  player.maxCooldown = Math.max(2, 4 - Math.floor(level / 5));
  player.damage = ships[saveData.currentShip].damage;

  return { rows: rows, cols: cols, enemySpeed: enemySpeed, enemyFireRate: enemyFireRate, enemyBulletSpeed: enemyBulletSpeed };
}

function startLevel(level) {
  currentLevel = level;
  currentWave = 1;
  score = 0;
  sessionCoins = 0;
  showScreen(null);
  document.getElementById('gameUI').classList.add('active');
  initGame();
  gameState = 'playing';
  if (animationId) cancelAnimationFrame(animationId);
  loop();
}

function initGame() {
  var config = getLevelConfig(currentLevel);
  player.x = W / 2;
  player.y = H - 60;
  bullets = []; enemyBullets = []; particles = []; enemies = []; stars = [];
  for (var i = 0; i < 50; i++) { stars.push({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 2 }); }
  spawnWave();
  updateUI();
}

function spawnWave() {
  enemies = [];
  var config = getLevelConfig(currentLevel);
  var spacingX = W / (config.cols + 1);
  var spacingY = 45;
  for (var r = 0; r < config.rows; r++) {
    for (var c = 0; c < config.cols; c++) {
      enemies.push({ x: spacingX * (c + 1), y: 100 + r * spacingY, w: 26, h: 18, alive: true, type: r % 3, speedX: config.enemySpeed });
    }
  }
  updateUI();
}

function updateUI() {
  document.getElementById('uiLevel').textContent = currentLevel;
  document.getElementById('uiWave').textContent = currentWave + '/' + maxWaves;
  document.getElementById('uiScore').textContent = score;
  document.getElementById('uiCoins').textContent = saveData.coins + sessionCoins;
}

function showLevelMessage(text) {
  var el = document.getElementById('levelMessage');
  el.textContent = text;
  el.style.opacity = 1;
  setTimeout(function() { el.style.opacity = 0; }, 1500);
}

window.addEventListener('keydown', function(e) {
  if (gameState !== 'playing') return;
  if (e.code === 'ArrowLeft') keys.ArrowLeft = true;
  if (e.code === 'ArrowRight') keys.ArrowRight = true;
  if (e.code === 'Space') { keys.Space = true; e.preventDefault(); }
});
window.addEventListener('keyup', function(e) {
  if (e.code === 'ArrowLeft') keys.ArrowLeft = false;
  if (e.code === 'ArrowRight') keys.ArrowRight = false;
  if (e.code === 'Space') keys.Space = false;
});
canvas.addEventListener('touchstart', function(e) { if(gameState==='playing') touchX = e.touches[0].clientX; }, { passive: true });
canvas.addEventListener('touchmove', function(e) { if(gameState==='playing') touchX = e.touches[0].clientX; }, { passive: true });
canvas.addEventListener('touchend', function() { touchX = null; }, { passive: true });

function update() {
  if (gameState !== 'playing') return;

  if (keys.ArrowLeft) player.x -= player.speed;
  if (keys.ArrowRight) player.x += player.speed;
  if (touchX !== null) {
    var dx = touchX - player.x;
    if (Math.abs(dx) > 5) player.x += Math.sign(dx) * Math.min(Math.abs(dx), player.speed * 1.5);
  }
  player.x = Math.max(player.w / 2, Math.min(W - player.w / 2, player.x));

  if (player.cooldown > 0) player.cooldown--;
  if ((keys.Space || touchX !== null) && player.cooldown === 0) {
    fireBullets();
    player.cooldown = player.maxCooldown;
  }

  for (var i = bullets.length - 1; i >= 0; i--) {
    bullets[i].x += bullets[i].vx || 0;
    bullets[i].y += bullets[i].vy || bullets[i].speed;
    if (bullets[i].y < -20 || bullets[i].x < -20 || bullets[i].x > W + 20) bullets.splice(i, 1);
  }

  var aliveEnemies = enemies.filter(function(e) { return e.alive; });
  var config = getLevelConfig(currentLevel);
  
  if (aliveEnemies.length > 0) {
    var hitWall = false;
    for (var k = 0; k < aliveEnemies.length; k++) {
      if (aliveEnemies[k].x - aliveEnemies[k].w / 2 <= 0 || aliveEnemies[k].x + aliveEnemies[k].w / 2 >= W) { hitWall = true; break; }
    }
    if (hitWall) {
      for (var m = 0; m < aliveEnemies.length; m++) { aliveEnemies[m].y += 10; aliveEnemies[m].speedX *= -1; }
    } else {
      for (var n = 0; n < aliveEnemies.length; n++) { aliveEnemies[n].x += aliveEnemies[n].speedX; }
    }
  }

  if (Math.random() < config.enemyFireRate && aliveEnemies.length > 0) {
    var s = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
    enemyBullets.push({ x: s.x, y: s.y + s.h / 2, speed: config.enemyBulletSpeed });
  }

  for (var p = enemyBullets.length - 1; p >= 0; p--) {
    enemyBullets[p].y += enemyBullets[p].speed;
    if (enemyBullets[p].y > H) enemyBullets.splice(p, 1);
  }

  for (var b = bullets.length - 1; b >= 0; b--) {
    for (var j = 0; j < enemies.length; j++) {
      if (enemies[j].alive && Math.abs(bullets[b].x - enemies[j].x) < enemies[j].w && Math.abs(bullets[b].y - enemies[j].y) < enemies[j].h) {
        enemies[j].alive = false; bullets.splice(b, 1); 
        score += 10 * currentLevel; sessionCoins += 1; updateUI();
        createExplosion(enemies[j].x, enemies[j].y, enemies[j].type); break;
      }
    }
  }

  for (var eb = enemyBullets.length - 1; eb >= 0; eb--) {
    if (Math.abs(enemyBullets[eb].x - player.x) < player.w / 2 && Math.abs(enemyBullets[eb].y - player.y) < player.h / 2) { gameOver(); return; }
  }
  for (var ae = 0; ae < aliveEnemies.length; ae++) {
    if (Math.abs(player.x - aliveEnemies[ae].x) < (player.w + aliveEnemies[ae].w) / 2 && Math.abs(player.y - aliveEnemies[ae].y) < (player.h + aliveEnemies[ae].h) / 2) { gameOver(); return; }
    if (aliveEnemies[ae].y > H - 100) { gameOver(); return; }
  }

  if (aliveEnemies.length === 0) {
    if (currentWave < maxWaves) { currentWave++; spawnWave(); showLevelMessage('ВОЛНА ' + currentWave); }
    else { levelWin(); return; }
  }

  for (var pt = particles.length - 1; pt >= 0; pt--) {
    var part = particles[pt]; part.x += part.vx; part.y += part.vy; part.life--;
    if (part.life <= 0) particles.splice(pt, 1);
  }
  for (var st = 0; st < stars.length; st++) { 
    stars[st].y += 0.5; if (stars[st].y > H) { stars[st].y = 0; stars[st].x = Math.random() * W; } 
  }
}

function fireBullets() {
  var dmg = player.damage;
  if (dmg === 1) {
    bullets.push({ x: player.x, y: player.y - player.h / 2, speed: -15 });
  } else if (dmg === 2) {
    bullets.push({ x: player.x - 8, y: player.y - player.h / 2, speed: -15 });
    bullets.push({ x: player.x + 8, y: player.y - player.h / 2, speed: -15 });
  } else if (dmg === 3) {
    bullets.push({ x: player.x, y: player.y - player.h / 2, speed: -15 });
    bullets.push({ x: player.x - 12, y: player.y - player.h / 2 + 5, speed: -15 });
    bullets.push({ x: player.x + 12, y: player.y - player.h / 2 + 5, speed: -15 });
  } else if (dmg === 5) { 
    bullets.push({ x: player.x, y: player.y - player.h / 2, speed: -15, vx: 0 });
    bullets.push({ x: player.x - 10, y: player.y - player.h / 2, speed: -14, vx: -5 });
    bullets.push({ x: player.x - 20, y: player.y - player.h / 2, speed: -13, vx: -10 });
    bullets.push({ x: player.x + 10, y: player.y - player.h / 2, speed: -14, vx: 5 });
    bullets.push({ x: player.x + 20, y: player.y - player.h / 2, speed: -13, vx: 10 });
    bullets.push({ x: player.x - 15, y: player.y - player.h / 2, speed: -12, vx: -8 });
    bullets.push({ x: player.x + 15, y: player.y - player.h / 2, speed: -12, vx: 8 });
    bullets.push({ x: player.x, y: player.y - player.h / 2 - 5, speed: -16, vx: 0 }); 
  }
}

function createExplosion(x, y, type) {
  var colors = ['#00f0ff', '#ff00e0', '#ffd700'];
  var color = colors[type % colors.length];
  for (var i = 0; i < 15; i++) {
    particles.push({ x: x, y: y, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, life: 30 + Math.random() * 20, color: color });
  }
}

function drawBackground() {
  ctx.fillStyle = '#05050a'; ctx.fillRect(0, 0, W, H);
  for (var i = 0; i < 50; i++) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
}

function draw() {
  ctx.fillStyle = '#05050a'; ctx.fillRect(0, 0, W, H);
  for (var i = 0; i < stars.length; i++) {
    ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + Math.random() * 0.5) + ')';
    ctx.fillRect(stars[i].x, stars[i].y, stars[i].s, stars[i].s);
  }

  if (gameState === 'playing' || gameState === 'paused' || gameState === 'gameover') {
    var shipColor = ships[saveData.currentShip].color;
    var isLegend = ships[saveData.currentShip].isLegend;
    
    ctx.save(); ctx.translate(player.x, player.y);
    ctx.shadowBlur = isLegend ? 25 : 15; ctx.shadowColor = shipColor;

    ctx.fillStyle = isLegend ? '#aa00ff' : '#0077ff';
    ctx.beginPath();
    ctx.moveTo(-player.w / 2, player.h / 2); ctx.lineTo(-player.w / 4, -player.h / 2);
    ctx.lineTo(0, player.h / 4); ctx.lineTo(player.w / 4, -player.h / 2);
    ctx.lineTo(player.w / 2, player.h / 2); ctx.closePath(); ctx.fill();

    ctx.fillStyle = shipColor;
    ctx.beginPath();
    ctx.moveTo(0, -player.h / 2 - 5); ctx.lineTo(player.w / 6, player.h / 2);
    ctx.lineTo(-player.w / 6, player.h / 2); ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#ffd700'; ctx.shadowColor = '#ffd700';
    ctx.beginPath();
    ctx.moveTo(-4, player.h / 2); ctx.lineTo(0, player.h / 2 + 10 + Math.random() * 5);
    ctx.lineTo(4, player.h / 2); ctx.closePath(); ctx.fill();
    
    if (isLegend) {
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, player.w, 0, Math.PI*2); ctx.stroke();
    }
    ctx.restore();

    ctx.shadowColor = '#fff'; ctx.shadowBlur = 10;
    for (var b = 0; b < bullets.length; b++) {
      ctx.fillStyle = '#fff';
      if (bullets[b].vx) {
        ctx.save();
        ctx.translate(bullets[b].x, bullets[b].y);
        ctx.rotate(Math.atan2(bullets[b].vy || bullets[b].speed, bullets[b].vx) - Math.PI/2);
        ctx.fillRect(-1.5, -12, 3, 18); 
        ctx.fillStyle = shipColor;
        ctx.fillRect(-3, -8, 6, 10); 
        ctx.restore();
      } else {
        ctx.fillRect(bullets[b].x - 1.5, bullets[b].y - 12, 3, 18); 
        ctx.fillStyle = shipColor;
        ctx.fillRect(bullets[b].x - 3, bullets[b].y - 8, 6, 10); 
      }
    }

    for (var e = 0; e < enemies.length; e++) {
      if (!enemies[e].alive) continue;
      var colors = ['#ff00e0', '#7cff6b', '#ffb84d'];
      ctx.fillStyle = colors[enemies[e].type % colors.length]; 
      ctx.shadowColor = colors[enemies[e].type % colors.length]; ctx.shadowBlur = 10;
      ctx.fillRect(enemies[e].x - enemies[e].w / 2, enemies[e].y - enemies[e].h / 2, enemies[e].w, enemies[e].h);
      ctx.fillStyle = '#05050a'; 
      ctx.fillRect(enemies[e].x - 6, enemies[e].y - 4, 4, 4); ctx.fillRect(enemies[e].x + 2, enemies[e].y - 4, 4, 4);
    }

    ctx.fillStyle = '#ff2d6f'; ctx.shadowColor = '#ff2d6f'; ctx.shadowBlur = 10;
    for (var eb = 0; eb < enemyBullets.length; eb++) ctx.fillRect(enemyBullets[eb].x - 2, enemyBullets[eb].y, 4, 12);

    for (var p = 0; p < particles.length; p++) {
      ctx.fillStyle = particles[p].color; ctx.globalAlpha = particles[p].life / 50; 
      ctx.fillRect(particles[p].x, particles[p].y, 4, 4);
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }
}

function loop() { 
  if (gameState !== 'paused') { update(); }
  draw(); animationId = requestAnimationFrame(loop); 
}

function togglePause() {
  if (gameState === 'playing') { gameState = 'paused'; showScreen('pauseScreen'); document.getElementById('gameUI').classList.remove('active'); }
  else if (gameState === 'paused') { gameState = 'playing'; showScreen(null); document.getElementById('gameUI').classList.add('active'); }
}

function quitToMenu() {
  gameState = 'menu';
  if (animationId) cancelAnimationFrame(animationId);
  saveData.coins += sessionCoins;
  sessionCoins = 0;
  saveProgress();
  showScreen('mainMenu');
}

function gameOver() {
  gameState = 'gameover';
  saveData.coins += sessionCoins;
  if (score > saveData.highScore) saveData.highScore = score;
  saveProgress();
  document.getElementById('finalScore').textContent = score;
  document.getElementById('earnedCoins').textContent = sessionCoins;
  showScreen('gameOverScreen');
}

function levelWin() {
  gameState = 'win';
  saveData.coins += sessionCoins;
  if (currentLevel + 1 > saveData.unlockedLevel && currentLevel < 30) { saveData.unlockedLevel = currentLevel + 1; }
  saveProgress();
  document.getElementById('winEarnedCoins').textContent = sessionCoins;
  showScreen('levelWinScreen');
}

function nextLevelFromWin() {
  if (currentLevel < 30) { startLevel(currentLevel + 1); } 
  else { showScreen('mainMenu'); }
}

showScreen('mainMenu');