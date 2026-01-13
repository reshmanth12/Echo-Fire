const ROW_NUMBERS = [0, 2, 4, 6, 8];
const COLORS = { 
    blue: '#007bff', 
    green: '#28a745', 
    red: '#dc3545', 
    yellow: '#FFD700' 
};

const LIGHT_COLORS = {
    '#007bff': '#e6f2ff', 
    '#28a745': '#e6ffea', 
    '#dc3545': '#ffe6e6', 
    '#FFD700': '#fffde6'  
};

let playerCount = 2;
let players = [];
let currentPlayerIndex = 0;
let gameState = 'SETUP'; // SETUP, TOSS, ROLL, SHOOT, PAUSE_MENU, VICTORY, ANIMATING
let board = {};
let currentRollValue = null; 
let notificationTimeout = null;
let isVsComputer = false; 

let lastRolls = {}; 
let consecutiveCount = {}; 

// --- CONTROLLER STATE ---
let currentFocusEl = null;
let shootingTargets = []; 
let shootingFocusIndex = 0;
let isEditingInput = false;
let isMouseMoving = false; 

// --- INITIALIZATION ---
window.onload = function() {
    checkForSavedGame();
    if(document.getElementById('step-2').classList.contains('hidden') === false) {
        renderPlayerConfig(); 
    }
    refreshInteractables();
    focusFirstElement();
    
    document.body.addEventListener('mousemove', () => {
        isMouseMoving = true;
        clearTimeout(window.mouseTimer);
        window.mouseTimer = setTimeout(() => isMouseMoving = false, 200);
    });
};

function checkForSavedGame() {
    const stored = localStorage.getItem('lms_saved_game');
    if (stored) {
        const data = JSON.parse(stored);
        document.getElementById('saved-game-section').classList.remove('hidden');
        if(data.savedAt) {
            document.getElementById('saved-game-date').innerText = "Last Saved: " + data.savedAt;
        }
    }
}

// ======================================================
//  INTERACTION & NAVIGATION SYSTEM
// ======================================================

function getVisibleInteractables() {
    // IMPORTANT: If shooting, DO NOT find menu buttons.
    if (gameState === 'SHOOT') return [];

    const all = Array.from(document.querySelectorAll('button, input, .color-dot, .nav-item, .pause-btn'));
    return all.filter(el => {
        return el.offsetParent !== null && !el.disabled && !el.classList.contains('hidden');
    });
}

function focusFirstElement() {
    const list = getVisibleInteractables();
    if(list.length > 0) setFocus(list[0]);
}

function setFocus(el) {
    if(currentFocusEl) currentFocusEl.classList.remove('keyboard-focus');
    currentFocusEl = el;
    if(currentFocusEl) currentFocusEl.classList.add('keyboard-focus');
}

function refreshInteractables() {
    // CRITICAL FIX: Disable menu highlighting during shooting
    if (gameState === 'SHOOT') return;

    const list = getVisibleInteractables();
    
    list.forEach(el => {
        el.onmouseenter = () => { if(isMouseMoving && !isEditingInput) setFocus(el); };

        if(el.tagName === 'INPUT') {
            el.onclick = () => {
                setFocus(el);
                isEditingInput = true;
                el.focus();
                el.classList.add('keyboard-focus');
            };
        }
        else if (el.classList.contains('color-dot')) {
            el.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                let pid = el.dataset.pid;
                let color = el.dataset.color;
                pickColor(pid, color, el);
                setFocus(el);
            };
        }
        else if (el.tagName === 'BUTTON') {
            // Using inline attributes or simple click logic
            el.addEventListener('click', () => {
                setFocus(el);
                setTimeout(() => {
                    refreshInteractables();
                    if(currentFocusEl && currentFocusEl.offsetParent === null) focusFirstElement();
                }, 100);
            });
        }
    });
}

