// ═══════════════════════════════════════════════════════════
//  GESTURE DETECTOR  —  MediaPipe hands via TF.js
// ═══════════════════════════════════════════════════════════

class GestureDetector {
  constructor(videoEl, overlayCtx) {
    this.video = videoEl;
    this.overlayCtx = overlayCtx; // game canvas ctx for skeleton drawing
    this.detector = null;
    this.running = false;
    this.hands = [];
    this.indexTip = null; // {x, y} in canvas pixels — mirrored
    this.onGesture = null; // callback(gesture, hand)
    this._lastGesture = '';
    this._gestureStartTime = 0;
    this._frameCount = 0;
  }

  async load() {
    const model = handPoseDetection.SupportedModels.MediaPipeHands;
    this.detector = await handPoseDetection.createDetector(model, {
      runtime: 'tfjs',
      modelType: 'lite',
      maxHands: 1,
    });
    this.running = true;
    console.log('[Gestures] Detector loaded');
  }

  async detect(canvasWidth, canvasHeight) {
    if (!this.detector || !this.running) return null;
    if (this.video.readyState < 2) return null;

    this._frameCount++;
    // Run detection every other frame for perf
    if (this._frameCount % 2 !== 0) return this._lastGestureResult || null;

    try {
      const hands = await this.detector.estimateHands(this.video, { flipHorizontal: true });
      if (!hands || hands.length === 0) {
        this.indexTip = null;
        this._lastGestureResult = { gesture: 'none', indexTip: null };
        return this._lastGestureResult;
      }

      const hand = hands[0];
      const kp = hand.keypoints;

      // Map keypoints to canvas space (video is mirrored via CSS, detection uses flipHorizontal)
      const scaleX = canvasWidth / this.video.videoWidth;
      const scaleY = canvasHeight / this.video.videoHeight;

      const mapped = kp.map(k => ({
        x: k.x * scaleX,
        y: k.y * scaleY,
        name: k.name,
      }));

      this.indexTip = { x: mapped[8].x, y: mapped[8].y };

      const gesture = this._classify(mapped);
      this._lastGestureResult = { gesture, indexTip: this.indexTip, keypoints: mapped };
      return this._lastGestureResult;
    } catch (e) {
      return this._lastGestureResult || null;
    }
  }

  _fingerUp(kp, tip, pip) {
    return kp[tip].y < kp[pip].y;
  }

  _classify(kp) {
    const thumbUp  = kp[4].y  < kp[3].y;
    const indexUp  = kp[8].y  < kp[6].y;
    const midUp    = kp[12].y < kp[10].y;
    const ringUp   = kp[16].y < kp[14].y;
    const pinkyUp  = kp[20].y < kp[18].y;

    const upCount = [thumbUp, indexUp, midUp, ringUp, pinkyUp].filter(Boolean).length;

    // ✌️ Peace — index + middle up, ring + pinky down
    if (indexUp && midUp && !ringUp && !pinkyUp) return 'peace';

    // 🖐 Open hand — 4 fingers up
    if (indexUp && midUp && ringUp && pinkyUp) return 'open';

    // ✊ Fist — all down (used for draw mode activation)
    if (!indexUp && !midUp && !ringUp && !pinkyUp) return 'fist';

    // 🤙 Pinch/thumb+pinky — thumb and pinky extended, rest down
    if (thumbUp && !indexUp && !midUp && !ringUp && pinkyUp) return 'pinch_wide';

    // ☝️ Point — only index up, determine direction
    if (indexUp && !midUp && !ringUp && !pinkyUp) {
      const wrist = kp[0];
      const tip = kp[8];
      const dx = tip.x - wrist.x;
      const dy = tip.y - wrist.y;
      const adx = Math.abs(dx), ady = Math.abs(dy);

      if (ady > adx * 1.3) return dy < 0 ? 'point_up' : 'point_down';
      if (adx > ady * 1.1) return dx > 0 ? 'point_right' : 'point_left';
      return 'point_up';
    }

    // 🤏 Pinch — thumb and index close together, others open
    if (!midUp && !ringUp) {
      const tx = kp[4].x, ty = kp[4].y;
      const ix = kp[8].x, iy = kp[8].y;
      const dist = Math.hypot(tx - ix, ty - iy);
      if (dist < 40) return 'pinch';
    }

    return 'none';
  }

  drawSkeleton(kp, ctx) {
    if (!kp) return;
    const connections = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [0,9],[9,10],[10,11],[11,12],
      [0,13],[13,14],[14,15],[15,16],
      [0,17],[17,18],[18,19],[19,20],
      [5,9],[9,13],[13,17],
    ];

    ctx.save();
    ctx.strokeStyle = 'rgba(0,255,245,0.5)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#00fff5';
    ctx.shadowBlur = 6;

    for (const [a, b] of connections) {
      ctx.beginPath();
      ctx.moveTo(kp[a].x, kp[a].y);
      ctx.lineTo(kp[b].x, kp[b].y);
      ctx.stroke();
    }

    for (let i = 0; i < kp.length; i++) {
      ctx.beginPath();
      ctx.arc(kp[i].x, kp[i].y, i === 8 ? 6 : 3, 0, Math.PI * 2);
      ctx.fillStyle = i === 8 ? '#ff006e' : 'rgba(0,255,245,0.8)';
      ctx.shadowColor = i === 8 ? '#ff006e' : '#00fff5';
      ctx.shadowBlur = i === 8 ? 12 : 4;
      ctx.fill();
    }
    ctx.restore();
  }
}
