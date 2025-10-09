/**
 * Configuration object for initializing the LightBox component.
 *
 * Use this to specify the root container where the lightbox UI will be mounted,
 * the set of image (or picture) wrapper elements that supply source and caption
 * metadata via data attributes, and optional debugging behavior.
 *
 * Image elements (or their wrapper elements) are expected to expose:
 * - data-src: The high‑resolution image source (required)
 * - data-caption: Optional caption/description text
 *
 * Accessibility considerations:
 * - Ensure each image wrapper has meaningful alt text on its contained <img>
 * - Captions (data-caption) are surfaced to assistive technologies when present
 *
 * @property container The DOM element into which the lightbox overlay structure and dynamic elements will be injected. Must be a stable element present at initialization time.
 * @property images An ordered collection of HTMLElement wrappers (e.g. <img>, <picture>, or a custom figure) that declare data-src (and optionally data-caption). Their order defines navigation sequence.
 * @property debug When true, enables verbose console logging and may render development aids (e.g. focus outlines). Defaults to false when omitted.
 *
 * @remarks
 * The interface does not manage event binding or mutation observation; callers
 * should provide a static snapshot of images or reinitialize if the set changes.
 *
 * @public
 */
export interface LightboxOptions {
    container: HTMLElement;
    images?: HTMLElement[]; // wrappers (picture or img) that have data-src and optional data-caption
    debug?: boolean;
}

/**
 * Full–screen modal lightbox component with cross–fading images, keyboard & touch
 * navigation, caption support, preloading of the next image, and robust race‑condition
 * handling for rapid navigation.
 *
 * Core ideas:
 * - Maintains two stacked <img> "layers" and crossfades between them (CSS drives the
 *   transition; this class only toggles a .visible class).
 * - Uses a monotonically increasing `loadId` to discard stale image load events when
 *   the user advances quickly.
 * - Delegated click handling on a gallery container; each child "wrapper" element
 *   must expose `data-src` (required) and optionally `data-caption`.
 * - Keyboard: ArrowLeft / ArrowRight to navigate, Escape to close.
 * - Pointer: Clicking left half = previous, right half = next; clicking backdrop closes.
 * - Touch: Horizontal swipe = previous / next, vertical swipe (up or down) = close.
 * - Preloads the next image (wraps around) after each successful load.
 *
 * Expected markup contract for each gallery item (wrapper element):
 *   <picture data-src="large.jpg" data-caption="Optional caption"> ... </picture>
 * or:
 *   <img data-src="large.jpg" data-caption="Optional caption" ...>
 *
 * Required CSS hooks (example):
 *   .lightbox-modal            (positioned overlay, hidden by default)
 *   .lightbox-modal.open       (visible state)
 *   .lightbox-inner
 *   .lightbox-img              (absolutely stacked images)
 *   .lightbox-img.visible      (opacity:1; default state opacity:0 with transition)
 *   .lightbox-caption.visible
 *   .lightbox-prev / .lightbox-next / .lightbox-close
 *
 * Construction flow:
 * 1. Builds its own modal DOM subtree and appends to document.body.
 * 2. Binds all interaction listeners (click, keyboard, touch).
 * 3. If an explicit images list is not supplied, auto-selects direct child
 *    <picture> or <img> elements of `options.container`.
 *
 * Performance notes:
 * - Only two <img> elements are ever in the DOM; their `src` attributes are swapped.
 * - Setting `next.src = ''` before reuse helps avoid brief flashes of stale content
 *   in certain browsers.
 * - Preloading uses a throwaway `Image` instance; no lifecycle management required.
 *
 * Error handling:
 * - On `onerror`, the currently visible image remains; the failed candidate is ignored.
 * - Missing `data-src` logs a warning in debug mode and aborts navigation.
 *
 * Thread-safety / concurrency:
 * - Not thread-safe; assumes single-threaded browser environment.
 *
 * LightboxOptions (inferred):
 * @typedef LightboxOptions
 * @property {HTMLElement} container Root gallery container whose children are clickable items.
 * @property {HTMLElement[]=} images Optional explicit ordered list of clickable wrapper elements.
 * @property {boolean=} debug Enable verbose console logging for diagnostics.
 *
 * Example usage:
 * ```ts
 * import { LightBox } from './lightbox';
 *
 * const galleryEl = document.querySelector('.my-gallery') as HTMLElement;
 *
 * const lightbox = new LightBox({
 *   container: galleryEl,
 *   debug: true
 * });
 *
 * // Programmatically open the 3rd image
 * lightbox.show(2);
 *
 * // Close later
 * lightbox.hide();
 * ```
 *
 * Lifecycle summary:
 * - show(index): Opens modal if not already open, initiates layered image swap.
 * - hide(): Closes modal, cancels pending loads (by bumping loadId) and clears visibility classes.
 * - next()/prev(): Convenience navigation with wrap-around.
 *
 * @class LightBox
 *
 * @constructor
 * @param {LightboxOptions} options Configuration object.
 * @param {HTMLElement} options.container Gallery container whose direct child <picture>/<img>
 *   elements (or provided `images`) are treated as slides.
 * @param {HTMLElement[]=} options.images Optional explicit sequence of wrapper elements. If omitted,
 *   discovered via `:scope > picture, :scope > img`.
 * @param {boolean=} options.debug If true, emits console debug / warning logs.
 *
 * @method show
 * @param {number} index Zero-based index into the gallery. Out-of-range indices are ignored.
 * @description Displays the specified slide, crossfading from the currently visible layer.
 * Attaches transient load handlers and preloads the subsequent image after a successful load.
 *
 * @method hide
 * @description Closes the modal lightbox, removes visibility classes, and invalidates any
 * in-flight image loads by incrementing the internal `loadId`.
 *
 * @method next
 * @description Advances to the next slide (wrap-around to index 0).
 *
 * @method prev
 * @description Moves to the previous slide (wrap-around to the final index).
 *
 * @remarks
 * This class assumes accompanying CSS for layout, transitions, and visibility toggling.
 * For custom transition timing, adjust the CSS of `.lightbox-img` and `.lightbox-img.visible`.
 *
 * @public
 */
