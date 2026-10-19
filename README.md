# AIR TETRIS ✌️

Play Tetris in the air. Your webcam tracks your hand and the game runs as an AR overlay on the live feed — no keyboard, no controller.

Built with vanilla JS, TensorFlow.js and the MediaPipe-style hand pose model. Runs fully in the browser.

## Demo

> Add a GIF/screenshot here: `docs/demo.gif`

## How it works

1. Webcam feed is rendered fullscreen behind a game canvas.
2. `@tensorflow-models/hand-pose-detection` tracks hand landmarks in real time.
3. `gestures.js` maps hand poses to game actions.
4. `tetris.js` runs the game logic, `drawing.js` renders it over the video, `main.js` ties the loop together.

Show ✌️ to start.

## Gestures

| Gesture | Action |
| ------- | ------ |
| ✌️ | Start game |
| _add the rest_ | move / rotate / drop |

## Run locally

```bash
git clone https://github.com/SaiiiKumarrr05/lets-playy-shawtty.git
cd lets-playy-shawtty
python -m http.server 8000
```

Open `http://localhost:8000` and allow camera access.

> Webcam needs `localhost` or HTTPS — opening `index.html` directly via `file://` won't work.

## Project structure

```
├── index.html     # layout + HUD + script loading
├── style.css      # AR overlay, HUD, scanlines, vignette
├── tetris.js      # game logic
├── gestures.js    # hand pose → action mapping
├── drawing.js     # canvas rendering over webcam
└── main.js        # init + game loop
```

## Tech

- JavaScript (vanilla), HTML5 Canvas
- TensorFlow.js `4.10.0`
- `@tensorflow-models/hand-pose-detection` `2.0.1`

## Requirements

- Modern browser (Chrome recommended)
- Webcam
- Decent lighting + plain-ish background for better tracking

## Author

[Saikumar Potturi](https://github.com/SaiiiKumarrr05)
