// EDSA Booking System — calendar modal, slot availability, confirmation redirect

const EDSA_NATIVE_FETCH = (() => {
    const native = window.__nativeFetch;
    return native ? native.bind(window) : fetch.bind(window);
})();

class EDSABookingSystem {
    static modalReady = false;

    constructor() {
        this.apiBaseUrl = this.getApiBaseUrl();
        this.availableSlots = [];
        this.selectedDate = null;
        this.selectedTime = null;
        this._listenersBound = false;
        this._displayYear = null;
        this._displayMonth = null;
        this.businessHours = {
            start: '10:00',
            end: '17:00',
            days: [1, 2, 3, 4, 5],
            slotDuration: 60
        };
        this.init();
    }

    hmHerbsApiOrigin() {
        if (typeof window.hmHerbsStorefrontApiBase === 'function') {
            return window.hmHerbsStorefrontApiBase();
        }
        const explicit = String(window.HMHERBS_API_ORIGIN || '').trim().replace(/\/+$/, '');
        if (explicit) return explicit;
        if (window.location.protocol === 'file:') return 'http://127.0.0.1:3001';
        const h = window.location.hostname;
        if ((h === 'localhost' || h === '127.0.0.1') && window.location.port && window.location.port !== '3001') {
            return 'http://127.0.0.1:3001';
        }
        if (window.location.protocol.startsWith('http')) {
            return window.location.origin;
        }
        return '';
    }

    getApiBaseUrl() {
        const origin = this.hmHerbsApiOrigin();
        return origin ? `${origin}/api/edsa` : '/api/edsa';
    }

    formatLocalDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    init() {
        this.setupModal();
        this.fixFormAttributes();
        this.ensureEventListeners();
        this.loadBusinessHours();
    }

