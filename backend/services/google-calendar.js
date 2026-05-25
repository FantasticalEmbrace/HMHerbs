const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const GoogleCalendarOAuthService = require('./google-calendar-oauth');

class GoogleCalendarService {
    constructor() {
        this.calendar = null;
        this.calendarId = 'primary';
        this.initialized = false;
        this.authMode = null;
        this._initPool = null;
    }

    resetClient() {
        this.calendar = null;
        this.calendarId = 'primary';
        this.initialized = false;
        this.authMode = null;
        this._initPool = null;
    }

    async _tryServiceAccount() {
        const credentialsPath =
            process.env.GOOGLE_CREDENTIALS_PATH ||
            path.join(__dirname, '../config/google-credentials.json');

        if (!fs.existsSync(credentialsPath)) {
            return false;
        }

        const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/calendar'],
        });

        this.calendar = google.calendar({ version: 'v3', auth });
        this.calendarId =
            process.env.GOOGLE_CALENDAR_ID || process.env.HMHERBS_CALENDAR_ID || 'primary';
        this.initialized = true;
        this.authMode = 'service_account';
        logger.info('[integration][google-calendar] Initialized via service account file');
        return true;
    }

    async ensureInitialized(pool) {
        if (this.initialized && this._initPool === pool) {
            return this.initialized;
        }

        this.resetClient();

        if (pool && (await GoogleCalendarOAuthService.isConfigured(pool))) {
            try {
                const { auth, calendarId } = await GoogleCalendarOAuthService.getAuthenticatedClient(
                    pool,
                    null
                );
                this.calendar = google.calendar({ version: 'v3', auth });
                this.calendarId = calendarId;
                this.initialized = true;
                this.authMode = 'oauth';
                this._initPool = pool;
                logger.info('[integration][google-calendar] Initialized via OAuth', {
                    calendarId: this.calendarId,
                });
                return true;
            } catch (err) {
                logger.warn('[integration][google-calendar] OAuth init failed', {
                    error: err.message,
                });
            }
        }

        return this._tryServiceAccount();
    }

    isAvailable() {
        return this.initialized && this.calendar !== null;
    }

    async createEvent(bookingData, pool) {
        if (pool) await this.ensureInitialized(pool);
        if (!this.isAvailable()) {
            logger.warn('[integration][google-calendar] Not initialized. Skipping event creation.');
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
                bookingId,
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
                    notes,
                    bookingId,
                }),
                start: {
                    dateTime: startDateTime.toISOString(),
                    timeZone: 'America/New_York',
                },
                end: {
                    dateTime: endDateTime.toISOString(),
                    timeZone: 'America/New_York',
                },
                location: '1493 Battlefield Pkwy, Fort Oglethorpe, GA 30742',
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: 24 * 60 },
                        { method: 'popup', minutes: 60 },
                    ],
                },
                attendees: [{ email, displayName: `${firstName} ${lastName}` }],
                colorId: '10',
            };

            const response = await this.calendar.events.insert({
                calendarId: this.calendarId,
                resource: event,
                sendUpdates: 'all',
            });

            logger.info('[integration][google-calendar] Event created', { eventId: response.data.id });

            return {
                eventId: response.data.id,
                htmlLink: response.data.htmlLink,
                hangoutLink: response.data.hangoutLink,
            };
        } catch (error) {
            logger.error('[integration][google-calendar] Create event error', { error: error.message });
            return null;
        }
    }

    async updateEvent(eventId, bookingData, pool) {
        if (pool) await this.ensureInitialized(pool);
        if (!this.isAvailable() || !eventId) return null;

        try {
            const { firstName, lastName, email, phone, preferredDate, preferredTime, notes } =
                bookingData;

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
                    notes,
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
                calendarId: this.calendarId,
                eventId,
                resource: event,
                sendUpdates: 'all',
            });

            return response.data;
        } catch (error) {
            logger.error('[integration][google-calendar] Update event error', { error: error.message });
            return null;
        }
    }

    async deleteEvent(eventId, pool) {
        if (pool) await this.ensureInitialized(pool);
        if (!this.isAvailable() || !eventId) return false;

        try {
            await this.calendar.events.delete({
                calendarId: this.calendarId,
                eventId,
                sendUpdates: 'all',
            });
            return true;
        } catch (error) {
            logger.error('[integration][google-calendar] Delete event error', { error: error.message });
            return false;
        }
    }

    async getAvailableSlots(date, pool) {
        if (pool) await this.ensureInitialized(pool);
        if (!this.isAvailable()) {
            return this.generateDefaultSlots();
        }

        try {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);

            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);

            const response = await this.calendar.events.list({
                calendarId: this.calendarId,
                timeMin: startOfDay.toISOString(),
                timeMax: endOfDay.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
            });

            const existingEvents = response.data.items || [];
            const bookedSlots = existingEvents.map((event) => {
                const start = new Date(event.start.dateTime || event.start.date);
                return start.toTimeString().slice(0, 5);
            });

            const allSlots = this.generateDefaultSlots();

            return allSlots.map((slot) => ({
                time: slot.time,
                available: !bookedSlots.includes(slot.time),
            }));
        } catch (error) {
            logger.error('[integration][google-calendar] Available slots error', {
                error: error.message,
            });
            return this.generateDefaultSlots();
        }
    }

    generateDefaultSlots() {
        const slots = [];
        for (let hour = 10; hour < 18; hour++) {
            slots.push({
                time: `${String(hour).padStart(2, '0')}:00`,
                available: true,
            });
        }
        return slots;
    }

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
        description += `Created automatically from the HM Herbs website booking system.`;

        return description;
    }
}

module.exports = new GoogleCalendarService();
