package com.businessone.menu

import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.preference.PreferenceManager
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : AppCompatActivity() {
    
    private lateinit var recyclerView: RecyclerView
    private lateinit var adapter: ServiceAdapter
    private lateinit var sharedPreferences: SharedPreferences
    private lateinit var progressBar: ProgressBar
    private lateinit var errorTextView: TextView
    private lateinit var apiService: ApiService
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        sharedPreferences = PreferenceManager.getDefaultSharedPreferences(this)
        setupToolbar()
        setupViews()
        loadPreferences()
        loadMenuFromApi()
    }
    
    private fun setupToolbar() {
        val toolbar = findViewById<androidx.appcompat.widget.Toolbar>(R.id.toolbar)
        setSupportActionBar(toolbar)
        
        findViewById<View>(R.id.settingsButton).setOnClickListener {
            showSettingsDialog()
        }
    }
    
    private fun setupViews() {
        recyclerView = findViewById(R.id.servicesRecyclerView)
        progressBar = findViewById(R.id.progressBar)
        errorTextView = findViewById(R.id.errorTextView)
        
        val spanCount = if (resources.configuration.screenWidthDp >= 600) 2 else 1
        recyclerView.layoutManager = GridLayoutManager(this, spanCount)
        
        adapter = ServiceAdapter(emptyList()) { service ->
            showServiceDetailDialog(service)
        }
        recyclerView.adapter = adapter
    }
    
    private fun loadMenuFromApi() {
        val apiKey = sharedPreferences.getString("api_key", "") ?: ""
        val apiUrl = sharedPreferences.getString("api_url", "https://businessonecomprehensive.com") ?: "https://businessonecomprehensive.com"
        
        if (apiKey.isEmpty()) {
            showApiKeyDialog()
            return
        }
        
        showLoading(true)
        ApiClient.setBaseUrl(apiUrl)
        apiService = ApiClient.getApiService()
        
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val response = apiService.getMenuItems(apiKey)
                
                withContext(Dispatchers.Main) {
                    showLoading(false)
                    
                    if (response.isSuccessful && response.body()?.success == true) {
                        val menuItems = response.body()?.items ?: emptyList()
                        val services = convertMenuItemsToServices(menuItems)
                        adapter.updateServices(services)
                        errorTextView.visibility = View.GONE
                    } else {
                        // Fallback to default services if API fails
                        showError("Unable to load menu from API. Using default services.")
                        val defaultServices = getDefaultServices()
                        adapter.updateServices(defaultServices)
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    showLoading(false)
                    showError("Connection error: ${e.message}. Using default services.")
                    val defaultServices = getDefaultServices()
                    adapter.updateServices(defaultServices)
                }
            }
        }
    }
    
    private fun convertMenuItemsToServices(menuItems: List<MenuItem>): List<Service> {
        return menuItems.map { item ->
            Service(
                id = item.id,
                title = item.name,
                description = item.description ?: "",
                icon = getIconForCategory(item.category),
                features = item.description?.split(". ")?.filter { it.isNotBlank() }?.take(6) 
                    ?: listOf("Professional service", "Expert support", "Quality guaranteed"),
                overview = item.description ?: "Professional service from Business One."
            )
        }
    }
    
    private fun getIconForCategory(category: String?): String {
        return when (category?.lowercase()) {
            "pos", "point of sale" -> "💳"
            "payment", "payment processing" -> "💵"
            "phone", "phone service" -> "📞"
            "website", "web development" -> "🌐"
            else -> "🔧"
        }
    }
    
    private fun getDefaultServices(): List<Service> {
        return listOf(
            Service(
                id = "pos",
                title = getString(R.string.service_pos_title),
                description = getString(R.string.service_pos_description),
                icon = "💳",
                features = listOf(
                    "Real-time inventory tracking",
                    "Sales reporting and analytics",
                    "Multi-location support",
                    "Customer management",
                    "Integration with payment processors",
                    "Mobile and tablet compatible"
                ),
                overview = "Our Point of Sale systems are designed to help businesses of all sizes manage their sales operations efficiently. With real-time inventory tracking, comprehensive reporting, and seamless payment integration, you can focus on growing your business while we handle the technology."
            ),
            Service(
                id = "payment",
                title = getString(R.string.service_payment_title),
                description = getString(R.string.service_payment_description),
                icon = "💵",
                features = listOf(
                    "Competitive processing rates",
                    "Secure payment gateway",
                    "Multiple payment methods",
                    "24/7 fraud monitoring",
                    "Quick settlement times",
                    "Dedicated account manager"
                ),
                overview = "Accept payments seamlessly with our secure payment processing solutions. We offer competitive rates, multiple payment methods including credit cards, debit cards, and digital wallets. Our 24/7 fraud monitoring ensures your transactions are always secure."
            ),
            Service(
                id = "phone",
                title = getString(R.string.service_phone_title),
                description = getString(R.string.service_phone_description),
                icon = "📞",
                features = listOf(
                    "Professional hold queues",
                    "Voicemail to email",
                    "Call forwarding and routing",
                    "Conference calling",
                    "Mobile app integration",
                    "Unlimited calling plans"
                ),
                overview = "Stay connected with clients and team members using our advanced business phone systems. Our hold queue technology ensures customers never hear continuous ringing or busy signals, providing a professional experience. Features include voicemail to email, call forwarding, conference calling, and mobile app integration."
            ),
            Service(
                id = "website",
                title = getString(R.string.service_website_title),
                description = getString(R.string.service_website_description),
                icon = "🌐",
                features = listOf(
                    "Responsive design",
                    "SEO optimization",
                    "Content management system",
                    "E-commerce integration",
                    "Mobile-first approach",
                    "Ongoing support and maintenance"
                ),
                overview = "Establish a strong online presence with our professional website development services. We create responsive, SEO-optimized websites that work seamlessly across all devices. Whether you need a simple business site or a full e-commerce platform, we have the expertise to bring your vision to life."
            )
        )
    }
    
    private fun showLoading(show: Boolean) {
        progressBar.visibility = if (show) View.VISIBLE else View.GONE
        recyclerView.visibility = if (show) View.GONE else View.VISIBLE
    }
    
    private fun showError(message: String) {
        errorTextView.text = message
        errorTextView.visibility = View.VISIBLE
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }
    
    private fun showApiKeyDialog() {
        val dialogView = layoutInflater.inflate(R.layout.dialog_api_setup, null)
        val apiKeyInput = dialogView.findViewById<TextInputEditText>(R.id.apiKeyInput)
        val apiUrlInput = dialogView.findViewById<TextInputEditText>(R.id.apiUrlInput)
        
        // Load existing values
        apiKeyInput.setText(sharedPreferences.getString("api_key", ""))
        apiUrlInput.setText(sharedPreferences.getString("api_url", "https://businessonecomprehensive.com"))
        
        MaterialAlertDialogBuilder(this)
            .setTitle("API Configuration")
            .setMessage("Enter your API key and API URL to load menu data from the server.")
            .setView(dialogView)
            .setPositiveButton("Save") { _, _ ->
                val apiKey = apiKeyInput.text?.toString() ?: ""
                val apiUrl = apiUrlInput.text?.toString() ?: "https://businessonecomprehensive.com"
                
                if (apiKey.isNotEmpty()) {
                    sharedPreferences.edit()
                        .putString("api_key", apiKey)
                        .putString("api_url", apiUrl)
                        .apply()
                    
                    loadMenuFromApi()
                } else {
                    Toast.makeText(this, "API key is required", Toast.LENGTH_SHORT).show()
                    // Use default services if no API key
                    adapter.updateServices(getDefaultServices())
                }
            }
            .setNegativeButton("Use Default") { _, _ ->
                adapter.updateServices(getDefaultServices())
            }
            .setCancelable(false)
            .show()
    }
    
    private fun showServiceDetailDialog(service: Service) {
        val dialogView = layoutInflater.inflate(R.layout.dialog_service_detail, null)
        
        dialogView.findViewById<android.widget.TextView>(R.id.detailServiceIcon).text = service.icon
        dialogView.findViewById<android.widget.TextView>(R.id.detailServiceTitle).text = service.title
        dialogView.findViewById<android.widget.TextView>(R.id.detailServiceDescription).text = service.description
        dialogView.findViewById<android.widget.TextView>(R.id.detailFeatures).text = 
            service.features.joinToString("\n") { "• $it" }
        dialogView.findViewById<android.widget.TextView>(R.id.detailOverview).text = service.overview
        
        val dialog = MaterialAlertDialogBuilder(this)
            .setView(dialogView)
            .setPositiveButton(getString(R.string.close), null)
            .create()
        
        dialogView.findViewById<com.google.android.material.button.MaterialButton>(R.id.getStartedButton)
            .setOnClickListener {
                contactUs(service.title)
                dialog.dismiss()
            }
        
        dialog.show()
    }
    
    private fun showSettingsDialog() {
        val dialogView = layoutInflater.inflate(R.layout.fragment_settings, null)
        
        val compactViewSwitch = dialogView.findViewById<com.google.android.material.switchmaterial.SwitchMaterial>(R.id.compactViewSwitch)
        val showDescriptionsSwitch = dialogView.findViewById<com.google.android.material.switchmaterial.SwitchMaterial>(R.id.showDescriptionsSwitch)
        val themeRadioGroup = dialogView.findViewById<android.widget.RadioGroup>(R.id.themeRadioGroup)
        val phoneTextView = dialogView.findViewById<android.widget.TextView>(R.id.phoneTextView)
        val emailTextView = dialogView.findViewById<android.widget.TextView>(R.id.emailTextView)
        val apiKeyButton = dialogView.findViewById<android.widget.Button>(R.id.apiKeyButton)
        
        // Load current preferences
        compactViewSwitch.isChecked = sharedPreferences.getBoolean("compact_view", false)
        showDescriptionsSwitch.isChecked = sharedPreferences.getBoolean("show_descriptions", true)
        
        val currentTheme = sharedPreferences.getString("theme", "light") ?: "light"
        when (currentTheme) {
            "light" -> dialogView.findViewById<com.google.android.material.radio.MaterialRadioButton>(R.id.themeLight).isChecked = true
            "dark" -> dialogView.findViewById<com.google.android.material.radio.MaterialRadioButton>(R.id.themeDark).isChecked = true
            "auto" -> dialogView.findViewById<com.google.android.material.radio.MaterialRadioButton>(R.id.themeAuto).isChecked = true
        }
        
        // Phone click
        phoneTextView.setOnClickListener {
            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${getString(R.string.phone_number)}"))
            startActivity(intent)
        }
        
        // Email click
        emailTextView.setOnClickListener {
            val intent = Intent(Intent.ACTION_SENDTO).apply {
                data = Uri.parse("mailto:")
                putExtra(Intent.EXTRA_EMAIL, arrayOf(getString(R.string.email)))
                putExtra(Intent.EXTRA_SUBJECT, "Business Inquiry")
            }
            startActivity(Intent.createChooser(intent, "Send Email"))
        }
        
        // API Key button
        apiKeyButton?.setOnClickListener {
            showApiKeyDialog()
        }
        
        val dialog = MaterialAlertDialogBuilder(this)
            .setTitle(getString(R.string.settings))
            .setView(dialogView)
            .setPositiveButton(getString(R.string.close), null)
            .create()
        
        // Save preferences
        compactViewSwitch.setOnCheckedChangeListener { _, isChecked ->
            sharedPreferences.edit().putBoolean("compact_view", isChecked).apply()
            adapter.notifyDataSetChanged()
        }
        
        showDescriptionsSwitch.setOnCheckedChangeListener { _, isChecked ->
            sharedPreferences.edit().putBoolean("show_descriptions", isChecked).apply()
            adapter.notifyDataSetChanged()
        }
        
        themeRadioGroup.setOnCheckedChangeListener { _, checkedId ->
            val theme = when (checkedId) {
                R.id.themeLight -> "light"
                R.id.themeDark -> "dark"
                R.id.themeAuto -> "auto"
                else -> "light"
            }
            sharedPreferences.edit().putString("theme", theme).apply()
            applyTheme(theme)
        }
        
        dialog.show()
    }
    
    private fun loadPreferences() {
        val theme = sharedPreferences.getString("theme", "light") ?: "light"
        applyTheme(theme)
    }
    
    private fun applyTheme(theme: String) {
        when (theme) {
            "light" -> AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO)
            "dark" -> AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_YES)
            "auto" -> AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM)
        }
    }
    
    private fun contactUs(serviceName: String) {
        val subject = "Inquiry about $serviceName"
        val body = "Hello,\n\nI'm interested in learning more about your $serviceName service.\n\nPlease contact me at your earliest convenience.\n\nThank you!"
        
        val intent = Intent(Intent.ACTION_SENDTO).apply {
            data = Uri.parse("mailto:")
            putExtra(Intent.EXTRA_EMAIL, arrayOf(getString(R.string.email)))
            putExtra(Intent.EXTRA_SUBJECT, subject)
            putExtra(Intent.EXTRA_TEXT, body)
        }
        startActivity(Intent.createChooser(intent, "Send Email"))
    }
}
