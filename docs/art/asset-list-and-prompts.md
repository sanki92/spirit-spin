# Spirit Spin — Asset List & Image Prompts

Target model: Gemini image (Nano Banana Pro) — 4K, supports reference images.
Pipeline for 3D items: **sheet image → crop views → Tripo Multiview (or Meshy) → auto-rig (beasts) → .glb**

> Never write "Beyblade" or any franchise name in prompts — it pulls the model toward copyrighted designs.

---

## 0. How to use these prompts

1. Generate **#1 Style Anchor** first. Pick the best one.
2. Attach the style anchor as a **reference image** to every later prompt. This keeps all art in one consistent style.
3. For derived sheets (expressions, spirit cut-ins, awakened forms), also attach that beast's chosen turnaround sheet as reference.
4. Gemini can't output transparency. Use the plain gray background, then remove it (remove.bg / rembg / Photoshop). VFX use **pure black** backgrounds so the game can blend them additively. No background removal is needed for those.
5. For 3D: crop each view out of the sheet. Tripo Multiview needs FRONT plus at least one of LEFT/BACK/RIGHT. FRONT + BACK gives the best results.
6. Regenerate freely. A bad sheet means a bad 3D model.

### STYLE BLOCK (paste at end of every prompt)
```
Art style: modern Japanese anime game art, cel-shaded with soft gradient shading, clean bold line art, highly saturated colors, dramatic rim lighting, premium polished look of a top-tier 2020s anime mobile game. Completely original design, not based on any existing franchise. No text, no watermark, no signature unless asked.
```

### 3D SHEET RULES (paste on any sheet going to image-to-3D)
```
Model sheet rules: orthographic views, no perspective distortion. Identical scale, pose, and height alignment in every view, all resting on the same baseline. Clear readable silhouette, limbs slightly apart from the body. Flat even studio lighting, no cast shadows, no glow, no particles, no motion effects. Plain solid light-gray background (#D9D9D9). No labels.
```

---

## 1. Style Anchor (1 image)

```
Anime key art poster of four original spirit beasts posed together, each rising behind its own battle spinning top on a futuristic arena floor: a lightning storm wolf (electric blue), a fortress tortoise with an obsidian hexagon shell (emerald), a pearl-and-violet moon sea serpent (silver/violet), a crimson-gold firebird (fire). Each beast is a giant glowing translucent spirit made of its element. Dramatic low camera angle, epic lighting, sparks and energy trails. 16:9, 4K.
[STYLE BLOCK]
```

---

## 2. Starter Beasts — Turnaround Sheets (4 images → 3D)

Template (swap the `BEAST` text per beast):
```
Character turnaround model sheet of an original creature: BEAST. Exactly 4 full-body views in one row, left to right: FRONT, LEFT SIDE, BACK, RIGHT SIDE. Neutral standing pose, mouth closed. Solid physical form (not glowing). 21:9, 4K.
[3D SHEET RULES]
[STYLE BLOCK]
```

| # | Name (rename freely) | Type | BEAST text |
|---|---|---|---|
| 2a | **VOLTFANG** | Attack | a lean, powerful storm wolf with electric-blue and white fur marked with jagged lightning-bolt patterns, sharp crystalline horns sweeping back from the brow, glowing yellow eyes, dark steel armored shoulder plates, and a long whip-like tail ending in a lightning-shaped blade. Fierce, predatory silhouette. |
| 2b | **AEGIRON** | Defense | a massive ancient tortoise whose shell is a fortress of hexagonal obsidian plates veined with glowing emerald cracks, small crystal spires on the shell, thick pillar-like armored legs, and a stern wise face with a stone beard. Heavy, immovable silhouette. |
| 2c | **NAGARA** | Stamina | a long elegant sea-serpent dragon with pearl-white and deep-violet scales, flowing translucent silk-ribbon fins, a crescent-moon crest on its head, and calm half-lidded silver eyes, body raised in a graceful S-curve. Serene, flowing silhouette. |
| 2d | **AGNYX** | Balance | a regal firebird with crimson, gold, and orange feathers, wings half-spread, long tail plumes ending in flame shapes, an ornamental golden crown-like crest, armored gold talons, and proud sharp eyes. Noble, radiant silhouette. |

---

## 3. Beast Expression Sheets (4 images, 2D, for AI dialogue UI)

Attach the beast's turnaround as reference.
```
Using the exact creature from the reference image (same design, colors, markings), create an expression sheet: 6 bust portraits in a 3x2 grid, identical framing and size, facing slightly toward the viewer. Labels below each are NOT drawn. Expressions in order: 1 neutral, 2 proud and confident, 3 furious roaring, 4 sad, 5 sulky and refusing (head turned away, eyes closed), 6 joyful and excited. Plain light-gray background. 3:2, 4K.
[STYLE BLOCK]
```

---

## 4. Spirit Call Cut-ins (4 images, 2D — splash that slides across the screen when the beast is summoned)

