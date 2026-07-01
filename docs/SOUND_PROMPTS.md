# Vector Run — Sound Prompts for Stable Audio

Generate each sound below in **Stable Audio**, then save the file to
`assets/audio/<filename>` using the exact filename in the heading. The game
auto-loads any file present (WebAudio synth is the fallback for missing files).

**Global style (keep consistent):** punchy, clean, *arcade / cartoony* — not
hyper-realistic. Stylised cel-shaded driving game vibe (Crossy Road / Art of
Rally / OutRun), bright and readable, mixed to sit above an engine drone.

**Format:** export **WAV** (preferred) or MP3, 44.1 kHz. Trim silence on
one-shots. Normalise to ~**-3 dBFS** peak. Loops must be seamless.

Each prompt is a single line inside a code block for easy copy-paste.

---

## 1. Engine loop — `engine_loop.wav`
Type: seamless LOOP · 3–6 s · Stereo · **highest priority**
```
Smooth looping car engine idle drone for an arcade racing game, warm and mellow low-frequency rumble, steady RPM hum, slightly synthetic and stylised (not a real recorded engine), clean and loopable with no clicks, mono-centred low end, subtle mechanical texture, no revving, constant tone
```
Record at a **mid, steady RPM** (we pitch/filter it in-game). Must loop perfectly.

## 1b. Engine high loop (optional) — `engine_high.wav`
Type: seamless LOOP · 3–6 s · Stereo
```
Smooth looping car engine at high RPM for an arcade racing game, warm synthetic drone about one octave up, steady fast hum, a touch more aggressive but still stylised and clean, perfectly loopable with no clicks, constant tone, no rev sweeps
```

---

## 2. Crash (heavy) — `crash.wav`
Type: one-shot · 0.4–0.8 s · Mono
```
Cartoon car crash impact, chunky metallic clang plus a short crunch and a low thud, stylised and punchy for a mobile game, exaggerated comic impact, quick decay, not gory or realistic, bright transient then a soft boom tail
```

## 2b. Light bump — `bump.wav`
Type: one-shot · 0.15–0.3 s · Mono
```
Small cartoon car bump, soft dull thud with a light plastic knock, gentle and non-threatening, very short, arcade style, minor collision
```

---

## 3. Tyre screech / barrier scrape — `screech.wav`
Type: one-shot (short-loopable) · 0.3–0.6 s · Mono
```
Stylised tyre screech skid, bright rubber squeal with a metallic scrape edge like grazing a guard rail, arcade cartoon tone, quick and zippy, sparks feel, not harsh or piercing, clean high-mid squeal
```

---

## 4. Near miss whoosh — `nearmiss.wav`
Type: one-shot · 0.2–0.4 s · Mono
```
Fast air whoosh of a car passing very close, short doppler swish, subtle rising then falling pitch, light and satisfying, arcade near-miss feedback, airy and clean, no engine
```

---

## 5. Coin / pickup — `coin.wav`
Type: one-shot · 0.15–0.3 s · Mono
```
Bright cheerful coin pickup chime, two quick ascending bell or synth notes, sparkly and rewarding, classic arcade collectible sound, clean and short, high-pitched shimmer
```

---

## 6. Power-up: Invincibility — `powerup.wav`
Type: one-shot · 0.6–1.2 s · Mono/Stereo
```
Triumphant power-up activation, ascending sparkling arpeggio into a bright shimmering swell, magical and energetic, becoming invincible feel, arcade game glow, uplifting synth, clean tail
```

## 6b. Invincibility loop (optional) — `powerup_loop.wav`
Type: seamless LOOP · 3–5 s · Stereo
```
Subtle looping magical shimmer hum for an invincibility power-up, gentle sparkling synth pad with a soft twinkle, energetic but not too loud, seamless loop, arcade glow
```

---

## 7. Jump / launch — `jump.wav`
Type: one-shot · 0.25–0.5 s · Mono
```
Cartoon car jump whoosh, quick upward pitch sweep with a light spring boing energy, playful and bouncy, arcade launch off a ramp, airy lift, clean
```

## 7b. Landing thud — `land.wav`
Type: one-shot · 0.15–0.3 s · Mono
```
Car landing thud on tarmac, soft suspension bounce with a short low thump and a tiny tyre chirp, satisfying arcade landing, quick decay
```

