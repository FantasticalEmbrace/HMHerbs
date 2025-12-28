package com.businessone.menu

import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Query

interface ApiService {
    @GET("api/menu")
    suspend fun getMenu(
        @Header("X-API-Key") apiKey: String,
        @Query("format") format: String = "json"
    ): Response<MenuResponse>
    
    @GET("api/menu/items")
    suspend fun getMenuItems(
        @Header("X-API-Key") apiKey: String,
        @Query("category") category: String? = null
    ): Response<MenuItemsResponse>
}

data class MenuResponse(
    val success: Boolean,
    val menu: MenuData?,
    val message: String?
)

data class MenuData(
    val id: String,
    val name: String,
    val categories: List<MenuCategory>?
)

data class MenuCategory(
    val id: String,
    val name: String,
    val items: List<MenuItem>?
)

data class MenuItem(
    val id: String,
    val name: String,
    val description: String?,
    val price: String?,
    val imageUrl: String?,
    val category: String?
)

data class MenuItemsResponse(
    val success: Boolean,
    val items: List<MenuItem>?,
    val message: String?
)