function findNextFocus(direction) {
    if(!currentFocusEl) return focusFirstElement();
    
    const rect = currentFocusEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    
    const candidates = getVisibleInteractables().filter(el => el !== currentFocusEl);
    let bestCandidate = null;
    let minDist = Infinity;

    candidates.forEach(el => {
        const r = el.getBoundingClientRect();
        const ecx = r.left + r.width / 2;
        const ecy = r.top + r.height / 2;
        
        let dx = ecx - cx;
        let dy = ecy - cy;
        let dist = Math.sqrt(dx*dx + dy*dy);
        
        let isValid = false;

        if (direction === 'UP') { if (ecy < cy - 5) isValid = true; }
        else if (direction === 'DOWN') { if (ecy > cy + 5) isValid = true; }
        else if (direction === 'LEFT') { if (ecx < cx && Math.abs(dy) < 40) isValid = true; }
        else if (direction === 'RIGHT') { if (ecx > cx && Math.abs(dy) < 40) isValid = true; }

        if (isValid) {
            if ((direction === 'UP' || direction === 'DOWN') && Math.abs(dx) > 100) dist += 1000;
            if (dist < minDist) {
                minDist = dist;
                bestCandidate = el;
            }
        }
    });

    if (bestCandidate) setFocus(bestCandidate);
}

// === GLOBAL KEY HANDLER ===
window.addEventListener('keydown', function(e) {
    
    // 1. ANIMATION LOCK
    if (gameState === 'ANIMATING') return;

    // 2. INPUT EDITING
    if (isEditingInput) {
        if (e.key === 'Enter' || e.key === 'Escape') {
            document.activeElement.blur(); 
            isEditingInput = false;
        }
        return; 
    }

    // 3. PAUSE MENU TOGGLE
    if (e.key === 'Escape' || e.key === 'Backspace') {
        if(gameState === 'ROLL' || gameState === 'SHOOT' || gameState === 'PAUSE_MENU') {
            togglePauseMenu();
            return;
        }
    }

    // 4. NAVIGATION KEYS
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault(); 
        
        if (gameState === 'SHOOT') {
            handleShootingNav(e.key);
        } else if (gameState === 'ROLL') {
            // No nav in roll
        } else {
            let dir = e.key.replace('Arrow', '').toUpperCase();
            findNextFocus(dir);
        }
        return;
    }

    // 5. ENTER KEY
    if (e.key === 'Enter') {
        e.preventDefault();
        
        if (gameState === 'ROLL') {
            const p = players[currentPlayerIndex];
            if (!p.isBot) roll(p.id);
            return;
        }

        if (gameState === 'SHOOT') {
            handleShootingFire();
            return;
        }

        // Generic Menu Click
        if (currentFocusEl) {
            if (currentFocusEl.tagName === 'INPUT') {
                isEditingInput = true;
                currentFocusEl.focus();
                currentFocusEl.classList.add('keyboard-focus');
            } else {
                currentFocusEl.click(); 
            }
        }
    }
});

// --- PAUSE MENU LOGIC ---
function togglePauseMenu() {
    const menu = document.getElementById('pause-menu');
    if (gameState === 'PAUSE_MENU') {
        // CLOSE
        menu.classList.add('hidden');
        // Restore state
        if(currentRollValue !== null && players[currentPlayerIndex].eliminated === false) {
             gameState = 'SHOOT';
             if(shootingTargets.length > 0) updateShootingFocus(); // Restore Aim Visuals
        } else {
             gameState = 'ROLL';
        }
        
        if(document.activeElement) document.activeElement.blur();
        if(currentFocusEl) currentFocusEl.classList.remove('keyboard-focus');
        currentFocusEl = null;

        setStatus(gameState === 'SHOOT' ? "Resume Shooting" : "Resume Rolling");
    } else {
        // OPEN
        menu.classList.remove('hidden');
        gameState = 'PAUSE_MENU';
        setStatus("Game Paused");
        setTimeout(() => {
            refreshInteractables();
            const firstBtn = menu.querySelector('button');
            if(firstBtn) setFocus(firstBtn);
        }, 50);
    }
}