    setupModal() {
        if (document.getElementById('edsa-booking-modal')) {
            EDSABookingSystem.modalReady = true;
            return;
        }

        const prevIcon =
            '<svg class="edsa-calendar-nav-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>';
        const nextIcon =
            '<svg class="edsa-calendar-nav-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>';

        const modalHTML = `
            <div id="edsa-booking-modal" class="edsa-modal" aria-hidden="true" role="dialog" aria-labelledby="edsa-modal-title">
                <div class="edsa-modal-overlay"></div>
                <div class="edsa-modal-content">
                    <div class="edsa-modal-header">
                        <h2 id="edsa-modal-title">Book Your EDSA Session</h2>
                        <button type="button" class="edsa-modal-close" aria-label="Close booking modal">
                            <svg class="cart-close-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z"/></svg>
                        </button>
                    </div>
                    <div class="edsa-modal-body">
                        <div id="edsa-form-message" class="edsa-form-message" role="alert" hidden></div>
                        <div class="edsa-booking-container">
                            <div class="edsa-calendar-section">
                                <div class="edsa-calendar-header">
                                    <button type="button" class="edsa-calendar-nav" id="prev-month" aria-label="Previous month">${prevIcon}</button>
                                    <h3 id="calendar-month-year"></h3>
                                    <button type="button" class="edsa-calendar-nav" id="next-month" aria-label="Next month">${nextIcon}</button>
                                </div>
                                <div class="edsa-calendar-grid" id="calendar-grid"></div>
                                <div class="edsa-time-slots" id="time-slots"></div>
                            </div>
                            <div class="edsa-form-section">
                                <form id="edsa-booking-form" novalidate>
                                    <div class="form-group">
                                        <label for="edsa-first-name">First Name *</label>
                                        <input type="text" id="edsa-first-name" name="firstName" required autocomplete="given-name">
                                    </div>
                                    <div class="form-group">
                                        <label for="edsa-last-name">Last Name *</label>
                                        <input type="text" id="edsa-last-name" name="lastName" required autocomplete="family-name">
                                    </div>
                                    <div class="form-group">
                                        <label for="edsa-email">Email *</label>
                                        <input type="email" id="edsa-email" name="email" required autocomplete="email">
                                    </div>
                                    <div class="form-group">
                                        <label for="edsa-phone">Phone *</label>
                                        <input type="tel" id="edsa-phone" name="phone" required autocomplete="tel"
                                            placeholder="(601) 398-5600" maxlength="14" inputmode="numeric">
                                    </div>
                                    <div class="form-group">
                                        <label for="edsa-notes">Additional Notes</label>
                                        <textarea id="edsa-notes" name="notes" rows="2" autocomplete="off"></textarea>
                                    </div>
                                    <div class="form-actions">
                                        <button type="button" class="btn btn-secondary" id="edsa-cancel-btn">Cancel</button>
                                        <button type="submit" class="btn btn-primary" id="edsa-submit-btn">Book Appointment</button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        EDSABookingSystem.modalReady = true;
    }

    fixFormAttributes() {
        const form = document.getElementById('edsa-booking-form');
        if (!form) return;
        form.removeAttribute('method');
        form.removeAttribute('action');
        form.setAttribute('novalidate', '');
    }

    ensureEventListeners() {
        if (this._listenersBound) return;

        const modal = document.getElementById('edsa-booking-modal');
        if (!modal) return;

        const closeBtn = modal.querySelector('.edsa-modal-close');
        const overlay = modal.querySelector('.edsa-modal-overlay');
        const cancelBtn = document.getElementById('edsa-cancel-btn');
        const form = document.getElementById('edsa-booking-form');
        const prevMonth = document.getElementById('prev-month');
        const nextMonth = document.getElementById('next-month');
        const bookBtn = document.getElementById('edsa-book-btn');

        [closeBtn, overlay, cancelBtn].forEach((el) => {
            if (el) el.addEventListener('click', () => this.closeModal());
        });

        if (prevMonth) prevMonth.addEventListener('click', () => this.navigateMonth(-1));
        if (nextMonth) nextMonth.addEventListener('click', () => this.navigateMonth(1));

        if (bookBtn) {
            bookBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.openModal();
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('show')) {
                this.closeModal();
            }
        });

        this._listenersBound = true;
    }

    lockPageScroll() {
        document.documentElement.classList.add('edsa-modal-open');
        document.body.classList.add('edsa-modal-open');
    }

    unlockPageScroll() {
        document.documentElement.classList.remove('edsa-modal-open');
        document.body.classList.remove('edsa-modal-open');
    }

    showFormMessage(message, type = 'error') {
        const box = document.getElementById('edsa-form-message');
        if (box) {
            box.hidden = false;
            box.className = `edsa-form-message edsa-form-message-${type}`;
            box.textContent = message;
        }
        if (typeof window.showEdsToast === 'function') {
            window.showEdsToast(message, type);
        }
    }

    clearFormMessage() {
        const box = document.getElementById('edsa-form-message');
        if (box) {
            box.hidden = true;
            box.textContent = '';
        }
    }

    async loadBusinessHours() {
        if (window.location.protocol === 'file:') return;

        try {
            const nativeFetch = window.__nativeFetch || window.fetch;
            const response = await nativeFetch(`${this.apiBaseUrl}/hours`).catch(() => null);
            if (response && response.ok) {
                const data = await response.json();
                if (data.hours) {
                    this.businessHours = { ...this.businessHours, ...data.hours };
                }
            }
        } catch {
            /* use defaults */
        }
    }

    async loadAvailableSlots(date) {
        const dateStr = this.formatLocalDate(date);

        if (window.location.protocol === 'file:') {
            this.availableSlots = this.generateTimeSlots(date);
            return;
        }

        const url = `${this.apiBaseUrl}/available-slots?date=${encodeURIComponent(dateStr)}&_=${Date.now()}`;

        try {
            const nativeFetch = window.__nativeFetch || window.fetch;
            const response = await nativeFetch(url, {
                cache: 'no-store',
                headers: { Accept: 'application/json' }
            });

            if (response.ok) {
                const data = await response.json();
                this.availableSlots = data.slots || [];
            } else {
                this.availableSlots = this.generateTimeSlots(date);
            }
        } catch (error) {
            if (window.location.protocol !== 'file:') {
                console.warn('Could not load available slots:', error);
            }
            this.availableSlots = this.generateTimeSlots(date);
        }
    }

    generateTimeSlots(date) {
        const slots = [];
        const dayOfWeek = date.getDay();

        if (!this.businessHours.days.includes(dayOfWeek)) {
            return [];
        }

        const [startHour, startMin] = this.businessHours.start.split(':').map(Number);
        const [endHour, endMin] = this.businessHours.end.split(':').map(Number);
        const duration = this.businessHours.slotDuration;

        let currentHour = startHour;
        let currentMin = startMin;

        while (currentHour < endHour || (currentHour === endHour && currentMin < endMin)) {
            const timeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;
            slots.push({ time: timeStr, available: true });
            currentMin += duration;
            if (currentMin >= 60) {
                currentMin = 0;
                currentHour++;
            }
        }

        return slots;
    }

    renderCalendar(year, month) {
        const calendarGrid = document.getElementById('calendar-grid');
        const monthYear = document.getElementById('calendar-month-year');
        if (!calendarGrid || !monthYear) return;

        this._displayYear = year;
        this._displayMonth = month;

        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        monthYear.textContent = `${monthNames[month]} ${year}`;

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        calendarGrid.innerHTML = '';

        ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((day) => {
            const header = document.createElement('div');
            header.className = 'calendar-day-header';
            header.textContent = day;
            calendarGrid.appendChild(header);
        });

        for (let i = 0; i < firstDay; i++) {
            const empty = document.createElement('div');
            empty.className = 'calendar-day empty';
            calendarGrid.appendChild(empty);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dayCell = document.createElement('div');
            dayCell.className = 'calendar-day';
            dayCell.textContent = String(day);

            const cellDate = new Date(year, month, day);
            cellDate.setHours(0, 0, 0, 0);

            if (cellDate < today) {
                dayCell.classList.add('disabled');
            } else {
                dayCell.addEventListener('click', () => this.selectDate(cellDate));
                if (cellDate.getTime() === today.getTime()) {
                    dayCell.classList.add('today');
                }
            }

            if (this.selectedDate && cellDate.getTime() === this.selectedDate.getTime()) {
                dayCell.classList.add('selected');
            }

            calendarGrid.appendChild(dayCell);
        }
    }

    async selectDate(date) {
        this.selectedDate = new Date(date);
        this.selectedTime = null;
        this.clearFormMessage();

        this.renderCalendar(this.selectedDate.getFullYear(), this.selectedDate.getMonth());
        await this.loadAvailableSlots(this.selectedDate);
        this.renderTimeSlots();
    }

    renderTimeSlots() {
        const timeSlotsContainer = document.getElementById('time-slots');
        if (!timeSlotsContainer) return;

        if (!this.selectedDate) {
            timeSlotsContainer.innerHTML = '<p class="no-date-selected">Please select a date first</p>';
            return;
        }

        if (this.availableSlots.length === 0) {
            timeSlotsContainer.innerHTML = '<p class="no-slots">No time slots for this date</p>';
            return;
        }

        timeSlotsContainer.innerHTML = '<h4>Available Times</h4><div class="time-slots-grid"></div>';
        const grid = timeSlotsContainer.querySelector('.time-slots-grid');

        this.availableSlots.forEach((slot) => {
            const slotBtn = document.createElement('button');
            slotBtn.type = 'button';
            slotBtn.className = 'time-slot-btn';
            slotBtn.textContent = this.formatTime(slot.time);
            slotBtn.disabled = !slot.available;

            if (!slot.available) {
                slotBtn.classList.add('unavailable');
            } else {
                slotBtn.addEventListener('click', () => this.selectTime(slot.time));
            }

            if (this.selectedTime === slot.time) {
                slotBtn.classList.add('selected');
            }

            grid.appendChild(slotBtn);
        });
    }

    selectTime(time) {
        this.selectedTime = time;
        this.clearFormMessage();
        this.renderTimeSlots();
    }

    formatTime(timeStr) {
        const [hours, minutes] = timeStr.split(':');
        const hour = parseInt(hours, 10);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${displayHour}:${minutes} ${ampm}`;
    }

