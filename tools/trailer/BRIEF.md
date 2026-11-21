# 《月帷巫女》 gameplay trailer — director's brief (the single source of truth for music, capture and edit)

A real-footage trailer of the game as it is: every picture is rendered by the game itself. No other game, studio or product is
named or alluded to anywhere (picture, text, file names, metadata). Music and sound are original, made for this trailer.
The world is a MAGIC world: no science / astronomy vocabulary in any text on screen.

FORMAT  1920x1080, 60 fps, about 1:43. Video H.264 (yuv420p, high quality), audio AAC 320 kb/s, 48 kHz stereo.
TEMPO   100 BPM, 4/4. One beat = 0.6 s = 36 frames; one bar = 2.4 s = 144 frames. Bar 1 starts at t = 0.
        Cuts fall on beats, the important ones on bar lines. 42 bars = 100.8 s, then a 2.4 s tail (bar 43) for the last fade.

| # | section | bars | time | music | picture |
|---|---------|------|------|-------|---------|
| 1 | 晨 PROLOGUE | 1–6 | 0:00.0–0:14.4 | Almost nothing: air, one breathy flute phrase (the MOTIF, stated slowly), a few koto notes, a low pad swelling in from bar 3. A soft bell on the downbeat of bar 5. | Black. A line of the game's opening narration. The cloud sea and a sky isle with its thin waterfall; the Sun wheel above the shrine; the vermilion torii climbing the steps; the heroine at the shrine, hands together, then she looks up. |
| 2 | 行 THE WORLD | 7–16 | 0:14.4–0:38.4 | The THEME (8 bars, built from the motif) on koto with strings under it; a light hand-drum pulse enters at bar 9; bars 15–16 lift (rising line, cymbal swell) into section 3. | She runs through the meadow, grass parting; the village at work; a leap off the shrine hill, wings of light, gliding; the broom summoned, flight over the red dusk forest and the mirror lake; into the lasting night — the town of ten thousand lanterns, the glowing mushroom wood. One caption: the three lands. |
| 3 | 象 THE ELEMENTS | 17–26 | 0:38.4–1:02.4 | Playful and rhythmic: plucked ostinato, taiko groove, wood-block accents; five 2-bar cells, each ending in a small accent so a cut can land on it; the motif appears as short answers. | Five cells of elemental play, one per 2 bars: (a) fire catches the grass and the wind fans it into a whirl; (b) water drowns the fire — steam; (c) ice shuts a river, she walks across; (d) thunder into wet ground, arcs run through the water; (e) earth heaves the ground up, a boulder bursts. Caption at the start: the eight signs. Tiny labels per element. |
| 4 | 战 BATTLE | 27–36 | 1:02.4–1:26.4 | Full weight: the THEME an octave up over driving taiko and a low string ostinato; bars 33–34 tighten (half-bar hits); bars 35–36 are the climb — a long rise with a roll — into ONE big hit exactly on the downbeat of bar 37 (t = 86.4 s), after which everything but reverb stops. | Shade creatures rise out of the night ground; a fight — talismans, a dodge, a guard, a spell that scatters them; a duel with a rival, spells crossing; the great shade beast; and bars 35–36: the beam struggle, two beams locked, the ground cracking — released on the bar-37 hit to white, then dark. |
| 5 | 灯 CODA | 37–42 (+43) | 1:26.4–1:40.8 (+2.4) | From the silence: the MOTIF on a music-box / koto, slowly, warm pad, one last low drum on bar 41, the final chord held through bar 43 and fading. | A great lantern is lit and the light runs outward; lanterns across the dark land; she rides the broom with her small fox companion against the Moon wheel. Title: 月帷巫女. A last line. Fade. |

CUE POINTS the edit will rely on (the score must hit them to within 20 ms; cues.json lists them):
  bar 5 downbeat (bell)                      t = 9.6
  bar 7 downbeat (theme enters)              t = 14.4
  bar 9 downbeat (pulse enters)              t = 19.2
  bar 17 downbeat (elements start)           t = 38.4
  cell accents: end of bars 18, 20, 22, 24, 26 (the accent sits on beat 4 of the second bar of each cell)
  bar 27 downbeat (battle starts)            t = 62.4
  bar 35 downbeat (climb starts)             t = 81.6
  bar 37 downbeat (THE HIT, then silence)    t = 86.4
  bar 41 downbeat (last low drum)            t = 96.0
  end of bar 42                              t = 100.8   (final chord rings into bar 43, out by 103.2)

ON-SCREEN TEXT (Chinese; narration, captions and labels in the game's own hand-written regular script — LXGW WenKai, the face of
the game's interface, shipped in assets/fonts/zh-CN — NOT a print (Song / Ming / Hei) face: the owner finds print type wrong for
this world; the title in the brush script Ma Shan Zheng, the tagline in the running script Zhi Mang Xing; generous
letter-spacing, soft white with a faint warm glow; never more than one short line at a time; fade in over 12 frames, out over 18):
  (lines 1–3 are the game's own opening narration, lightly trimmed — src/locales/zh-CN/story.dlg.main.js)
  bars 1–2   很久很久以前，日轮和月轮是一对姊妹，轮流在天上走。
  bars 3–4   月影落下的地方，人们叫它「月帷」。
  bars 5–6   镇着长夜的灯，一盏一盏地暗了。
  bar 11–12  一片永昼　一片薄暮　一片长夜
  bar 17     八象灵诀　万物相生相克
  cells      small labels at a corner: 火 · 风 / 水 / 冰 / 雷 / 岩
  bar 27     影祟四起
  bar 39–40  月帷巫女   (title, large, with the vermilion seal; under it, small: 曦月洲绘卷 — the game's own tagline)
  bar 41–42  去把灯，一盏一盏点亮。
  bar 43     实机画面　(small, bottom)

DELIVERABLES (final, kept in the project): trailer/月帷巫女-实机演示.mp4, trailer/score.wav, trailer/README.md (what it shows, how it
was made, how to rebuild). Sources that are kept: tools/trailer/** . Everything else lives under .tmp/trailer/ and is deleted at the end.