// --- SHOOTING LOGIC (SEPARATED) ---
function enableShooting(shooterId) {
    gameState = 'SHOOT'; 
    shootingFocusIndex = 0; 
    shootingTargets = [];
    
    // Clear any menu focus
    if(currentFocusEl) {
        currentFocusEl.classList.remove('keyboard-focus');
        currentFocusEl = null;
    }

    players.forEach(p => {
        if (p.id === shooterId || p.eliminated) return;
        ROW_NUMBERS.forEach(num => {
            const k = `${p.id}_${num}`; 
            if (!board[k].dead && board[k].stage > 0) {
                shootingTargets.push({ 
                    playerId: p.id, 
                    rowNum: num, 
                    elementId: `cell-${p.id}-${num}` 
                });
            }
        });
    });

    if (players[shooterId].isBot) { 
        setTimeout(() => executeBotShot(shooterId), 1000); 
        return; 
    }

    if(shootingTargets.length > 0) {
        setStatus("Select Target: Arrows to Aim, Enter to Shoot");
        
        // Initial Visuals
        shootingTargets.forEach((t, idx) => {
            const el = document.getElementById(t.elementId);
            el.classList.add('valid-target'); // Red Blink
            
            // Mouse Interaction
            el.onmouseenter = () => { 
                if(isMouseMoving && gameState === 'SHOOT') {
                    shootingFocusIndex = idx; 
                    updateShootingFocus(); 
                }
            };
            el.onclick = () => { 
                if(gameState === 'SHOOT') {
                    shootingFocusIndex = idx; 
                    handleShootingFire(); 
                }
            };
        });
        
        updateShootingFocus(); // Green Lock on first
    } else { 
        setStatus("No Targets!"); 
        setTimeout(() => nextTurn(), 1000); 
    }
}

function handleShootingNav(key) {
    if (shootingTargets.length === 0) return;
    
    if (key === 'ArrowRight' || key === 'ArrowDown') {
        shootingFocusIndex = (shootingFocusIndex + 1) % shootingTargets.length;
    } else {
        shootingFocusIndex = (shootingFocusIndex - 1 + shootingTargets.length) % shootingTargets.length;
    }
    
    updateShootingFocus();
}

function updateShootingFocus() {
    // Clear old locks
    shootingTargets.forEach(t => {
        const el = document.getElementById(t.elementId);
        if(el) el.classList.remove('aim-locked');
    });

    // Apply new lock
    const t = shootingTargets[shootingFocusIndex];
    if (t) {
        const el = document.getElementById(t.elementId);
        if(el) {
            el.classList.add('aim-locked');
            // Ensure visible if scrolled? (Game fits screen usually)
        }
    }
}

function handleShootingFire() {
    const t = shootingTargets[shootingFocusIndex];
    if (t) shoot(players[currentPlayerIndex].id, t.playerId, t.rowNum);
}

// ======================================================
//  GAME SETUP LOGIC
// ======================================================

function showBotMenu() {
    document.getElementById('step-1').classList.add('hidden');
    document.getElementById('step-bot').classList.remove('hidden');
    setTimeout(() => { refreshInteractables(); focusFirstElement(); }, 50);
}

function goBackToMain() {
    document.getElementById('step-bot').classList.add('hidden');
    document.getElementById('step-1').classList.remove('hidden');
    setTimeout(() => { refreshInteractables(); focusFirstElement(); }, 50);
}

function goBackToStep1() {
    goHome();
}

function setupBotGame(numBots) {
    isVsComputer = true;
    playerCount = 1 + numBots; 
    document.getElementById('step-bot').classList.add('hidden');
    document.getElementById('step-2').classList.remove('hidden');
    renderPlayerConfig();
    setTimeout(() => { refreshInteractables(); focusFirstElement(); }, 50);
}

function setupPlayers(count) {
    isVsComputer = false;
    playerCount = count;
    document.getElementById('step-1').classList.add('hidden');
    document.getElementById('step-2').classList.remove('hidden');
    renderPlayerConfig();
    setTimeout(() => { refreshInteractables(); focusFirstElement(); }, 50);
}

