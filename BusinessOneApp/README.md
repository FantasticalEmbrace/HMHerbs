# Business One Menu - Android App

A modern Android application showcasing Business One's integrated business solutions. This app provides an interactive menu interface for displaying services including POS systems, Payment Processing, Phone Service, and Website Development.

## Features

- **API Integration**: Connects to a website via API key to fetch and display digital menu data dynamically
- **Interactive Service Cards**: Browse services with detailed information loaded from API
- **Service Detail Dialogs**: Tap any service to view comprehensive details and features
- **Settings Panel**: Customize display preferences, theme, and API configuration
- **Dark Mode Support**: Light, Dark, and Auto theme options
- **Responsive Design**: Adapts to different screen sizes
- **Contact Integration**: Direct phone and email links
- **Offline Fallback**: Uses default services if API is unavailable

## Project Structure

```
BusinessOneApp/
├── app/
│   ├── src/
│   │   └── main/
│   │       ├── java/com/businessone/menu/
│   │       │   ├── MainActivity.kt
│   │       │   ├── Service.kt
│   │       │   └── ServiceAdapter.kt
│   │       ├── res/
│   │       │   ├── layout/
│   │       │   │   ├── activity_main.xml
│   │       │   │   ├── item_service_card.xml
│   │       │   │   ├── dialog_service_detail.xml
│   │       │   │   └── fragment_settings.xml
│   │       │   ├── values/
│   │       │   │   ├── strings.xml
│   │       │   │   ├── colors.xml
│   │       │   │   └── themes.xml
│   │       │   └── drawable/
│   │       │       └── service_icon_background.xml
│   │       └── AndroidManifest.xml
│   └── build.gradle
├── build.gradle
├── settings.gradle
└── gradle.properties
```

## Prerequisites

To build this Android app, you need:

1. **Android Studio** (Arctic Fox or later recommended)
   - Download from: https://developer.android.com/studio

2. **Android SDK**
   - Minimum SDK: 24 (Android 7.0)
   - Target SDK: 34 (Android 14)
   - Compile SDK: 34

3. **JDK 8 or higher**

## Building the APK

### Option 1: Using Android Studio (Recommended)

1. **Open the Project**
   ```bash
   # Open Android Studio
   # File > Open > Select the BusinessOneApp folder
   ```

2. **Sync Gradle**
   - Android Studio will automatically sync Gradle files
   - Wait for dependencies to download

3. **Build the APK**
   - **Debug APK**: `Build > Build Bundle(s) / APK(s) > Build APK(s)`
   - **Release APK**: `Build > Generate Signed Bundle / APK` (requires signing key)

4. **Locate the APK**
   - Debug APK: `app/build/outputs/apk/debug/app-debug.apk`
   - Release APK: `app/build/outputs/apk/release/app-release.apk`

### Option 2: Using Command Line

1. **Navigate to project directory**
   ```bash
   cd BusinessOneApp
   ```

2. **Build Debug APK**
   ```bash
   ./gradlew assembleDebug
   ```
   (On Windows: `gradlew.bat assembleDebug`)

3. **Build Release APK** (requires signing configuration)
   ```bash
   ./gradlew assembleRelease
   ```

4. **Find the APK**
   - Debug: `app/build/outputs/apk/debug/app-debug.apk`
   - Release: `app/build/outputs/apk/release/app-release.apk`

## Installing the APK

### On Android Device

1. **Enable Unknown Sources**
   - Settings > Security > Unknown Sources (enable)

2. **Transfer APK to device**
   - Use USB, email, or cloud storage

3. **Install**
   - Tap the APK file
   - Follow installation prompts

### Using ADB

```bash
adb install app-debug.apk
```

## API Integration

The app connects to a website API to fetch menu data dynamically. 

### API Configuration

1. **First Launch**: The app will prompt you to enter an API key
2. **API Key**: Enter your API key to authenticate with the server
3. **API URL**: Default is `https://businessonecomprehensive.com` (can be customized)
4. **Settings**: Access API configuration from Settings → Configure API Key

### API Endpoints

The app expects the following API endpoints:

- `GET /api/menu/items` - Returns menu items
  - Header: `X-API-Key: your_api_key`
  - Response: `{ "success": true, "items": [...] }`

### Menu Item Format

Each menu item should have:
```json
{
  "id": "unique_id",
  "name": "Service Name",
  "description": "Service description",
  "price": "Optional price",
  "imageUrl": "Optional image URL",
  "category": "Category name"
}
```

### Fallback Mode

If the API is unavailable or no API key is provided, the app will use default Business One services:
1. **Point of Sale (POS)** - Modern POS systems for sales and inventory management
2. **Payment Processing** - Secure payment processing solutions
3. **Phone Service** - Business phone systems with advanced features
4. **Website Development** - Professional website design and development

## Customization

### Changing Brand Colors

Edit `app/src/main/res/values/colors.xml`:
```xml
<color name="primary">#1a4d7a</color>
<color name="accent">#ff6b35</color>
```

### Adding/Modifying Services

Edit the `getServices()` function in `MainActivity.kt`:
```kotlin
Service(
    id = "new_service",
    title = "New Service",
    description = "Description here",
    icon = "🔧",
    features = listOf("Feature 1", "Feature 2"),
    overview = "Detailed overview..."
)
```

### Updating Contact Information

Edit `app/src/main/res/values/strings.xml`:
```xml
<string name="phone_number">(850) 290-2084</string>
<string name="email">info@businessonecomprehensive.com</string>
```

## Dependencies

- **AndroidX Core**: Core Android functionality
- **Material Components**: Material Design UI components
- **Navigation Component**: Navigation between screens
- **RecyclerView**: Efficient list/grid display
- **CardView**: Card-based UI elements

## App Information

- **Package Name**: `com.businessone.menu`
- **Version Code**: 1
- **Version Name**: 1.0.0
- **Min SDK**: 24 (Android 7.0)
- **Target SDK**: 34 (Android 14)

## Troubleshooting

### Build Errors

1. **Gradle Sync Failed**
   - Check internet connection
   - File > Invalidate Caches / Restart
   - Check `gradle.properties` settings

2. **SDK Not Found**
   - Tools > SDK Manager
   - Install required SDK versions

3. **Dependencies Not Resolving**
   - Check `build.gradle` files
   - Ensure `google()` and `mavenCentral()` repositories are included

### Runtime Issues

1. **App Crashes on Launch**
   - Check logcat for error messages
   - Verify all resources are present

2. **Theme Not Applying**
   - Check `themes.xml` and `colors.xml`
   - Verify AppCompatDelegate usage

## License

© 2025 Business One. All rights reserved.

## Support

For questions or issues:
- Email: info@businessonecomprehensive.com
- Phone: (850) 290-2084

---

**Note**: This app is designed to be similar in functionality to a digital menu app but with original code and Business One branding to avoid any legal issues.

