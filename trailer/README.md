# 《月帷巫女》实机演示 — gameplay trailer

`月帷巫女-实机演示.mp4`: 1:43.2 (6,192 frames), 1920x1080, 60 fps, H.264 High, AAC 320 kb/s 48 kHz stereo — the master (about 438 MB).
`月帷巫女-实机演示-分享版.mp4`: the same film re-encoded at about 9.6 Mb/s (about 124 MB) for sharing.
`月帷巫女-实机演示-无字幕母版.mp4`: the same cut WITHOUT captions and title (about 586 MB), kept so that the text or the music can be
redone without the recorded takes: `node tools/trailer/edit/edit.mjs --from-clean` lays the captions, the title and the score
master over it (render the score master first, step 1 below).

## What it shows

Five movements cut to the score (100 BPM, one bar = 2.4 s = 144 frames):

| bars | section | picture |
|---|---|---|
| 1–6 | 晨 prologue | the game's opening narration over black; the sky isle and its thin fall over the pink dusk sea; the Sun wheel and the Moon wheel above the fox village; the vermilion torii tunnel; she prays before the fox elder's hall, eyes closed, the fox spirit above her shoulder, then opens her eyes and lifts her head to the sky |
| 7–16 | 行 the world | she runs through the meadow, past the village and the shrine courtyard, leaps off the hill on wings of light and glides down over the fields, calls the broom over the red dusk forest and the mirror lake, crosses the town of lanterns in the lasting night and dives into the glowing mushroom wood |
| 17–26 | 象 the elements | five cells of elemental play: fire fanned into a whirl by wind; rain drowning the blaze in steam; a river frozen to walk on; thunder through soaked shades; on the sunlit meadow stone columns heave up one after another toward a pile of rocks, and the last bursts it |
| 27–36 | 战 battle | shades rise out of the night ground; talismans, a dodge, a guard, fire, the 金环 spell; the duel with 胧夜; the great shade beast 胧牙; the beam struggle, released on the hit |
| 37–43 | 灯 coda | out of white: the great lantern is lit, she rides the broom with the fox spirit before the Moon wheel (title), the lanterns of the town come on ring by ring |

Every picture is rendered by the game itself, recorded frame by frame by the capture rig in `tools/trailer/`
(the game's own camera, input and spells; nothing is painted over the picture except the captions and the title).
The only picture not from the game is the plain black of the first bar (2.4 s) under the opening line.
The music is synthesised by `tools/trailer/score/` (no samples, no recordings); `score.wav` is the composer's
render and `score-cues.json` its cue sheet.

## How it was made / how to rebuild

1. **Score master** (the loudness the film uses, −14.5 LUFS integrated, true peak below −1 dBTP):
   `node tools/trailer/score/render.mjs --lufs -14.5 --out .tmp/trailer/edit/score_master.wav`
2. **Shots** (to re-record one). Each shot is a file in `tools/trailer/shots/<section>/`. Record one against the pinned game bundle:
   `node tools/trailer/capture.mjs --shot tools/trailer/shots/<section>/<shot>.js --build ca43df76158f --slot <n> --out .tmp/trailer/shots/<section>/takes/<shot>`
   (try `--frames 30` first; see `tools/trailer/README.md`). Each section folder under `.tmp/trailer/shots/` holds an
   `EDL.json` listing the takes with in-point and length; replace a take there and rebuild.
3. **The cut:** `node tools/trailer/edit/edit.mjs` reads the five EDLs, renders the captions and the title to
   transparent PNGs in headless Chrome, and lets ffmpeg cut, fade, overlay and encode this file. `--preview` makes a
   quick 540p draft. Typefaces — only the three OFL faces shipped with the game in `assets/fonts/zh-CN`, no
   system font: the narration, the captions, the element labels and 实机画面 in the game's hand-written regular
   script LXGW WenKai; the title 月帷巫女 and its seal in Ma Shan Zheng; the tagline 曦月洲绘卷 in Zhi Mang Xing.
   The caption renderer asks Chrome which font drew every line and stops if any glyph came from elsewhere
   (`.tmp/trailer/edit/captions/fonts-used.json`). Edit decisions (in-point slides, swaps) live in `ADJUST` in `edit.mjs`; the caption timing
   and placement in `CAPTIONS`. A review (contact sheet every 0.5 s, the frames either side of every cut, loudness,
   cut detection) is written to `.tmp/trailer/edit/review/`.

The picture keeps the game's own look: no grade is applied, only BT.709 limited-range levels and tags.

## After the clean-up

The recorded takes (ProRes, about 6 GB for the final cut, 39 GB with tests) and the pinned game bundle lived in `.tmp/trailer/`,
the project's scratch area, and were deleted once the film was finished. What is kept: the film, the score, the shot files
(`tools/trailer/shots/`), the edit (`tools/trailer/edit/edit.mjs`) and the five cut lists as they were used
(`tools/trailer/edit/edl/<section>.json`: take, in-point, length per shot). To rebuild the cut, re-record the shots listed in
those files into `.tmp/trailer/shots/<section>/takes/…` (without `--build`, the recorder builds the current game), copy each cut
list back to `.tmp/trailer/shots/<section>/EDL.json`, render the score master (step 1) and run the edit. Shots re-recorded
against a later version of the game will differ in detail from the film.

