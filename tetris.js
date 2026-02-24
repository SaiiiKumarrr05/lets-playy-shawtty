// ═══════════════════════════════════════════════════════════
//  TETRIS ENGINE  —  renders AR-style onto the game canvas
// ═══════════════════════════════════════════════════════════

const TETROMINOS = {
  I: { cells: [[0,0],[1,0],[2,0],[3,0]], color: '#00fff5', glow: '#00fff5' },
  O: { cells: [[0,0],[1,0],[0,1],[1,1]], color: '#ffe600', glow: '#ffe600' },
  T: { cells: [[1,0],[0,1],[1,1],[2,1]], color: '#ff006e', glow: '#ff00aa' },
  S: { cells: [[1,0],[2,0],[0,1],[1,1]], color: '#00ff88', glow: '#00ff88' },
  Z: { cells: [[0,0],[1,0],[1,1],[2,1]], color: '#ff6a00', glow: '#ff9900' },
  J: { cells: [[0,0],[0,1],[1,1],[2,1]], color: '#3d5afe', glow: '#7986cb' },
  L: { cells: [[2,0],[0,1],[1,1],[2,1]], color: '#ff4081', glow: '#ff80ab' },
};

const TETRO_KEYS = Object.keys(TETROMINOS);

// Board config — columns/rows are relative to canvas size
// We'll use a virtual grid that maps to canvas pixels
const COLS = 10;
const ROWS = 20;

class TetrisEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.board = [];
    this.currentPiece = null;
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.dropSpeed = 900; // ms per row
    this.lastDrop = 0;
    this.running = false;
    this.paused = false;
    this.onScorePop = null; // callback(pts)
    this.onLineClear = null;
    this.onGameOver = null;
    this.onNeedDraw = null; // callback when piece placed, need new shape
    this.pendingType = null; // next piece type from drawing
    this._initBoard();
  }

  get cellW() { return this.canvas.width / COLS; }
  get cellH() { return this.canvas.height / ROWS; }

  _initBoard() {
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  reset() {
    this._initBoard();
    this.score = 0; this.level = 1; this.lines = 0;
    this.dropSpeed = 900;
    this.currentPiece = null;
    this.pendingType = null;
    this.running = true;
    this.paused = false;
    this.lastDrop = performance.now();
  }

  // ── Piece creation ──────────────────────────────────────
  createPiece(type) {
    const def = TETROMINOS[type];
    // Center horizontally, start at top
    const startX = Math.floor(COLS / 2) - 1;
    return {
      type,
      color: def.color,
      glow: def.glow,
      // cells: array of {x,y} in grid coords
      cells: def.cells.map(([cx, cy]) => ({ x: cx + startX, y: cy - 2 })),
      // For scale: base cell size multiplier (1 = normal)
      scaleFactor: 1.0,
    };
  }

  rotatePiece(piece) {
    // Rotate cells 90° CW around centroid
    const cx = piece.cells.reduce((s, c) => s + c.x, 0) / 4;
    const cy = piece.cells.reduce((s, c) => s + c.y, 0) / 4;
    const rotated = piece.cells.map(c => ({
      x: Math.round(cx + (c.y - cy)),
      y: Math.round(cy - (c.x - cx)),
    }));
    return { ...piece, cells: rotated };
  }

  scalePieceBy(piece, delta) {
    // Scale affects visual render only (cells stay 1 unit, but rendered bigger/smaller)
    const newScale = Math.max(0.6, Math.min(1.8, (piece.scaleFactor || 1) + delta));
    return { ...piece, scaleFactor: newScale };
  }

  // ── Collision ───────────────────────────────────────────
  _isValid(cells) {
    for (const c of cells) {
      if (c.x < 0 || c.x >= COLS) return false;
      if (c.y >= ROWS) return false;
      if (c.y >= 0 && this.board[c.y][c.x]) return false;
    }
    return true;
  }

  // ── Piece controls ──────────────────────────────────────
  move(dx) {
    if (!this.currentPiece || this.paused) return;
    const moved = this.currentPiece.cells.map(c => ({ x: c.x + dx, y: c.y }));
    if (this._isValid(moved)) {
      this.currentPiece.cells = moved;
    }
  }

  rotate() {
    if (!this.currentPiece || this.paused) return;
    const rotated = this.rotatePiece(this.currentPiece);
    if (this._isValid(rotated.cells)) {
      this.currentPiece = rotated;
    } else {
      // Wall kick: try ±1
      const kickL = rotated.cells.map(c => ({ x: c.x - 1, y: c.y }));
      const kickR = rotated.cells.map(c => ({ x: c.x + 1, y: c.y }));
      if (this._isValid(kickL)) { this.currentPiece = { ...rotated, cells: kickL }; }
      else if (this._isValid(kickR)) { this.currentPiece = { ...rotated, cells: kickR }; }
    }
  }

  scale(delta) {
    if (!this.currentPiece || this.paused) return;
    this.currentPiece = this.scalePieceBy(this.currentPiece, delta);
  }

  softDrop() {
    if (!this.currentPiece || this.paused) return;
    this._dropOne();
  }

  hardDrop() {
    if (!this.currentPiece || this.paused) return;
    while (true) {
      const dropped = this.currentPiece.cells.map(c => ({ x: c.x, y: c.y + 1 }));
      if (this._isValid(dropped)) {
        this.currentPiece.cells = dropped;
      } else {
        this._placePiece();
        break;
      }
    }
  }

  _dropOne() {
    const dropped = this.currentPiece.cells.map(c => ({ x: c.x, y: c.y + 1 }));
    if (this._isValid(dropped)) {
      this.currentPiece.cells = dropped;
    } else {
      this._placePiece();
    }
  }

  _placePiece() {
    // Lock piece onto board
    for (const c of this.currentPiece.cells) {
      if (c.y < 0) {
        // Game over
        this.running = false;
        if (this.onGameOver) this.onGameOver(this.score);
        return;
      }
      this.board[c.y][c.x] = this.currentPiece.color;
    }
    this._clearLines();
    this.currentPiece = null;
    // Signal that we need a new drawn shape
    if (this.onNeedDraw) this.onNeedDraw();
  }

  _clearLines() {
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (this.board[r].every(c => c !== null)) {
        this.board.splice(r, 1);
        this.board.unshift(Array(COLS).fill(null));
        cleared++;
        r++;
      }
    }
    if (cleared > 0) {
      const pts = [0, 100, 300, 500, 800][Math.min(cleared, 4)] * this.level;
      this.score += pts;
      this.lines += cleared;
      this.level = Math.floor(this.lines / 10) + 1;
      this.dropSpeed = Math.max(120, 900 - (this.level - 1) * 80);
      if (this.onScorePop) this.onScorePop(pts, cleared);
    }
  }

  // ── Spawn a piece from matched type ────────────────────
  spawnPiece(type) {
    this.currentPiece = this.createPiece(type || 'T');
    this.lastDrop = performance.now();
  }

  // ── Update loop ─────────────────────────────────────────
  update(ts) {
    if (!this.running || this.paused || !this.currentPiece) return;
    if (ts - this.lastDrop > this.dropSpeed) {
      this._dropOne();
      this.lastDrop = ts;
    }
  }

  // ── Render ──────────────────────────────────────────────
  render(drawTrail) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const cw = this.cellW;
    const ch = this.cellH;

    // Clear canvas
    ctx.clearRect(0, 0, W, H);

    // Draw board grid (subtle)
    ctx.strokeStyle = 'rgba(0,255,245,0.06)';
    ctx.lineWidth = 0.5;
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * cw, 0);
      ctx.lineTo(c * cw, H);
      ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * ch);
      ctx.lineTo(W, r * ch);
      ctx.stroke();
    }

    // Draw board cells
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.board[r][c]) {
          this._drawCell(ctx, c, r, this.board[r][c], cw, ch, 1.0);
        }
      }
    }

    // Draw current piece with ghost
    if (this.currentPiece) {
      // Ghost
      let ghost = { ...this.currentPiece, cells: this.currentPiece.cells.map(c => ({ ...c })) };
      while (true) {
        const next = ghost.cells.map(c => ({ x: c.x, y: c.y + 1 }));
        if (this._isValid(next)) { ghost.cells = next; } else break;
      }
      for (const c of ghost.cells) {
        if (c.y >= 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.07)';
          ctx.fillRect(c.x * cw + 2, c.y * ch + 2, cw - 4, ch - 4);
        }
      }

      // Current piece
      const sf = this.currentPiece.scaleFactor || 1;
      for (const c of this.currentPiece.cells) {
        if (c.y >= 0) {
          this._drawCell(ctx, c.x, c.y, this.currentPiece.color, cw, ch, sf);
        }
      }
    }

    // Draw air-drawing trail
    if (drawTrail && drawTrail.length > 1) {
      ctx.save();
      ctx.strokeStyle = '#ff006e';
      ctx.shadowColor = '#ff006e';
      ctx.shadowBlur = 18;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(drawTrail[0].x, drawTrail[0].y);
      for (let i = 1; i < drawTrail.length; i++) {
        ctx.lineTo(drawTrail[i].x, drawTrail[i].y);
      }
      ctx.stroke();

      // Fading dots
      for (let i = 0; i < drawTrail.length; i++) {
        const alpha = i / drawTrail.length;
        ctx.beginPath();
        ctx.arc(drawTrail[i].x, drawTrail[i].y, 3 * alpha, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,0,110,${alpha})`;
        ctx.fill();
      }
      ctx.restore();
    }
  }

  _drawCell(ctx, cx, cy, color, cw, ch, scale = 1) {
    const pad = (1 - scale) * cw * 0.5;
    const x = cx * cw + pad + 1;
    const y = cy * ch + pad + 1;
    const w = cw * scale - 2;
    const h = ch * scale - 2;

    ctx.shadowColor = color;
    ctx.shadowBlur = 12;

    // Main fill
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);

    // Inner highlight
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x, y, w, h * 0.3);
    ctx.fillRect(x, y, w * 0.18, h);

    // Dark shadow edge
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x + w - 3, y, 3, h);
    ctx.fillRect(x, y + h - 3, w, 3);

    ctx.shadowBlur = 0;

    // Glow border
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.globalAlpha = 1;
  }
}
