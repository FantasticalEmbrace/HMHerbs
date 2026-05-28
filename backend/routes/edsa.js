// EDSA (Electro Dermal Stress Analysis) Service Routes
const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const {
    edsaBookingValidation,
    edsaCustomerEmailValidation,
    edsaCustomerRescheduleValidation
} = require('../middleware/validation');
const googleCalendar = require('../services/google-calendar');
const { isUsPhoneDisplay } = require('../utils/usPhoneDisplay');
const {
    sendBookingReceivedEmail,
    sendBookingReceivedStoreEmail,
    sendAppointmentCancelledEmail,
    sendAppointmentCancelledStoreEmail,
    sendAppointmentRescheduledEmail,
    sendAppointmentRescheduledStoreEmail
} = require('../services/edsaAppointmentEmail');
const { isStoreDateTimeInFuture, normalizeDateYmd } = require('../utils/storeTimezone');

/** HH:MM times held by pending/confirmed website bookings (not Google Calendar alone). */
async function getActiveBookedTimesForDate(pool, dateStr, excludeBookingId = null) {
    const excludeId = Number(excludeBookingId);
    const hasExclude = Number.isFinite(excludeId) && excludeId > 0;
    const excludeSql = hasExclude ? ' AND id <> ?' : '';
    const params = hasExclude ? [dateStr, excludeId] : [dateStr];

    const [rows] = await pool.execute(
        `SELECT preferred_time AS slot_time
           FROM edsa_bookings
          WHERE preferred_date = ?
            AND status IN ('pending', 'confirmed')${excludeSql}`,
        params
    );
    const times = new Set();
    for (const row of rows) {
        if (row.slot_time) {
            times.add(String(row.slot_time).slice(0, 5));
        }
    }
    return times;
}

function formatBookingRow(booking) {
    const requestType = booking.customer_request_type || 'none';
    const canChange = ['pending', 'confirmed'].includes(booking.status);
    return {
        bookingId: booking.id,
        firstName: booking.first_name,
        lastName: booking.last_name,
        email: booking.email,
        phone: booking.phone,
        preferredDate: normalizeDateYmd(booking.preferred_date) || booking.preferred_date,
        preferredTime: String(booking.preferred_time || '').slice(0, 5),
        status: booking.status,
        notes: booking.notes,
        createdAt: booking.created_at,
        location: '1140 Battlefield Pkwy, Fort Oglethorpe, GA 30742',
        customerRequestType: requestType,
        customerRequestNotes: booking.customer_request_notes || null,
        requestedDate: booking.requested_date || null,
        requestedTime: booking.requested_time
            ? String(booking.requested_time).slice(0, 5)
            : null,
        customerRequestAt: booking.customer_request_at || null,
        canChange,
        hasPendingRequest: false,
    };
}

async function loadBookingForCustomer(pool, bookingId, email) {
    const id = Number(bookingId);
    const normalizedEmail = String(email || '')
        .trim()
        .toLowerCase();
    if (!Number.isFinite(id) || id < 1 || !normalizedEmail) {
        return null;
    }

    const [rows] = await pool.execute(
        `SELECT id, first_name, last_name, email, phone,
                preferred_date, preferred_time, status, notes, created_at,
                google_calendar_event_id,
                customer_request_type, customer_request_notes,
                requested_date, requested_time, customer_request_at
           FROM edsa_bookings WHERE id = ? LIMIT 1`,
        [id]
    );
    if (!rows.length) return null;
    const booking = rows[0];
    if (String(booking.email || '').trim().toLowerCase() !== normalizedEmail) {
        return null;
    }
    return booking;
}

async function loadBookingRowById(pool, bookingId) {
    const id = Number(bookingId);
    if (!Number.isFinite(id) || id < 1) return null;
    const [rows] = await pool.execute(
        `SELECT id, first_name, last_name, email, phone,
                preferred_date, preferred_time, status, notes, google_calendar_event_id
           FROM edsa_bookings WHERE id = ? LIMIT 1`,
        [id]
    );
    return rows.length ? rows[0] : null;
}

async function isSlotAvailable(pool, dateStr, timeHm, excludeBookingId = null) {
    const normalizedTime = String(timeHm).slice(0, 5);
    const dbBooked = await getActiveBookedTimesForDate(pool, dateStr, excludeBookingId);
    if (dbBooked.has(normalizedTime)) {
        return false;
    }

    await googleCalendar.ensureInitialized(pool);
    if (googleCalendar.isAvailable()) {
        const slots = await googleCalendar.getAvailableSlots(dateStr, pool);
        const match = slots.find((s) => s.time === normalizedTime);
        if (match && !match.available) {
            return false;
        }
    }
    return true;
}

