#!/usr/bin/env python3
"""
Generate a cyberpunk app icon for Musicio.
Creates a 1024x1024 PNG with neon equalizer bars forming an "M" letterform.
Premium quality with dramatic neon glow effects.
"""

import math
import random
from PIL import Image, ImageDraw, ImageFilter, ImageChops

SIZE = 1024
CENTER = SIZE // 2

# Colors
BG_TOP = (8, 8, 14)
BG_BOTTOM = (14, 14, 24)
CYAN = (0, 240, 255)
MAGENTA = (255, 0, 170)
DEEP_PURPLE = (80, 0, 180)
GRID_COLOR = (25, 35, 55)
GRID_COLOR_BRIGHT = (35, 50, 75)


def lerp_color(c1, c2, t):
    return tuple(int(a + (b - a) * max(0, min(1, t))) for a, b in zip(c1, c2))


def create_rounded_rect_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def draw_gradient_background(img):
    draw = ImageDraw.Draw(img)
    for y in range(SIZE):
        t = y / SIZE
        t = t * t * (3 - 2 * t)
        color = lerp_color(BG_TOP, BG_BOTTOM, t)
        draw.line([(0, y), (SIZE, y)], fill=color)

    # Radial vignette
    vignette = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    vdraw = ImageDraw.Draw(vignette)
    for r in range(SIZE // 2, 0, -3):
        t = 1.0 - (r / (SIZE / 2))
        alpha = int(t * t * 90)
        vdraw.ellipse(
            [CENTER - r, CENTER - r, CENTER + r, CENTER + r],
            fill=(0, 0, 0, alpha),
        )
    img.paste(Image.alpha_composite(img.convert("RGBA"), vignette).convert("RGB"))


def draw_grid(img):
    overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    spacing = 40

    for x in range(0, SIZE, spacing):
        dist = abs(x - CENTER)
        alpha = max(6, int(28 * (1 - dist / (SIZE / 2))))
        is_major = x % (spacing * 3) == 0
        color = (*GRID_COLOR_BRIGHT, min(alpha + 12, 45)) if is_major else (*GRID_COLOR, alpha)
        draw.line([(x, 0), (x, SIZE)], fill=color, width=1)

    for y in range(0, SIZE, spacing):
        dist = abs(y - CENTER)
        alpha = max(6, int(28 * (1 - dist / (SIZE / 2))))
        is_major = y % (spacing * 3) == 0
        color = (*GRID_COLOR_BRIGHT, min(alpha + 12, 45)) if is_major else (*GRID_COLOR, alpha)
        draw.line([(0, y), (SIZE, y)], fill=color, width=1)

    # Intersection dots on major grid
    for x in range(0, SIZE, spacing * 3):
        for y in range(0, SIZE, spacing * 3):
            dist = math.sqrt((x - CENTER) ** 2 + (y - CENTER) ** 2)
            if dist < SIZE * 0.42:
                alpha = int(35 * (1 - dist / (SIZE * 0.42)))
                draw.ellipse([x - 1, y - 1, x + 1, y + 1], fill=(70, 110, 150, alpha))

    img_rgba = img.convert("RGBA")
    result = Image.alpha_composite(img_rgba, overlay)
    img.paste(result.convert("RGB"))


def draw_center_glow(img):
    """Large ambient glow behind the M for depth."""
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)

    # Cyan glow on left
    for r in range(350, 0, -3):
        t = r / 350
        alpha = int(18 * (1 - t) ** 1.5)
        draw.ellipse(
            [CENTER - 200 - r, CENTER - 20 - r, CENTER - 200 + r, CENTER - 20 + r],
            fill=(0, 60, 80, alpha),
        )

    # Magenta glow on right
    for r in range(350, 0, -3):
        t = r / 350
        alpha = int(18 * (1 - t) ** 1.5)
        draw.ellipse(
            [CENTER + 200 - r, CENTER - 20 - r, CENTER + 200 + r, CENTER - 20 + r],
            fill=(60, 0, 40, alpha),
        )

    # Central purple glow
    for r in range(280, 0, -3):
        t = r / 280
        alpha = int(22 * (1 - t) ** 2)
        draw.ellipse(
            [CENTER - r, CENTER - r + 40, CENTER + r, CENTER + r + 40],
            fill=(25, 8, 50, alpha),
        )

    img_rgba = img.convert("RGBA")
    result = Image.alpha_composite(img_rgba, glow)
    img.paste(result.convert("RGB"))


