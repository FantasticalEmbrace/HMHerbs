# SiteGround Deployment Fix Guide

## Problem
Your website is missing CSS files and showing unstyled content on SiteGround because:
1. CSS files in the `css/` folder weren't uploaded
2. Icon files might be missing
3. Case sensitivity issues (Linux vs Windows)

## Immediate Fix Steps

### Step 1: Upload CSS Files
1. **Log into SiteGround cPanel**
2. **Open File Manager**
3. **Navigate to your domain root** (usually `public_html` or `www`)
4. **Check if `css` folder exists** - if not, create it (lowercase!)
5. **Upload ALL these files** from your local `css/` folder:
   - `accessibility-enhancements.css`
   - `brands-categories.css`
   - `browser-compatibility.css`
   - `customer-auth.css`
   - `edsa-booking.css`
   - `emergency-fixes.css`
   - `mobile-enhancements.css`
   - `performance-optimizations.css`
   - `products.css`

### Step 2: Verify File Structure
Your server should have this structure:
```
public_html/
├── index.html
├── products.html
├── checkout.html
├── styles.css
├── css/              ← This folder MUST exist
│   ├── mobile-enhancements.css
│   ├── customer-auth.css
│   └── [all other CSS files]
├── js/
│   └── [all JS files]
└── images/
    └── [all image files]
```

### Step 3: Fix Icon Issue
The manifest.json references `icon-144x144.png` which is missing. Either:
- **Option A**: Upload the icon file to `images/icon-144x144.png`
- **Option B**: Remove the reference from manifest.json if you don't need it

### Step 4: Set File Permissions
After uploading, set permissions:
- **CSS files**: 644 (readable by web server)
- **Folders**: 755 (executable/readable)
- **HTML files**: 644

### Step 5: Clear Cache
1. Clear browser cache (Ctrl+F5 or Cmd+Shift+R)
2. Clear SiteGround cache if you have caching enabled
3. Test the site again

## Quick Verification

After uploading, test these URLs directly:
- `https://donaldr27.sg-host.com/css/mobile-enhancements.css`
- `https://donaldr27.sg-host.com/css/customer-auth.css`
- `https://donaldr27.sg-host.com/css/performance-optimizations.css`

If these URLs return 404, the files aren't uploaded correctly.

## Common Mistakes to Avoid

1. ❌ **Wrong folder name**: `CSS` or `Css` instead of `css` (Linux is case-sensitive!)
2. ❌ **Wrong location**: CSS files in root instead of `css/` folder
3. ❌ **Missing files**: Not all CSS files uploaded
4. ❌ **File permissions**: Files not readable by web server

## If Still Not Working

1. Check SiteGround error logs in cPanel
2. Verify folder name is exactly `css` (lowercase)
3. Ensure all file names match exactly (case-sensitive)
4. Check file permissions are 644
5. Try accessing CSS files directly via URL to see error messages

