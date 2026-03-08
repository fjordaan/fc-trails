# GPS Map Calibration

Use this procedure to accurately set the map corner coordinates from real GPS readings.

## Why two waypoints?
Each waypoint has a known pixel position on the map image. By standing at two waypoints and recording your GPS coordinates, Claude can solve the exact corner coordinates mathematically — no guessing needed.

## In the cemetery

Visit **two waypoints that are far apart**. The best pair for this trail is:

| Waypoint | Symbol | Title | Location on map |
|----------|--------|-------|-----------------|
| 3 | Ze | Zelkova | Upper-left area |
| 14 | Sy | Veteran sycamores | Lower-right area |

At each waypoint:
1. Stand as close as possible to the **base of the tree trunk** (or the marker post if there is one)
2. Open the **Compass app** on your iPhone
3. Tap the coordinates at the bottom — Apple Maps will open
4. Wait 15–30 seconds for the GPS to settle (stand still, in the open)
5. Note the coordinates shown, e.g. `51.48312ºN, -0.21445ºW`

## Back home

Tell Claude:
- "I'm at waypoint Ze (Zelkova): 51.48312ºN, -0.21445ºW"
- "I'm at waypoint Sy (Veteran sycamores): 51.47901ºN, -0.21312ºW"

Claude will look up the pixel positions from trail.json and calculate the exact corner coordinates.
