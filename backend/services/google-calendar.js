// Google Calendar API Integration Service
// Handles automatic event creation in HM Herbs' Google Calendar

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class GoogleCalendarService {
    constructor() {
        this.calendar = null;
        this.calendarId = null;
        this.initialized = false;
        this.init();
    }

    async init() {
        try {
            // Load configuration from environment or config file
            this.calendarId = process.env.GOOGLE_CALENDAR_ID || 
                             process.env.HMHERBS_CALENDAR_ID ||
                             null;

            // Check if Google Calendar API is configured
            const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH || 
                                   path.join(__dirname, '../config/google-credentials.json');
            
            if (!fs.existsSync(credentialsPath)) {
                console.warn('Google Calendar credentials not found. Calendar integration disabled.');
                console.warn('To enable: Place google-credentials.json in backend/config/');
                return;
            }

            // Load credentials
            const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
            
            // Initialize OAuth2 client
            const auth = new google.auth.GoogleAuth({
                credentials: credentials,
                scopes: ['https://www.googleapis.com/auth/calendar']
            });

            // Create calendar client
            this.calendar = google.calendar({ version: 'v3', auth });
            this.initialized = true;

            console.log('Google Calendar service initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Google Calendar service:', error.message);
            console.warn('Calendar integration will be disabled. Bookings will still be saved to database.');
        }
    }

    /**
     * Create an event in HM Herbs' Google Calendar
     * @param {Object} bookingData - Booking information
     * @returns {Promise<Object>} Created event or null if failed
     */
    async createEvent(bookingData) {
        if (!this.initialized || !this.calendar) {
            console.warn('Google Calendar not initialized. Skipping event creation.');
            return null;
        }

        try {
            const {
                firstName,
                lastName,
                email,
                phone,
                preferredDate,
                preferredTime,
                notes,
                bookingId
            } = bookingData;

            // Parse date and time
            const startDateTime = new Date(`${preferredDate}T${preferredTime}`);
            const endDateTime = new Date(startDateTime);
            endDateTime.setHours(endDateTime.getHours() + 1); // 1 hour session

            // Format for Google Calendar API
            const event = {
                summary: `EDSA Session - ${firstName} ${lastName}`,
                description: this.buildEventDescription({
                    firstName,
                    lastName,
                    email,
                    phone,
                    notes,
                    bookingId
                }),
                start: {
                    dateTime: startDateTime.toISOString(),
                    timeZone: 'America/New_York', // Adjust to your timezone
                },
                end: {
                    dateTime: endDateTime.toISOString(),
                    timeZone: 'America/New_York',
                },
                location: '1140 Battlefield Pkwy, Fort Oglethorpe, GA 30742',
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: 24 * 60 }, // 24 hours before
                        { method: 'popup', minutes: 60 }, // 1 hour before
                    ],
                },
                attendees: [
                    { email: email, displayName: `${firstName} ${lastName}` },
                    // Add HM Herbs email if needed
                    // { email: 'hmherbs1@gmail.com' }
                ],
                colorId: '10', // Green color for appointments
            };

            // Create the event
            const response = await this.calendar.events.insert({
                calendarId: this.calendarId || 'primary',
                resource: event,
                sendUpdates: 'all', // Send email notifications to attendees
            });

            console.log('Google Calendar event created:', response.data.id);
            
            return {
                eventId: response.data.id,
                htmlLink: response.data.htmlLink,
                hangoutLink: response.data.hangoutLink,
            };
        } catch (error) {
            console.error('Error creating Google Calendar event:', error.message);
            // Don't throw - allow booking to succeed even if calendar sync fails
            return null;
        }
    }

    /**
     * Update an existing calendar event
     * @param {String} eventId - Google Calendar event ID
     * @param {Object} bookingData - Updated booking information
     */
    async updateEvent(eventId, bookingData) {
        if (!this.initialized || !this.calendar || !eventId) {
            return null;
        }

        try {
            const {
                firstName,
                lastName,
                email,
                phone,
                preferredDate,
                preferredTime,
                notes
            } = bookingData;

            const startDateTime = new Date(`${preferredDate}T${preferredTime}`);
            const endDateTime = new Date(startDateTime);
            endDateTime.setHours(endDateTime.getHours() + 1);

            const event = {
                summary: `EDSA Session - ${firstName} ${lastName}`,
                description: this.buildEventDescription({
                    firstName,
                    lastName,
                    email,
                    phone,
                    notes
                }),
                start: {
                    dateTime: startDateTime.toISOString(),
                    timeZone: 'America/New_York',
                },
                end: {
                    dateTime: endDateTime.toISOString(),
                    timeZone: 'America/New_York',
                },
            };

            const response = await this.calendar.events.update({
                calendarId: this.calendarId || 'primary',
                eventId: eventId,
                resource: event,
                sendUpdates: 'all',
            });

            return response.data;
        } catch (error) {
            console.error('Error updating Google Calendar event:', error.message);
            return null;
        }
    }

    /**
     * Delete a calendar event
     * @param {String} eventId - Google Calendar event ID
     */
    async deleteEvent(eventId) {
        if (!this.initialized || !this.calendar || !eventId) {
            return false;
        }

        try {
            await this.calendar.events.delete({
                calendarId: this.calendarId || 'primary',
                eventId: eventId,
                sendUpdates: 'all',
            });
            return true;
        } catch (error) {
            console.error('Error deleting Google Calendar event:', error.message);
            return false;
        }
    }

    /**
     * Get available time slots for a date (check calendar for conflicts)
     * @param {Date} date - Date to check
     * @returns {Promise<Array>} Array of available time slots
     */
    async getAvailableSlots(date) {
        if (!this.initialized || !this.calendar) {
            // Return default slots if calendar not available
            return this.generateDefaultSlots();
        }

        try {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);

            // Get existing events for the day
            const response = await this.calendar.events.list({
                calendarId: this.calendarId || 'primary',
                timeMin: startOfDay.toISOString(),
                timeMax: endOfDay.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
            });

            const existingEvents = response.data.items || [];
            const bookedSlots = existingEvents.map(event => {
                const start = new Date(event.start.dateTime || event.start.date);
                return start.toTimeString().slice(0, 5); // HH:MM format
            });

            // Generate all possible slots
            const allSlots = this.generateDefaultSlots();
            
            // Mark slots as unavailable if they conflict
            return allSlots.map(slot => ({
                time: slot.time,
                available: !bookedSlots.includes(slot.time)
            }));
        } catch (error) {
            console.error('Error fetching available slots:', error.message);
            return this.generateDefaultSlots();
        }
    }

    /**
     * Generate default time slots (10am-6pm, hourly)
     */
    generateDefaultSlots() {
        const slots = [];
        for (let hour = 10; hour < 18; hour++) {
            slots.push({
                time: `${String(hour).padStart(2, '0')}:00`,
                available: true
            });
        }
        return slots;
    }

    /**
     * Build event description text
     */
    buildEventDescription({ firstName, lastName, email, phone, notes, bookingId }) {
        let description = `EDSA (Electro Dermal Stress Analysis) Appointment\n\n`;
        description += `Client: ${firstName} ${lastName}\n`;
        description += `Email: ${email}\n`;
        description += `Phone: ${phone}\n`;
        
        if (bookingId) {
            description += `Booking ID: ${bookingId}\n`;
        }
        
        if (notes) {
            description += `\nNotes: ${notes}\n`;
        }
        
        description += `\n---\n`;
        description += `This appointment was automatically created from the HM Herbs website booking system.`;
        
        return description;
    }

    /**
     * Check if service is available
     */
    isAvailable() {
        return this.initialized && this.calendar !== null;
    }
}

// Export singleton instance
module.exports = new GoogleCalendarService();