Attach the beast's turnaround as reference. Swap `ELEMENT`: lightning / emerald stone and crystal / moonlight and water / fire.
```
Using the exact creature from the reference image, ultra-dynamic anime cut-in splash: the creature bursting toward the camera as a giant glowing semi-translucent spirit made of ELEMENT energy, mid-roar, extreme foreshortening, speed lines and energy streaks behind it. Very wide horizontal banner, subject fills the frame, pure black background. 21:9, 4K.
[STYLE BLOCK]
```

---

## 5. Beast Emblems (1 image → 4 chip icons, also used on top's center)

```
Sheet of 4 circular emblem badges in one row, front-facing, flat, each a stylized head icon inside a metallic ring: 1 lightning wolf (electric blue), 2 obsidian tortoise with emerald (green), 3 crescent-moon serpent (violet/silver), 4 crimson-gold firebird (red/gold). Bold, readable at small size, game-icon quality. Plain light-gray background. 4:1, 4K.
[STYLE BLOCK]
```

---

## 6. Battle Tops — Product Sheets (4 images → 3D)

Tops spin fast in battle, so the **TOP-DOWN view matters most**. Make sure it's crisp.

Template (swap `TOP`):
```
Product design sheet of an original battle spinning top toy, about 5 cm wide, made of glossy metal and translucent colored plastic, perfectly rotationally symmetric. Layout: top row has 4 orthographic views — TOP-DOWN (looking straight down), SIDE PROFILE, BOTTOM-UP, and a 3/4 hero view. Bottom row has an EXPLODED side view showing the 3 parts separated vertically: outer blade ring, metal core disc with emblem chip, pointed tip. Design: TOP. 16:9, 4K.
[3D SHEET RULES]
Clean stylized product render, crisp edges, slight cel-shaded highlights.
```

| # | Top | TOP text |
|---|---|---|
| 6a | Voltfang top | outer ring with 3 jagged fang-shaped attack blades in 3-fold rotational symmetry, gunmetal steel with electric-blue translucent plastic, wolf-head emblem chip in the center, flat wide rubber tip |
| 6b | Aegiron top | thick round outer ring with 6 smooth hexagonal bumps in 6-fold symmetry, heavy dark obsidian metal with emerald translucent plastic, tortoise-shell emblem chip, wide ball tip |
| 6c | Nagara top | thin wide disc ring with 2 long sweeping crescent blades in 2-fold symmetry, polished silver with violet translucent plastic, crescent-serpent emblem chip, sharp needle tip |
| 6d | Agnyx top | 4 wing-shaped blades in 4-fold symmetry alternating sharp and rounded, gold and crimson translucent plastic, firebird emblem chip, semi-flat tip |

---

## 7. Stadium (3 images)

**7a. Stadium sheet → 3D**
```
Design sheet of an original futuristic circular battle stadium for spinning tops, a shallow concave bowl about 50 cm wide with a raised outer wall that has 3 evenly spaced gaps (ring-out pockets). Dark brushed-metal surface with glowing cyan circuit lines spiraling toward a slight dip in the center. Views: TOP-DOWN, SIDE CROSS-SECTION, 3/4 hero view. 16:9, 4K.
[3D SHEET RULES]
[STYLE BLOCK]
```

**7b. Floor texture**
```
Seamless tileable top-down texture of dark brushed metal with thin glowing cyan circuit lines, subtle scratches and wear, perfectly flat lighting, no perspective. 1:1, 4K.
```

**7c. Arena backdrop**
```
Wide panoramic background of a huge futuristic indoor battle arena at night: stadium seating full of cheering crowd silhouettes, colored spotlights, giant video screens, light haze. The center is empty and dark (a stadium will sit there). Slightly blurred for depth of field. 21:9, 4K.
[STYLE BLOCK]
```

---

## 8. Rival Blader (1 image, 2D — gives the bot opponent a personality)

```
Character expression sheet of an original anime rival character, a cocky 16-year-old blader with spiky silver hair with one red streak, a sharp grin, a torn dark-red jacket with a high collar, and fingerless gloves. 6 bust portraits in a 3x2 grid, identical framing: 1 smug, 2 shouting a battle command, 3 shocked, 4 angry, 5 defeated looking down, 6 respectful nod. Plain light-gray background. 3:2, 4K.
[STYLE BLOCK]
```

---

## 9. Launcher Skins (1 image — shown full-screen on the phone during the rip)

```
Sheet of 4 original futuristic ripcord launcher devices for spinning tops, each shown straight-on from the front in one row, same scale: 1 electric blue with lightning decals, 2 emerald and obsidian heavy armored, 3 silver and violet sleek, 4 crimson and gold ornate. Mechanical details, grip, a ripcord handle sticking out of the side. Plain light-gray background. 21:9, 4K.
[STYLE BLOCK]
```

---

## 10. VFX Textures (black background, all additive)

