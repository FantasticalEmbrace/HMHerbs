// EDSA Image Handler
// Ensure EDSA image loads correctly with fallback paths

(function() {
    'use strict';
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureEDSALoads);
    } else {
        ensureEDSALoads();
    }

    function ensureEDSALoads() {
        const edsaImg = document.querySelector('.edsa-image img') || document.getElementById('edsa-main-image');
        if (!edsaImg) return;

        // Ensure the image is visible
        edsaImg.classList.add('loaded');
        edsaImg.style.opacity = '1';
        edsaImg.style.display = 'block';

        // Use proper event listeners instead of inline handlers
        edsaImg.addEventListener('load', function () {
            this.classList.add('loaded');
            this.style.opacity = '1';
        }, { once: true });

        edsaImg.addEventListener('error', function () {
            // Silently handle image load errors - don't log to avoid console noise
            const originalSrc = this.src || this.getAttribute('src') || 'images/edsa.jpg';
            const altPaths = [
                './images/edsa.jpg',
                'images/edsa.jpg',
                '/images/edsa.jpg'
            ];

            let pathIndex = 0;
            const tryNextPath = () => {
                if (pathIndex < altPaths.length) {
                    const testImg = new Image();
                    testImg.addEventListener('load', () => {
                        edsaImg.src = altPaths[pathIndex];
                        edsaImg.classList.add('loaded');
                        edsaImg.style.opacity = '1';
                    }, { once: true });
                    testImg.addEventListener('error', () => {
                        pathIndex++;
                        tryNextPath();
                    }, { once: true });
                    testImg.src = altPaths[pathIndex];
                }
            };
            tryNextPath();
        }, { once: true });

        // If image hasn't loaded yet, force it
        if (!edsaImg.complete || edsaImg.naturalWidth === 0) {
            const originalSrc = edsaImg.src || edsaImg.getAttribute('src') || 'images/edsa.jpg';
            const img = new Image();
            img.addEventListener('load', function () {
                edsaImg.src = originalSrc;
                edsaImg.classList.add('loaded');
                edsaImg.style.opacity = '1';
            }, { once: true });
            img.addEventListener('error', function () {
                // Silently handle - error listener above will handle fallback
            }, { once: true });
            img.src = originalSrc;
        }
    }

    // Attach event listener for EDSA booking button (wait for edsa-booking.js to load)
    function attachEDSABookingListener() {
        const edsaBookBtn = document.getElementById('edsa-book-btn');
        if (edsaBookBtn && typeof openEDSABooking === 'function') {
            edsaBookBtn.addEventListener('click', function (e) {
                e.preventDefault();
                openEDSABooking();
            });
        } else if (edsaBookBtn) {
            // Retry if function not loaded yet
            setTimeout(attachEDSABookingListener, 100);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachEDSABookingListener);
    } else {
        attachEDSABookingListener();
    }
})();

