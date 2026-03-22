# Drop Card Specs

## Grid
- **Layout**: CSS Grid, auto-fill
- **Min card width**: 240px
- **Gap**: 20px
- **Padding**: 40px

## Card Container
- **Aspect ratio**: 4:5 (portrait)
- **Entire card is clickable** (links to booking URL)
- **Hover**: translateY(-4px), box-shadow 0 8px 24px rgba(0,0,0,0.2)

## Image Area
- **Size**: flex: 1 (fills remaining space after footer)
- **Background**: cover, center
- **Fallback color**: #000000

## Tag (top-left badge)
- **Position**: top 10px, left 10px
- **Background**: #ffffff
- **Text color**: #000000
- **Font**: 0.625rem (10px), weight 700, uppercase
- **Padding**: 5px 10px

## Footer (black bar)
- **Background**: #000000
- **Padding**: 20px
- **Layout**: flex, space-between, align-items center
- **Gap**: 12px

## Footer Text (all three lines)
- **Font size**: 1rem (16px) — identical for all
- **Font weight**: 600
- **Color**: #fcf6e9 (cream)
- **Line-height**: 1.2
- **Text-transform**: uppercase
- **White-space**: nowrap

## Footer Spacing
```
PROPERTY NAME
            ← margin-bottom: 12px
DATE
            ← margin-bottom: 2px
DAYS
```

## Button
- **Background**: #ffffff
- **Text color**: #000000
- **Font**: 0.625rem (10px), weight 700, uppercase
- **Padding**: 8px 12px
- **Hover**: background changes to #fcf6e9
