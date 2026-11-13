---
name: Watch Together
description: Cozy pastel-pink claymorphic private watch cinema for couples and close friends.
colors:
  sakura-pink: "#ec4899"
  sakura-deep: "#db2777"
  blush-rose: "#f472b6"
  petal-soft: "#fbcfe8"
  cream-blush: "#fff6fa"
  marshmallow-white: "#fff8fc"
  plum-ink: "#3b142d"
  plum-muted: "#78345c"
  plum-dim: "#a25d88"
  gold-shimmer: "#f59e0b"
  lavender-glaze: "#d8b4fe"
  cinema-obsidian: "#0e0a16"
typography:
  display:
    fontFamily: "'Outfit', 'Poppins', -apple-system, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "'Outfit', 'Poppins', -apple-system, sans-serif"
    fontSize: "1.3rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: "'Outfit', 'Poppins', -apple-system, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "0em"
  body:
    fontFamily: "'Outfit', 'Poppins', -apple-system, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0em"
  label:
    fontFamily: "'Outfit', 'Poppins', -apple-system, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.02em"
rounded:
  sm: "8px"
  md: "14px"
  lg: "20px"
  card: "26px"
  pill: "9999px"
spacing:
  xs: "0.35rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.75rem"
  xl: "2.25rem"
components:
  button-primary:
    backgroundColor: "{colors.sakura-pink}"
    textColor: "#ffffff"
    rounded: "16px"
    padding: "0.58rem 1.3rem"
  button-primary-hover:
    backgroundColor: "{colors.sakura-deep}"
  button-secondary:
    backgroundColor: "{colors.marshmallow-white}"
    textColor: "#be185d"
    rounded: "{rounded.md}"
    padding: "0.55rem 1rem"
  chip-default:
    backgroundColor: "{colors.petal-soft}"
    textColor: "#be185d"
    rounded: "{rounded.pill}"
    padding: "0.32rem 0.85rem"
  card-clay:
    backgroundColor: "{colors.marshmallow-white}"
    textColor: "{colors.plum-ink}"
    rounded: "{rounded.card}"
    padding: "1.5rem"
  input-field:
    backgroundColor: "#ffffff"
    textColor: "{colors.plum-ink}"
    rounded: "{rounded.md}"
    padding: "0.65rem 1rem"
---

# Design System: Watch Together

## Overview

**Creative North Star: "The Pastel Claymorphic Cinema"**

Watch Together treats a private self-hosted watch party like a warm, tactile jewelry-box cinema rather than a sterile media server or corporate video call. Across dashboards, auth gates, setup wizards, admin consoles, and diagnostics, surfaces blend soft blush-white marshmallow glass with bouncy 3D pink clay buttons, warm amber shimmer highlights, and deep berry ink for crisp legibility.

Only the active video theater mode dims into translucent obsidian glass so the cinema screen commands full attention, while every surrounding shell — Setup, Admin, Auth, Library, and Home — keeps the same playful coquette warmth and friendly conversational copy.

**Key Characteristics:**
- Tactile 3D claymorphism using thick colored bottom bevel lips and bright top inner highlights
- Soft blush canvas (`cream-blush`) warmed by rose, buttercream gold, and lavender radial glows
- Deep plum ink typography that preserves high legibility against pastel frosted surfaces
- Spring-like micro-bounces (`cubic-bezier(0.34, 1.56, 0.64, 1)`) on interactive pills and clay controls

## Colors

The palette pairs vibrant sakura pinks and soft blush tints with warm gold shimmer, subtle lavender glaze, and deep plum ink for contrast.

### Primary
- **Sakura Pink** (`sakura-pink`): Primary CTAs, active room badges, progress fills, focus glows, and brand gradient highlights.
- **Sakura Deep** (`sakura-deep`): Hover intensification and gradient depth on primary buttons and active ribbons.
- **Blush Rose** (`blush-rose`): Card borders, ambient glow shadows, custom scrollbars, and holographic framing accents.

### Secondary
- **Gold Shimmer** (`gold-shimmer`): VIP/special actions, holographic borders, star sparkles, and warning badges that stay warm inside the pink world.

### Tertiary
- **Lavender Glaze** (`lavender-glaze`): Soft iridescent gradient companion for multi-stop holographic highlights and secondary badges.

### Neutral
- **Cream Blush** (`cream-blush`): Global light page canvas layered with soft rose and warm cream radial washes.
- **Marshmallow White** (`marshmallow-white`): Frosted card and pill fill surfaces (`backdrop-filter: blur(20px)`).
- **Plum Ink** (`plum-ink`): Primary headings and body copy (never harsh pure black on pastel panels).
- **Plum Muted / Dim** (`plum-muted` / `plum-dim`): Secondary helper labels, timestamps, placeholders, and subtitle captions.
- **Cinema Obsidian** (`cinema-obsidian`): Reserved strictly for active theater/fullscreen chrome when video playback takes focus.

### Named Rules
**The Warm Ink Rule.** Text on light pastel surfaces uses deep plum (`plum-ink` and `plum-muted`), never cold gray `#111827` or neutral charcoal, so copy stays harmonious with blush surfaces.

## Typography

**Display Font:** Outfit (fallback Poppins, -apple-system, sans-serif)
**Body Font:** Outfit (fallback Poppins, -apple-system, sans-serif)

**Character:** Geometric, friendly, and rounded with confident `800`-weight display titles and clean tabular/tightly tracked metadata for timestamps and room status pills.