    navigateMonth(direction) {
        let year = this._displayYear;
        let month = this._displayMonth;
        if (year == null || month == null) {
            const now = new Date();
            year = now.getFullYear();
            month = now.getMonth();
        }
        const d = new Date(year, month + direction, 1);
        this.renderCalendar(d.getFullYear(), d.getMonth());
    }

    confirmationPageOrigin() {
        const apiOrigin = this.hmHerbsApiOrigin();
        const pageOrigin = window.location.origin;
        if (apiOrigin && apiOrigin !== pageOrigin) {
            return apiOrigin;
        }
        return pageOrigin || apiOrigin || '';
    }

    buildConfirmationUrl({ bookingId, email, preferredDate, preferredTime, firstName, lastName }) {
        const params = new URLSearchParams();
        if (bookingId != null && bookingId !== '') params.set('booking', String(bookingId));
        if (email) params.set('email', String(email).trim());
        if (preferredDate) params.set('date', preferredDate);
        if (preferredTime) params.set('time', preferredTime);
        if (firstName) params.set('firstName', firstName);
        if (lastName) params.set('lastName', lastName);

        const origin = this.confirmationPageOrigin() || window.location.origin;
        const base = origin.endsWith('/') ? origin : `${origin}/`;
        return `${base}edsa-confirmation.html?${params.toString()}`;
    }

    redirectToConfirmation(details) {
        const href = this.buildConfirmationUrl(details);
        this._redirecting = true;

        const modal = document.getElementById('edsa-booking-modal');
        if (modal) {
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
        }
        this.unlockPageScroll();

        window.location.replace(href);
        setTimeout(() => {
            if (!/\/edsa-confirmation\.html/i.test(window.location.pathname)) {
                window.location.href = href;
            }
        }, 150);
    }