function renderPlayerConfig() {
    const container = document.getElementById('player-config');
    container.innerHTML = '';
    
    if (isVsComputer) {
        container.innerHTML += `
            <div class="player-input-row">
                <span style="font-weight:bold; margin-right:10px;">YOU:</span>
                <input type="text" id="p0-name" value="Player" style="width:80px;" tabindex="-1">
                <div style="display:flex; gap:5px;" id="p0-colors">
                    <div class="color-dot" style="background:${COLORS.blue}" data-pid="0" data-color="blue" onclick="pickColor(0, 'blue', this)"></div>
                    <div class="color-dot" style="background:${COLORS.green}" data-pid="0" data-color="green" onclick="pickColor(0, 'green', this)"></div>
                    <div class="color-dot" style="background:${COLORS.red}" data-pid="0" data-color="red" onclick="pickColor(0, 'red', this)"></div>
                    <div class="color-dot" style="background:${COLORS.yellow}" data-pid="0" data-color="yellow" onclick="pickColor(0, 'yellow', this)"></div>
                </div>
            </div>
            <p style="font-size:12px; color:#666;">(Bots will pick remaining colors automatically)</p>
        `;
    } else {
        for (let i = 0; i < playerCount; i++) {
            container.innerHTML += `
                <div class="player-input-row">
                    <input type="text" id="p${i}-name" value="P${i+1}" style="width:50px;" tabindex="-1">
                    <div style="display:flex; gap:5px;" id="p${i}-colors">
                        <div class="color-dot" style="background:${COLORS.blue}" data-pid="${i}" data-color="blue" onclick="pickColor(${i}, 'blue', this)"></div>
                        <div class="color-dot" style="background:${COLORS.green}" data-pid="${i}" data-color="green" onclick="pickColor(${i}, 'green', this)"></div>
                        <div class="color-dot" style="background:${COLORS.red}" data-pid="${i}" data-color="red" onclick="pickColor(${i}, 'red', this)"></div>
                        <div class="color-dot" style="background:${COLORS.yellow}" data-pid="${i}" data-color="yellow" onclick="pickColor(${i}, 'yellow', this)"></div>
                    </div>
                </div>`;
        }
    }
    refreshInteractables();
}

// === COLOR PICKING LOGIC (ROBUST) ===
let playerColors = {};

function pickColor(pIdx, color, el) {
    const existingPlayer = Object.keys(playerColors).find(key => playerColors[key] === color);
    if (existingPlayer && existingPlayer != pIdx) {
        document.getElementById('error-msg').innerText = `Color taken!`;
        return; 
    }
    if (playerColors[pIdx] === color) {
        el.classList.remove('selected');
        delete playerColors[pIdx];
        document.getElementById('error-msg').innerText = ""; 
        return;
    }
    document.getElementById('error-msg').innerText = "";
    Array.from(document.getElementById(`p${pIdx}-colors`).children).forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    playerColors[pIdx] = color;
}

function saveNames() { if (isVsComputer) return alert("Saving names disabled in Bot mode."); const names = []; for(let i=0; i<playerCount; i++) names.push(document.getElementById(`p${i}-name`).value); localStorage.setItem('lms_saved_names', JSON.stringify(names)); alert("Names Saved!"); }
function loadNames() { if (isVsComputer) return; const stored = localStorage.getItem('lms_saved_names'); if(stored) { const names = JSON.parse(stored); for(let i=0; i<playerCount && i<names.length; i++) document.getElementById(`p${i}-name`).value = names[i]; } else alert("No saved names found!"); }
function saveGame() { 
    if(gameState === 'SETUP' || gameState === 'TOSS') { alert("Cannot save during setup!"); return; } 
    const gameData = { playerCount, players, currentPlayerIndex, gameState, board, currentRollValue, lastRolls, consecutiveCount, isVsComputer, savedAt: new Date().toLocaleString() }; 
    localStorage.setItem('lms_saved_game', JSON.stringify(gameData)); 
    showNotification("Game Saved Successfully!", "green"); 
    if(gameState === 'PAUSE_MENU') togglePauseMenu();
}
function loadSavedGame() { const stored = localStorage.getItem('lms_saved_game'); if(!stored) return; const data = JSON.parse(stored); playerCount = data.playerCount; players = data.players; currentPlayerIndex = data.currentPlayerIndex; gameState = 'ROLL'; board = data.board; lastRolls = data.lastRolls || {}; consecutiveCount = data.consecutiveCount || {}; isVsComputer = data.isVsComputer || false; document.getElementById('setup-screen').classList.add('hidden'); document.getElementById('game-arena').classList.remove('hidden'); buildBoard(); players.forEach(p => { ROW_NUMBERS.forEach(num => { updateVisuals(p.id, num); if(board[`${p.id}_${num}`].dead) document.getElementById(`cell-${p.id}-${num}`).classList.add('perm-dead'); }); if(p.eliminated) eliminate(p.id); }); nextTurn(false); }

