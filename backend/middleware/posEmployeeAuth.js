'use strict';

const jwt = require('jsonwebtoken');
const personnel = require('../services/posPersonnel');

function authenticatePosEmployee(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
        return res.status(401).json({ error: 'Employee session required', code: 'EMPLOYEE_AUTH_REQUIRED' });
    }
    try {
        const decoded = personnel.verifyEmployeeToken(token);
        req.posEmployee = {
            id: decoded.employeeId,
            employeeCode: decoded.employeeCode,
            name: decoded.name
        };
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid employee session', code: 'INVALID_EMPLOYEE_TOKEN' });
    }
}

module.exports = { authenticatePosEmployee };
