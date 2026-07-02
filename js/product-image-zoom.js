/**
 * Product image lightbox with zoom / pan (Amazon-style) for product detail pages.
 */
(function () {
    'use strict';

    const ZOOM_MIN = 1;
    const ZOOM_MAX = 4;
    const ZOOM_STEP = 0.5;

    class ProductImageZoom {
        constructor(options = {}) {
            this.getImages = options.getImages || (() => []);
            this.resolveUrl = options.resolveUrl || ((url) => url);
            this.getActiveIndex = options.getActiveIndex || (() => 0);

            this.currentIndex = 0;
            this.scale = 1;
            this.translateX = 0;
            this.translateY = 0;
            this.isOpen = false;
            this.isDragging = false;
            this.dragStartX = 0;
            this.dragStartY = 0;
            this.dragOriginX = 0;
            this.dragOriginY = 0;
            this.pinchStartDistance = 0;
            this.pinchStartScale = 1;
            this.pointerMoved = false;
            this.boundMainImage = null;
            this.boundMainHandler = null;
            this.boundMainKeyHandler = null;

            this.buildModal();
            this.bindModalEvents();
        }

        buildModal() {
            const root = document.createElement('div');
            root.id = 'product-image-zoom-modal';
            root.className = 'product-image-zoom';
            root.hidden = true;
            root.setAttribute('role', 'dialog');
            root.setAttribute('aria-modal', 'true');
            root.setAttribute('aria-label', 'Product image viewer');
            root.innerHTML = [
                '<div class="product-image-zoom-backdrop" data-zoom-dismiss></div>',
                '<div class="product-image-zoom-dialog">',
                '  <button type="button" class="product-image-zoom-close modal-close" aria-label="Close image viewer"></button>',
                '  <button type="button" class="product-image-zoom-nav product-image-zoom-prev" aria-label="Previous image">',
                '    <i class="fas fa-chevron-left" aria-hidden="true"></i>',
                '  </button>',
                '  <button type="button" class="product-image-zoom-nav product-image-zoom-next" aria-label="Next image">',
                '    <i class="fas fa-chevron-right" aria-hidden="true"></i>',
                '  </button>',
                '  <div class="product-image-zoom-toolbar" role="toolbar" aria-label="Image zoom controls">',
                '    <button type="button" class="product-image-zoom-tool" data-zoom-action="out" aria-label="Zoom out">',
                '      <i class="fas fa-search-minus" aria-hidden="true"></i>',
                '    </button>',
                '    <span class="product-image-zoom-level" aria-live="polite">100%</span>',
                '    <button type="button" class="product-image-zoom-tool" data-zoom-action="in" aria-label="Zoom in">',
                '      <i class="fas fa-search-plus" aria-hidden="true"></i>',
                '    </button>',
                '    <button type="button" class="product-image-zoom-tool product-image-zoom-reset" data-zoom-action="reset" aria-label="Reset zoom">',
                '      Reset',
                '    </button>',
                '  </div>',
                '  <div class="product-image-zoom-stage">',
                '    <div class="product-image-zoom-canvas">',
                '      <img class="product-image-zoom-img" alt="" draggable="false">',
                '    </div>',
                '  </div>',
                '  <p class="product-image-zoom-hint">Pinch or scroll to zoom · Drag to pan when zoomed</p>',
                '</div>'
            ].join('');

            document.body.appendChild(root);

            this.root = root;
            this.stage = root.querySelector('.product-image-zoom-stage');
            this.canvas = root.querySelector('.product-image-zoom-canvas');
            this.img = root.querySelector('.product-image-zoom-img');
            this.levelEl = root.querySelector('.product-image-zoom-level');
            this.prevBtn = root.querySelector('.product-image-zoom-prev');
            this.nextBtn = root.querySelector('.product-image-zoom-next');
        }

        bindModalEvents() {
            this.root.querySelector('[data-zoom-dismiss]').addEventListener('click', () => this.close());
            this.root.querySelector('.product-image-zoom-close').addEventListener('click', () => this.close());

            this.root.querySelectorAll('[data-zoom-action]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const action = btn.getAttribute('data-zoom-action');
                    if (action === 'in') this.zoomBy(ZOOM_STEP);
                    if (action === 'out') this.zoomBy(-ZOOM_STEP);
                    if (action === 'reset') this.resetTransform();
                });
            });

            this.prevBtn.addEventListener('click', () => this.stepImage(-1));
            this.nextBtn.addEventListener('click', () => this.stepImage(1));

            document.addEventListener('keydown', (e) => {
                if (!this.isOpen) return;
                if (e.key === 'Escape') {
                    e.preventDefault();
                    this.close();
                } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    this.stepImage(-1);
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    this.stepImage(1);
                } else if (e.key === '+' || e.key === '=') {
                    e.preventDefault();
                    this.zoomBy(ZOOM_STEP);
                } else if (e.key === '-') {
                    e.preventDefault();
                    this.zoomBy(-ZOOM_STEP);
                }
            });

            this.stage.addEventListener('wheel', (e) => {
                if (!this.isOpen) return;
                e.preventDefault();
                const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
                this.zoomBy(delta, e.clientX, e.clientY);
            }, { passive: false });

            this.stage.addEventListener('pointerdown', (e) => this.onPointerDown(e));
            this.stage.addEventListener('pointermove', (e) => this.onPointerMove(e));
            this.stage.addEventListener('pointerup', (e) => this.onPointerUp(e));
            this.stage.addEventListener('pointercancel', (e) => this.onPointerUp(e));
            this.stage.addEventListener('pointerleave', (e) => this.onPointerUp(e));

            this.stage.addEventListener('click', (e) => {
                if (!this.isOpen || this.isDragging || this.pointerMoved) return;
                if (e.target.closest('.product-image-zoom-nav')) return;
                if (this.scale > 1) return;
                this.setScale(2, e.clientX, e.clientY);
            });

            this.img.addEventListener('dblclick', (e) => {
                e.preventDefault();
                if (this.scale > 1) {
                    this.resetTransform();
                } else {
                    this.setScale(2, e.clientX, e.clientY);
                }
            });

            this.img.addEventListener('load', () => this.resetTransform());
        }

        bindMainImage(mainImage) {
            if (!mainImage) return;

            if (this.boundMainImage && this.boundMainHandler) {
                this.boundMainImage.removeEventListener('click', this.boundMainHandler);
                this.boundMainImage.removeEventListener('keydown', this.boundMainKeyHandler);
            }

            this.boundMainImage = mainImage;
            mainImage.classList.add('product-image-zoomable');
            mainImage.setAttribute('role', 'button');
            mainImage.setAttribute('tabindex', '0');
            mainImage.setAttribute('aria-label', 'View larger product image');

            this.boundMainHandler = (e) => {
                if (!mainImage.src || mainImage.src.startsWith('data:image/svg')) return;
                e.preventDefault();
                this.open(this.getActiveIndex());
            };
            this.boundMainKeyHandler = (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                if (!mainImage.src || mainImage.src.startsWith('data:image/svg')) return;
                e.preventDefault();
                this.open(this.getActiveIndex());
            };

            mainImage.addEventListener('click', this.boundMainHandler);
            mainImage.addEventListener('keydown', this.boundMainKeyHandler);

            const wrap = mainImage.closest('.product-main-image');
            if (wrap && !wrap.querySelector('.product-image-zoom-hint-badge')) {
                const badge = document.createElement('span');
                badge.className = 'product-image-zoom-hint-badge';
                badge.setAttribute('aria-hidden', 'true');
                badge.innerHTML = '<i class="fas fa-search-plus"></i>';
                wrap.appendChild(badge);
            }
        }

        open(index = 0) {
            const images = this.getImages();
            if (!images.length) return;

            this.currentIndex = Math.max(0, Math.min(index, images.length - 1));
            this.isOpen = true;
            this.root.hidden = false;
            this.root.classList.add('is-open');
            document.body.classList.add('product-image-zoom-open');
            this.resetTransform();
            this.loadCurrentImage();
            this.updateNavButtons();
            this.root.querySelector('.product-image-zoom-close').focus();
        }

        close() {
            if (!this.isOpen) return;
            this.isOpen = false;
            this.root.hidden = true;
            this.root.classList.remove('is-open');
            document.body.classList.remove('product-image-zoom-open');
            this.resetTransform();
            if (this.boundMainImage) {
                this.boundMainImage.focus();
            }
        }

        stepImage(delta) {
            const images = this.getImages();
            if (images.length <= 1) return;
            this.currentIndex = (this.currentIndex + delta + images.length) % images.length;
            this.resetTransform();
            this.loadCurrentImage();
            this.updateNavButtons();
        }

        loadCurrentImage() {
            const images = this.getImages();
            const image = images[this.currentIndex];
            if (!image) return;
            const url = this.resolveUrl(image.image_url);
            this.img.src = url;
            this.img.alt = image.alt_text || 'Product image';
        }

        updateNavButtons() {
            const images = this.getImages();
            const multi = images.length > 1;
            this.prevBtn.hidden = !multi;
            this.nextBtn.hidden = !multi;
        }

        zoomBy(delta, clientX, clientY) {
            this.setScale(this.scale + delta, clientX, clientY);
        }

        setScale(nextScale, clientX, clientY) {
            const prevScale = this.scale;
            this.scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextScale));

            if (this.scale === 1) {
                this.translateX = 0;
                this.translateY = 0;
            } else if (typeof clientX === 'number' && typeof clientY === 'number' && this.stage) {
                const rect = this.stage.getBoundingClientRect();
                const offsetX = clientX - rect.left - rect.width / 2;
                const offsetY = clientY - rect.top - rect.height / 2;
                const ratio = this.scale / prevScale - 1;
                this.translateX -= offsetX * ratio;
                this.translateY -= offsetY * ratio;
            }

            this.clampTranslate();
            this.applyTransform();
        }

        resetTransform() {
            this.scale = 1;
            this.translateX = 0;
            this.translateY = 0;
            this.applyTransform();
        }

        applyTransform() {
            if (!this.canvas) return;
            const value = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
            this.canvas.style.setProperty('transform', value, 'important');
            this.canvas.style.setProperty('-webkit-transform', value, 'important');
            if (this.levelEl) {
                this.levelEl.textContent = `${Math.round(this.scale * 100)}%`;
            }
            this.stage.classList.toggle('is-zoomed', this.scale > 1);
        }

        clampTranslate() {
            if (!this.stage || this.scale <= 1) {
                this.translateX = 0;
                this.translateY = 0;
                return;
            }
            const rect = this.stage.getBoundingClientRect();
            const maxX = (rect.width * (this.scale - 1)) / 2 + 40;
            const maxY = (rect.height * (this.scale - 1)) / 2 + 40;
            this.translateX = Math.max(-maxX, Math.min(maxX, this.translateX));
            this.translateY = Math.max(-maxY, Math.min(maxY, this.translateY));
        }

        onPointerDown(e) {
            if (!this.isOpen) return;
            if (e.pointerType === 'touch' && e.isPrimary === false) return;

            this.stage.setPointerCapture(e.pointerId);
            this.activePointers = this.activePointers || new Map();
            this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            this.pointerMoved = false;
            this.pointerDownX = e.clientX;
            this.pointerDownY = e.clientY;

            if (this.activePointers.size === 2) {
                this.pinchStartDistance = this.getPointerDistance();
                this.pinchStartScale = this.scale;
                this.isDragging = false;
                return;
            }

            if (this.scale > 1) {
                this.isDragging = true;
                this.dragStartX = e.clientX;
                this.dragStartY = e.clientY;
                this.dragOriginX = this.translateX;
                this.dragOriginY = this.translateY;
                this.stage.classList.add('is-dragging');
            }
        }

        onPointerMove(e) {
            if (!this.isOpen || !this.activePointers) return;
            if (!this.activePointers.has(e.pointerId)) return;

            this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

            if (Math.hypot(e.clientX - this.pointerDownX, e.clientY - this.pointerDownY) > 6) {
                this.pointerMoved = true;
            }

            if (this.activePointers.size === 2) {
                const distance = this.getPointerDistance();
                if (this.pinchStartDistance > 0) {
                    const next = this.pinchStartScale * (distance / this.pinchStartDistance);
                    this.setScale(next);
                }
                return;
            }

            if (!this.isDragging || this.scale <= 1) return;
            e.preventDefault();
            this.translateX = this.dragOriginX + (e.clientX - this.dragStartX);
            this.translateY = this.dragOriginY + (e.clientY - this.dragStartY);
            this.clampTranslate();
            this.applyTransform();
        }

        onPointerUp(e) {
            if (!this.activePointers) return;
            this.activePointers.delete(e.pointerId);
            if (this.activePointers.size < 2) {
                this.pinchStartDistance = 0;
            }
            if (this.activePointers.size === 0) {
                this.isDragging = false;
                this.stage.classList.remove('is-dragging');
            }
            try {
                this.stage.releasePointerCapture(e.pointerId);
            } catch {
                // ignore
            }
        }

        getPointerDistance() {
            const points = Array.from(this.activePointers.values());
            if (points.length < 2) return 0;
            const dx = points[0].x - points[1].x;
            const dy = points[0].y - points[1].y;
            return Math.hypot(dx, dy);
        }
    }

    window.HMProductImageZoom = ProductImageZoom;
})();