### Hierarchy
- **Display** (800, 1.75rem / clamp(1.4rem, 2.5vw, 2rem), 1.2): Hero welcome headers, Setup step titles, and brand banners (`-0.02em` tracking).
- **Headline** (800, 1.3rem, 1.25): Top navbar brand mark and section titles.
- **Title** (700, 1.05rem, 1.35): Card headers, modal titles, and diagnostics panel sections.
- **Body** (500, 0.9rem, 1.5): Form helper text, descriptions, and chat messages (60-72ch comfortable measure).
- **Label** (700, 0.78rem, 1.2): Compact clay chips, status pills, timestamps, and button labels.

### Named Rules
**The Weight Over Size Rule.** Hierarchy relies on bold `700`-`800` Outfit weights paired with tight `-0.02em` display tracking rather than oversized thin headings.

## Layout

Content lives inside centered `max-width: 1200px` padded containers (`1.75rem` desktop gutter) with generous `1.75rem` vertical rhythm between frosted cards and `grid-template-columns: repeat(auto-fit, minmax(250px, 1fr))` responsive card grids that collapse gracefully down to mobile viewports.

## Elevation & Depth

Depth uses a signature **3D Claymorphic Glass Hybrid**: floating frosted blush cards (`backdrop-filter: blur(16px-24px)`) combined with tactile solid bottom-lip shadows and crisp bright upper inner highlights so elements look puffy and pressable.

### Shadow Vocabulary
- **Clay Primary Lip** (`box-shadow: 0 6px 0 #9d1366, 0 8px 20px rgba(236, 72, 153, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35)`): Tactile bevel under primary hot-pink action buttons.
- **Marshmallow Card Depth** (`box-shadow: 0 16px 36px -8px rgba(244, 114, 182, 0.28), 0 6px 14px -3px rgba(236, 72, 153, 0.14), inset 0 2px 5px rgba(255, 255, 255, 0.98), inset 0 -3px 6px rgba(244, 114, 182, 0.16)`): Floating container shadow for holographic and clay cards.
- **Glitter Glow** (`box-shadow: 0 8px 32px rgba(244, 114, 182, 0.25), 0 0 15px rgba(251, 191, 36, 0.15)`): Ambient highlight around live presence banners and spotlight states.

### Named Rules
**The Pressable Lip Rule.** Primary and secondary clay buttons physically depress (`translateY` down while shortening the bottom lip shadow) on `:active` and lift cleanly on `:hover`.

## Shapes

Generously rounded organic curves everywhere: compact `8px` (`sm`) badges and inner frames, `14px` (`md`) inputs and secondary buttons, `16px` primary clay buttons, `20px` (`lg`) banners, `26px` (`card`) main frosted cards, and `9999px` (`pill`) chips and presence pills.

## Components

Every primitive feels cushiony, rosy, and immediately responsive to pointer hover and press.

### Buttons
- **Shape:** Pillows of pink clay (`16px` primary, `14px` secondary).
- **Primary:** Multi-stop sakura pink gradient (`#ff5db0` -> `#ec4899` -> `#c5127a`), white `800`-weight label, `0.58rem 1.3rem` padding, and `#9d1366` 3D bottom lip.
- **Hover / Focus:** Lifts `2px` upward on spring curve with intensified glow; `:active` presses down `4px`.
- **Secondary:** Frosted marshmallow-pink gradient (`#fff5fa` -> `#fbd5eb`), `#be185d` text, `1.5px` rose border, `0.55rem 1rem` padding.

### Chips
- **Style:** Full pill (`9999px`), frosted soft rose gradient, `1.5px` blush border, `#be185d` `700`-weight label (`0.32rem 0.85rem`).
- **State:** Active state saturates toward `#f9a8d4` with a sakura glow border and `#9d174d` ink.

### Cards / Containers
- **Corner Style:** Soft marshmallow `26px` radius.
- **Background:** `linear-gradient(155deg, rgba(255,255,255,0.98), rgba(254,226,242,0.92))` with `backdrop-filter: blur(20px)`.
- **Shadow Strategy:** Marshmallow Card Depth outer pink shadow + bright white top inner edge.
- **Border:** Crisp `1.5px` luminous white or translucent rose highlight border.
- **Internal Padding:** `1.25rem` to `1.75rem`.

### Inputs / Fields
- **Style:** Frosted translucent white (`rgba(255, 255, 255, 0.85)`), `1px` blush border, `14px` radius, left rose icon slot.
- **Focus:** Solid `#ffffff` surface, sakura pink border, `3px` soft sakura halo glow.

### Navigation
- **Sticky Frost Header:** Sticky frosted glass bar (`backdrop-filter: blur(20px)`), blush bottom border, sakura-to-gold gradient brand wordmark, and pill-shaped profile indicator; transitions into centered auto-hiding dark obsidian glass pill inside active video theater mode.

## Do's and Don'ts

### Do:
- **Do** carry the playful pastel-pink claymorphic voice into Setup, Admin, AuthGate, and Diagnostics screens using light blush surfaces and plum ink.
- **Do** give primary/secondary interactive controls spring-like press feedback and clear focus rings (`0 0 0 3px rgba(236, 72, 153, 0.35)`).
- **Do** use warm gold (`#f59e0b`) and crisp emerald (`#10b981`) status indicators styled harmoniously inside frosted pink cards.

### Don't:
- **Don't** slip into generic dark-slate corporate admin panels (`#0f172a` / `#1e293b` / `#cbd5e1`) outside the active video theater screen.
- **Don't** flatten clay buttons into plain unstyled HTML controls without borders, depth, or hover states.
- **Don't** hardcode personal user names, emails, or single-couple accounts into shared UI chrome.

