// ═══════════════════════════════════════════════════════════
//  MAIN  —  wires everything together
//  Modes: WAIT → DRAW → PLAY (→ PAUSE) → DRAW → ...
// ═══════════════════════════════════════════════════════════

// ── DOM refs ────────────────────────────────────────────────
const videoEl       = document.getElementById('webcam');
const gameCanvas    = document.getElementById('game-canvas');
const ctx           = gameCanvas.getContext('2d');
const scoreEl       = document.getElementById('score');
const levelEl       = document.getElementById('level');
const linesEl       = document.getElementById('lines');
const statusEl      = document.getElementById('status-text');
const gestureEl     = document.getElementById('gesture-badge');
const modeBadge     = document.getElementById('mode-badge');
const scorePop      = document.getElementById('score-pop');

// ── Resize canvas to fill window ────────────────────────────
function resizeCanvas() {
  gameCanvas.width  = window.innerWidth;
  gameCanvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ── Systems ──────────────────────────────────────────────────
const tetris   = new TetrisEngine(gameCanvas);
const gestureDetector = new GestureDetector(videoEl, ctx);
const airDraw  = new AirDrawing();

// ── Game state machine ───────────────────────────────────────
// Modes: 'WAIT' | 'DRAW' | 'PLAY' | 'PAUSE' | 'GAMEOVER'
let mode = 'WAIT';
let prevGesture = 'none';
let gestureHoldStart = 0;
const HOLD_THRESH = 700; // ms to confirm a gesture

// For movement repeat throttle
let lastMoveTime = 0;
let moveRepeat = 0;
const MOVE_INIT_DELAY = 400;
const MOVE_REPEAT_DELAY = 100;

// For draw mode: how long fist held → start draw; release fist → stop
let drawingActive = false;
let drawRecognized = false;
let recognizedType = null;
let recognizedAt = 0;
const RECOGNIZE_DISPLAY_TIME = 1200; // ms to show matched label before spawning

// Scale gesture state
let pinchScale = 1.0;
let lastPinchDist = null;

// ── Status messages ──────────────────────────────────────────
const STATUS = {
  WAIT:      'SHOW ✌️ PEACE SIGN TO START',
  DRAW:      '✊ DRAW YOUR PIECE IN THE AIR!',
  DRAW_OPEN: 'OPEN HAND TO CONFIRM PIECE',
  PLAY:      '✌️ NEW GAME  |  🖐 PAUSE',
  PAUSE:     'PAUSED — 🖐 OPEN HAND TO RESUME',
  GAMEOVER:  'GAME OVER — ✌️ TO PLAY AGAIN',
};

function setMode(m) {
  mode = m;
  modeBadge.className = '';
  if (m === 'DRAW') {
    modeBadge.textContent = '◈ DRAW MODE ◈';
    modeBadge.classList.add('draw');
    statusEl.textContent = STATUS.DRAW;
    airDraw.clear();
    drawingActive = false;
    drawRecognized = false;
    recognizedType = null;
  } else if (m === 'PLAY') {
    modeBadge.textContent = '◈ PLAY MODE ◈';
    modeBadge.classList.add('play');
    statusEl.textContent = STATUS.PLAY;
  } else if (m === 'PAUSE') {
    modeBadge.textContent = '◈ PAUSED ◈';
    modeBadge.classList.add('pause');
    statusEl.textContent = STATUS.PAUSE;
  } else if (m === 'WAIT') {
    modeBadge.textContent = '◈ WAITING ◈';
    modeBadge.classList.add('wait');
    statusEl.textContent = STATUS.WAIT;
  } else if (m === 'GAMEOVER') {
    modeBadge.textContent = '◈ GAME OVER ◈';
    statusEl.textContent = STATUS.GAMEOVER;
    showGameOver();
  }
}

// ── Score pop ────────────────────────────────────────────────
let popTimer = null;
function triggerScorePop(pts, lines) {
  const labels = ['', '', 'DOUBLE!', 'TRIPLE!!', 'TETRIS!!!'];
  const label = lines >= 2 ? labels[Math.min(lines, 4)] : `+${pts}`;
  scorePop.textContent = label;
  scorePop.className = 'show';
  clearTimeout(popTimer);
  popTimer = setTimeout(() => { scorePop.className = ''; }, 1300);
  scoreEl.textContent = tetris.score;
  levelEl.textContent = tetris.level;
  linesEl.textContent = tetris.lines;
}

// ── Tetris callbacks ──────────────────────────────────────────
tetris.onScorePop = triggerScorePop;

tetris.onNeedDraw = () => {
  // Piece landed — switch to DRAW mode
  setMode('DRAW');
};

tetris.onGameOver = (finalScore) => {
  setMode('GAMEOVER');
};

// ── Game over overlay ─────────────────────────────────────────
let gameOverEl = null;
function showGameOver() {
  if (gameOverEl) gameOverEl.remove();
  gameOverEl = document.createElement('div');
  gameOverEl.className = 'gameover-overlay';
  gameOverEl.innerHTML = `
    <div class="gameover-title">GAME OVER</div>
    <div class="gameover-score">SCORE: ${tetris.score}</div>
    <div class="gameover-sub">SHOW ✌️ TO PLAY AGAIN</div>
  `;
  document.getElementById('arena').appendChild(gameOverEl);
}

function hideGameOver() {
  if (gameOverEl) { gameOverEl.remove(); gameOverEl = null; }
}

// ── Gesture icons ─────────────────────────────────────────────
const GESTURE_ICONS = {
  peace: '✌️', open: '🖐', fist: '✊', point_up: '☝️',
  point_down: '👇', point_left: '👈', point_right: '👉',
  pinch: '🤏', pinch_wide: '🤙', none: '',
};

// ── Gesture handling ──────────────────────────────────────────
function handleGesture(gesture, now) {
  gestureEl.textContent = GESTURE_ICONS[gesture] || '';

  // Track hold duration
  if (gesture !== prevGesture) {
    prevGesture = gesture;
    gestureHoldStart = now;
    moveRepeat = 0;
    lastMoveTime = 0;
  }
  const heldMs = now - gestureHoldStart;

  // ── WAIT mode ─────────────────────────────────────────────
  if (mode === 'WAIT' || mode === 'GAMEOVER') {
    if (gesture === 'peace' && heldMs > HOLD_THRESH) {
      hideGameOver();
      tetris.reset();
      scoreEl.textContent = '0';
      levelEl.textContent = '1';
      linesEl.textContent = '0';
      setMode('DRAW');
    }
    return;
  }

  // ── Pause toggle (open hand, any mode during play) ────────
  if (gesture === 'open' && heldMs > HOLD_THRESH) {
    if (mode === 'PLAY') {
      tetris.paused = true;
      setMode('PAUSE');
      gestureHoldStart = now + 99999; // prevent immediate re-trigger
      return;
    }
    if (mode === 'PAUSE') {
      tetris.paused = false;
      setMode('PLAY');
      gestureHoldStart = now + 99999;
      return;
    }
  }

  // ── DRAW mode ─────────────────────────────────────────────
  if (mode === 'DRAW') {
    if (gesture === 'fist') {
      // Actively drawing
      if (!drawingActive) { drawingActive = true; airDraw.clear(); }
    } else if (drawingActive) {
      // Released fist — recognize what was drawn
      drawingActive = false;
      const result = airDraw.recognize();
      if (result) {
        recognizedType = result.type;
        drawRecognized = true;
        recognizedAt = now;
        statusEl.textContent = `✓ ${result.type}-PIECE! OPEN HAND TO SPAWN →`;
      }
    }

    // Open hand confirms shape → spawn piece → switch to PLAY
    if (drawRecognized && gesture === 'open' && heldMs > 300) {
      const type = recognizedType || 'T';
      tetris.spawnPiece(type);
      airDraw.clear();
      drawRecognized = false;
      setMode('PLAY');
      gestureHoldStart = now + 99999;
    }

    // Auto-spawn if recognized and a brief pause (user does nothing for 1.5s)
    if (drawRecognized && now - recognizedAt > 1800 && gesture === 'none') {
      tetris.spawnPiece(recognizedType || 'T');
      airDraw.clear();
      drawRecognized = false;
      setMode('PLAY');
    }
    return;
  }

  // ── PLAY mode controls ────────────────────────────────────
  if (mode === 'PLAY' && !tetris.paused && tetris.currentPiece) {
    // Rotate: point up (once per gesture)
    if (gesture === 'point_up' && heldMs < 300) {
      tetris.rotate();
    }

    // Move left
    if (gesture === 'point_left') {
      const delay = moveRepeat === 0 ? MOVE_INIT_DELAY : MOVE_REPEAT_DELAY;
      if (now - lastMoveTime > delay) {
        tetris.move(-1);
        lastMoveTime = now;
        moveRepeat++;
      }
    }

    // Move right
    if (gesture === 'point_right') {
      const delay = moveRepeat === 0 ? MOVE_INIT_DELAY : MOVE_REPEAT_DELAY;
      if (now - lastMoveTime > delay) {
        tetris.move(1);
        lastMoveTime = now;
        moveRepeat++;
      }
    }

    // Fast drop: point down
    if (gesture === 'point_down') {
      if (now - lastMoveTime > 80) {
        tetris.softDrop();
        lastMoveTime = now;
      }
    }

    // Pinch wide (🤙) = hard drop
    if (gesture === 'pinch_wide' && heldMs < 300) {
      tetris.hardDrop();
    }
  }
}

// ── Keyboard fallback ─────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (mode === 'WAIT' || mode === 'GAMEOVER') {
    if (e.key === 'Enter') {
      hideGameOver();
      tetris.reset();
      scoreEl.textContent = '0'; levelEl.textContent = '1'; linesEl.textContent = '0';
      setMode('DRAW');
    }
    return;
  }
  if (mode === 'DRAW') {
    if (e.key === ' ' || e.key === 'Enter') {
      const result = airDraw.recognize() || { type: 'T' };
      tetris.spawnPiece(result.type);
      airDraw.clear();
      drawRecognized = false;
      setMode('PLAY');
    }
    return;
  }
  if (mode === 'PLAY') {
    if (!tetris.currentPiece) return;
    switch (e.key) {
      case 'ArrowLeft':  tetris.move(-1); break;
      case 'ArrowRight': tetris.move(1);  break;
      case 'ArrowDown':  tetris.softDrop(); break;
      case 'ArrowUp': case 'z': case 'Z': tetris.rotate(); break;
      case ' ':          tetris.hardDrop(); break;
      case 'p': case 'P':
        tetris.paused = !tetris.paused;
        setMode(tetris.paused ? 'PAUSE' : 'PLAY');
        break;
    }
  } else if (mode === 'PAUSE') {
    if (e.key === 'p' || e.key === 'P') {
      tetris.paused = false;
      setMode('PLAY');
    }
  }
});

