# Circaevum

**A 3D Planetary Time Visualization**

Circaevum is an interactive Three.js application that visualizes time as vertical movement through space. Watch Earth and other planets trace helical worldlines through spacetime as you navigate from century-scale views down to individual hours.

![Circaevum Screenshot](circaevum/screenshot.png)

## Concept

In Circaevum, time flows upward. Each planet's orbit creates a helix (worldline) as it spirals through time. The present moment is where you see the planets on their orbital plane—navigate backward with 'A' to descend into the past, or forward with 'D' to ascend into the future.

The visualization spans 9 zoom levels, from a 125-year century view showing the grand sweep of orbital mechanics, down to an 8-hour day view where you can watch Earth's precise position change by the hour.

## Quick Start

1. Open `circaevum/index.html` in a modern web browser
2. Click **"EXPLORE THE PROTOTYPE"** to enter the visualization
3. Use the controls below to navigate through time and zoom levels

## Controls

| Key | Action |
|-----|--------|
| **1-9, 0** | Switch zoom levels (1=Century, 9=Day, 0=Landing) |
| **W / S** | Zoom in / out one level |
| **A / D** | Navigate backward / forward in time |
| **Space** | Smooth return to present |
| **N** | Instant return to present |
| **M** | Toggle Moon worldline |
| **T** | Toggle horizontal time view |
| **R** | Rotate view 90° |

**Mouse:**
- Click and drag to pan the view
- Scroll to zoom in/out

**UI Buttons:**
- **TIME MARKERS** - Toggle visibility of time markers
- **LIGHT MODE** - Switch between dark and light themes
- **SOUND OFF** - Toggle ambient audio

## Zoom Levels

| Level | Name | Time Span | Focus |
|-------|------|-----------|-------|
| 1 | Century | 125 years | Sun |
| 2 | Decade | 10 years | Sun |
| 3 | Year | 1 year | Sun |
| 4 | Quarter | 3 months | Earth |
| 5 | Month | 1 month | Earth |
| 6 | Lunar | ~29 days | Earth |
| 7 | Week | 1 week | Earth |
| 8 | Day | 1 day | Earth |
| 9 | Clock | 8 hours | Earth |

## Project Structure

```
circaevum-package/
├── README.md           # This file
├── QUICK_START.md      # Quick reference guide
└── circaevum/
    ├── index.html      # Main application entry point
    ├── css/
    │   └── styles.css  # Application styling
    └── js/
        ├── config.js   # Constants, zoom configs, planet data
        ├── datetime.js # Date initialization & height calculations
        └── main.js     # Three.js scene, rendering, navigation
```

## Technical Details

### Dependencies

- **Three.js r128** - 3D rendering (loaded from CDN)
- Modern browser with WebGL support

### How It Works

**Height = Time:** Each year equals 100 scene units vertically. The present moment is calculated from your system clock, positioning planets at their actual current orbital positions.

**Orbital Accuracy:** Planet positions use simplified circular orbits with period-accurate ratios. Earth's `startAngle` is dynamically calculated from the Vernal Equinox, so planets appear in roughly correct positions relative to Earth's seasons.

**Worldlines:** The helical trails behind each planet represent their path through spacetime. As you navigate through time, you're moving along these worldlines.

**Navigation Offsets:** Each zoom level tracks how far you've navigated from the present. When switching zoom levels, the system preserves your selected time position.

## Browser Compatibility

Tested and working in:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Requires WebGL support.

## Known Limitations

- Orbital mechanics are simplified (circular orbits, not elliptical)
- Planet sizes are not to scale (for visibility)
- Very far time navigation (centuries away) may have floating-point precision issues

## Development

This is an active prototype. The codebase is organized into:

- **config.js** - All constants and configuration (planet data, zoom levels, scene settings)
- **datetime.js** - Date/time state management and height calculations
- **main.js** - Three.js scene setup, rendering loop, user interaction, and navigation logic

### Version Naming

Versions follow the format `vYY.Q.TT` where:
- `YY` = Two-digit year
- `Q` = Quarter (1-4)
- `TT` = Taiji number within that quarter

Example: `v25.4.08` = Year 2025, Q4, Taiji 08

## Roadmap

This visualization is the foundation for a broader time management platform. Planned features include:

- **Calendar Events** - Create, view, and manage events positioned in 3D spacetime
- **Calendar Sharing** - Share calendars and collaborate with others
- **Account System** - User accounts with persistent data and preferences
- **Data Ecosystem Integration** - Connect with Google Calendar, Outlook, Apple Calendar, and other time management tools
- **Time Analytics** - Visualize patterns in how you spend your time
- **Collaborative Planning** - See shared events and availability in the 3D space

## License

[Your license here]

## Credits

Built with [Three.js](https://threejs.org/)

---

*"The only reason for time is so that everything doesn't happen at once."* — Albert Einstein
