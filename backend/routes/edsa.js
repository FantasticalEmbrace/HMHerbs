// EDSA (Electro Dermal Stress Analysis) Service Routes
const express = require('express');
const router = express.Router();
const { edsaBookingValidation } = require('../middleware/validation');
const googleCalendar = require('../services/google-calendar');

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
        console.error('EDSA info fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get business hours
router.get('/hours', async (req, res) => {
    try {
        // Default business hours: 9 AM to 5 PM, Monday-Friday
        const businessHours = {
            monday: { open: '09:00', close: '17:00', closed: false },
            tuesday: { open: '09:00', close: '17:00', closed: false },
            wednesday: { open: '09:00', close: '17:00', closed: false },
            thursday: { open: '09:00', close: '17:00', closed: false },
            friday: { open: '09:00', close: '17:00', closed: false },
            saturday: { open: '09:00', close: '17:00', closed: false },
            sunday: { open: '09:00', close: '17:00', closed: true }
        };

        // Try to get from settings if available
        try {
            const [settings] = await req.pool.execute(`
                SELECT key_name, value 
                FROM settings 
                WHERE key_name LIKE 'business_hours_%'
            `);
            
            settings.forEach(setting => {
                const day = setting.key_name.replace('business_hours_', '');
                if (businessHours[day]) {
                    const hours = JSON.parse(setting.value || '{}');
                    if (hours.open && hours.close) {
                        businessHours[day] = hours;
                    }
                }
            });
        } catch (err) {
            // Use defaults if settings query fails
            console.log('Using default business hours');
        }

        res.json({ hours: businessHours });
    } catch (error) {
        console.error('Business hours error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get available time slots for a date
router.get('/available-slots', async (req, res) => {
    try {
        const { date } = req.query;
        
        if (!date) {
            return res.status(400).json({ error: 'Date parameter is required (YYYY-MM-DD)' });
        }

        const dateObj = new Date(date);
        if (isNaN(dateObj.getTime())) {
            return res.status(400).json({ error: 'Invalid date format' });
        }

        // Get available slots from Google Calendar
        const slots = await googleCalendar.getAvailableSlots(dateObj);

        res.json({ slots });
    } catch (error) {
        console.error('Available slots error:', error);
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

        // Validate phone format (basic validation)
        const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
        if (!phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''))) {
            return res.status(400).json({ error: 'Invalid phone number format' });
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

        // Check if preferred date is in the future
        const preferredDateTime = new Date(`${preferredDate}T${preferredTime}`);
        const now = new Date();
        if (preferredDateTime <= now) {
            return res.status(400).json({ error: 'Preferred date and time must be in the future' });
        }

        // Validate alternative date/time if provided
        if (alternativeDate && alternativeTime) {
            if (!dateRegex.test(alternativeDate) || !timeRegex.test(alternativeTime)) {
                return res.status(400).json({ error: 'Invalid alternative date or time format' });
            }

            const alternativeDateTime = new Date(`${alternativeDate}T${alternativeTime}`);
            if (alternativeDateTime <= now) {
                return res.status(400).json({ error: 'Alternative date and time must be in the future' });
            }
        }

        // Check for existing booking conflicts (basic check)
        const [existingBookings] = await req.pool.execute(`
            SELECT id FROM edsa_bookings 
            WHERE (preferred_date = ? AND preferred_time = ?) 
               OR (confirmed_date = ? AND confirmed_time = ?)
            AND status IN ('pending', 'confirmed')
        `, [preferredDate, preferredTime, preferredDate, preferredTime]);

        if (existingBookings.length > 0) {
            return res.status(409).json({ 
                error: 'The requested time slot is already booked. Please choose a different time or provide an alternative.' 
            });
        }

        // Create booking
        const [result] = await req.pool.execute(`
            INSERT INTO edsa_bookings (
                user_id, first_name, last_name, email, phone,
                preferred_date, preferred_time, alternative_date, alternative_time, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            notes || null
        ]);

        // Create Google Calendar event for HM Herbs
        let calendarEvent = null;
        if (googleCalendar.isAvailable()) {
            try {
                calendarEvent = await googleCalendar.createEvent({
                    firstName,
                    lastName,
                    email,
                    phone,
                    preferredDate,
                    preferredTime,
                    notes: notes || null,
                    bookingId: result.insertId
                });

                // Store Google Calendar event ID in database (if column exists)
                if (calendarEvent && calendarEvent.eventId) {
                    try {
                        await req.pool.execute(
                            'UPDATE edsa_bookings SET google_calendar_event_id = ? WHERE id = ?',
                            [calendarEvent.eventId, result.insertId]
                        );
                    } catch (dbError) {
                        // Column might not exist yet - that's okay
                        console.warn('Could not store calendar event ID (column may not exist):', dbError.message);
                    }
                }
            } catch (calendarError) {
                console.error('Google Calendar sync error (booking still saved):', calendarError);
                // Don't fail the booking if calendar sync fails
            }
        }

        // Send confirmation email (placeholder - implement email service)
        // await sendEDSABookingConfirmation(email, firstName, preferredDate, preferredTime);

        res.status(201).json({
            message: 'EDSA appointment booking submitted successfully',
            bookingId: result.insertId,
            status: 'pending',
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
        console.error('EDSA booking error:', error);
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
        console.error('EDSA bookings fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
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
        console.error('EDSA booking fetch error:', error);
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
            
            if (booking.length > 0 && booking[0].google_calendar_event_id && googleCalendar.isAvailable()) {
                await googleCalendar.deleteEvent(booking[0].google_calendar_event_id);
            }
        } catch (calendarError) {
            console.warn('Could not delete calendar event:', calendarError);
        }

        res.json({ message: 'Booking cancelled successfully' });
    } catch (error) {
        console.error('EDSA booking cancellation error:', error);
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

        const calendarEvent = await googleCalendar.createEvent({
            ...eventDetails,
            bookingId
        });

        if (calendarEvent) {
            res.json({
                success: true,
                event: calendarEvent
            });
        } else {
            res.status(500).json({ error: 'Failed to create calendar event' });
        }
    } catch (error) {
        console.error('Create calendar event error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
