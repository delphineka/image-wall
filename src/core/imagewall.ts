/**
 * ImageWall — a robust, JustifiedGallery-style layout.
 *
 * - Expects container to contain <picture> or <img> elements (we treat both).
 * - Each item is left in the DOM; we set width/height/position on the *item* element (the picture).
 * - Preserves aspect ratios to row height (width = aspect * rowHeight).
 * - Uses two-pass algorithm: first compute rows & integer widths (distribute rounding),
 *   then apply positions in a single pass to avoid layout thrash.
 */

import { LightBox } from "./lightbox";

/**
 * Options for configuring the ImageWall layout engine.
 *
 * All properties are optional; sensible defaults are applied when omitted.
 *
 * @remarks
 * The layout algorithm arranges images into rows whose heights are normalized
 * toward a target height while preserving each image's intrinsic aspect ratio.
 * Gaps are applied between items and rows. The final (possibly incomplete) row
 * can be aligned differently to improve visual balance.
 *
 * @property rowHeight - Target (approximate) row height in CSS pixels. The algorithm
 * adjusts individual row heights slightly to achieve a visually balanced, justified
 * layout while keeping aspect ratios intact. Smaller values create more rows; larger
 * values create fewer, taller rows. (Default: 220)
 *
 * @property gap - Uniform spacing in pixels applied both horizontally between images
 * in a row and vertically between rows. Set to 0 for a flush, masonry-like look.
 * (Default: 8)
 *
 * @property lastRowAlign - How to align the final row when it does not fill the full
 * width. Use:
 *  - 'left' (natural flow, no stretching)
 *  - 'center' (row centered without stretching)
 *  - 'right' (right-align remaining images)
 *  - 'justify' (distribute to span full width; may enlarge gaps or adjust widths)
 * (Default: 'left')
 *
 * @property enableLightbox - When true, clicking an image triggers a lightbox /
 * modal viewer (implementation-dependent). Disable if you plan to handle clicks
 * externally. (Default: true)
 *
 * @property debounceMs - Milliseconds to debounce resize / container dimension
 * recalculations. Tune higher for performance on rapid resize; lower for more
 * immediate responsiveness. (Default: 120)
 *
 * @property debug - Enables verbose console logging of layout computations, useful
 * during development or performance tuning. Avoid enabling in production due to
 * extra overhead. (Default: false)
 *
 * @public
 */
export interface ImageWallOptions {
    rowHeight?: number; // target row height in px (will be slightly adjusted per row)
    gap?: number;       // gap between images in px (horizontal & vertical)
    lastRowAlign?: 'left' | 'center' | 'justify' | 'right'; // how to treat the last row if not full
    enableLightbox?: boolean; // enable lightbox on click
    debounceMs?: number; // resize debounce
    debug?: boolean;     // enable debug logging
}

type ImgInfo = { el: HTMLElement; aspect: number; naturalW: number; naturalH: number };

