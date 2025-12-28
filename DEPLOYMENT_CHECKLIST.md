# SiteGround Deployment Checklist

## Required Files and Folders Structure

Your SiteGround server should have this exact structure:

```
/
├── index.html
├── products.html
├── checkout.html
├── account.html
├── admin.html
├── brands.html
├── categories.html
├── script.js
├── admin-app.js
├── styles.css
├── css/
│   ├── accessibility-enhancements.css
│   ├── brands-categories.css
│   ├── browser-compatibility.css
│   ├── customer-auth.css
│   ├── edsa-booking.css
│   ├── emergency-fixes.css
│   ├── mobile-enhancements.css
│   ├── performance-optimizations.css
│   └── products.css
├── js/
│   ├── checkout.js
│   ├── products.js
│   ├── account.js
│   ├── mobile-menu.js
│   └── [all other .js files]
├── images/
│   └── [all image files]
└── backend/
    └── [backend files if needed]
```

## Critical CSS Files Missing on Server

Based on the 404 errors, these files need to be uploaded:

1. ✅ `css/performance-optimizations.css`
2. ✅ `css/browser-compatibility.css`
3. ✅ `css/mobile-enhancements.css`
4. ✅ `css/customer-auth.css`
5. ✅ `css/emergency-fixes.css`
6. ✅ `css/edsa-booking.css`
7. ✅ `css/accessibility-enhancements.css`

## Upload Instructions

### Option 1: Using SiteGround File Manager
1. Log into SiteGround cPanel
2. Go to File Manager
3. Navigate to your domain's root directory (usually `public_html` or `www`)
4. Create a `css` folder if it doesn't exist (case-sensitive: lowercase `css`)
5. Upload all CSS files from your local `css/` folder to the server's `css/` folder
6. Ensure file names match exactly (case-sensitive)

### Option 2: Using FTP/SFTP
1. Connect to your SiteGround server via FTP/SFTP
2. Navigate to your domain root
3. Upload the entire `css/` folder
4. Ensure folder name is lowercase: `css` (not `CSS` or `Css`)

## Common Issues and Solutions

### Issue 1: Case Sensitivity
- **Problem**: Linux servers are case-sensitive
- **Solution**: Ensure folder name is exactly `css` (lowercase) and file names match exactly

### Issue 2: File Permissions
- **Problem**: Files might not be readable
- **Solution**: Set file permissions to 644 for CSS files and 755 for folders

### Issue 3: Path Issues
- **Problem**: Paths might be incorrect
- **Solution**: Ensure CSS files are in `css/` folder relative to HTML files

## Verification Steps

After uploading, verify:
1. All CSS files are in the `css/` folder on the server
2. File names match exactly (case-sensitive)
3. File permissions are correct (644 for files, 755 for folders)
4. Clear browser cache and hard refresh (Ctrl+F5)
5. Check browser console for any remaining 404 errors

## Quick Fix Script

If you have SSH access, you can verify files exist:
```bash
ls -la css/
```

This should show all CSS files listed above.

