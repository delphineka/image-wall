# Image Wall

## Contents

- [Introduction](#introduction)
- [Installation/Importing](#installationimporting)
- [Usage](#usage)
  - [Example Gallery](#example-gallery)
  - [Default Initialisation](#default-initialisation)
  - [Using in a Browser Environment](#using-in-a-browser-environment)
- [Options](#options)
  - [ImageWall](#imagewall)
  - [LightBox](#lightbox)
- [Events](#events)
- [Exposed Methods and Attributes](#exposed-methods)
  - [ImageWall](#imagewall-1)
  - [LightBox](#lightbox-1)

## Introduction

A lightweight, dependency-free, image wall with built-in light box. The image wall layout mimics Flickr's justified layout.

The included LightBox class allows you to cycle through the wall images in a popover using a data attribute pointing to a higher resolution url for each. Navigation is via button, clicking on left/right half of image, or by swipe gesture (left/right to navigate, up/down to close).

My motivation for this package was being unable to find a simple package that I could throw a container with child images, and just let it do the layout and lightbox without lots of wrangling and dependencies, and without a required folder structure of images with prefixes.

The ImageWall and LightBox instances can be created independently from each other if you only want the functionality of one and not the other. LightBox is enabled by default when creating an ImageWall instance, disable via options.

ImageWall is css free (sizing etc. is via inline styling), LightBox has css published with this package, or feel free to style it according to your needs.

Compiled gzip size less than 4kB.

![a loaded image wall](./media/ImageWall.png)
&nbsp;
![light box](./media/LightBox.png)

## Installation/Importing

Install the package via npm:

```bash
npm install imagewall
# or with yarn
yarn add imagewall
```

ESM Import (TypeScript / modern bundlers like Vite/Webpack)

```ts
import {
  ImageWall,
  ImageWallOptions,
  LightBox,
  LightboxOptions
} from 'imagewall'
// CSS is automatically imported via index.ts, so no need for a separate import.
```

## Usage

The gallery container should consist of thumbnail images (either `<img>` or `<picture>`).

For LightBox, each image element must have a `data-src` attribute with the url of the higher resolution image to display. An optional `data-description` element can be used to include a caption for the image in LightBox.

### Example Gallery

See [demo page](./index.html). You can run this demo by cloning/forking this repository and running `npm run dev`.

Note, that the image elements must be immediate descendants of the container, not nested at a deeper level.

Using `<picture>` elements:

```html
<div class="image-wall" id="gallery">
  <picture
    data-src="/media/kowloon.max-1200x600.format-webp.webp"
    data-caption="Kowloon Harbour, Hong Kong"
  >
    <source
      srcset="/media/kowloon.height-300.format-webp.webp"
      type="image/webp"
    />
    <img
      src="/media/kowloon.height-300.format-jpeg.jpg"
      alt="kowloon"
      height="180"
      width="auto"
    />
  </picture>
  <picture data-src="/media/good-food.max-1200x600.format-webp.webp">
    <source
      srcset="/media/good-food.height-300.format-webp.webp"
      type="image/webp"
    />
    <img
      src="/media/good-food.height-300.format-jpeg.jpg"
      alt="good-food"
      height="180"
      width="auto"
    />
  </picture>
  ....
</div>
```

Using `<img>` elements:

```html
<div class="image-wall" id="gallery">
  <img src="/media/kowloon.height-300.format-jpeg.jpg" alt="kowloon" height="180
  width="auto" data-src="/media/kowloon.max-1200x600.format-webp.webp"
  data-caption="Kowloon Harbour, Hong Kong">
  <img
    src="/media/good-food.height-300.format-jpeg.jpg"
    alt="good-food"
    height="180"
    width="auto"
    data-src="/media/good-food.max-1200x600.format-webp.webp"
  />
  ....
</div>
```
### Default Initialisation
To use all defaults, simply pass your thumbnail gallery container:

```ts
new ImageWall(document.getElementById('gallery'))
```

Similarly, to create the LightBox without the ImageWall:

```ts
new LightBox({ container: document.getElementById('gallery') })
```

See [Options](#options) for configuration notes.

### Using in a Browser Environment

**UMD**

```html
<!-- CSS -->
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/imagewall@latest/dist/imagewall.css"
/>

<!-- UMD JS -->
<script src="https://cdn.jsdelivr.net/npm/imagewall@latest/dist/imagewall.umd.js"></script>

<script>
  // global ImageWall object from UMD build
  const galleryContainer = document.getElementById('gallery')
  const imageWall = new ImageWall.ImageWall(galleryContainer)
  // or to create LightBox without ImageWall
  const lightbox = new ImageWall.LightBox({ container: galleryContainer })
</script>
```

**Module**

ImageWall with LightBox

```html
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/imagewall@latest/dist/imagewall.css"
/>

<script type="module">
  import { ImageWall } from 'https://cdn.jsdelivr.net/npm/imagewall@latest/dist/imagewall.js'
  const container = document.getElementById('gallery')
  const imageWall = new ImageWall(container)
</script>
```

LightBox without ImageWall

```html
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/imagewall@latest/dist/imagewall.css"
/>

<script type="module">
  import { LightBox } from 'https://cdn.jsdelivr.net/npm/imagewall@latest/dist/imagewall.js'
  const container = document.getElementById('gallery')
  const lightbox = new LightBox({ container })
</script>
```

## Options

### ImageWall

The options have the following type, exposed in `ImageWallOptions`:

```ts
    rowHeight?: number; // target row height in px (will be slightly adjusted per row)
    gap?: number;       // gap between images in px (horizontal & vertical)
    lastRowAlign?: 'left' | 'center' | 'justify' | 'right'; // how to treat the last row if not full
    enableLightbox?: boolean; // enable lightbox on click
    debounceMs?: number; // resize debounce
    debug?: boolean;     // enable debug logging
```

As indicated, the row height will be adjusted to fit the images while keeping their aspect ratios. The `rowHeight` value is the **maximum** value that the row height will have.

For example, to create an image wall with target height 180px, gap 6px and with LightBox disabled:
```ts
new ImageWall(container, { rowHeight: 180, gap: 6, enableLightbox: false });
```

`debug` will output messages to the debug console to help any troubleshooting. It should be set to `false` for production.

### LightBox

The options have the following type, exposed in `ImageWallOptions`:
```ts
    container: HTMLElement;
    images?: HTMLElement[]; // wrappers (picture or img) that have data-src and optional data-caption
    debug?: boolean;
```

Only `container` is required, `images` wil be self discovered if omitted (it exists here to allow ImageWall to pass in a ready-made list without needing a second DOM query).

When LightBox is used with ImageWall, these options are passed in from that class.

## Events

ImageWall emits a `'layout'` event whenever the layout is adjusted. This will happen for the first run, and any subsequent run when the container dimensions are altered (screen layout change for example).

## Exposed methods

### ImageWall
The following methods are exposed on `ImageWall`:

- `refresh()`: Re-run layout using the current cached list of images.
- `rebuild()`: Re-scan direct children for images, update internal list & (optionally) LightBox, then layout.

Additionally, the LightBox instance is exposed via the `ImageWall` `lightBox` attribute.

### LightBox
The following methods are exposed on `LightBox`:

- `show(index: number)`: show the image at (zero-based) index position. Opens the modal if not already open.
- `close()`: close the modal
- `next()`: show the next image in the gallery
- `prev()`: show the previous image in the gallery

Additionally, the `images` array is exposed and can be updated programatically if needed.

All of the LightBox public methods and attributes are accessible via `imageWall.lightBox` if calling LightBox from ImageWall.