// Mouse drawing fallback (for desktop testing)
let mouseDrawing = false;
gameCanvas.addEventListener('mousedown', e => {
  if (mode !== 'DRAW') return;
  mouseDrawing = true;
  drawingActive = true;
  airDraw.clear();
});
gameCanvas.addEventListener('mousemove', e => {
  if (!mouseDrawing || mode !== 'DRAW') return;
  airDraw.trail.push({ x: e.clientX, y: e.clientY, t: performance.now() });
  if (airDraw.trail.length % 15 === 0) {
    const result = airDraw.recognize();
    if (result) {
      recognizedType = result.type;
      drawRecognized = true;
      recognizedAt = performance.now();
      statusEl.textContent = `→ ${result.type}-PIECE! RELEASE TO SPAWN`;
    }
  }
});
gameCanvas.addEventListener('mouseup', e => {
  if (!mouseDrawing) return;
  mouseDrawing = false;
  drawingActive = false;
  const result = airDraw.recognize();
  if (result) {
    recognizedType = result.type;
    drawRecognized = true;
    recognizedAt = performance.now();
    statusEl.textContent = `✓ ${result.type}-PIECE! PRESS ENTER OR WAIT`;
    setTimeout(() => {
      if (mode === 'DRAW' && drawRecognized) {
        tetris.spawnPiece(recognizedType);
        airDraw.clear();
        drawRecognized = false;
        setMode('PLAY');
      }
    }, 900);
  }
});

