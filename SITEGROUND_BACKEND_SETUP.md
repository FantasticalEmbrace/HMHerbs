# SiteGround Backend Setup Guide

## Problem Identified

Your website at `https://donaldr27.sg-host.com/products.html` is trying to fetch products from:
- `https://donaldr27.sg-host.com/api/products`

But the backend server is **not running** on SiteGround. The backend is only running locally on your machine (`localhost:3001`).

## Solution Options

### Option 1: Deploy Backend to SiteGround (Recommended for Production)

SiteGround supports Node.js applications. You'll need to:

1. **Set up Node.js on SiteGround**
   - Log into SiteGround cPanel
   - Go to **Node.js** section
   - Create a new Node.js application
   - Set Node.js version (14.x or higher)
   - Set application root to your backend folder

2. **Upload Backend Files**
   - Upload entire `backend/` folder to SiteGround
   - Upload `package.json` from root (or create one in backend)
   - Set up environment variables in SiteGround (.env file)

3. **Configure Database**
   - Set up MySQL database in SiteGround
   - Update `.env` file with production database credentials
   - Run database migrations

4. **Set Environment Variables**
   ```
   PORT=3001
   DB_HOST=your-db-host
   DB_USER=your-db-user
   DB_PASSWORD=your-db-password
   DB_NAME=your-db-name
   JWT_SECRET=your-secret-key
   ```

5. **Start the Application**
   - SiteGround will auto-start Node.js apps
   - Check logs for any errors

### Option 2: Use Static Product Data (Quick Fix)

If you don't want to set up the backend right now, you can use static JSON data:

1. Export your products to a JSON file
2. Upload it to SiteGround
3. Modify `js/products.js` to load from the JSON file instead of API

### Option 3: Point to Different Backend Server

If you have the backend running elsewhere:

1. Update `js/products.js` line 65-67:
   ```javascript
   const apiBaseUrl = window.location.origin.includes('localhost')
       ? 'http://localhost:3001'
       : 'https://your-backend-server.com'; // Change this
   ```

## Current API Routes Available

Your backend has these public routes (no authentication required):
- `GET /api/products` - Get all products
- `GET /api/brands` - Get all brands  
- `GET /api/categories` - Get all categories
- `GET /api/health-categories` - Get health categories

## Quick Test

To verify if backend is accessible, try accessing:
- `https://donaldr27.sg-host.com/api/products`
- `https://donaldr27.sg-host.com/api/brands`

If you get 404 or connection errors, the backend is not running.

## Recommended Next Steps

1. **Immediate**: Set up Node.js app on SiteGround
2. **Upload**: Backend folder and dependencies
3. **Configure**: Database connection
4. **Test**: Verify API endpoints work
5. **Deploy**: Frontend will automatically connect

## Alternative: Static Site Mode

If you want a static site without backend:
1. Export products to JSON
2. Modify JavaScript to load from JSON file
3. Remove API dependencies
4. Products will be read-only (no cart/orders)

