package com.businessone.menu

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.preference.PreferenceManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.card.MaterialCardView

class ServiceAdapter(
    private var services: List<Service>,
    private val onItemClick: (Service) -> Unit
) : RecyclerView.Adapter<ServiceAdapter.ServiceViewHolder>() {
    
    private var compactView = false
    private var showDescriptions = true
    
    fun updateServices(newServices: List<Service>) {
        services = newServices
        notifyDataSetChanged()
    }
    
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ServiceViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_service_card, parent, false)
        return ServiceViewHolder(view)
    }
    
    override fun onBindViewHolder(holder: ServiceViewHolder, position: Int) {
        val service = services[position]
        val context = holder.itemView.context
        val prefs = PreferenceManager.getDefaultSharedPreferences(context)
        
        compactView = prefs.getBoolean("compact_view", false)
        showDescriptions = prefs.getBoolean("show_descriptions", true)
        
        holder.bind(service, compactView, showDescriptions)
        holder.itemView.setOnClickListener {
            onItemClick(service)
        }
    }
    
    override fun getItemCount() = services.size
    
    class ServiceViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val icon: TextView = itemView.findViewById(R.id.serviceIcon)
        private val title: TextView = itemView.findViewById(R.id.serviceTitle)
        private val description: TextView = itemView.findViewById(R.id.serviceDescription)
        private val featuresContainer: View = itemView.findViewById(R.id.featuresContainer)
        private val card: MaterialCardView = itemView.findViewById(R.id.root)
        
        fun bind(service: Service, compactView: Boolean, showDescriptions: Boolean) {
            icon.text = service.icon
            title.text = service.title
            
            if (showDescriptions && !compactView) {
                description.text = service.description
                description.visibility = View.VISIBLE
            } else {
                description.visibility = View.GONE
            }
            
            if (compactView) {
                featuresContainer.visibility = View.GONE
            } else {
                featuresContainer.visibility = View.VISIBLE
            }
        }
    }
}