async function deleteBookingCalendarEvent(pool, eventId) {
    if (!eventId) return;
    try {
        await googleCalendar.ensureInitialized(pool);
        if (googleCalendar.isAvailable()) {
            await googleCalendar.deleteEvent(eventId, pool);
        }
    } catch (err) {
        logger.warn('Could not delete calendar event:', err.message);
    }
}

async function syncBookingCalendarEvent(pool, row) {
    const bookingId = row.id;
    const payload = {
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        phone: row.phone,
        preferredDate: normalizeDateYmd(row.preferred_date) || row.preferred_date,
        preferredTime: String(row.preferred_time || '').slice(0, 5),
        notes: row.notes,
        bookingId
    };

    await googleCalendar.ensureInitialized(pool);
    if (!googleCalendar.isAvailable()) return;

    try {
        if (row.google_calendar_event_id) {
            await googleCalendar.updateEvent(row.google_calendar_event_id, payload, pool);
            return;
        }
        const created = await googleCalendar.createEvent(payload, pool);
        if (created?.eventId) {
            await pool.execute(
                'UPDATE edsa_bookings SET google_calendar_event_id = ? WHERE id = ?',
                [created.eventId, bookingId]
            );
        }
    } catch (err) {
        logger.error('Google Calendar sync error:', err.message);
    }
}

function bookingEmailPayload(row) {
    return {
        bookingId: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        phone: row.phone,
        preferredDate: normalizeDateYmd(row.preferred_date) || row.preferred_date,
        preferredTime: String(row.preferred_time || '').slice(0, 5),
        notes: row.notes
    };
}

// Get business hours for EDSA service
router.get('/hours', async (req, res) => {
    try {
        // Return default business hours
        res.json({
            hours: {
                monday: { open: '10:00', close: '18:00', closed: false },
                tuesday: { open: '10:00', close: '18:00', closed: false },
                wednesday: { open: '10:00', close: '18:00', closed: false },
                thursday: { open: '10:00', close: '18:00', closed: false },
                friday: { open: '10:00', close: '18:00', closed: false },
                saturday: { open: '10:00', close: '15:00', closed: false },
                sunday: { open: '00:00', close: '00:00', closed: true }
            }
        });
    } catch (error) {
        logger.error('EDSA hours fetch error:', error);
        // Return default hours even on error
        res.json({
            hours: {
                monday: { open: '10:00', close: '18:00', closed: false },
                tuesday: { open: '10:00', close: '18:00', closed: false },
                wednesday: { open: '10:00', close: '18:00', closed: false },
                thursday: { open: '10:00', close: '18:00', closed: false },
                friday: { open: '10:00', close: '18:00', closed: false },
                saturday: { open: '10:00', close: '15:00', closed: false },
                sunday: { open: '00:00', close: '00:00', closed: true }
            }
        });
    }
});

