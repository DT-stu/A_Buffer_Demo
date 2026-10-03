# Z-Buffer vs A-Buffer Transparency Demo

An educational, CPU-based Canvas simulation showing why a conventional Z-buffer is not enough for transparent geometry and how a simplified A-buffer preserves layered surfaces. The scene contains four projected 3D triangle meshes: a cube, pyramid, octahedron, and triangular prism.

## Pixel, sample, and the two algorithms

A **pixel** is one final screen location. A **sample** is one object's contribution to that pixel, including its color, opacity, and depth. Several transparent objects can produce several samples at one pixel.

The Z-buffer stores the closest depth and its associated color for every pixel. This works well for opaque surfaces, because anything behind the nearest surface is hidden. With transparency, however, the surfaces behind the closest one should remain partly visible. This demo's Z-buffer intentionally discards them and blends only the closest sample with the background.

The simplified A-buffer stores a list of `{ depth, color, alpha }` samples per pixel. After rasterization, it sorts each list from farthest to nearest. Back-to-front order is required because alpha blending is order-dependent: the far layer is placed over the background first, then progressively nearer layers are placed over that result.

For each RGB component, blending uses:

```text
result = sourceAlpha × sourceColor
       + (1 − sourceAlpha) × destinationColor
```

## Running

Open `index.html` directly in a modern desktop browser. There is no build step, server, dependency, or external library.

## Controls

- Click **Z-buffer**, **A-buffer**, or **Toggle** to change algorithms.
- All four object cards remain visible. Each has independent depth and alpha sliders plus movement buttons.
- Click a card to make that object the target for keyboard arrow-key movement.
- The auxiliary side camera shows the meshes' positions and depth relative to the main camera; it is an orientation aid, not output from either buffer algorithm. Its slider and ±15° buttons orbit the camera around the scene's Z axis.
- Click the canvas to inspect the one retained fragment and discarded candidates in Z-buffer mode, or all stored fragments in A-buffer blend order.
- Keyboard: `1` selects Z-buffer, `2` selects A-buffer, `Space` toggles, and `R` resets.

## Limitations

This is a deliberately modest 500 × 350, CPU-based educational simulation of the A-buffer concept—not a production GPU renderer. It uses triangle meshes, barycentric depth interpolation, simple perspective projection, and basic face shading, but does not model antialiasing, lighting, clipping, fragment shaders, memory optimization, or advanced order-independent transparency techniques.
