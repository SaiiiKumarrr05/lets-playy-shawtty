// ═══════════════════════════════════════════════════════════
//  AIR DRAWING ENGINE  —  capture index-tip trail → tetromino
// ═══════════════════════════════════════════════════════════

class AirDrawing {
  constructor() {
    this.trail = [];           // Array of {x, y, t}
    this.maxTrailLength = 120; // points kept
    this.maxAge = 2200;        // ms — trail fades
    this.isActive = false;     // true when actively drawing (fist gesture)
    this.lastMatchedType = null;
    this.matchConfidence = 0;
  }

  // Call each frame with current index tip position (or null if not drawing)
  update(indexTip, isDrawing, now) {
    if (isDrawing && indexTip) {
      this.isActive = true;
      this.trail.push({ x: indexTip.x, y: indexTip.y, t: now });
      if (this.trail.length > this.maxTrailLength) {
        this.trail.shift();
      }
    } else if (!isDrawing && this.isActive) {
      // Just stopped drawing — recognize
      this.isActive = false;
    }

    // Age out old points
    this.trail = this.trail.filter(p => now - p.t < this.maxAge);
  }

  getActiveLegTrail() {
    // Return the last 2s of trail for rendering
    const now = performance.now();
    return this.trail.filter(p => now - p.t < this.maxAge);
  }

  clear() {
    this.trail = [];
    this.lastMatchedType = null;
  }

  // ── Shape → Tetromino matching ───────────────────────────
  recognize() {
    const pts = this.trail;
    if (pts.length < 8) return null;

    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = maxX - minX, h = maxY - minY;

    if (w < 20 && h < 20) return null; // too small

    const aspect = w / (h || 1);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    // Normalize points 0..1
    const norm = pts.map(p => ({
      x: (p.x - minX) / (w || 1),
      y: (p.y - minY) / (h || 1),
    }));

    // Feature: quadrant density
    let q = [0, 0, 0, 0]; // TL, TR, BL, BR
    for (const p of norm) {
      if (p.x < 0.5 && p.y < 0.5) q[0]++;
      else if (p.x >= 0.5 && p.y < 0.5) q[1]++;
      else if (p.x < 0.5 && p.y >= 0.5) q[2]++;
      else q[3]++;
    }
    const total = pts.length;
    q = q.map(v => v / total);

    // Feature: diagonal skew
    let skew = 0;
    for (const p of norm) skew += (p.x - 0.5) * (p.y - 0.5);
    skew /= total;

    // Feature: stroke direction changes (zigzag = S/Z)
    const dirChanges = this._countDirectionChanges(pts);
    const zigzag = dirChanges / total;

    // Feature: start vs end position
    const startX = norm[0].x, endX = norm[norm.length - 1].x;
    const startY = norm[0].y, endY = norm[norm.length - 1].y;
    const returnRatio = Math.hypot(startX - endX, startY - endY);

    // ── Decision tree ────────────────────────────────────
    let type = 'T';
    let confidence = 0.6;

    // Very horizontal line → I
    if (aspect > 2.8 && h < 60) {
      type = 'I'; confidence = 0.9;
    }
    // Very vertical line → I
    else if (aspect < 0.35 && w < 60) {
      type = 'I'; confidence = 0.9;
    }
    // Square-ish → O
    else if (aspect > 0.7 && aspect < 1.4 && returnRatio < 0.3) {
      type = 'O'; confidence = 0.85;
    }
    // Strong positive skew → S
    else if (skew > 0.05 || (q[1] + q[2] > q[0] + q[3] + 0.2)) {
      type = 'S'; confidence = 0.75;
    }
    // Strong negative skew → Z
    else if (skew < -0.05 || (q[0] + q[3] > q[1] + q[2] + 0.2)) {
      type = 'Z'; confidence = 0.75;
    }
    // Left-heavy → J
    else if (q[0] + q[2] > 0.55) {
      type = 'J'; confidence = 0.7;
    }
    // Right-heavy → L
    else if (q[1] + q[3] > 0.55) {
      type = 'L'; confidence = 0.7;
    }
    // Default → T
    else {
      type = 'T'; confidence = 0.6;
    }

    this.lastMatchedType = type;
    this.matchConfidence = confidence;
    return { type, confidence };
  }

  _countDirectionChanges(pts) {
    if (pts.length < 3) return 0;
    let changes = 0;
    let lastDx = pts[1].x - pts[0].x;
    for (let i = 2; i < pts.length; i++) {
      const dx = pts[i].x - pts[i-1].x;
      if (Math.sign(dx) !== Math.sign(lastDx) && Math.abs(dx) > 5) {
        changes++;
        lastDx = dx;
      }
    }
    return changes;
  }

  // Draw trail and matched shape preview on canvas ctx
  renderTrail(ctx, now) {
    const trail = this.trail;
    if (trail.length < 2) return;

    // Draw fading trail
    for (let i = 1; i < trail.length; i++) {
      const age = (now - trail[i].t) / this.maxAge;
      const alpha = Math.max(0, 1 - age);
      const thickness = (1 - age) * 5 + 1;

      const r = Math.round(255 * (1 - age));
      const g = Math.round(110 * age);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(trail[i].x, trail[i].y);
      ctx.strokeStyle = `rgba(255, ${g}, 110, ${alpha})`;
      ctx.shadowColor = '#ff006e';
      ctx.shadowBlur = 15 * alpha;
      ctx.lineWidth = thickness;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    }

    // Glowing dot at tip
    const tip = trail[trail.length - 1];
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.008);
    ctx.save();
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 8 + pulse * 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 0, 110, 0.9)';
    ctx.shadowColor = '#ff006e';
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.restore();
  }

  // Show matched type label near drawing
  renderMatchLabel(ctx, type, confidence, now) {
    if (!type) return;
    const trail = this.trail;
    if (trail.length === 0) return;
    const tip = trail[trail.length - 1];

    const pulse = 0.7 + 0.3 * Math.sin(now * 0.005);
    ctx.save();
    ctx.font = "bold 14px 'Press Start 2P', monospace";
    ctx.fillStyle = `rgba(255,230,0,${pulse})`;
    ctx.shadowColor = '#ffe600';
    ctx.shadowBlur = 20;
    ctx.textAlign = 'center';
    ctx.fillText(`${type}-PIECE`, tip.x, tip.y - 25);
    ctx.restore();
  }
}