function startToss() {
    if (!playerColors[0]) { document.getElementById('error-msg').innerText = "Pick a color for yourself!"; return; }
    if (!isVsComputer && Object.keys(playerColors).length < playerCount) {
        document.getElementById('error-msg').innerText = "Pick colors for all players!"; return;
    }

    players = [];
    players.push({ id: 0, name: document.getElementById(`p0-name`) ? document.getElementById(`p0-name`).value : "Player", color: COLORS[playerColors[0]], isBot: false, eliminated: false });
    
    if (isVsComputer) {
        const availableColors = ['blue', 'green', 'red', 'yellow'].filter(c => c !== playerColors[0]);
        for(let i=1; i<playerCount; i++) players.push({ id: i, name: `Bot ${i}`, color: COLORS[availableColors[i-1]], isBot: true, eliminated: false });
    } else {
        for (let i = 1; i < playerCount; i++) players.push({ id: i, name: document.getElementById(`p${i}-name`).value, color: COLORS[playerColors[i]], isBot: false, eliminated: false });
    }
    
    for(let i=0; i<playerCount; i++) { lastRolls[i] = null; consecutiveCount[i] = 0; }
    localStorage.removeItem('lms_saved_game');
    document.getElementById('saved-game-section').classList.add('hidden');
    document.getElementById('setup-screen').classList.add('hidden');
    
    const tossOverlay = document.getElementById('toss-overlay');
    tossOverlay.classList.remove('hidden'); document.getElementById('toss-result').innerText = "";
    let gradient = "conic-gradient("; let slice = 100 / playerCount; 
    players.forEach((p, idx) => { gradient += `${p.color} ${idx * slice}% ${(idx + 1) * slice}%${idx < playerCount - 1 ? ', ' : ''}`; }); gradient += ")";
    const wheel = document.getElementById('wheel'); wheel.style.background = gradient; wheel.style.transition = 'none'; wheel.style.transform = 'rotate(0deg)'; wheel.offsetHeight; 
    const winnerIdx = Math.floor(Math.random() * playerCount);
    const targetRotation = (360 * 5) - ((winnerIdx * (360/playerCount)) + (180/playerCount));
    wheel.style.transition = 'transform 3s cubic-bezier(0.25, 0.1, 0.25, 1)';
    setTimeout(() => { wheel.style.transform = `rotate(${targetRotation}deg)`; }, 50);
    setTimeout(() => {
        const winner = players[winnerIdx]; const resText = document.getElementById('toss-result'); resText.innerText = `${winner.name} goes first!`; resText.style.color = winner.color; currentPlayerIndex = winnerIdx;
        setTimeout(() => { tossOverlay.classList.add('hidden'); initializeGame(); }, 2000);
    }, 3100); 
}

function initializeGame() {
    board = {}; players.forEach(p => { ROW_NUMBERS.forEach(num => { board[`${p.id}_${num}`] = { stage: 0, kills: 0, dead: false }; }); });
    document.getElementById('game-arena').classList.remove('hidden');
    buildBoard(); nextTurn(false); 
}

function buildBoard() {
    const grid = document.getElementById('grid'); const diceCont = document.getElementById('dice-container');
    grid.style.setProperty('--col-count', playerCount); grid.innerHTML = ''; diceCont.innerHTML = '';
    if(playerCount === 2) diceCont.className = 'two-players'; else diceCont.className = '';
    grid.appendChild(createDiv('header-cell', '#'));
    players.forEach(p => { const h = createDiv('header-cell', p.name); h.style.borderTop = `4px solid ${p.color}`; h.id = `head-${p.id}`; grid.appendChild(h); });
    grid.appendChild(createDiv('header-cell', '#'));
    ROW_NUMBERS.forEach(num => {
        const ln = createDiv('cell side-num', num); ln.id = `row-l-${num}`; grid.appendChild(ln);
        players.forEach(p => {
            const cell = document.createElement('div'); cell.className = 'cell'; cell.id = `cell-${p.id}-${num}`;
            cell.innerHTML = `<div class="kill-tracker" id="k-${p.id}-${num}">${'<div class="kill-dot"></div>'.repeat(6)}</div><div class="drawing-area"><div class="part part-head"></div><div class="part part-body"></div><div class="part part-arms"></div><div class="part part-legs"></div><div class="part part-gun"></div><div class="part part-gun-handle"></div><div class="bullet-indicators"><div class="bullet-dot bullet-1"></div><div class="bullet-dot bullet-2"></div><div class="bullet-dot bullet-3"></div></div></div>`;
            grid.appendChild(cell);
        });
        grid.appendChild(createDiv('cell side-num', num));
    });
    players.forEach((p, idx) => {
        const die = document.createElement('div'); die.className = `corner-die pos-${idx}`; die.id = `die-${p.id}`;
        die.innerHTML = `<span class="die-label">${p.name}</span><span id="val-${p.id}">🎲</span>`;
        die.onclick = () => { if(!p.isBot) roll(p.id); }; 
        diceCont.appendChild(die);
    });
    refreshInteractables(); 
}

