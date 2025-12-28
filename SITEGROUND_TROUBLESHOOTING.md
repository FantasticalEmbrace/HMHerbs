# SiteGround Troubleshooting Guide

## Step 1: Verify File Structure

After uploading, your SiteGround file structure should look like this:

```
public_html/  (or www/)
├── index.html
├── products.html
├── checkout.html
├── styles.css
├── css/
│   ├── mobile-enhancements.css
│   ├── customer-auth.css
│   ├── performance-optimizations.css
│   ├── browser-compatibility.css
│   ├── emergency-fixes.css
│   ├── edsa-booking.css
│   ├── accessibility-enhancements.css
│   ├── products.css
│   └── brands-categories.css
├── js/
│   └── [all JS files]
└── images/
    └── [all image files]
```

## Step 2: Upload the Diagnostic File

1. Upload `check-upload.html` to your SiteGround root directory
2. Visit: `https://donaldr27.sg-host.com/check-upload.html`
3. This will show you exactly which files are missing

## Step 3: Common Issues

### Issue 1: Files Uploaded to Wrong Location

**Problem**: Files might be in a subfolder like `hmherbs-main/` instead of root

**Solution**: 
- Check if your files are in `public_html/hmherbs-main/` instead of `public_html/`
- Move all files from `hmherbs-main/` to `public_html/` root
- OR update all paths in HTML files to include `hmherbs-main/` prefix

### Issue 2: Case Sensitivity

**Problem**: Linux servers are case-sensitive

**Solution**:
- Folder must be exactly `css` (lowercase)
- Not `CSS`, `Css`, or `Css`
- File names must match exactly: `mobile-enhancements.css` (not `Mobile-Enhancements.css`)

### Issue 3: File Permissions

**Problem**: Files exist but server can't read them

**Solution**:
- Set CSS files to permission **644**
- Set folders to permission **755**
- In File Manager: Right-click file → Change Permissions → Set to 644

### Issue 4: Files in Wrong Folder

**Problem**: CSS files might be in root instead of `css/` folder

**Solution**:
- Create `css` folder in root if it doesn't exist
- Move all `.css` files (except `styles.css`) into the `css/` folder
- Keep `styles.css` in root (it's referenced directly)

## Step 4: Quick Verification Commands

If you have SSH access, run these commands:

```bash
# Check if css folder exists
ls -la css/

# Check file permissions
ls -la css/*.css

# Verify file names (case-sensitive)
ls css/ | grep -i mobile
```

## Step 5: Manual File Check

Test these URLs directly in your browser:

1. `https://donaldr27.sg-host.com/css/mobile-enhancements.css`
2. `https://donaldr27.sg-host.com/css/customer-auth.css`
3. `https://donaldr27.sg-host.com/css/performance-optimizations.css`

**If you see 404:**
- File doesn't exist at that location
- Check folder name is `css` (lowercase)
- Check file name matches exactly

**If you see CSS code:**
- File exists and is accessible ✅
- Problem might be elsewhere

## Step 6: Check SiteGround File Manager

1. Log into SiteGround cPanel
2. Open **File Manager**
3. Navigate to your domain root (`public_html` or `www`)
4. Look for `css` folder
5. Click into `css` folder
6. Verify all CSS files are there

## Step 7: If Still Not Working

1. **Check error logs** in SiteGround cPanel
2. **Clear SiteGround cache** if caching is enabled
3. **Clear browser cache** (Ctrl+F5)
4. **Check .htaccess file** - make sure it's not blocking CSS files
5. **Contact SiteGround support** with the specific 404 errors

## Quick Fix Checklist

- [ ] All files uploaded to correct location (root, not subfolder)
- [ ] `css` folder exists (lowercase)
- [ ] All CSS files are in `css/` folder
- [ ] File permissions set to 644
- [ ] Folder permissions set to 755
- [ ] Browser cache cleared
- [ ] SiteGround cache cleared (if applicable)
- [ ] Tested URLs directly in browser