/**
 * Responsive, gap-aware justified image wall (masonry-like) that:
 * - Packs direct <img> or <picture> children of a container into rows of (near) uniform height.
 * - Justifies (stretches) every full row to the container’s inner width (padding respected).
 * - Supports configurable handling of the final (incomplete) row: left, center, right, or justify.
 * - Applies absolute positioning (container must remain position: relative (set automatically if empty)).
 * - Optionally wires a LightBox (if provided in the surrounding codebase).
 *
 * Core algorithm:
 * 1. Collect direct child images and resolve each natural size (async, deferred until loaded if necessary).
 * 2. Greedily accumulate images into a row until the projected width at target row height would overflow.
 * 3. For "full" rows: compute a precise row height so summed widths (plus gaps) exactly fill the container.
 * 4. For the last row:
 *    - If lastRowAlign = 'justify', treat as a full row (stretched).
 *    - Otherwise keep target row height and do not stretch; align horizontally per lastRowAlign.
 * 5. Convert floating widths to integer pixel widths with fractional distribution to avoid cumulative drift.
 * 6. Absolutely position each item; container height is set to the final occupied vertical space.
 *
 * Public lifecycle:
 * - Instantiate with a container already containing <img> or <picture>.
 * - Automatic initial layout.
 * - Debounced relayout on window resize.
 * - Use refresh() after external dimension changes (e.g., container resized by CSS/layout).
 * - Use rebuild() if the child list has changed (added / removed images) before re-layout.
 *
 * Events:
 * - Dispatches a 'layout' EventTarget event after each successful layout pass.
 *
 * LightBox (optional):
 * - If enableLightbox = true, a LightBox instance is created.
 * - rebuild() keeps the LightBox image list in sync.
 *
 * Performance considerations:
 * - Image natural sizes are cached per layout invocation; repeated refresh() without DOM changes is cheap.
 * - Debounce on resize prevents excessive reflow churn.
 * - Absolute positioning avoids nested flex/grid overhead for large image counts.
 *
 * Accessibility & semantics:
 * - Original <img>/<picture> elements remain; only their sizing & positioning styles are modified.
 * - Consumers may add alt text / figure wrappers as needed (only direct children are collected).
 *
 * Styling expectations:
 * - Container width is fluid (100% is set). Ensure it is allowed to size via parent layout rules.
 * - Gaps are implemented as pixel offsets between absolutely positioned elements (no CSS gap property).
 *
 * Error handling:
 * - Throws if no container is supplied or if a child item lacks an <img>.
 * - If an image cannot resolve natural size, falls back to minimal (1x1) to keep layout stable.
 *
 * Debug mode:
 * - Set debug: true to emit detailed console diagnostics about sizing, rows, and final distribution.
 *
 * Example usage:
 * ```ts
 * const wall = new ImageWall(document.querySelector('.gallery')!, {
 *   rowHeight: 200,
 *   gap: 8,
 *   lastRowAlign: 'center',
 *   enableLightbox: true,
 *   debounceMs: 150,
 *   debug: false,
 * });
 *
 * wall.addEventListener('layout', () => {
 *   console.log('Image wall laid out.');
 * });
 *
 * // Later: if you dynamically append/remove images
 * wall.rebuild();
 * // Or if only sizes changed (e.g. fonts/padding altered container width)
 * wall.refresh();
 * ```
 *
 * Configuration options (ImageWallOptions - all optional; defaults shown):
 * - rowHeight: number (default 180) Target height for rows before stretch justification.
 * - gap: number (default 6) Horizontal & vertical pixel gap between items.
 * - lastRowAlign: 'left' | 'center' | 'right' | 'justify' (default 'center') Alignment strategy for incomplete final row.
 * - enableLightbox: boolean (default true) Whether to instantiate a LightBox helper (if available).
 * - debounceMs: number (default 120) Resize debounce interval in ms.
 * - debug: boolean (default false) Console diagnostics switch.
 *
 * Public API:
 * - constructor(container: HTMLElement, options?: ImageWallOptions)
 * - refresh(): Re-run layout using the current cached list of images.
 * - rebuild(): Re-scan direct children for images, update internal list & (optionally) LightBox, then layout.
 *
 * Internal methods (not for external use):
 * - layout(): Orchestrates the full measurement & positioning pass (async due to image size resolution).
 * - loadImageNaturalSize(): Resolves an image's intrinsic dimensions (with fallback & error resilience).
 *
 * @fires Event#layout Dispatched after each completed layout pass.
 * @public
 */
export class ImageWall extends EventTarget {
    public lightbox: LightBox | null = null;
    private container: HTMLElement;
    private images: HTMLElement[] = [];
    private opts: Required<ImageWallOptions>;
    private resizeTimer: number | null = null;

    constructor(container: HTMLElement, options: ImageWallOptions = {}) {
        super();
        if (!container) throw new Error('ImageWall: container is required');
        this.container = container;
        this.images = Array.from(this.container.querySelectorAll(':scope > picture, :scope > img')) as HTMLElement[];
        this.opts = {
            rowHeight: options.rowHeight ?? 180,
            gap: options.gap ?? 6,
            lastRowAlign: options.lastRowAlign ?? 'center',
            enableLightbox: options.enableLightbox ?? true,
            debounceMs: options.debounceMs ?? 120,
            debug: options.debug ?? false,
        };

        // container base styles for absolute layout
        this.container.style.position = this.container.style.position || 'relative';
        this.container.style.width = '100%';

        // Initial layout
        this.layout();
        this.container.classList.add('image-wall-initialized');

        // Debounced resize
        window.addEventListener('resize', () => {
            if (this.resizeTimer) window.clearTimeout(this.resizeTimer);
            this.resizeTimer = window.setTimeout(() => {
                this.layout();
                this.resizeTimer = null;
            }, this.opts.debounceMs);
        });

        // LightBox on click
        if (this.opts.enableLightbox)
            this.lightbox = new LightBox({ container: this.container, images: this.images, debug: this.opts.debug });
    }

    /** Public: recompute layout (useful if DOM changed) */
    public refresh() {
        this.layout();
    }

    /** Public: re-collect images and recompute layout (useful if children changed) */
    public rebuild() {
        this.images = Array.from(this.container.querySelectorAll(':scope > picture, :scope > img')) as HTMLElement[];
        this.layout();
        if (this.opts.enableLightbox && this.lightbox) {
            this.lightbox.images = this.images;
        }
    }