def get_m_bar_heights():
    """Define equalizer bar heights that form a bold, symmetric M shape."""
    random.seed(42)

    num_bars = 35
    bar_width = 16
    gap = 3
    total_width = num_bars * (bar_width + gap) - gap
    start_x = CENTER - total_width // 2

    # Build a perfectly symmetric M profile
    # Half-profile (left half including center), then mirror
    half = num_bars // 2  # 17 bars in left half, bar 17 is center
    mid = half  # center bar index

    left_profile = []
    for i in range(half + 1):
        if i <= 5:
            # Left pillar - tall and strong
            h = 1.0 - i * 0.005
        elif i <= 11:
            # Left diagonal descent into the V
            progress = (i - 5) / 6
            ease = (1 - math.cos(progress * math.pi)) / 2
            h = 0.97 - ease * 0.58
        elif i <= 14:
            # Valley floor
            dist = abs(i - 13)
            h = 0.33 + dist * 0.04
        elif i <= half:
            # Ascent to center peak - make it more prominent
            progress = (i - 14) / (half - 14)
            ease = (1 - math.cos(progress * math.pi)) / 2
            h = 0.37 + ease * 0.42
        left_profile.append(h)

    # Mirror to create full profile
    full_profile = list(left_profile)
    # Add mirrored right side (excluding center which is already in left_profile)
    for i in range(half - 1, -1, -1):
        full_profile.append(left_profile[i])

    bars = []
    for i, h in enumerate(full_profile):
        # Tiny organic variation
        h += random.uniform(-0.012, 0.012)
        h = max(0.18, min(1.0, h))
        x = start_x + i * (bar_width + gap)
        bars.append((x, h, bar_width))

    return bars