function createDiv(cls, txt) { const d = document.createElement('div'); d.className = cls; d.innerText = txt; return d; }
function goHome() { if(confirm("Exit to Home?")) location.reload(); }
function restartGame() { if(confirm("Restart Game?")) { 
    document.getElementById('pause-menu').classList.add('hidden'); 
    document.getElementById('victory-screen').classList.add('hidden'); 
    document.getElementById('game-arena').classList.add('hidden'); 
    board = {}; startToss(); 
} }

function nextTurn(advance = true) {
    if(checkWin()) return;
    currentRollValue = null; 
    if(advance) { let loops = 0; do { currentPlayerIndex = (currentPlayerIndex + 1) % playerCount; loops++; } while (players[currentPlayerIndex].eliminated && loops < playerCount); }
    const p = players[currentPlayerIndex];
    gameState = 'ROLL'; setStatus(`${p.name}'s Turn`);
    document.body.style.backgroundColor = LIGHT_COLORS[p.color];
    document.querySelectorAll('.header-cell').forEach(h => { h.style.backgroundColor = '#ddd'; h.style.color = '#333'; });
    document.querySelectorAll('.cell').forEach(c => { c.style.borderColor = '#444'; c.style.backgroundColor = 'transparent'; });
    document.querySelectorAll('.corner-die').forEach(d => { d.classList.remove('my-turn'); d.style.borderColor = '#333'; d.style.boxShadow = '4px 4px 0px rgba(0,0,0,0.2)'; });
    const activeDie = document.getElementById(`die-${p.id}`); activeDie.classList.add('my-turn'); activeDie.style.borderColor = p.color; activeDie.style.boxShadow = `0 0 20px ${p.color}`;
    document.getElementById(`head-${p.id}`).style.backgroundColor = p.color; document.getElementById(`head-${p.id}`).style.color = '#fff';
    ROW_NUMBERS.forEach(num => { document.getElementById(`cell-${p.id}-${num}`).style.borderColor = p.color; document.getElementById(`cell-${p.id}-${num}`).style.backgroundColor = `${p.color}10`; });
    if (p.isBot) setTimeout(() => { roll(p.id); }, 500);
}

function getLotteryRoll(pId) {
    let randomEven = Math.floor(Math.random() * 151) * 2;
    let roll = randomEven % 10;
    if (lastRolls[pId] !== undefined && roll === lastRolls[pId]) {
        consecutiveCount[pId]++;
        if (consecutiveCount[pId] >= 4) { let newRandom = Math.floor(Math.random() * 151) * 2; randomEven = newRandom; consecutiveCount[pId] = 1; }
    } else consecutiveCount[pId] = 1;
    lastRolls[pId] = roll; return randomEven; 
}

function roll(pId) {
    if (pId !== currentPlayerIndex || gameState !== 'ROLL') return;
    gameState = 'ANIMATING';
    const valSpan = document.getElementById(`val-${pId}`);
    const startTime = Date.now();
    const iv = setInterval(() => {
        valSpan.innerText = Math.floor(Math.random() * 151) * 2;
        if (Date.now() - startTime > 1000) {
            clearInterval(iv); const fullRes = getLotteryRoll(pId); valSpan.innerText = fullRes; handleRollResult(pId, fullRes);
        }
    }, 50);
}