// ── Camera init ───────────────────────────────────────────────
async function initCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    });
    videoEl.srcObject = stream;
    await new Promise(r => { videoEl.onloadedmetadata = r; });
    statusEl.textContent = 'LOADING HAND TRACKER...';
    return true;
  } catch (e) {
    statusEl.textContent = 'NO CAMERA — USE KEYBOARD (ENTER=START, ARROWS, Z=ROTATE, SPACE=DROP)';
    return false;
  }
}

// ── Main render loop ──────────────────────────────────────────
async function loop(ts) {
  const now = ts || performance.now();

  // Detect gestures
  if (gestureDetector.detector) {
    const result = await gestureDetector.detect(gameCanvas.width, gameCanvas.height);
    if (result) {
      const { gesture, indexTip, keypoints } = result;
      handleGesture(gesture, now);

      // Update air drawing with current index tip
      const shouldDraw = (mode === 'DRAW') && drawingActive;
      airDraw.update(indexTip, shouldDraw, now);

      // Draw skeleton on canvas
      if (keypoints) {
        // Skeleton drawn inside tetris.render as overlay
        ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
        tetris.render(null); // render board first
        gestureDetector.drawSkeleton(keypoints, ctx);
        // Render air trail
        if (mode === 'DRAW') {
          airDraw.renderTrail(ctx, now);
          if (drawRecognized || airDraw.trail.length > 10) {
            const r = airDraw.recognize();
            if (r) airDraw.renderMatchLabel(ctx, r.type, r.confidence, now);
          }
        }
      } else {
        ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
        tetris.render(null);
        if (mode === 'DRAW') {
          airDraw.renderTrail(ctx, now);
          if (airDraw.trail.length > 10) {
            const r = airDraw.recognize();
            if (r) airDraw.renderMatchLabel(ctx, r.type, r.confidence, now);
          }
        }
      }
    } else {
      // No detection result — still render
      ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
      tetris.render(null);
      if (mode === 'DRAW') airDraw.renderTrail(ctx, now);
    }
  } else {
    // No hand detector (no camera or loading)
    ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
    tetris.render(null);
    if (mode === 'DRAW') airDraw.renderTrail(ctx, now);
  }

  // Update tetris physics
  tetris.update(now);
  // Update HUD
  scoreEl.textContent = tetris.score;
  levelEl.textContent = tetris.level;
  linesEl.textContent = tetris.lines;

  requestAnimationFrame(loop);
}

// ── Boot ──────────────────────────────────────────────────────
(async function boot() {
  setMode('WAIT');
  statusEl.textContent = 'STARTING CAMERA...';

  const hasCam = await initCamera();

  if (hasCam) {
    statusEl.textContent = 'LOADING HAND TRACKER...';
    try {
      await gestureDetector.load();
      statusEl.textContent = STATUS.WAIT;
    } catch (e) {
      statusEl.textContent = 'HAND TRACKING UNAVAILABLE — USE KEYBOARD (ENTER TO START)';
    }
  }

  requestAnimationFrame(loop);
})();
