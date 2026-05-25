# Quick Build Instructions

## Prerequisites
1. Install **Android Studio** from https://developer.android.com/studio
2. Open Android Studio and let it install SDK components

## Build Steps

### Method 1: Android Studio (Easiest)

1. **Open Project**
   - Launch Android Studio
   - Click "Open" and select the `BusinessOneApp` folder
   - Wait for Gradle sync to complete

2. **Build APK**
   - Click `Build` menu → `Build Bundle(s) / APK(s)` → `Build APK(s)`
   - Wait for build to complete
   - Click "locate" when notification appears
   - APK will be in: `app/build/outputs/apk/debug/app-debug.apk`

3. **Install on Device**
   - Transfer APK to Android device
   - Enable "Install from Unknown Sources" in device settings
   - Tap APK file to install

### Method 2: Command Line

1. **Open Terminal/Command Prompt** in `BusinessOneApp` folder

2. **Windows:**
   ```cmd
   gradlew.bat assembleDebug
   ```

3. **Mac/Linux:**
   ```bash
   chmod +x gradlew
   ./gradlew assembleDebug
   ```

4. **Find APK:**
   - Location: `app/build/outputs/apk/debug/app-debug.apk`

## App Details

- **Package**: com.businessone.menu
- **Version**: 1.0.0
- **Min Android**: 7.0 (API 24)
- **Target Android**: 14 (API 34)

## Troubleshooting

**Gradle Sync Failed?**
- Check internet connection
- File → Invalidate Caches / Restart
- Try: File → Sync Project with Gradle Files

**Build Errors?**
- Ensure Android SDK is installed (Tools → SDK Manager)
- Check that JDK 8+ is installed
- Verify all files are in correct locations

## Need Help?

- Email: info@businessonecomprehensive.com
- Phone: (850) 290-2084