    async handleFormSubmit(e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.clearFormMessage();

        const form =
            (e.target && e.target.id === 'edsa-booking-form' ? e.target : null) ||
            (e.currentTarget && e.currentTarget.id === 'edsa-booking-form' ? e.currentTarget : null) ||
            document.getElementById('edsa-booking-form');
        if (!form) return;

        if (window.location.protocol === 'file:') {
            this.showFormMessage(
                'Booking requires the web server. Start the backend, then open http://localhost:3001/index.html',
                'warning'
            );
            return;
        }

        if (!this.selectedDate || !this.selectedTime) {
            this.showFormMessage('Please select a date and time for your appointment.', 'warning');
            return;
        }

        const formData = new FormData(form);
        const phoneRaw = String(formData.get('phone') || '').trim();
        if (!window.HMHERBS_PHONE_US || !HMHERBS_PHONE_US.isValidDisplay(phoneRaw, false)) {
            this.showFormMessage('Please enter a valid phone in the format (601) 398-5600.', 'warning');
            return;
        }

        const bookingData = {
            firstName: formData.get('firstName'),
            lastName: formData.get('lastName'),
            email: formData.get('email'),
            phone: formData.get('phone'),
            preferredDate: this.formatLocalDate(this.selectedDate),
            preferredTime: this.selectedTime,
            notes: formData.get('notes') || ''
        };

        const submitBtn = document.getElementById('edsa-submit-btn');
        if (!submitBtn) return;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Booking...';

        try {
            const response = await EDSA_NATIVE_FETCH(`${this.apiBaseUrl}/book`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookingData)
            });

            let result = {};
            try {
                result = await response.json();
            } catch {
                result = {};
            }

            const booked =
                response.status === 201 ||
                (response.ok && (result.bookingId != null || result.message));

            if (booked) {
                this._redirecting = true;
                this.redirectToConfirmation({
                    bookingId: result.bookingId,
                    email: bookingData.email,
                    preferredDate: result.preferredDate || bookingData.preferredDate,
                    preferredTime: result.preferredTime || bookingData.preferredTime,
                    firstName: bookingData.firstName,
                    lastName: bookingData.lastName
                });
                return;
            }

            const msg = result.error || 'Failed to book appointment. Please try again.';
            this.showFormMessage(msg, response.status === 409 ? 'warning' : 'error');
        } catch (error) {
            console.error('Booking error:', error);
            this.showFormMessage('An error occurred while booking. Please try again.', 'error');
        } finally {
            if (!this._redirecting) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Book Appointment';
            }
        }
    }

    openModal() {
        const modal = document.getElementById('edsa-booking-modal');
        if (!modal) return;

        this.fixFormAttributes();
        this.ensureEventListeners();
        this.clearFormMessage();
        this.lockPageScroll();

        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');

        const now = new Date();
        this.selectedDate = null;
        this.selectedTime = null;
        this.availableSlots = [];
        this.renderCalendar(now.getFullYear(), now.getMonth());

        const timeSlotsContainer = document.getElementById('time-slots');
        if (timeSlotsContainer) {
            timeSlotsContainer.innerHTML = '<p class="no-date-selected">Please select a date first</p>';
        }
    }

    closeModal() {
        const modal = document.getElementById('edsa-booking-modal');
        if (!modal) return;

        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
        this.unlockPageScroll();

        const form = document.getElementById('edsa-booking-form');
        if (form) form.reset();

        this.selectedDate = null;
        this.selectedTime = null;
        this.clearFormMessage();
    }
}

let edsaBookingSystem;

function openEDSABooking(e) {
    if (e && typeof e.preventDefault === 'function') {
        e.preventDefault();
    }
    if (!edsaBookingSystem) {
        edsaBookingSystem = new EDSABookingSystem();
    }
    edsaBookingSystem.openModal();
}

function handleEdsBookingFormSubmit(e) {
    const form = e.target;
    if (!form || form.id !== 'edsa-booking-form') return;

    e.preventDefault();
    e.stopImmediatePropagation();

    if (!edsaBookingSystem) {
        edsaBookingSystem = new EDSABookingSystem();
    }
    edsaBookingSystem.handleFormSubmit(e);
}

function initEdsBooking() {
    if (!edsaBookingSystem) {
        edsaBookingSystem = new EDSABookingSystem();
    }
}

if (!window.__edsaBookingSubmitCaptureBound) {
    window.__edsaBookingSubmitCaptureBound = true;
    document.addEventListener('submit', handleEdsBookingFormSubmit, true);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEdsBooking);
} else {
    initEdsBooking();
}

window.openEDSABooking = openEDSABooking;