// Get EDSA service information
router.get('/info', async (req, res) => {
    try {
        const [settings] = await req.pool.execute(`
            SELECT key_name, value, description 
            FROM settings 
            WHERE key_name IN ('edsa_service_enabled', 'edsa_service_price', 'edsa_service_description')
        `);

        const serviceInfo = {};
        settings.forEach(setting => {
            serviceInfo[setting.key_name] = setting.value;
        });

        res.json({
            enabled: serviceInfo.edsa_service_enabled === 'true',
            price: parseFloat(serviceInfo.edsa_service_price || 75.00),
            description: serviceInfo.edsa_service_description || 'Electro Dermal Stress Analysis - A non-invasive health assessment technique'
        });
    } catch (error) {
        logger.error('EDSA info fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get available time slots for a date
router.get('/available-slots', async (req, res) => {
    try {
        const { date, excludeBookingId } = req.query;

        if (!date) {
            return res.status(400).json({ error: 'Date parameter is required (YYYY-MM-DD)' });
        }

        const dateYmd = normalizeDateYmd(date);
        if (!dateYmd) {
            return res.status(400).json({ error: 'Invalid date format' });
        }

        const dbBooked = await getActiveBookedTimesForDate(
            req.pool,
            dateYmd,
            excludeBookingId || null
        );

        await googleCalendar.ensureInitialized(req.pool);
        const slots = await googleCalendar.getAvailableSlots(dateYmd, req.pool);

        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.json({
            slots: slots.map((slot) => ({
                ...slot,
                available:
                    Boolean(slot.available) && !dbBooked.has(String(slot.time).slice(0, 5)),
            })),
        });
    } catch (error) {
        logger.error('Available slots error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Book EDSA appointment
router.post('/book', edsaBookingValidation, async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            email,
            phone,
            preferredDate,
            preferredTime,
            alternativeDate,
            alternativeTime,
            notes
        } = req.body;

        // Validate required fields
        if (!firstName || !lastName || !email || !phone || !preferredDate || !preferredTime) {
            return res.status(400).json({ 
                error: 'All required fields must be provided (firstName, lastName, email, phone, preferredDate, preferredTime)' 
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        if (!isUsPhoneDisplay(phone)) {
            return res.status(400).json({ error: 'Phone must be formatted as (555) 123-4567' });
        }

        // Validate date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(preferredDate)) {
            return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
        }

        // Validate time format (HH:MM)
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(preferredTime)) {
            return res.status(400).json({ error: 'Invalid time format. Use HH:MM' });
        }

        // Check if preferred date is in the future (store timezone: America/New_York)
        if (!isStoreDateTimeInFuture(preferredDate, preferredTime)) {
            return res.status(400).json({ error: 'Preferred date and time must be in the future' });
        }

        // Validate alternative date/time if provided
        if (alternativeDate && alternativeTime) {
            if (!dateRegex.test(alternativeDate) || !timeRegex.test(alternativeTime)) {
                return res.status(400).json({ error: 'Invalid alternative date or time format' });
            }

            if (!isStoreDateTimeInFuture(alternativeDate, alternativeTime)) {
                return res.status(400).json({ error: 'Alternative date and time must be in the future' });
            }
        }

        const normalizedTime = String(preferredTime).slice(0, 5);
        if (!(await isSlotAvailable(req.pool, preferredDate, normalizedTime))) {
            return res.status(409).json({
                error:
                    'That time is no longer available. Please choose another slot.',
                code: 'SLOT_TAKEN',
            });
        }

        // Create booking
        const [result] = await req.pool.execute(`
            INSERT INTO edsa_bookings (
                user_id, first_name, last_name, email, phone,
                preferred_date, preferred_time, alternative_date, alternative_time, notes,
                status, confirmed_date, confirmed_time
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)
        `, [
            req.user?.id || null,
            firstName,
            lastName,
            email,
            phone,
            preferredDate,
            preferredTime,
            alternativeDate || null,
            alternativeTime || null,
            notes || null,
            preferredDate,
            preferredTime
        ]);

        // Create Google Calendar event for HM Herbs
        let calendarEvent = null;
        await googleCalendar.ensureInitialized(req.pool);
        if (googleCalendar.isAvailable()) {
            try {
                calendarEvent = await googleCalendar.createEvent(
                    {
                        firstName,
                        lastName,
                        email,
                        phone,
                        preferredDate,
                        preferredTime,
                        notes: notes || null,
                        bookingId: result.insertId,
                    },
                    req.pool
                );

                // Store Google Calendar event ID in database (if column exists)
                if (calendarEvent && calendarEvent.eventId) {
                    try {
                        await req.pool.execute(
                            'UPDATE edsa_bookings SET google_calendar_event_id = ? WHERE id = ?',
                            [calendarEvent.eventId, result.insertId]
                        );
                    } catch (dbError) {
                        // Column might not exist yet - that's okay
                        logger.warn('Could not store calendar event ID (column may not exist):', dbError.message);
                    }
                }
            } catch (calendarError) {
                logger.error('Google Calendar sync error (booking still saved):', calendarError);
                // Don't fail the booking if calendar sync fails
            }
        }

        const bookingId = Number(result.insertId);
        const emailPayload = {
            bookingId: Number.isFinite(bookingId) ? bookingId : result.insertId,
            firstName,
            lastName,
            email,
            phone,
            preferredDate,
            preferredTime
        };
        try {
            await Promise.all([
                sendBookingReceivedEmail(emailPayload),
                sendBookingReceivedStoreEmail(emailPayload)
            ]);
        } catch (emailErr) {
            logger.error('EDSA booking notification email error (booking saved):', emailErr);
        }

        res.status(201).json({
            message: 'EDSA appointment booking submitted successfully',
            bookingId: Number.isFinite(bookingId) ? bookingId : result.insertId,
            status: 'confirmed',
            firstName,
            lastName,
            email,
            preferredDate,
            preferredTime,
            calendarEvent: calendarEvent ? {
                created: true,
                link: calendarEvent.htmlLink
            } : {
                created: false,
                message: 'Calendar sync not available'
            }
        });
    } catch (error) {
        logger.error('EDSA booking error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user's EDSA bookings (requires authentication)
router.get('/bookings', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const [bookings] = await req.pool.execute(`
            SELECT 
                id, first_name, last_name, email, phone,
                preferred_date, preferred_time, alternative_date, alternative_time,
                status, notes, created_at
            FROM edsa_bookings 
            WHERE user_id = ?
            ORDER BY preferred_date DESC, preferred_time DESC
        `, [req.user.id]);

        res.json({ bookings });
    } catch (error) {
        logger.error('EDSA bookings fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Public booking summary for thank-you page (email must match booking)
router.get('/bookings/:id/confirmation-summary', async (req, res) => {
    try {
        const bookingId = Number(req.params.id);
        const email = String(req.query.email || '')
            .trim()
            .toLowerCase();
        if (!Number.isFinite(bookingId) || bookingId < 1 || !email) {
            return res.status(400).json({ error: 'booking id and email are required' });
        }

        const booking = await loadBookingForCustomer(req.pool, bookingId, email);
        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        res.json(formatBookingRow(booking));
    } catch (error) {
        logger.error('EDSA confirmation summary error:', error);
        res.status(500).json({ error: 'Failed to load booking summary' });
    }
});

// Customer manage appointment (same verification as confirmation page)
router.get('/bookings/:id/manage', async (req, res) => {
    try {
        const booking = await loadBookingForCustomer(
            req.pool,
            req.params.id,
            req.query.email
        );
        if (!booking) {
            return res.status(404).json({ error: 'Appointment not found' });
        }
        res.json(formatBookingRow(booking));
    } catch (error) {
        logger.error('EDSA manage booking error:', error);
        res.status(500).json({ error: 'Failed to load appointment' });
    }
});

// Customer self-service cancel (immediate)
router.post('/bookings/:id/cancel-appointment', edsaCustomerEmailValidation, async (req, res) => {
    try {
        const bookingId = Number(req.params.id);
        const { email } = req.body;

        const booking = await loadBookingForCustomer(req.pool, bookingId, email);
        if (!booking) {
            return res.status(404).json({ error: 'Appointment not found' });
        }

        if (!['pending', 'confirmed'].includes(booking.status)) {
            return res.status(400).json({
                error: 'This appointment can no longer be cancelled online. Please call the store.',
            });
        }

        const prevPayload = bookingEmailPayload(booking);

        await req.pool.execute(
            `UPDATE edsa_bookings
                SET status = 'cancelled',
                    google_calendar_event_id = NULL,
                    customer_request_type = 'none',
                    customer_request_notes = NULL,
                    requested_date = NULL,
                    requested_time = NULL,
                    customer_request_at = NULL,
                    updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
            [bookingId]
        );

        if (booking.google_calendar_event_id) {
            await deleteBookingCalendarEvent(req.pool, booking.google_calendar_event_id);
        }

        try {
            await Promise.all([
                sendAppointmentCancelledEmail(prevPayload),
                sendAppointmentCancelledStoreEmail(prevPayload)
            ]);
        } catch (emailErr) {
            logger.error('EDSA cancellation email error (cancel saved):', emailErr);
        }

        res.json({
            message: 'Your appointment has been cancelled.',
            bookingId,
            status: 'cancelled',
        });
    } catch (error) {
        logger.error('EDSA customer cancel error:', error);
        res.status(500).json({ error: 'Failed to cancel appointment' });
    }
});

// Customer self-service reschedule (immediate when slot is available)
router.post('/bookings/:id/reschedule-appointment', edsaCustomerRescheduleValidation, async (req, res) => {
    try {
        const bookingId = Number(req.params.id);
        const { email, preferredDate, preferredTime, notes } = req.body;

        const booking = await loadBookingForCustomer(req.pool, bookingId, email);
        if (!booking) {
            return res.status(404).json({ error: 'Appointment not found' });
        }

        if (!['pending', 'confirmed'].includes(booking.status)) {
            return res.status(400).json({
                error: 'This appointment can no longer be changed online. Please call the store.',
            });
        }

        const normalizedTime = String(preferredTime).slice(0, 5);
        const dateYmd = normalizeDateYmd(preferredDate) || preferredDate;

        if (!isStoreDateTimeInFuture(dateYmd, normalizedTime)) {
            return res.status(400).json({ error: 'Please choose a date and time in the future.' });
        }

        const currentDate = normalizeDateYmd(booking.preferred_date);
        const currentTime = String(booking.preferred_time || '').slice(0, 5);
        if (currentDate === dateYmd && currentTime === normalizedTime) {
            return res.status(400).json({
                error: 'You are already booked for that date and time.',
            });
        }

        if (!(await isSlotAvailable(req.pool, dateYmd, normalizedTime, bookingId))) {
            return res.status(409).json({
                error: 'That time is no longer available. Please choose another slot.',
                code: 'SLOT_TAKEN',
            });
        }

        const previousDate = currentDate;
        const previousTime = currentTime;

        await req.pool.execute(
            `UPDATE edsa_bookings
                SET preferred_date = ?,
                    preferred_time = ?,
                    confirmed_date = ?,
                    confirmed_time = ?,
                    notes = COALESCE(?, notes),
                    customer_request_type = 'none',
                    customer_request_notes = NULL,
                    requested_date = NULL,
                    requested_time = NULL,
                    customer_request_at = NULL,
                    updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
            [dateYmd, normalizedTime, dateYmd, normalizedTime, notes || null, bookingId]
        );

        const updated = await loadBookingRowById(req.pool, bookingId);
        if (updated) {
            await syncBookingCalendarEvent(req.pool, updated);
        }

        const emailPayload = bookingEmailPayload(updated || booking);
        try {
            await Promise.all([
                sendAppointmentRescheduledEmail(emailPayload, previousDate, previousTime),
                sendAppointmentRescheduledStoreEmail(emailPayload, previousDate, previousTime)
            ]);
        } catch (emailErr) {
            logger.error('EDSA reschedule email error (reschedule saved):', emailErr);
        }

        res.json({
            message: 'Your appointment has been rescheduled.',
            bookingId,
            preferredDate: dateYmd,
            preferredTime: normalizedTime,
            booking: formatBookingRow(
                updated || {
                    ...booking,
                    preferred_date: dateYmd,
                    preferred_time: normalizedTime
                }
            ),
        });
    } catch (error) {
        logger.error('EDSA customer reschedule error:', error);
        res.status(500).json({ error: 'Failed to reschedule appointment' });
    }
});

// Get specific booking by ID
router.get('/bookings/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        const [bookings] = await req.pool.execute(`
            SELECT 
                id, first_name, last_name, email, phone,
                preferred_date, preferred_time, alternative_date, alternative_time,
                status, notes, created_at
            FROM edsa_bookings 
            WHERE id = ? ${userId ? 'AND user_id = ?' : ''}
        `, userId ? [id, userId] : [id]);

        if (bookings.length === 0) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        res.json({ booking: bookings[0] });
    } catch (error) {
        logger.error('EDSA booking fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Cancel EDSA booking
router.put('/bookings/:id/cancel', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        let query = 'UPDATE edsa_bookings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN (?, ?)';
        let params = ['cancelled', id, 'pending', 'confirmed'];

        if (userId) {
            query += ' AND user_id = ?';
            params.push(userId);
        }

        const [result] = await req.pool.execute(query, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Booking not found or cannot be cancelled' });
        }

        // Delete calendar event if it exists
        try {
            const [booking] = await req.pool.execute(
                'SELECT google_calendar_event_id FROM edsa_bookings WHERE id = ?',
                [id]
            );
            
            if (booking.length > 0 && booking[0].google_calendar_event_id) {
                await googleCalendar.ensureInitialized(req.pool);
                if (googleCalendar.isAvailable()) {
                    await googleCalendar.deleteEvent(booking[0].google_calendar_event_id, req.pool);
                }
            }
        } catch (calendarError) {
            logger.warn('Could not delete calendar event:', calendarError);
        }

        res.json({ message: 'Booking cancelled successfully' });
    } catch (error) {
        logger.error('EDSA booking cancellation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create calendar event endpoint (for frontend use)
router.post('/create-calendar-event', async (req, res) => {
    try {
        const { bookingId, eventDetails } = req.body;

        if (!bookingId || !eventDetails) {
            return res.status(400).json({ error: 'bookingId and eventDetails are required' });
        }

        await googleCalendar.ensureInitialized(req.pool);
        const calendarEvent = await googleCalendar.createEvent(
            {
                ...eventDetails,
                bookingId,
            },
            req.pool
        );

        if (calendarEvent) {
            res.json({
                success: true,
                event: calendarEvent
            });
        } else {
            res.status(500).json({ error: 'Failed to create calendar event' });
        }
    } catch (error) {
        logger.error('Create calendar event error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