| # | Item | Prompt |
|---|---|---|
| 10a | Spark burst flipbook | `4x4 grid of 16 animation frames of a bright yellow-white metal spark burst, frame 1 small flash, growing to a full burst, fading to embers by frame 16. Each frame centered in its cell, same scale. Pure black background. 1:1, 4K.` |
| 10b | Shockwave ring | `Single bright white-cyan circular shockwave ring, thin sharp edge with soft inner glow and slight distortion streaks, viewed from directly above, centered. Pure black background. 1:1, 4K.` |
| 10c | Element auras ×4 | `2x2 grid of 4 seamless swirling energy textures: top-left crackling electric-blue lightning, top-right emerald crystal shards and stone dust, bottom-left flowing silver-violet moonlight water, bottom-right roaring crimson-gold fire. Each fills its cell. Pure black background. 1:1, 4K.` |
| 10d | Speed lines | `Anime radial speed lines converging to the center, white streaks of varying thickness, the center clear. Pure black background. 16:9, 4K.` |
| 10e | Dust puffs flipbook | `4x4 grid of 16 frames of a gray-white dust cloud puff expanding and dissipating, centered, same scale. Pure black background. 1:1, 4K.` |
| 10f | Ground crack decal | `Top-down view of a radial impact crack in a metal floor, glowing orange edges, centered. Pure black background. 1:1, 4K.` |

> If the flipbook frames come out inconsistent, buy a VFX pack (e.g. on itch.io or Fab) for those two. Everything else should be fine.

---

## 11. UI (text included — Nano Banana Pro renders text well)

| # | Item | Prompt |
|---|---|---|
| 11a | Logo | `Game logo text "SPIRIT SPIN" in bold dynamic anime-style lettering, metallic chrome with electric-blue and crimson energy edges, a stylized spinning-top swirl integrated into the "O"-shaped space between the words. Plain light-gray background. 16:9, 4K. [STYLE BLOCK]` |
| 11b | Finish banners | `Sheet of 4 anime battle result banners stacked vertically, bold italic metallic lettering with energy effects: "SPIN FINISH" (silver/blue), "RING OUT" (orange), "SHATTER FINISH" (red, cracked letters), "SPIRIT FINISH" (gold, glowing aura). Plain light-gray background. 1:1, 4K. [STYLE BLOCK]` |
| 11c | Rip grade badges | `Sheet of 4 rank badges in a row, shield-shaped, bold letters: "S" (gold, flaming), "A" (silver-blue), "B" (green), "C" (gray). Plain light-gray background. 4:1, 4K. [STYLE BLOCK]` |
| 11d | Countdown | `Sheet of 4 huge anime countdown graphics in a row: "3", "2", "1", "LAUNCH!", chunky metallic lettering with speed streaks, "LAUNCH!" largest with an explosive energy burst. Plain light-gray background. 21:9, 4K. [STYLE BLOCK]` |
| 11e | Type icons | `Sheet of 4 round game icons in a row: ATTACK (crossed blades, red), DEFENSE (shield, green), STAMINA (infinity spiral, blue), BALANCE (yin-yang-like split circle, gold). Plain light-gray background. 4:1, 4K. [STYLE BLOCK]` |
| 11f | UI kit | `Game UI kit sheet in a futuristic anime style: primary button, secondary button, a dialogue box with a portrait frame on the left, a spirit power gauge bar (empty and full), a health/spin bar, a panel frame, and a close icon. Dark navy panels with electric-blue and gold trims. Plain light-gray background. 16:9, 4K. [STYLE BLOCK]` |
| 11g | App icon | `Mobile app icon: a glowing battle spinning top seen from above with an electric spirit swirl rising from it, dark navy background, bold and readable at small size, centered with generous margin. 1:1, 4K. [STYLE BLOCK]` |

---

## 12. Audio (not images — needed though)

Tools: ElevenLabs Sound Effects / Voice, or royalty-free packs.
- Rip / launch whoosh + ripcord zip
- Metal clash (light, heavy), grinding, spin hum (loopable, pitch drops as spin dies)
- Ring-out clang, shatter burst, spin-down wobble
- Roar per beast ×4 (wolf howl-roar, deep tortoise rumble, serpent hiss-song, firebird screech)
- Announcer: "3… 2… 1… LAUNCH!", "SPIN FINISH!", "RING OUT!", "SHATTER FINISH!", "SPIRIT FINISH!"
- Menu click, unlock fanfare, battle music loop (1), menu music loop (1)

---

## Generation count

| Group | Images |
|---|---|
| Style anchor | 1 |
| Beast turnarounds | 4 |
| Expression sheets | 4 |
| Spirit cut-ins | 4 |
| Emblems | 1 |
| Tops | 4 |
| Stadium | 3 |
| Rival | 1 |
| Launchers | 1 |
| VFX | 6 |
| UI | 7 |
| **Total** | **36** (plus rerolls) |

Later (not needed for sub-project 1): awakened beast forms, more tops/parts, player avatars, commentator character, tournament UI.
