# User Prompts Log — Vector Run

Verbatim record of the prompts that drove this project.

---

## Prompt 1 — Initial brief

> I want you to create a 3d phone game which is like a 3d infinite running dodging
> game. I want it to be with cars on a freeway where the player is dodging traffic
> and always zooming forward.
>
> I want you to fully plan this out.
> you also have access to meshy API via our bannerlord mods and stuff to make some
> graphics for the cars and obstacles.
>
> I don't want this to be hyper realistic but a bit cartoony.
>
> Impacts should slow the car down until they are caught with spinny effects and
> transparent flashes.
>
> the player can be trying to outrun police
>
> Think of different obstacles. and different sections like lanes with oncoming
> traffics, median strips etc.
>
> Fully build this out and get this to a workable state. It should be similar to 3d
> geometry dodging games in mechanics and that could be a good draft to start with.
>
> You have unlimited tokens and time.
>
> Fully plan out all features. build, test, review

## Prompt 2 — Clarification

> No train sort is totally different and not related

(Noted: the sibling `train_sort` folder is an unrelated game; Vector Run was
built fresh and independently.)

## Prompt 3 — Jump

> adding in a jump may be good. I will want to test later.
>
> Please check and test everything and build all

(Built: parabolic jump via swipe-up / JUMP button / Space; clears low obstacles
— cones, barriers, spikes, same-dir cars — but not tall trucks/blocks; "AIR!"
bonus; squash-stretch + dust FX + audio. Added jump_test.js.)

## Prompt 4 — Evolving terrain

> different sections and terrains to the level that change overtime

(Built: terrain.js theme system — 6 distinct biomes (Day Plains, Sunset Desert,
Night City, Deep Forest, Snowfield, Dusk Highway) that cycle by distance with a
smooth color crossfade, each with its own sky/fog/ground/lighting and
theme-specific roadside props — cacti, lit buildings, neon billboards, layered
pines, rocks. Added terrain_test.js. Kept separate from road-LAYOUT sections.)