---

## 8. Ramp boost — `boost.wav`
Type: one-shot · 0.4–0.8 s · Mono
```
Speed boost surge, rising synthesised swoosh with a turbo whoosh and a bright energetic accent, arcade nitro feel, fast acceleration whoomph, clean rising tone into a quick punch
```

---

## 9. Police siren loop — `siren.wav`
Type: seamless LOOP · 2–4 s · Stereo
```
Looping police siren wail, classic two-tone rising and falling siren, urgent but slightly stylised for an arcade chase game, steady tempo, clean and loopable, mid-bright, not too shrill, sense of pursuit
```
Keep it a **constant even loop** (we fade it by proximity in-game).

---

## 10. Busted / game over — `bust.wav`
Type: one-shot · 0.8–1.5 s · Stereo
```
Game over busted sting, descending defeated brass or synth slide with a short record-scratch feel and a low thud, comedic arcade failure, caught by the cops energy, clean ending, not too long
```

---

## 11. Explosion (enemy grenade) — `explode.wav`
Type: one-shot · 0.5–0.9 s · Mono/Stereo
```
Cartoon explosion, punchy boom with a bright crackle and a short debris tail, stylised comic blast not realistic warfare, tight low-end thump, quick decay, arcade grenade pop
```

---

## 12. Grenade lob / throw — `throw.wav`
Type: one-shot · 0.2–0.4 s · Mono
```
Quick projectile throw whoosh, short airy launch swish with a light metallic tink, arcade object lobbed cue, snappy and clean
```

---

## 13. UI click — `click.wav`
Type: one-shot · 0.05–0.15 s · Mono
```
Clean UI button click for a game menu, soft synthetic tick pop, crisp and modern, very short, satisfying tap feedback, no reverb
```

---

## 14. Combo / streak up (optional) — `combo.wav`
Type: one-shot · 0.2–0.4 s · Mono
```
Rising combo increment chime, short ascending two-note synth ping like a score multiplier ticking up, bright and rewarding, arcade style
```

---

## 15. Area transition whoosh (optional) — `whoosh_transition.wav`
Type: one-shot · 0.6–1.0 s · Stereo
```
Big transition whoosh, sweeping filtered noise rise into a soft bright arrival chime, entering a new area feel from highway to desert, cinematic but light, arcade, clean
```

---

## 16. Background music loop (optional) — `music_loop.wav`
Type: seamless LOOP · 30–90 s · Stereo
```
Upbeat driving game background music loop, energetic synthwave arcade chase vibe, steady four-on-the-floor beat around 124 BPM, catchy bass line, bright retro synth arpeggios, sense of speed and pursuit, seamless loop, not too busy so sound effects cut through, fun and adrenaline
```

## 16b. Desert music loop (optional) — `music_desert_loop.wav`
Type: seamless LOOP · 30–90 s · Stereo
```
Upbeat driving game music loop with a warm desert flavour, synthwave arcade chase energy around 124 BPM with dusty twangy guitar layered over retro synths, sense of speed, seamless loop, leaves room for sound effects, fun and adventurous
```

---

## Priority order (if credits are limited)
1. `engine_loop.wav`
2. `crash.wav`, `coin.wav`, `siren.wav`
3. `jump.wav`, `land.wav`, `powerup.wav`, `bust.wav`
4. `screech.wav`, `nearmiss.wav`, `explode.wav`, `boost.wav`
5. `click.wav`, `throw.wav`, `bump.wav`
6. `music_loop.wav`, optional loops/variants

## After you save the files
Drop them in `assets/audio/` with the exact filenames, then tell me — I'll wire
the audio engine to play the real samples (synth stays as auto-fallback), plus
speed-based pitch/volume on the engine loop, proximity fade on the siren, and a
music toggle.

### Filename checklist
```
assets/audio/
  engine_loop.wav
  engine_high.wav        (optional)
  crash.wav
  bump.wav
  screech.wav
  nearmiss.wav
  coin.wav
  powerup.wav
  powerup_loop.wav       (optional)
  jump.wav
  land.wav
  boost.wav
  siren.wav
  bust.wav
  explode.wav
  throw.wav
  click.wav
  combo.wav              (optional)
  whoosh_transition.wav  (optional)
  music_loop.wav         (optional)
  music_desert_loop.wav  (optional)
```
