const ROW_NUMBERS = [0, 2, 4, 6, 8];
const COLORS = { 
    blue: '#007bff', 
    green: '#28a745', 
    red: '#dc3545', 
    yellow: '#FFD700' 
};

let playerCount = 2;
let players = [];
let currentPlayerIndex = 0;
let gameState = 'ROLL';
let board = {};
let currentRollValue = null; 

// --- GAME SETUP ---
function setupPlayers(count) {
    playerCount = count;
    document.getElementById('step-1').classList.add('hidden');
    document.getElementById('step-2').classList.remove('hidden');
    const container = document.getElementById('player-config');
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        container.innerHTML += `
            <div class="player-input-row">
                <input type="text" id="p${i}-name" value="P${i+1}" style="width:50px;">
                <div style="display:flex; gap:5px;" id="p${i}-colors">
                    <div class="color-dot" style="background:${COLORS.blue}" onclick="pickColor(${i}, 'blue', this)"></div>
                    <div class="color-dot" style="background:${COLORS.green}" onclick="pickColor(${i}, 'green', this)"></div>
                    <div class="color-dot" style="background:${COLORS.red}" onclick="pickColor(${i}, 'red', this)"></div>
                    <div class="color-dot" style="background:${COLORS.yellow}" onclick="pickColor(${i}, 'yellow', this)"></div>
                </div>
            </div>`;
    }
}

let playerColors = {};

function pickColor(pIdx, color, el) {
    // 1. Check if taken by SOMEONE ELSE
    const existingPlayer = Object.keys(playerColors).find(key => playerColors[key] === color);
    
    // If taken by another player (and not me)
    if (existingPlayer && existingPlayer != pIdx) {
        document.getElementById('error-msg').innerText = `Color taken by Player ${parseInt(existingPlayer) + 1}!`;
        return; 
    }

    // 2. TOGGLE / UNDO Logic
    // If I clicked the color I already have, deselect it
    if (playerColors[pIdx] === color) {
        el.classList.remove('selected');
        delete playerColors[pIdx];
        document.getElementById('error-msg').innerText = ""; // Clear error
        return;
    }

    // 3. Normal Selection Logic
    // Clear error
    document.getElementById('error-msg').innerText = "";

    // Remove old selection visuals for this player
    Array.from(document.getElementById(`p${pIdx}-colors`).children).forEach(c => c.classList.remove('selected'));
    
    // Select the new dot
    el.classList.add('selected');
    playerColors[pIdx] = color;
}

function startGame() {
    // Check 1: Everyone picked a color?
    if (Object.keys(playerColors).length < playerCount) {
        document.getElementById('error-msg').innerText = "Pick colors for all players!";
        return;
    }
    
    // Check 2: All Unique? (Redundant but safe)
    const distinct = new Set(Object.values(playerColors));
    if(distinct.size < playerCount) {
        document.getElementById('error-msg').innerText = "All players must have different colors!";
        return;
    }

    players = []; board = {};
    for (let i = 0; i < playerCount; i++) {
        players.push({
            id: i,
            name: document.getElementById(`p${i}-name`).value,
            color: COLORS[playerColors[i]],
            eliminated: false
        });
    }
    
    players.forEach(p => {
        ROW_NUMBERS.forEach(num => {
            board[`${p.id}_${num}`] = { stage: 0, kills: 0, dead: false };
        });
    });

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('game-arena').classList.remove('hidden');
    
    buildBoard();
    nextTurn(false); 
}

function buildBoard() {
    const grid = document.getElementById('grid');
    const diceCont = document.getElementById('dice-container');
    
    grid.style.setProperty('--col-count', playerCount);
    grid.innerHTML = '';
    diceCont.innerHTML = '';
    
    if(playerCount === 2) diceCont.className = 'two-players';
    else diceCont.className = '';

    grid.appendChild(createDiv('header-cell', '#'));
    players.forEach(p => {
        const h = createDiv('header-cell', p.name);
        h.style.borderTop = `4px solid ${p.color}`;
        h.id = `head-${p.id}`;
        grid.appendChild(h);
    });
    grid.appendChild(createDiv('header-cell', '#'));

    ROW_NUMBERS.forEach(num => {
        const ln = createDiv('cell side-num', num);
        ln.id = `row-l-${num}`;
        grid.appendChild(ln);

        players.forEach(p => {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.id = `cell-${p.id}-${num}`;
            cell.innerHTML = `
                <div class="kill-tracker" id="k-${p.id}-${num}">
                    ${'<div class="kill-dot"></div>'.repeat(6)}
                </div>
                <div class="drawing-area">
                    <div class="part part-head"></div>
                    <div class="part part-body"></div>
                    <div class="part part-arms"></div>
                    <div class="part part-legs"></div>
                    <div class="part part-gun"></div>
                    <div class="part part-gun-handle"></div>
                    <div class="bullet-indicators">
                        <div class="bullet-dot bullet-1"></div>
                        <div class="bullet-dot bullet-2"></div>
                        <div class="bullet-dot bullet-3"></div>
                    </div>
                </div>
            `;
            grid.appendChild(cell);
        });

        grid.appendChild(createDiv('cell side-num', num));
    });

    players.forEach((p, idx) => {
        const die = document.createElement('div');
        die.className = `corner-die pos-${idx}`;
        die.id = `die-${p.id}`;
        die.innerHTML = `<span class="die-label">${p.name}</span><span id="val-${p.id}">🎲</span>`;
        die.onclick = () => roll(p.id);
        diceCont.appendChild(die);
    });
}

