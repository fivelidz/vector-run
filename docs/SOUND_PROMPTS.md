# Vector Run — Sound Prompts for Stable Audio

Generate each sound below in **Stable Audio**, then save the file to
`assets/audio/<filename>` using the exact filename in the heading. The game
will auto-load any file present (falling back to the WebAudio synth if missing).

**Global style to keep consistent across all SFX:** punchy, clean, *arcade /
cartoony* — not hyper-realistic. Think a stylised cel-shaded driving game
(Crossy Road / Art of Rally / OutRun energy), bright and readable, mixed to sit
above an engine drone. Mono is fine for one-shots; stereo for loops/music.

**Format:** export as **WAV** (preferred) or **MP3**, 44.1 kHz. Keep one-shots
short and trimmed (no long silence). Normalise to about **-3 dBFS** peak.

> Naming note: filenames below are what the loader expects. If Stable Audio
> gives you a long name, just rename to the target filename before saving.

---

## 1. Engine loop (most important) — `engine_loop.wav`
- **Type:** seamless LOOP · **Length:** 3–6 s · **Stereo**
- **Prompt:**
  > Smooth looping car engine idle drone for an arcade racing game, warm and
  > mellow low-frequency rumble, steady RPM hum, slightly synthetic and
  > stylised (not a real recorded engine), clean and loopable with no clicks,
  > mono-centred low end, subtle mechanical texture, no revving, constant tone.
- **Notes:** We pitch-shift and open a filter on this in-game to fake
  acceleration, so record it at a **mid, steady RPM** — no rev sweeps. Must loop
  perfectly (match start/end amplitude & phase).
- **Optional extra:** `engine_high.wav` — a second higher-RPM loop we can
  crossfade to at top speed (same style, ~1 octave up, a touch more aggressive).

---

## 2. Impact / crash (heavy) — `crash.wav`
- **Type:** one-shot · **Length:** 0.4–0.8 s · Mono
- **Prompt:**
  > Cartoon car crash impact, chunky metallic clang plus a short crunch and a
  > low thud, stylised and punchy for a mobile game, exaggerated comic impact,
  > quick decay, not gory or realistic, bright transient then a soft boom tail.

## 2b. Light bump — `bump.wav`
- **Type:** one-shot · **Length:** 0.15–0.3 s · Mono
- **Prompt:**
  > Small cartoon car bump, soft dull thud with a light plastic knock, gentle
  > and non-threatening, very short, arcade style, minor collision.

---

## 3. Tyre screech / barrier scrape — `screech.wav`
- **Type:** one-shot (can be short-loopable) · **Length:** 0.3–0.6 s · Mono
- **Prompt:**
  > Stylised tyre screech skid, bright rubber squeal with a metallic scrape edge
  > (grazing a guard rail), arcade cartoon tone, quick and zippy, sparks feel,
  > not harsh or piercing, clean high-mid squeal.

---

## 4. Near miss whoosh — `nearmiss.wav`
- **Type:** one-shot · **Length:** 0.2–0.4 s · Mono
- **Prompt:**
  > Fast air whoosh of a car passing very close, short doppler swish, subtle
  > rising-then-falling pitch, light and satisfying, arcade near-miss feedback,
  > airy and clean, no engine.

---

## 5. Coin / pickup — `coin.wav`
- **Type:** one-shot · **Length:** 0.15–0.3 s · Mono
- **Prompt:**
  > Bright cheerful coin pickup chime, two quick ascending bell/synth notes,
  > sparkly and rewarding, classic arcade collectible sound, clean and short,
  > high-pitched shimmer.

---

## 6. Power-up: Invincibility — `powerup.wav`
- **Type:** one-shot · **Length:** 0.6–1.2 s · Mono/Stereo
- **Prompt:**
  > Triumphant power-up activation, ascending sparkling arpeggio into a bright
  > shimmering swell, magical and energetic, "you are now invincible" feel,
  > arcade game glow, uplifting synth, clean tail.
- **Optional:** `powerup_loop.wav` — a subtle looping sparkle/hum to play WHILE
  invincible (3–5 s seamless loop, shimmery, not too loud).

---

## 7. Jump / launch — `jump.wav`
- **Type:** one-shot · **Length:** 0.25–0.5 s · Mono
- **Prompt:**
  > Cartoon car jump whoosh, quick upward pitch sweep with a light spring/boing
  > energy, playful and bouncy, arcade launch off a ramp, airy lift, clean.

## 7b. Landing thud — `land.wav`
- **Type:** one-shot · **Length:** 0.15–0.3 s · Mono
- **Prompt:**
  > Car landing thud on tarmac, soft suspension bounce with a short low thump
  > and a tiny tyre chirp, satisfying arcade landing, quick decay.