    /** Core: compute & apply layout */
    private async layout() {
        // collect only direct children (avoid duplicates)
        if (!this.images.length) {
            this.container.style.height = '0px';
            return;
        }

        // gather natural sizes
        type ImgInfo = { el: HTMLElement; aspect: number; naturalW: number; naturalH: number; src: string };
        const infos: ImgInfo[] = await Promise.all(this.images.map(async (el) => {
            const imgEl = el.tagName.toLowerCase() === 'img'
                ? (el as HTMLImageElement)
                : (el.querySelector('img') as HTMLImageElement | null);

            if (!imgEl) throw new Error('ImageWall: each item must contain an <img>');

            const { width: naturalW, height: naturalH } = await this.loadImageNaturalSize(imgEl);
            const aspect = (naturalW && naturalH) ? (naturalW / naturalH) : 1;
            return { el, aspect, naturalW, naturalH, src: imgEl.currentSrc || imgEl.src || '' };
        }));

        // container inner width (account for padding)
        const rect = this.container.getBoundingClientRect();
        const cs = getComputedStyle(this.container);
        const padLeft = parseFloat(cs.paddingLeft) || 0;
        const padRight = parseFloat(cs.paddingRight) || 0;
        const containerInner = Math.max(1, Math.floor(rect.width - padLeft - padRight));

        if (this.opts.debug) {
            console.debug('[ImageWall] containerInner:', containerInner);
            console.debug('[ImageWall] items:', infos.map(i => ({ src: i.src, aspect: +i.aspect.toFixed(3) })));
        }

        const gap = this.opts.gap;
        const targetH = this.opts.rowHeight;

        // FIRST PASS: greedily build rows (mark stretch true for full rows)
        type RowTemp = { items: ImgInfo[]; floatWidths: number[]; rowHFloat: number; stretch: boolean };
        const rowsTemp: RowTemp[] = [];

        let cursor: ImgInfo[] = [];
        let aspectSum = 0;

        for (const info of infos) {
            cursor.push(info);
            aspectSum += info.aspect;

            const expectedW = aspectSum * targetH + gap * (cursor.length - 1);

            if (expectedW >= containerInner) {
                // full row -> compute exact row height and mark stretch true
                const rowH = (containerInner - gap * (cursor.length - 1)) / aspectSum;
                const floatWidths = cursor.map(it => it.aspect * rowH);
                rowsTemp.push({ items: cursor.slice(), floatWidths, rowHFloat: rowH, stretch: true });
                cursor = [];
                aspectSum = 0;
            }
            // else keep adding
        }

        // LAST ROW handling based on opts.lastRowAlign
        if (cursor.length) {
            const align = this.opts.lastRowAlign; // 'left'|'center'|'justify'|'right'
            if (align === 'justify') {
                const aspectSumLast = cursor.reduce((s, it) => s + it.aspect, 0);
                const rowH = (containerInner - gap * (cursor.length - 1)) / aspectSumLast;
                const floatWidths = cursor.map(i => i.aspect * rowH);
                rowsTemp.push({ items: cursor.slice(), floatWidths, rowHFloat: rowH, stretch: true });
            } else {
                // not stretched: use targetH and mark stretch=false
                const floatWidths = cursor.map(i => i.aspect * targetH);
                rowsTemp.push({ items: cursor.slice(), floatWidths, rowHFloat: targetH, stretch: false });
            }
        }

        if (this.opts.debug) {
            console.debug('[ImageWall] rowsTemp:', rowsTemp.map((r, idx) => ({ idx, count: r.items.length, stretch: r.stretch, rowH: Math.round(r.rowHFloat) })));
        }

        // SECOND PASS: convert float widths -> integer widths
        type PositionedRow = { items: ImgInfo[]; widths: number[]; height: number; stretch: boolean };
        const positionedRows: PositionedRow[] = [];

        for (const row of rowsTemp) {
            const n = row.items.length;
            const totalGap = gap * Math.max(0, n - 1);

            if (row.stretch) {
                // distribute to exactly fill containerInner - totalGap
                const targetInner = containerInner - totalGap;
                const floors = row.floatWidths.map(w => Math.floor(w));
                const fractions = row.floatWidths.map((w, i) => ({ idx: i, frac: w - floors[i] }));
                let sumFloors = floors.reduce((s, v) => s + v, 0);
                let remaining = targetInner - sumFloors;

                // if negative (rare), reduce floors conservatively
                if (remaining < 0) {
                    let toRemove = -remaining;
                    for (let i = floors.length - 1; i >= 0 && toRemove > 0; i--) {
                        const dec = Math.min(Math.max(0, floors[i] - 1), toRemove);
                        if (dec > 0) { floors[i] -= dec; toRemove -= dec; }
                    }
                    sumFloors = floors.reduce((s, v) => s + v, 0);
                    remaining = Math.max(0, targetInner - sumFloors);
                }

                fractions.sort((a, b) => b.frac - a.frac);
                const add = new Array(n).fill(0);
                for (let k = 0; k < remaining; k++) add[fractions[k % n].idx]++;

                const finalWidths = floors.map((f, i) => f + add[i]);
                const finalSum = finalWidths.reduce((s, v) => s + v, 0);
                if (finalSum !== targetInner) {
                    finalWidths[finalWidths.length - 1] += (targetInner - finalSum);
                }

                const intRowH = Math.max(1, Math.round(row.rowHFloat));
                positionedRows.push({ items: row.items, widths: finalWidths, height: intRowH, stretch: true });

            } else {
                // non-stretched row: simply round widths (do NOT force fill)
                const rounded = row.floatWidths.map(w => Math.max(1, Math.round(w)));
                const intRowH = Math.max(1, Math.round(row.rowHFloat));
                positionedRows.push({ items: row.items, widths: rounded, height: intRowH, stretch: false });
            }
        }

        // Defensive final check: ensure last row flagged not stretched if it doesn't fill
        if (this.opts.lastRowAlign !== 'justify' && positionedRows.length > 0) {
            const last = positionedRows[positionedRows.length - 1];
            const n = last.widths.length;
            const totalGap = gap * Math.max(0, n - 1);
            const rowInnerWidth = last.widths.reduce((s, w) => s + w, 0) + totalGap;
            if (rowInnerWidth < containerInner) last.stretch = false;
            else last.stretch = true;
            if (this.opts.debug) console.debug('[ImageWall] post-check last rowInnerWidth:', rowInnerWidth, 'containerInner:', containerInner, 'stretch:', last.stretch);
        }

        // APPLY pass: write styles in one batch
        this.images.forEach(el => {
            el.style.position = ''; el.style.left = ''; el.style.top = ''; el.style.width = ''; el.style.height = ''; el.style.margin = '';
            const img = el.tagName.toLowerCase() === 'img' ? (el as HTMLImageElement) : (el.querySelector('img') as HTMLImageElement | null);
            if (img) { img.style.display = 'block'; img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'cover'; }
        });

        // position rows; handle alignment for non-stretched rows based on this.opts.lastRowAlign
        let y = 0;
        for (const prow of positionedRows) {
            const n = prow.widths.length;
            const totalGaps = gap * Math.max(0, n - 1);
            const totalWidths = prow.widths.reduce((s, v) => s + v, 0);
            const rowInnerWidth = totalWidths + totalGaps;

            let x = 0;
            if (!prow.stretch && rowInnerWidth < containerInner) {
                // choose alignment: left/center/right
                const align = this.opts.lastRowAlign; // 'left'|'center'|'justify'|'right'
                if (align === 'center') {
                    x = Math.round((containerInner - rowInnerWidth) / 2);
                } else if (align === 'right') {
                    x = Math.max(0, containerInner - rowInnerWidth);
                } else {
                    // left or unknown -> left-align
                    x = 0;
                }
            } else {
                // stretched rows: keep x = 0
                x = 0;
            }

            for (let i = 0; i < prow.items.length; i++) {
                const info = prow.items[i];
                const w = prow.widths[i];
                const h = prow.height;
                const el = info.el;

                el.style.position = 'absolute';
                el.style.left = `${x}px`;
                el.style.top = `${y}px`;
                el.style.width = `${w}px`;
                el.style.height = `${h}px`;
                el.style.margin = '0';

                x += w + gap;
            }

            y += prow.height + gap;
        }

        this.container.style.height = `${Math.max(0, y - gap)}px`;

        // emit event after layout
        this.dispatchEvent(new Event('layout'));
        if (this.opts.debug) console.debug('[ImageWall] layout complete, total height:', this.container.style.height);
    }




    /** Helper: get natural size of an image; resolves immediately if already loaded */
    private loadImageNaturalSize(imgEl: HTMLImageElement): Promise<{ width: number; height: number }> {
        return new Promise((resolve, reject) => {
            if (!imgEl.src) {
                // treat as tiny fallback
                resolve({ width: 1, height: 1 });
                return;
            }
            if (imgEl.complete && imgEl.naturalWidth) {
                resolve({ width: imgEl.naturalWidth, height: imgEl.naturalHeight });
                return;
            }
            const tmp = new Image();
            tmp.onload = () => resolve({ width: tmp.naturalWidth, height: tmp.naturalHeight });
            tmp.onerror = () => {
                // fallback to element sizes if available
                const w = imgEl.naturalWidth || (imgEl.width || 1);
                const h = imgEl.naturalHeight || (imgEl.height || 1);
                if (w && h) resolve({ width: w, height: h });
                else reject(new Error('ImageWall: failed to load image ' + imgEl.src));
            };
            tmp.src = imgEl.currentSrc || imgEl.src;
        });
    }
}
