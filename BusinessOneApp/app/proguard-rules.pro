# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.

# Keep data classes
-keep class com.businessone.menu.Service { *; }

# Keep all activities
-keep class * extends android.app.Activity
-keep class * extends androidx.appcompat.app.AppCompatActivity

# Keep RecyclerView adapters
-keep class * extends androidx.recyclerview.widget.RecyclerView$Adapter