---

## 8. Ramp boost — `boost.wav`  *(used when hitting a launch ramp)*
- **Type:** one-shot · **Length:** 0.4–0.8 s · Mono
- **Prompt:**
  > Speed boost surge, rising synthesised swoosh with a turbo whoosh and a bright
  > energetic accent, arcade nitro feel, fast acceleration whoomph, clean rising
  > tone into a quick punch.

---

## 9. Police siren loop — `siren.wav`
- **Type:** seamless LOOP · **Length:** 2–4 s · Stereo
- **Prompt:**
  > Looping police siren wail, classic two-tone rising and falling siren, urgent
  > but slightly stylised for an arcade chase game, steady tempo, clean and
  > loopable, mid-bright, not too shrill, sense of pursuit.
- **Notes:** We fade this in/out by proximity, so keep it a **constant, even
  loop** with no big dynamic swells.

---

## 10. Busted / game over — `bust.wav`
- **Type:** one-shot · **Length:** 0.8–1.5 s · Stereo
- **Prompt:**
  > Game over "busted" sting, descending defeated brass/synth slide with a short
  > record-scratch feel and a low thud, comedic arcade failure, "caught by the
  > cops" energy, clean ending, not too long.

---

## 11. Explosion (enemy grenade) — `explode.wav`
- **Type:** one-shot · **Length:** 0.5–0.9 s · Mono/Stereo
- **Prompt:**
  > Cartoon explosion, punchy boom with a bright crackle and a short debris
  > tail, stylised comic blast (not realistic warfare), tight low-end thump,
  > quick decay, arcade grenade pop.

---

## 12. Grenade lob / throw — `throw.wav`  *(enemy fires)*
- **Type:** one-shot · **Length:** 0.2–0.4 s · Mono
- **Prompt:**
  > Quick projectile throw whoosh, short airy launch swish with a light metallic
  > tink, arcade "object lobbed" cue, snappy and clean.

---

## 13. UI click — `click.wav`
- **Type:** one-shot · **Length:** 0.05–0.15 s · Mono
- **Prompt:**
  > Clean UI button click for a game menu, soft synthetic tick/pop, crisp and
  > modern, very short, satisfying tap feedback, no reverb.

---

## 14. Combo / near-miss streak up — `combo.wav`  *(optional)*
- **Type:** one-shot · **Length:** 0.2–0.4 s · Mono
- **Prompt:**
  > Rising combo increment chime, short ascending two-note synth ping that feels
  > like a score multiplier ticking up, bright and rewarding, arcade style.

---

## 15. Exit taken / area transition — `whoosh_transition.wav`  *(optional)*
- **Type:** one-shot · **Length:** 0.6–1.0 s · Stereo
- **Prompt:**
  > Big transition whoosh, sweeping filtered noise rise into a soft bright
  > arrival chime, "entering a new area" feel (highway to desert), cinematic but
  > light, arcade, clean.

---

## 16. Background music (optional, big win if you have credits) — `music_loop.wav`
- **Type:** seamless LOOP · **Length:** 30–90 s · Stereo
- **Prompt:**
  > Upbeat driving game background music loop, energetic synthwave / arcade chase
  > vibe, steady four-on-the-floor beat around 120–128 BPM, catchy bass line,
  > bright retro synth arpeggios, sense of speed and pursuit, seamless loop, not
  > too busy so SFX cut through, fun and adrenaline-y.
- **Optional variant:** `music_desert_loop.wav` — same tempo/energy but a warmer
  desert flavour (dusty guitar/twang layered over the synth) for the desert area.

---

## Priority order (if credits are limited)
1. `engine_loop.wav`  ← biggest quality upgrade
2. `crash.wav`, `coin.wav`, `siren.wav`
3. `jump.wav`, `land.wav`, `powerup.wav`, `bust.wav`
4. `screech.wav`, `nearmiss.wav`, `explode.wav`, `boost.wav`
5. `click.wav`, `throw.wav`, `bump.wav`
6. `music_loop.wav`, optional loops/variants

---

## After you save the files
Drop them in `assets/audio/`. Tell me when they're in and I'll wire the audio
engine to **load and play the real samples** (with the current WebAudio synth as
the automatic fallback for any file that's missing). I'll also add:
- pitch/volume scaling of `engine_loop.wav` with speed,
- proximity fade for `siren.wav`,
- a music toggle that streams `music_loop.wav`.

### Full filename checklist
```
assets/audio/
  engine_loop.wav        (+ optional engine_high.wav)
  crash.wav
  bump.wav
  screech.wav
  nearmiss.wav
  coin.wav
  powerup.wav            (+ optional powerup_loop.wav)
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
  music_loop.wav         (optional, + optional music_desert_loop.wav)
```