def draw_equalizer_m(img):
    """Draw the M letterform with segmented neon equalizer bars and heavy glow."""
    bars = get_m_bar_heights()

    max_bar_height = 460
    bar_base_y = CENTER + 210

    # Segment parameters for each bar
    seg_height = 6
    seg_gap = 2

    # --- GLOW LAYER 0: Super-wide color wash ---
    glow_super = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gs_draw = ImageDraw.Draw(glow_super)
    for x, h, w in bars:
        bh = int(max_bar_height * h)
        bt = bar_base_y - bh
        t = (x - bars[0][0]) / (bars[-1][0] - bars[0][0])
        r, g, b = lerp_color(CYAN, MAGENTA, t)
        expand = 30
        gs_draw.rounded_rectangle(
            [x - expand, bt - expand, x + w + expand, bar_base_y + expand],
            radius=10, fill=(r, g, b, 16),
        )
    glow_super = glow_super.filter(ImageFilter.GaussianBlur(radius=60))

    # --- GLOW LAYER 1: Ultra-wide ambient glow ---
    glow_ultra = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gu_draw = ImageDraw.Draw(glow_ultra)
    for x, h, w in bars:
        bh = int(max_bar_height * h)
        bt = bar_base_y - bh
        t = (x - bars[0][0]) / (bars[-1][0] - bars[0][0])
        r, g, b = lerp_color(CYAN, MAGENTA, t)
        expand = 20
        gu_draw.rounded_rectangle(
            [x - expand, bt - expand, x + w + expand, bar_base_y + expand],
            radius=8, fill=(r, g, b, 28),
        )
    glow_ultra = glow_ultra.filter(ImageFilter.GaussianBlur(radius=40))

    # --- GLOW LAYER 2: Wide glow ---
    glow_wide = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gw_draw = ImageDraw.Draw(glow_wide)
    for x, h, w in bars:
        bh = int(max_bar_height * h)
        bt = bar_base_y - bh
        t = (x - bars[0][0]) / (bars[-1][0] - bars[0][0])
        r, g, b = lerp_color(CYAN, MAGENTA, t)
        expand = 12
        gw_draw.rounded_rectangle(
            [x - expand, bt - expand, x + w + expand, bar_base_y + expand],
            radius=6, fill=(r, g, b, 42),
        )
    glow_wide = glow_wide.filter(ImageFilter.GaussianBlur(radius=22))

    # --- GLOW LAYER 3: Medium glow ---
    glow_med = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gm_draw = ImageDraw.Draw(glow_med)
    for x, h, w in bars:
        bh = int(max_bar_height * h)
        bt = bar_base_y - bh
        t = (x - bars[0][0]) / (bars[-1][0] - bars[0][0])
        r, g, b = lerp_color(CYAN, MAGENTA, t)
        expand = 6
        gm_draw.rounded_rectangle(
            [x - expand, bt - expand, x + w + expand, bar_base_y + expand],
            radius=4, fill=(r, g, b, 65),
        )
    glow_med = glow_med.filter(ImageFilter.GaussianBlur(radius=10))

    # --- GLOW LAYER 4: Tight glow ---
    glow_tight = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gt_draw = ImageDraw.Draw(glow_tight)
    for x, h, w in bars:
        bh = int(max_bar_height * h)
        bt = bar_base_y - bh
        t = (x - bars[0][0]) / (bars[-1][0] - bars[0][0])
        r, g, b = lerp_color(CYAN, MAGENTA, t)
        expand = 3
        gt_draw.rounded_rectangle(
            [x - expand, bt - expand, x + w + expand, bar_base_y + expand],
            radius=3, fill=(r, g, b, 90),
        )
    glow_tight = glow_tight.filter(ImageFilter.GaussianBlur(radius=5))

    # --- CORE LAYER: Sharp segmented bars ---
    core = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    core_draw = ImageDraw.Draw(core)

    for x, h, w in bars:
        bh = int(max_bar_height * h)
        bt = bar_base_y - bh
        t = (x - bars[0][0]) / (bars[-1][0] - bars[0][0])
        base_r, base_g, base_b = lerp_color(CYAN, MAGENTA, t)

        # Draw segmented bar
        num_segs = bh // (seg_height + seg_gap)
        for s in range(num_segs):
            seg_bot = bar_base_y - s * (seg_height + seg_gap)
            seg_top = seg_bot - seg_height
            if seg_top < bt:
                seg_top = bt

            seg_t = s / max(1, num_segs - 1)  # 0=bottom, 1=top

            # Color gradient: darker at bottom, brighter/whiter at top
            brightness = 0.60 + 0.40 * seg_t
            white_mix = seg_t * 0.40  # more white toward top
            sr = min(255, int(base_r * brightness + 255 * white_mix))
            sg = min(255, int(base_g * brightness + 255 * white_mix))
            sb = min(255, int(base_b * brightness + 255 * white_mix))

            alpha = int(210 + 45 * seg_t)
            alpha = min(255, alpha)

            core_draw.rounded_rectangle(
                [x, seg_top, x + w, seg_bot],
                radius=2,
                fill=(sr, sg, sb, alpha),
            )

        # Bright cap on top (the tip glows hottest)
        cap_h = 5
        cap_r = min(255, base_r + 120)
        cap_g = min(255, base_g + 120)
        cap_b = min(255, base_b + 120)
        core_draw.rounded_rectangle(
            [x - 1, bt - 3, x + w + 1, bt + cap_h],
            radius=3,
            fill=(cap_r, cap_g, cap_b, 255),
        )

        # Inner highlight stripe
        cx = x + w // 2
        core_draw.line(
            [(cx, bt + 8), (cx, bar_base_y - 4)],
            fill=(255, 255, 255, 30),
            width=max(1, w // 4),
        )

    # --- Composite all layers ---
    img_rgba = img.convert("RGBA")
    img_rgba = Image.alpha_composite(img_rgba, glow_super)
    img_rgba = Image.alpha_composite(img_rgba, glow_ultra)
    img_rgba = Image.alpha_composite(img_rgba, glow_wide)
    img_rgba = Image.alpha_composite(img_rgba, glow_med)
    img_rgba = Image.alpha_composite(img_rgba, glow_tight)
    img_rgba = Image.alpha_composite(img_rgba, core)
    img.paste(img_rgba.convert("RGB"))

    return bars


def draw_base_line(img, bars):
    """Draw a glowing horizontal baseline under the bars."""
    bar_base_y = CENTER + 210
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    left_x = bars[0][0] - 30
    right_x = bars[-1][0] + bars[-1][2] + 30

    num_seg = 60
    for i in range(num_seg):
        t = i / (num_seg - 1)
        x1 = int(left_x + t * (right_x - left_x))
        x2 = int(left_x + (i + 1) / (num_seg - 1) * (right_x - left_x))
        x2 = min(x2, right_x)
        r, g, b = lerp_color(CYAN, MAGENTA, t)

        # Core line
        draw.line([(x1, bar_base_y), (x2, bar_base_y)], fill=(r, g, b, 220), width=2)
        # Glow
        draw.line([(x1, bar_base_y), (x2, bar_base_y)], fill=(r, g, b, 50), width=10)

    blurred = layer.filter(ImageFilter.GaussianBlur(radius=4))
    img_rgba = img.convert("RGBA")
    img_rgba = Image.alpha_composite(img_rgba, blurred)
    img_rgba = Image.alpha_composite(img_rgba, layer)
    img.paste(img_rgba.convert("RGB"))


def draw_reflection(img, bars):
    """Faded reflection below baseline."""
    max_bar_height = 460
    bar_base_y = CENTER + 210
    reflect_max = 90

    reflection = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    r_draw = ImageDraw.Draw(reflection)

    for x, h, w in bars:
        bh = int(max_bar_height * h)
        t = (x - bars[0][0]) / (bars[-1][0] - bars[0][0])
        cr, cg, cb = lerp_color(CYAN, MAGENTA, t)

        refl_h = min(reflect_max, int(bh * 0.3))
        num_segs = max(1, refl_h // 4)
        for s in range(num_segs):
            seg_top = bar_base_y + 4 + int(s * refl_h / num_segs)
            seg_bot = bar_base_y + 4 + int((s + 1) * refl_h / num_segs)
            fade = 1.0 - s / num_segs
            alpha = int(35 * fade * fade)
            r_draw.rectangle([x, seg_top, x + w, seg_bot], fill=(cr, cg, cb, alpha))

    reflection = reflection.filter(ImageFilter.GaussianBlur(radius=5))
    img_rgba = img.convert("RGBA")
    result = Image.alpha_composite(img_rgba, reflection)
    img.paste(result.convert("RGB"))


def draw_top_cap_glow(img, bars):
    """Extra bloom glow at the tip of each bar for that neon-light-tube feel."""
    max_bar_height = 460
    bar_base_y = CENTER + 210

    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    for x, h, w in bars:
        bh = int(max_bar_height * h)
        bt = bar_base_y - bh
        t = (x - bars[0][0]) / (bars[-1][0] - bars[0][0])
        r, g, b = lerp_color(CYAN, MAGENTA, t)

        # Draw a small radial glow at the top of each bar
        glow_r = 18
        cx = x + w // 2
        cy = bt
        for gr in range(glow_r, 0, -1):
            gt = gr / glow_r
            alpha = int(50 * (1 - gt) ** 1.5)
            draw.ellipse(
                [cx - gr, cy - gr, cx + gr, cy + gr],
                fill=(min(255, r + 80), min(255, g + 80), min(255, b + 80), alpha),
            )

    layer = layer.filter(ImageFilter.GaussianBlur(radius=5))
    img_rgba = img.convert("RGBA")
    result = Image.alpha_composite(img_rgba, layer)
    img.paste(result.convert("RGB"))


def draw_scanlines(img):
    overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for y in range(0, SIZE, 3):
        draw.line([(0, y), (SIZE, y)], fill=(0, 0, 0, 14), width=1)
    img_rgba = img.convert("RGBA")
    result = Image.alpha_composite(img_rgba, overlay)
    img.paste(result.convert("RGB"))


def draw_ambient_particles(img):
    random.seed(77)
    overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    for _ in range(80):
        x = random.randint(80, SIZE - 80)
        y = random.randint(120, SIZE - 120)
        size = random.uniform(0.8, 2.5)
        t = x / SIZE
        r, g, b = lerp_color(CYAN, MAGENTA, t)
        alpha = random.randint(25, 80)
        draw.ellipse([x - size, y - size, x + size, y + size], fill=(r, g, b, alpha))

    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=1.5))
    img_rgba = img.convert("RGBA")
    result = Image.alpha_composite(img_rgba, overlay)
    img.paste(result.convert("RGB"))


