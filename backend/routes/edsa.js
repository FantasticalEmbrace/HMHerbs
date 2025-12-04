// EDSA (Electro Dermal Stress Analysis) Service Routes
const express = require('express');
const router = express.Router();

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

// Book EDSA appointment
router.post('/book', async (req, res) => {
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

        // Send confirmation email (placeholder - implement email service)
        // await sendEDSABookingConfirmation(email, firstName, preferredDate, preferredTime);

        res.status(201).json({
            message: 'EDSA appointment booking submitted successfully',
            bookingId: result.insertId,
            status: 'pending',
            preferredDate,
            preferredTime
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
                id,
                preferred_date,
                preferred_time,
                alternative_date,
                alternative_time,
                confirmed_date,
                confirmed_time,
                status,
                notes,
                created_at
            FROM edsa_bookings 
            WHERE user_id = ? 
            ORDER BY created_at DESC
        `, [req.user.id]);

        res.json(bookings);
    } catch (error) {
        console.error('EDSA bookings fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get specific booking details
router.get('/bookings/:bookingId', async (req, res) => {
    try {
        const { bookingId } = req.params;

        let query = `
            SELECT 
                id,
                first_name,
                last_name,
                email,
                phone,
                preferred_date,
                preferred_time,
                alternative_date,
                alternative_time,
                confirmed_date,
                confirmed_time,
                status,
                notes,
                created_at,
                updated_at
            FROM edsa_bookings 
            WHERE id = ?
        `;
        let params = [bookingId];

        // If user is authenticated, only show their bookings
        if (req.user) {
            query += ' AND user_id = ?';
            params.push(req.user.id);
        }

        const [bookings] = await req.pool.execute(query, params);

        if (bookings.length === 0) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        res.json(bookings[0]);
    } catch (error) {
        console.error('EDSA booking fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Cancel EDSA booking
router.put('/bookings/:bookingId/cancel', async (req, res) => {
    try {
        const { bookingId } = req.params;

        let query = 'UPDATE edsa_bookings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN (?, ?)';
        let params = ['cancelled', bookingId, 'pending', 'confirmed'];

        // If user is authenticated, only allow cancelling their own bookings
        if (req.user) {
            query += ' AND user_id = ?';
            params.push(req.user.id);
        }

        const [result] = await req.pool.execute(query, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Booking not found or cannot be cancelled' });
        }

        res.json({ message: 'Booking cancelled successfully' });
    } catch (error) {
        console.error('EDSA booking cancellation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get available time slots for a specific date
router.get('/availability/:date', async (req, res) => {
    try {
        const { date } = req.params;

        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
            return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
        }

        // Check if date is in the future
        const requestedDate = new Date(date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (requestedDate < today) {
            return res.status(400).json({ error: 'Cannot check availability for past dates' });
        }

        // Get booked time slots for the date
        const [bookedSlots] = await req.pool.execute(`
            SELECT preferred_time, confirmed_time 
            FROM edsa_bookings 
            WHERE (preferred_date = ? OR confirmed_date = ?) 
            AND status IN ('pending', 'confirmed')
        `, [date, date]);

        // Define available time slots (9 AM to 5 PM, hourly slots)
        const allSlots = [];
        for (let hour = 9; hour <= 17; hour++) {
            allSlots.push(`${hour.toString().padStart(2, '0')}:00`);
        }

        // Filter out booked slots
        const bookedTimes = bookedSlots.map(slot => slot.preferred_time || slot.confirmed_time);
        const availableSlots = allSlots.filter(slot => !bookedTimes.includes(slot));

        res.json({
            date,
            availableSlots,
            bookedSlots: bookedTimes
        });
    } catch (error) {
        console.error('EDSA availability check error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