function handleRollResult(pId, fullNum) {
    let num = fullNum % 10; currentRollValue = num;
    document.querySelectorAll('.highlight-row-label').forEach(e => e.classList.remove('highlight-row-label'));
    document.getElementById(`row-l-${num}`).classList.add('highlight-row-label');
    const key = `${pId}_${num}`; const data = board[key];
    if (data.dead) { setStatus(`Rolled ${fullNum}. Block destroyed!`); setTimeout(() => nextTurn(), 1000); return; }
    if (data.stage < 4) { data.stage++; updateVisuals(pId, num); setStatus(`Rolled ${fullNum}. Building...`); setTimeout(() => nextTurn(), 800); } 
    else {
        if (data.stage < 7) { data.stage++; updateVisuals(pId, num); setStatus(data.stage === 7 ? `Rolled ${fullNum}. 3rd Bullet! (RISKY)` : `Rolled ${fullNum}. Bullet Loaded!`); enableShooting(pId); } 
        else { setStatus(`Rolled ${fullNum}. Full Ammo! SHOOT!`); enableShooting(pId); }
    }
}

function executeBotShot(botId) {
    let validTargets = [];
    players.forEach(p => {
        if (p.id !== botId && !p.eliminated) {
            ROW_NUMBERS.forEach(num => {
                let cellData = board[`${p.id}_${num}`];
                if (!cellData.dead && cellData.stage > 0) {
                    let threatScore = 10;
                    if (cellData.stage >= 5) threatScore = 80 + (cellData.stage*5);
                    else if (cellData.stage === 4) threatScore = 50; 
                    validTargets.push({ id: p.id, name: p.name, row: num, stage: cellData.stage, threat: threatScore, elementId: `cell-${p.id}-${num}` });
                }
            });
        }
    });
    if (validTargets.length === 0) { setStatus("Bot has no targets!"); setTimeout(() => nextTurn(), 1000); return; }
    validTargets.forEach(t => document.getElementById(t.elementId).classList.add('valid-target'));
    setStatus(`Bot ${players[botId].name} calculating shot...`);
    setTimeout(() => {
        validTargets.forEach(t => document.getElementById(t.elementId).classList.remove('valid-target'));
        validTargets.sort((a, b) => b.threat - a.threat);
        let finalTarget = validTargets[0];
        let targetEl = document.getElementById(finalTarget.elementId);
        targetEl.classList.add('valid-target'); targetEl.classList.add('aim-locked');
        setStatus(`Bot Locked: ${players[finalTarget.id].name} (Stage ${finalTarget.stage})`);
        setTimeout(() => { targetEl.classList.remove('valid-target'); targetEl.classList.remove('aim-locked'); shoot(botId, finalTarget.id, finalTarget.row); }, 1000);
    }, 1500);
}

function shoot(sId, vId, vNum) {
    if(gameState !== 'SHOOT') return;
    
    // Clear Visuals
    document.querySelectorAll('.valid-target').forEach(e => e.classList.remove('valid-target'));
    document.querySelectorAll('.aim-locked').forEach(e => e.classList.remove('aim-locked'));
    document.querySelectorAll('.cell').forEach(e => { e.onclick = null; e.onmouseenter = null; });

    const vData = board[`${vId}_${vNum}`]; vData.stage = 0; vData.kills++;
    if(vData.kills >= 6) { vData.dead = true; document.getElementById(`cell-${vId}-${vNum}`).classList.add('perm-dead'); }
    updateVisuals(vId, vNum);
    showNotification(`${players[sId].name} HIT ${players[vId].name}!`, players[sId].color);
    const shooterData = board[`${sId}_${currentRollValue}`];
    if (shooterData.stage === 7) {
        setStatus("HIT! Gun Exploded (Self-Kill)!");
        setTimeout(() => {
            shooterData.stage = 0; shooterData.kills++;   
            if(shooterData.kills >= 6) { shooterData.dead = true; document.getElementById(`cell-${sId}-${currentRollValue}`).classList.add('perm-dead'); }
            updateVisuals(sId, currentRollValue); checkWipeout(vId); checkWipeout(sId);
            setTimeout(() => nextTurn(), 1000);
        }, 1000);
    } else { setStatus("HIT! Target Reset."); checkWipeout(vId); setTimeout(() => nextTurn(), 1000); }
}