function createDiv(cls, txt) {
    const d = document.createElement('div');
    d.className = cls; d.innerText = txt; return d;
}

/* --- GAME LOOP --- */

function nextTurn(advance = true) {
    if(checkWin()) return;
    
    if(advance) {
        let loops = 0;
        do {
            currentPlayerIndex = (currentPlayerIndex + 1) % playerCount;
            loops++;
        } while (players[currentPlayerIndex].eliminated && loops < playerCount);
    }

    const p = players[currentPlayerIndex];
    gameState = 'ROLL';
    setStatus(`${p.name}'s Turn`);
    
    // 1. Reset visual highlights for all
    document.querySelectorAll('.header-cell').forEach(h => {
        h.style.backgroundColor = '#ddd'; h.style.color = '#333';
    });
    document.querySelectorAll('.cell').forEach(c => {
        c.style.borderColor = '#444'; c.style.backgroundColor = 'transparent';
    });
    document.querySelectorAll('.corner-die').forEach(d => {
        d.classList.remove('my-turn'); d.style.borderColor = '#333'; d.style.boxShadow = '4px 4px 0px rgba(0,0,0,0.2)';
    });

    // 2. Highlight CURRENT player
    const activeDie = document.getElementById(`die-${p.id}`);
    activeDie.classList.add('my-turn');
    activeDie.style.borderColor = p.color;
    activeDie.style.boxShadow = `0 0 20px ${p.color}`; 
    
    const head = document.getElementById(`head-${p.id}`);
    head.style.backgroundColor = p.color; head.style.color = '#fff';

    ROW_NUMBERS.forEach(num => {
        const cell = document.getElementById(`cell-${p.id}-${num}`);
        cell.style.borderColor = p.color;
        cell.style.backgroundColor = `${p.color}10`; 
    });
}

function roll(pId) {
    if (pId !== currentPlayerIndex || gameState !== 'ROLL') return;
    gameState = 'ANIMATING';
    
    const valSpan = document.getElementById(`val-${pId}`);
    let count = 0;
    const iv = setInterval(() => {
        valSpan.innerText = ROW_NUMBERS[Math.floor(Math.random()*5)];
        count++;
        if(count > 8) {
            clearInterval(iv);
            const res = ROW_NUMBERS[Math.floor(Math.random()*5)];
            valSpan.innerText = res;
            currentRollValue = res; 
            handleRollResult(pId, res);
        }
    }, 50);
}

function handleRollResult(pId, num) {
    document.querySelectorAll('.highlight-row-label').forEach(e => e.classList.remove('highlight-row-label'));
    document.getElementById(`row-l-${num}`).classList.add('highlight-row-label');

    const key = `${pId}_${num}`;
    const data = board[key];

    if (data.dead) {
        setStatus(`Rolled ${num}. Block destroyed!`);
        setTimeout(() => nextTurn(), 1000);
        return;
    }

    if (data.stage < 4) {
        data.stage++;
        updateVisuals(pId, num);
        setStatus(`Building...`);
        setTimeout(() => nextTurn(), 800);
    } else {
        if (data.stage < 7) {
            data.stage++;
            updateVisuals(pId, num);
            if(data.stage === 7) setStatus("3rd Bullet! (RISKY)");
            else setStatus("Bullet Loaded! SHOOT!");
            enableShooting(pId);
        } else {
            setStatus("Full Ammo! SHOOT!");
            enableShooting(pId);
        }
    }
}

function enableShooting(shooterId) {
    gameState = 'SHOOT';
    let targets = 0;
    
    players.forEach(p => {
        if (p.id === shooterId || p.eliminated) return;
        ROW_NUMBERS.forEach(num => {
            const k = `${p.id}_${num}`;
            // Target if NOT dead AND has parts
            if (!board[k].dead && board[k].stage > 0) {
                const cell = document.getElementById(`cell-${p.id}-${num}`);
                cell.classList.add('valid-target');
                cell.onclick = () => shoot(shooterId, p.id, num);
                targets++;
            }
        });
    });

    if(targets === 0) {
        setStatus("No Targets!");
        setTimeout(() => nextTurn(), 1000);
    }
}

