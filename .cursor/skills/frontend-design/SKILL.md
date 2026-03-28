---
name: frontend-design
description: Guides creation of distinctive, production-grade web UIs (components, pages, apps) with strong typography, motion, and layout—avoiding generic AI aesthetics. Use when building or redesigning frontend interfaces, landing pages, dashboards, or when the user asks for polished, memorable design in React, Vue, HTML/CSS, or Next.js.
---

# Frontend design

Adapted from [Anthropic’s Claude Code `frontend-design` skill](https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md).

Guides creation of distinctive, production-grade frontend interfaces that avoid generic “AI slop” aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

The user provides frontend requirements: a component, page, application, or interface. They may include purpose, audience, or technical constraints.

## Design thinking

Before coding, understand the context and commit to a **bold** aesthetic direction:

- **Purpose**: What problem does this solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. Use these for inspiration; design one direction and stay true to it.
- **Constraints**: Framework, performance, accessibility.
- **Differentiation**: What makes this unforgettable? What is the one thing someone will remember?

**Critical**: Choose a clear conceptual direction and execute with precision. Bold maximalism and refined minimalism both work—the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:

- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear point of view
- Meticulously refined in every detail

## Frontend aesthetics guidelines

Focus on:

- **Typography**: Distinctive, characterful fonts; pair a strong display face with a refined body font. Avoid overused defaults (e.g. Arial, Inter-only stacks) when the brief allows custom choices.
- **Color & theme**: Cohesive palette; prefer CSS variables. Dominant colors with sharp accents beat timid, evenly distributed palettes.
- **Motion**: Animations and micro-interactions. Prefer CSS for static HTML; in React, use Motion when available. Prefer one orchestrated moment (e.g. staggered `animation-delay` on load) over scattered trivial motion. Consider scroll-linked and hover states that feel intentional.
- **Spatial composition**: Unexpected layouts—asymmetry, overlap, diagonal flow, grid-breaking elements, generous negative space **or** controlled density.
- **Backgrounds & visual details**: Atmosphere and depth: gradient meshes, noise/grain, geometric patterns, layered transparency, shadows, decorative borders, custom cursors—matched to the chosen aesthetic.

**Avoid** generic AI-looking UIs: clichéd purple-on-white gradients, predictable component patterns, interchangeable layouts, and “default Tailwind demo” sameness.

Interpret creatively; vary light/dark, type, and mood across different requests. Do not converge on the same trendy font or palette every time.

**Important**: Match implementation complexity to the vision—maximalist work needs richer motion and texture; minimal/refined work needs restraint, spacing, and typographic precision.

Commit fully to a distinctive vision; prioritize memorable, context-appropriate design over safe defaults.