def draw_neon_border(img):
    """Draw a gradient neon border with multi-layer glow."""
    radius = int(SIZE * 0.22)
    inset = 8

    # Build border mask (ring shape)
    outer = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(outer).rounded_rectangle(
        [inset, inset, SIZE - 1 - inset, SIZE - 1 - inset],
        radius=radius, fill=255,
    )
    inner_inset = inset + 3
    inner = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(inner).rounded_rectangle(
        [inner_inset, inner_inset, SIZE - 1 - inner_inset, SIZE - 1 - inner_inset],
        radius=max(0, radius - 3), fill=255,
    )
    border_mask = ImageChops.subtract(outer, inner)

    # Build gradient fill for border (diagonal cyan -> magenta)
    gradient = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    g_draw = ImageDraw.Draw(gradient)
    strip = 16
    for y in range(0, SIZE, strip):
        for x in range(0, SIZE, strip):
            t = (x + y) / (2 * SIZE)
            r, g, b = lerp_color(CYAN, MAGENTA, t)
            g_draw.rectangle([x, y, x + strip, y + strip], fill=(r, g, b, 255))
    gradient.putalpha(border_mask)

    # Multiple glow passes
    for blur_r, alpha_mult in [(28, 0.20), (16, 0.35), (8, 0.55), (3, 0.80), (0, 1.0)]:
        layer = gradient.copy()
        if blur_r > 0:
            layer = layer.filter(ImageFilter.GaussianBlur(radius=blur_r))
        r_ch, g_ch, b_ch, a_ch = layer.split()
        a_ch = a_ch.point(lambda p, m=alpha_mult: int(p * m))
        layer = Image.merge("RGBA", (r_ch, g_ch, b_ch, a_ch))
        img_rgba = img.convert("RGBA")
        img_rgba = Image.alpha_composite(img_rgba, layer)
        img.paste(img_rgba.convert("RGB"))