function showNotification(msg, color) { const el = document.getElementById('game-notification'); if(notificationTimeout) clearTimeout(notificationTimeout); el.innerText = msg; el.style.color = color || '#333'; el.style.borderColor = color || '#333'; el.classList.add('show'); notificationTimeout = setTimeout(() => { el.classList.remove('show'); }, 3000); }
function updateVisuals(pId, num) { const data = board[`${pId}_${num}`]; const cell = document.getElementById(`cell-${pId}-${num}`); for(let i=1; i<=7; i++) cell.classList.remove(`stage-${i}`); if(data.stage > 0) cell.classList.add(`stage-${data.stage}`); const dots = document.getElementById(`k-${pId}-${num}`).children; for(let i=0; i<6; i++) { if(i < data.kills) dots[i].classList.add('dead'); } }
function checkWipeout(pId) { let blockedCount = 0; let hasAnyPart = false; ROW_NUMBERS.forEach(n => { const d = board[`${pId}_${n}`]; if(d.dead) blockedCount++; if(d.stage > 0) hasAnyPart = true; }); if (blockedCount === 5 || !hasAnyPart) eliminate(pId); }
function eliminate(pId) { if(players[pId].eliminated) return; players[pId].eliminated = true; document.getElementById(`head-${pId}`).style.opacity = '0.3'; document.getElementById(`die-${pId}`).style.display = 'none'; }
function checkWin() { const alive = players.filter(p => !p.eliminated); if(alive.length === 1) { triggerVictory(alive[0]); return true; } if(alive.length === 0) { setStatus("DRAW! No Survivors."); return true; } return false; }
function setStatus(msg) { document.getElementById('status-bar').innerText = msg; }
function triggerVictory(winner) { const screen = document.getElementById('victory-screen'); const name = document.getElementById('winner-name'); const canvas = document.getElementById('fireworks'); const ctx = canvas.getContext('2d'); screen.classList.remove('hidden'); gameState = 'VICTORY'; name.innerText = `${winner.name} WINS!`; name.style.color = winner.color; canvas.width = window.innerWidth; canvas.height = window.innerHeight; const particleCount = 50; const spawnChance = 0.05; let fireworks = []; let particles = []; function loop() { ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; ctx.fillRect(0, 0, canvas.width, canvas.height); if (Math.random() < spawnChance) fireworks.push(new Firework()); fireworks = fireworks.filter(f => !f.dead); particles = particles.filter(p => !p.dead); fireworks.forEach(f => { f.update(); f.draw(); }); particles.forEach(p => { p.update(); p.draw(); }); requestAnimationFrame(loop); } class Firework { constructor() { this.x = Math.random() * canvas.width; this.y = canvas.height; this.targetY = Math.random() * (canvas.height / 2); this.speed = 5 + Math.random() * 5; this.color = `hsl(${Math.random() * 360}, 100%, 50%)`; this.dead = false; } update() { this.y -= this.speed; if (this.y <= this.targetY) { this.dead = true; for (let i = 0; i < particleCount; i++) particles.push(new Particle(this.x, this.y, this.color)); } } draw() { ctx.beginPath(); ctx.arc(this.x, this.y, 3, 0, Math.PI * 2); ctx.fillStyle = this.color; ctx.fill(); } } class Particle { constructor(x, y, color) { this.x = x; this.y = y; this.color = color; this.angle = Math.random() * Math.PI * 2; this.speed = Math.random() * 5 + 1; this.alpha = 1; this.decay = Math.random() * 0.02 + 0.01; this.gravity = 0.1; this.dead = false; } update() { this.x += Math.cos(this.angle) * this.speed; this.y += Math.sin(this.angle) * this.speed + this.gravity; this.alpha -= this.decay; if (this.alpha <= 0) this.dead = true; } draw() { ctx.globalAlpha = this.alpha; ctx.beginPath(); ctx.arc(this.x, this.y, 2, 0, Math.PI * 2); ctx.fillStyle = this.color; ctx.fill(); ctx.globalAlpha = 1; } } loop(); }