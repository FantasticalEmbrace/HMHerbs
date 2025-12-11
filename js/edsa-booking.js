// EDSA Booking System with Google Calendar Integration
// Handles calendar display, booking form, and Google Calendar sync

class EDSABookingSystem {
    constructor() {
        this.apiBaseUrl = this.getApiBaseUrl();
        this.googleCalendarId = null; // Will be set from backend config
        this.availableSlots = [];
        this.selectedDate = null;
        this.selectedTime = null;
        this.businessHours = {
            start: '10:00',
            end: '18:00',
            days: [1, 2, 3, 4, 5], // Monday to Friday
            slotDuration: 60 // minutes
        };
        this.init();
    }

    getApiBaseUrl() {
        // Check if we're using file:// protocol (opened directly)
        if (window.location.protocol === 'file:') {
            // Silently use defaults - no console warnings needed for file:// protocol
            // Return API URL for when server is running
            return 'http://localhost:3001/api/edsa';
        }
        
        // Check if we're in development (localhost)
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            // If served from backend server, use relative path
            if (window.location.port === '3001') {
                return '/api/edsa';
            }
            return 'http://localhost:3001/api/edsa';
        }

        // For production, use the same origin with /api/edsa path
        return `${window.location.origin}/api/edsa`;
    }

    init() {
        this.setupModal();
        this.loadBusinessHours();
    }

    setupModal() {
        // Create modal HTML
        const modalHTML = `
            <div id="edsa-booking-modal" class="edsa-modal" aria-hidden="true" role="dialog" aria-labelledby="edsa-modal-title">
                <div class="edsa-modal-overlay"></div>
                <div class="edsa-modal-content">
                    <div class="edsa-modal-header">
                        <h2 id="edsa-modal-title">Book Your EDSA Session</h2>
                        <button class="edsa-modal-close" aria-label="Close booking modal">
                            <i class="fas fa-times" aria-hidden="true"></i>
                        </button>
                    </div>
                    <div class="edsa-modal-body">
                        <div class="edsa-booking-container">
                            <!-- Calendar Section -->
                            <div class="edsa-calendar-section">
                                <div class="edsa-calendar-header">
                                    <button class="edsa-calendar-nav" id="prev-month" aria-label="Previous month">
                                        <i class="fas fa-chevron-left" aria-hidden="true"></i>
                                    </button>
                                    <h3 id="calendar-month-year"></h3>
                                    <button class="edsa-calendar-nav" id="next-month" aria-label="Next month">
                                        <i class="fas fa-chevron-right" aria-hidden="true"></i>
                                    </button>
                                </div>
                                <div class="edsa-calendar-grid" id="calendar-grid"></div>
                                <div class="edsa-time-slots" id="time-slots"></div>
                            </div>
                            
                            <!-- Booking Form Section -->
                            <div class="edsa-form-section">
                                <form id="edsa-booking-form">
                                    <div class="form-group">
                                        <label for="edsa-first-name">First Name *</label>
                                        <input type="text" id="edsa-first-name" name="firstName" required>
                                    </div>
                                    <div class="form-group">
                                        <label for="edsa-last-name">Last Name *</label>
                                        <input type="text" id="edsa-last-name" name="lastName" required>
                                    </div>
                                    <div class="form-group">
                                        <label for="edsa-email">Email *</label>
                                        <input type="email" id="edsa-email" name="email" required>
                                    </div>
                                    <div class="form-group">
                                        <label for="edsa-phone">Phone *</label>
                                        <input type="tel" id="edsa-phone" name="phone" required>
                                    </div>
                                    <div class="form-group">
                                        <label for="edsa-notes">Additional Notes</label>
                                        <textarea id="edsa-notes" name="notes" rows="3"></textarea>
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
        
        // Insert modal into body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Setup event listeners
        this.setupEventListeners();
    }

    setupEventListeners() {
        const modal = document.getElementById('edsa-booking-modal');
        const closeBtn = modal.querySelector('.edsa-modal-close');
        const overlay = modal.querySelector('.edsa-modal-overlay');
        const cancelBtn = document.getElementById('edsa-cancel-btn');
        const form = document.getElementById('edsa-booking-form');
        const prevMonth = document.getElementById('prev-month');
        const nextMonth = document.getElementById('next-month');

        // Close modal
        [closeBtn, overlay, cancelBtn].forEach(el => {
            if (el) {
                el.addEventListener('click', () => this.closeModal());
            }
        });

        // Form submission
        if (form) {
            form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }

        // Calendar navigation
        if (prevMonth) {
            prevMonth.addEventListener('click', () => this.navigateMonth(-1));
        }
        if (nextMonth) {
            nextMonth.addEventListener('click', () => this.navigateMonth(1));
        }

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('show')) {
                this.closeModal();
            }
        });
    }

    async loadBusinessHours() {
        // Skip API call if using file:// protocol
        if (window.location.protocol === 'file:') {
            // Silently use defaults - warning already shown in getApiBaseUrl()
            return;
        }

        try {
            // Load business hours from backend (if available)
            const response = await fetch(`${this.apiBaseUrl}/hours`);
            if (response.ok) {
                const data = await response.json();
                if (data.hours) {
                    this.businessHours = { ...this.businessHours, ...data.hours };
                }
            }
        } catch (error) {
            // Silently fail and use defaults - this is expected if backend isn't running
            if (window.location.protocol !== 'file:') {
                console.warn('Could not load business hours, using defaults');
            }
        }
    }

    async loadAvailableSlots(date) {
        const dateStr = date.toISOString().split('T')[0];
        
        // Skip API call if using file:// protocol
        if (window.location.protocol === 'file:') {
            // Generate slots locally using business hours
            this.availableSlots = this.generateTimeSlots(date);
            return;
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/available-slots?date=${dateStr}`);
            
            if (response.ok) {
                const data = await response.json();
                this.availableSlots = data.slots || [];
            } else {
                // Generate default slots if API not available
                this.availableSlots = this.generateTimeSlots(date);
            }
        } catch (error) {
            // Silently generate defaults - this is expected if backend isn't running
            if (window.location.protocol !== 'file:') {
                console.warn('Could not load available slots, generating defaults');
            }
            this.availableSlots = this.generateTimeSlots(date);
        }
    }

    generateTimeSlots(date) {
        const slots = [];
        const dayOfWeek = date.getDay();
        
        // Check if day is in business days
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
            slots.push({
                time: timeStr,
                available: true
            });

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

        const date = new Date(year, month, 1);
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        
        monthYear.textContent = `${monthNames[month]} ${year}`;

        // Get first day of month and number of days
        const firstDay = date.getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Clear previous calendar
        calendarGrid.innerHTML = '';

        // Add day headers
        const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayHeaders.forEach(day => {
            const header = document.createElement('div');
            header.className = 'calendar-day-header';
            header.textContent = day;
            calendarGrid.appendChild(header);
        });

        // Add empty cells for days before month starts
        for (let i = 0; i < firstDay; i++) {
            const empty = document.createElement('div');
            empty.className = 'calendar-day empty';
            calendarGrid.appendChild(empty);
        }

        // Add days of month
        for (let day = 1; day <= daysInMonth; day++) {
            const dayCell = document.createElement('div');
            dayCell.className = 'calendar-day';
            dayCell.textContent = day;
            
            const cellDate = new Date(year, month, day);
            cellDate.setHours(0, 0, 0, 0);

            // Disable past dates
            if (cellDate < today) {
                dayCell.classList.add('disabled');
            } else {
                dayCell.addEventListener('click', () => this.selectDate(cellDate));
                
                // Highlight today
                if (cellDate.getTime() === today.getTime()) {
                    dayCell.classList.add('today');
                }
            }

            // Highlight selected date
            if (this.selectedDate && 
                cellDate.getTime() === this.selectedDate.getTime()) {
                dayCell.classList.add('selected');
            }

            calendarGrid.appendChild(dayCell);
        }
    }

    async selectDate(date) {
        this.selectedDate = new Date(date);
        this.selectedTime = null;
        
        // Update calendar display
        this.renderCalendar(this.selectedDate.getFullYear(), this.selectedDate.getMonth());
        
        // Load and display time slots
        await this.loadAvailableSlots(date);
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
            timeSlotsContainer.innerHTML = '<p class="no-slots">No available time slots for this date</p>';
            return;
        }

        timeSlotsContainer.innerHTML = '<h4>Available Times</h4><div class="time-slots-grid"></div>';
        const grid = timeSlotsContainer.querySelector('.time-slots-grid');

        this.availableSlots.forEach(slot => {
            const slotBtn = document.createElement('button');
            slotBtn.className = 'time-slot-btn';
            slotBtn.textContent = this.formatTime(slot.time);
            slotBtn.disabled = !slot.available;
            
            if (slot.available) {
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
        this.renderTimeSlots();
    }

    formatTime(timeStr) {
        const [hours, minutes] = timeStr.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${displayHour}:${minutes} ${ampm}`;
    }

    navigateMonth(direction) {
        if (!this.selectedDate) {
            this.selectedDate = new Date();
        }
        
        this.selectedDate.setMonth(this.selectedDate.getMonth() + direction);
        this.renderCalendar(this.selectedDate.getFullYear(), this.selectedDate.getMonth());
    }

    async handleFormSubmit(e) {
        e.preventDefault();
        
        // Check if using file:// protocol
        if (window.location.protocol === 'file:') {
            alert('⚠️ Booking requires a web server.\n\nPlease start the backend server:\ncd backend && npm start\n\nThen access: http://localhost:3001/index.html');
            return;
        }
        
        if (!this.selectedDate || !this.selectedTime) {
            alert('Please select a date and time for your appointment.');
            return;
        }

        const formData = new FormData(e.target);
        const bookingData = {
            firstName: formData.get('firstName'),
            lastName: formData.get('lastName'),
            email: formData.get('email'),
            phone: formData.get('phone'),
            preferredDate: this.selectedDate.toISOString().split('T')[0],
            preferredTime: this.selectedTime,
            notes: formData.get('notes') || ''
        };

        const submitBtn = document.getElementById('edsa-submit-btn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Booking...';

        try {
            const response = await fetch(`${this.apiBaseUrl}/book`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(bookingData)
            });

            const result = await response.json();

            if (response.ok) {
                // Create Google Calendar event
                await this.createGoogleCalendarEvent(bookingData);
                
                // Show success message
                this.showSuccessMessage(result);
                this.closeModal();
            } else {
                alert(result.error || 'Failed to book appointment. Please try again.');
            }
        } catch (error) {
            console.error('Booking error:', error);
            alert('An error occurred while booking your appointment. Please try again.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Book Appointment';
        }
    }

    async createGoogleCalendarEvent(bookingData) {
        try {
            // Create Google Calendar event link
            const startDateTime = new Date(`${bookingData.preferredDate}T${bookingData.preferredTime}`);
            const endDateTime = new Date(startDateTime);
            endDateTime.setMinutes(endDateTime.getMinutes() + this.businessHours.slotDuration);

            const eventDetails = {
                title: `EDSA Session - ${bookingData.firstName} ${bookingData.lastName}`,
                description: `EDSA Appointment\n\nContact: ${bookingData.email}\nPhone: ${bookingData.phone}\n\nNotes: ${bookingData.notes || 'None'}`,
                start: startDateTime.toISOString(),
                end: endDateTime.toISOString(),
                location: '1140 Battlefield Pkwy, Fort Oglethorpe, GA 30742'
            };

            // Create Google Calendar URL
            const googleCalendarUrl = this.buildGoogleCalendarUrl(eventDetails);
            
            // Open in new window (or send to backend to create via API)
            window.open(googleCalendarUrl, '_blank');
            
            // Alternatively, send to backend to create via Google Calendar API
            await fetch(`${this.apiBaseUrl}/create-calendar-event`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    bookingId: bookingData.bookingId,
                    eventDetails
                })
            });
        } catch (error) {
            console.warn('Could not create Google Calendar event:', error);
        }
    }

    buildGoogleCalendarUrl(eventDetails) {
        const params = new URLSearchParams({
            action: 'TEMPLATE',
            text: eventDetails.title,
            dates: `${this.formatGoogleDate(eventDetails.start)}/${this.formatGoogleDate(eventDetails.end)}`,
            details: eventDetails.description,
            location: eventDetails.location
        });
        
        return `https://calendar.google.com/calendar/render?${params.toString()}`;
    }

    formatGoogleDate(dateString) {
        const date = new Date(dateString);
        return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    }

    showSuccessMessage(result) {
        const message = `Your EDSA appointment has been booked successfully!\n\nDate: ${this.formatDate(this.selectedDate)}\nTime: ${this.formatTime(this.selectedTime)}\n\nA confirmation email will be sent to ${result.email || 'your email'}.`;
        
        if (window.hmHerbsApp) {
            window.hmHerbsApp.showNotification('Appointment booked successfully!', 'success');
        } else {
            alert(message);
        }
    }

    formatDate(date) {
        return date.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    }

    openModal() {
        const modal = document.getElementById('edsa-booking-modal');
        if (modal) {
            modal.classList.add('show');
            modal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            
            // Initialize calendar with current month
            const now = new Date();
            this.selectedDate = null;
            this.renderCalendar(now.getFullYear(), now.getMonth());
        }
    }

    closeModal() {
        const modal = document.getElementById('edsa-booking-modal');
        if (modal) {
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
            
            // Reset form
            const form = document.getElementById('edsa-booking-form');
            if (form) {
                form.reset();
            }
            this.selectedDate = null;
            this.selectedTime = null;
        }
    }
}

// Initialize EDSA booking system
let edsaBookingSystem;

// Update the openEDSABooking function
function openEDSABooking() {
    if (!edsaBookingSystem) {
        edsaBookingSystem = new EDSABookingSystem();
    }
    edsaBookingSystem.openModal();
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (!edsaBookingSystem) {
            edsaBookingSystem = new EDSABookingSystem();
        }
    });
} else {
    if (!edsaBookingSystem) {
        edsaBookingSystem = new EDSABookingSystem();
    }
}