def draw_inner_shadow(img):
    """Subtle inner shadow at the edges of the icon for depth."""
    radius = int(SIZE * 0.22)
    inset = 0

    # Create a filled rounded rect, invert to get shadow on edges
    shape = Image.new("L", (SIZE, SIZE), 255)
    d = ImageDraw.Draw(shape)
    d.rounded_rectangle(
        [inset, inset, SIZE - 1 - inset, SIZE - 1 - inset],
        radius=radius, fill=0,
    )
    # Blur it so the edges are soft
    shape = shape.filter(ImageFilter.GaussianBlur(radius=40))

    shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    shadow.putalpha(shape)
    # Reduce opacity
    r_ch, g_ch, b_ch, a_ch = shadow.split()
    a_ch = a_ch.point(lambda p: min(p, 60))
    shadow = Image.merge("RGBA", (r_ch, g_ch, b_ch, a_ch))

    img_rgba = img.convert("RGBA")
    result = Image.alpha_composite(img_rgba, shadow)
    img.paste(result.convert("RGB"))


def add_top_shine(img):
    """Subtle glass-like shine at top of icon."""
    shine = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(shine)

    for y in range(250):
        t = y / 250
        alpha = int(10 * (1 - t) ** 3)
        draw.line([(80, y), (SIZE - 80, y)], fill=(255, 255, 255, alpha))

    img_rgba = img.convert("RGBA")
    result = Image.alpha_composite(img_rgba, shine)
    img.paste(result.convert("RGB"))


def apply_rounded_mask(img):
    radius = int(SIZE * 0.22)
    mask = create_rounded_rect_mask(SIZE, radius)
    result = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    result.paste(img, mask=mask)
    return result


def main():
    print("Creating Musicio cyberpunk icon (v2)...")

    img = Image.new("RGB", (SIZE, SIZE), BG_TOP)

    print("  [1/12] Gradient background...")
    draw_gradient_background(img)

    print("  [2/12] Grid lines...")
    draw_grid(img)

    print("  [3/12] Center ambient glow...")
    draw_center_glow(img)

    print("  [4/12] Top shine...")
    add_top_shine(img)

    print("  [5/12] Equalizer M bars...")
    bars = draw_equalizer_m(img)

    print("  [6/12] Bar tip glow bloom...")
    draw_top_cap_glow(img, bars)

    print("  [7/12] Base line...")
    draw_base_line(img, bars)

    print("  [8/12] Reflection...")
    draw_reflection(img, bars)

    print("  [9/12] Ambient particles...")
    draw_ambient_particles(img)

    print("  [10/12] Neon border...")
    draw_neon_border(img)

    print("  [11/12] Scanlines...")
    draw_scanlines(img)

    print("  [12/12] Rounded mask...")
    result = apply_rounded_mask(img)

    output_path = "/Users/viraat/Documents/musicio/assets/icon.png"
    result.save(output_path, "PNG", optimize=True)
    print(f"\nIcon saved to: {output_path}")
    print(f"Size: {result.size[0]}x{result.size[1]}")


if __name__ == "__main__":
    main()