function shoot(sId, vId, vNum) {
    if(gameState !== 'SHOOT') return;
    document.querySelectorAll('.valid-target').forEach(e => {
        e.classList.remove('valid-target'); e.onclick = null;
    });

    // 1. DAMAGE
    const vData = board[`${vId}_${vNum}`];
    vData.stage = 0; vData.kills++;
    if(vData.kills >= 6) {
        vData.dead = true;
        document.getElementById(`cell-${vId}-${vNum}`).classList.add('perm-dead');
    }
    updateVisuals(vId, vNum);
    
    // 2. SELF-KILL CHECK
    const shooterKey = `${sId}_${currentRollValue}`;
    const shooterData = board[shooterKey];
    
    if (shooterData.stage === 7) {
        setStatus("HIT! Gun Exploded (Self-Kill)!");
        setTimeout(() => {
            shooterData.stage = 0; shooterData.kills++;   
            if(shooterData.kills >= 6) {
                shooterData.dead = true;
                document.getElementById(`cell-${sId}-${currentRollValue}`).classList.add('perm-dead');
            }
            updateVisuals(sId, currentRollValue);
            checkWipeout(vId); checkWipeout(sId);
            setTimeout(() => nextTurn(), 1000);
        }, 1000);
    } else {
        setStatus("HIT! Target Reset.");
        checkWipeout(vId);
        setTimeout(() => nextTurn(), 1000);
    }
}

function updateVisuals(pId, num) {
    const data = board[`${pId}_${num}`];
    const cell = document.getElementById(`cell-${pId}-${num}`);
    for(let i=1; i<=7; i++) cell.classList.remove(`stage-${i}`);
    if(data.stage > 0) cell.classList.add(`stage-${data.stage}`);

    const dots = document.getElementById(`k-${pId}-${num}`).children;
    for(let i=0; i<6; i++) {
        if(i < data.kills) dots[i].classList.add('dead');
    }
}

function checkWipeout(pId) {
    let blockedCount = 0;
    let hasAnyPart = false;
    ROW_NUMBERS.forEach(n => {
        const d = board[`${pId}_${n}`];
        if(d.dead) blockedCount++;
        if(d.stage > 0) hasAnyPart = true;
    });
    // Eliminate if All Blocked OR No Parts Left
    if (blockedCount === 5 || !hasAnyPart) {
        eliminate(pId);
    }
}

function eliminate(pId) {
    if(players[pId].eliminated) return;
    players[pId].eliminated = true;
    document.getElementById(`head-${pId}`).style.opacity = '0.3';
    document.getElementById(`die-${pId}`).style.display = 'none';
}

function checkWin() {
    const alive = players.filter(p => !p.eliminated);
    if(alive.length === 1) {
        triggerVictory(alive[0]);
        return true;
    }
    if(alive.length === 0) {
        setStatus("DRAW! No Survivors.");
        return true;
    }
    return false;
}

function setStatus(msg) { document.getElementById('status-bar').innerText = msg; }

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && gameState === 'ROLL' && players.length > 0) {
        roll(players[currentPlayerIndex].id);
    }
});

/* --- CANVAS FIREWORKS --- */
function triggerVictory(winner) {
    const screen = document.getElementById('victory-screen');
    const name = document.getElementById('winner-name');
    const canvas = document.getElementById('fireworks');
    const ctx = canvas.getContext('2d');
    
    screen.classList.remove('hidden');
    name.innerText = `${winner.name} WINS!`;
    name.style.color = winner.color; 

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let fireworks = [];
    let particles = [];

    function loop() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (Math.random() < 0.05) fireworks.push(new Firework());

        fireworks = fireworks.filter(f => !f.dead);
        particles = particles.filter(p => !p.dead);

        fireworks.forEach(f => { f.update(); f.draw(); });
        particles.forEach(p => { p.update(); p.draw(); });

        requestAnimationFrame(loop);
    }

    class Firework {
        constructor() {
            this.x = Math.random() * canvas.width;
            this.y = canvas.height;
            this.targetY = Math.random() * (canvas.height / 2);
            this.speed = 5 + Math.random() * 5;
            this.color = `hsl(${Math.random() * 360}, 100%, 50%)`;
            this.dead = false;
        }
        update() {
            this.y -= this.speed;
            if (this.y <= this.targetY) {
                this.dead = true;
                for (let i = 0; i < 50; i++) particles.push(new Particle(this.x, this.y, this.color));
            }
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
        }
    }

    class Particle {
        constructor(x, y, color) {
            this.x = x; this.y = y; this.color = color;
            this.angle = Math.random() * Math.PI * 2;
            this.speed = Math.random() * 5 + 1;
            this.alpha = 1;
            this.decay = Math.random() * 0.02 + 0.01;
            this.gravity = 0.1;
            this.dead = false;
        }
        update() {
            this.x += Math.cos(this.angle) * this.speed;
            this.y += Math.sin(this.angle) * this.speed + this.gravity;
            this.alpha -= this.decay;
            if (this.alpha <= 0) this.dead = true;
        }
        draw() {
            ctx.save();
            ctx.globalAlpha = this.alpha;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
            ctx.restore();
        }
    }

    loop();
}