export class LightBox {
    private container: HTMLElement;
    public images: HTMLElement[];
    private debug: boolean;

    private modal: HTMLDivElement;
    private inner: HTMLDivElement;
    private imgEls: [HTMLImageElement, HTMLImageElement];
    private captionEl: HTMLDivElement;
    private prevBtn: HTMLButtonElement;
    private nextBtn: HTMLButtonElement;
    private closeBtn: HTMLButtonElement;

    private currentIndex = 0;
    private activeLayer = 0; // 0 or 1
    private loadId = 0;

    // For touch tracking
    private touchStartX = 0;
    private touchStartY = 0;
    private touchEndX = 0;
    private touchEndY = 0;

    constructor(options: LightboxOptions) {
        this.container = options.container;
        this.images = options.images ?? [];
        if (!this.images || this.images.length === 0) {
            this.images = Array.from(this.container.querySelectorAll(':scope > picture, :scope > img')) as HTMLElement[];
        }
        this.debug = !!options.debug;

        // Build DOM
        this.modal = document.createElement('div');
        this.modal.className = 'lightbox-modal';

        this.inner = document.createElement('div');
        this.inner.className = 'lightbox-inner';

        const imgA = document.createElement('img');
        const imgB = document.createElement('img');
        imgA.className = 'lightbox-img';
        imgB.className = 'lightbox-img';
        // ensure no visible class initially
        imgA.classList.remove('visible');
        imgB.classList.remove('visible');

        this.imgEls = [imgA, imgB];

        this.captionEl = document.createElement('div');
        this.captionEl.className = 'lightbox-caption';

        this.prevBtn = document.createElement('button');
        this.prevBtn.type = 'button';
        this.prevBtn.className = 'lightbox-prev';

        this.nextBtn = document.createElement('button');
        this.nextBtn.type = 'button';
        this.nextBtn.className = 'lightbox-next';

        this.closeBtn = document.createElement('button');
        this.closeBtn.type = 'button';
        this.closeBtn.className = 'lightbox-close';

        // Append in order: two image layers, caption, controls
        this.inner.appendChild(imgA);
        this.inner.appendChild(imgB);
        this.inner.appendChild(this.captionEl);
        this.inner.appendChild(this.prevBtn);
        this.inner.appendChild(this.nextBtn);
        this.inner.appendChild(this.closeBtn);
        this.modal.appendChild(this.inner);
        document.body.appendChild(this.modal);

        // Event listeners
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.hide();
        });
        this.prevBtn.addEventListener('click', () => this.prev());
        this.nextBtn.addEventListener('click', () => this.next());
        imgA.addEventListener('click', (e) => this.imageClickHandler(e));
        imgB.addEventListener('click', (e) => this.imageClickHandler(e));
        imgA.addEventListener('contextmenu', (e) => e.preventDefault()); // disable right-click
        imgB.addEventListener('contextmenu', (e) => e.preventDefault());
        this.closeBtn.addEventListener('click', () => this.hide());

        // 🧭 Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (!this.modal.classList.contains('open')) return;
            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    this.prev();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.next();
                    break;
                case 'Escape':
                    e.preventDefault();
                    this.hide();
                    break;
            }
        });

        // 🤏 Touch gesture support
        this.modal.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            this.touchStartX = e.touches[0].clientX;
            this.touchStartY = e.touches[0].clientY;
        });
        this.modal.addEventListener('touchend', (e) => {
            if (e.changedTouches.length !== 1) return;
            this.touchEndX = e.changedTouches[0].clientX;
            this.touchEndY = e.changedTouches[0].clientY;
            this.handleSwipe();
        });

        // Delegated click on gallery container — use wrapper's data-src / data-caption
        this.container.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const clickedItem = this.images.find((el) => el === target || el.contains(target));
            if (!clickedItem) return;
            const idx = this.images.indexOf(clickedItem);
            if (idx >= 0) this.show(idx);
        });
    }

    /** Swipe detection helper */
    private handleSwipe() {
        const dx = this.touchEndX - this.touchStartX;
        const dy = this.touchEndY - this.touchStartY;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        if (Math.max(absX, absY) < 40) return; // threshold
        if (absX > absY) {
            // horizontal swipe
            if (dx > 0) this.prev();
            else this.next();
        } else {
            // vertical swipe (up/down) closes
            this.hide();
        }
    }

    private imageClickHandler = (e: MouseEvent) => {
        // if clicked on left half of image, call previous, else next
        const img = e.currentTarget as HTMLImageElement;
        const rect = img.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        if (clickX < rect.width / 2) {
            this.prev();
        } else {
            this.next();
        }
    }

    /** Show index with crossfade between two layers. */
    public show(index: number) {
        if (index < 0 || index >= this.images.length) return;
        this.currentIndex = index;

        const wrapper = this.images[index];
        const dataSrc = wrapper.dataset.src;
        const caption = wrapper.dataset.caption ?? '';

        if (!dataSrc) {
            if (this.debug) console.warn('LightBox: clicked element missing data-src', wrapper);
            return;
        }

        // Make modal visible via class
        this.modal.classList.add('open');

        const curr = this.imgEls[this.activeLayer];
        const next = this.imgEls[1 - this.activeLayer];

        if (this.debug) {
            console.debug(`LightBox: show index ${index}, src=${dataSrc}, caption="${caption}"`);
        }

        // Cancel stale loads
        const thisLoad = ++this.loadId;

        // Ensure next has no prior handlers and is not visible
        next.onload = null;
        next.onerror = null;
        next.classList.remove('visible');
        // Clear src to avoid accidental previous-image paint in some browsers
        next.src = '';

        // Install load handler (only acts for the active loadId)
        next.onload = () => {
            if (thisLoad !== this.loadId) return; // stale
            // Reveal next and hide current (CSS transition handles crossfade)
            next.classList.add('visible');
            curr.classList.remove('visible');

            if (this.debug) {
                console.debug(`LightBox: image loaded successfully`, next);
            }

            // Swap active layer
            this.activeLayer = 1 - this.activeLayer;

            // Caption
            if (caption) {
                this.captionEl.textContent = caption;
                this.captionEl.classList.add('visible');
            } else {
                this.captionEl.textContent = '';
                this.captionEl.classList.remove('visible');
            }

            // ✅ Preload the next image in the background
            const nextIndex = (this.currentIndex + 1) % this.images.length;
            const preloadWrapper = this.images[nextIndex];
            const preloadSrc = preloadWrapper.dataset.src;
            if (preloadSrc) {
                const img = new Image();
                img.src = preloadSrc;
                if (this.debug) console.debug(`LightBox: preloading next image ${nextIndex} (${preloadSrc})`);
            }
        };

        next.onerror = () => {
            if (this.debug) console.warn('LightBox: failed to load', dataSrc);
            // Do not change layers on error — keep previous visible image.
        };

        // Start loading AFTER handlers attached
        next.src = dataSrc;
    }

    public hide() {
        // Use class-based hiding; do not set inline display style
        this.modal.classList.remove('open');
        // Optionally hide caption and imgs immediately
        this.captionEl.classList.remove('visible');
        this.imgEls.forEach(img => img.classList.remove('visible'));
        // increment loadId to cancel any pending loads
        this.loadId++;
    }

    public next() {
        this.show((this.currentIndex + 1) % this.images.length);
    }

    public prev() {
        this.show((this.currentIndex - 1 + this.images.length) % this.images.length);
    }
}
