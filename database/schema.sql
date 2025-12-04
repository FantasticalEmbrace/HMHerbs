-- H&M Herbs & Vitamins - Complete E-commerce Database Schema
-- Designed to handle 10,000+ products with dual categorization (health conditions + brands)

-- Users table for customer accounts
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    date_of_birth DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    email_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP NULL,
    INDEX idx_email (email),
    INDEX idx_created_at (created_at)
);

-- User addresses for shipping/billing
CREATE TABLE user_addresses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    type ENUM('shipping', 'billing') NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    company VARCHAR(100),
    address_line_1 VARCHAR(255) NOT NULL,
    address_line_2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    country VARCHAR(100) NOT NULL DEFAULT 'United States',
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_type (type)
);

-- Health condition categories (Blood Pressure, Heart Health, etc.)
CREATE TABLE health_categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    image_url VARCHAR(500),
    meta_title VARCHAR(255),
    meta_description TEXT,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_slug (slug),
    INDEX idx_sort_order (sort_order)
);

-- Product brands
CREATE TABLE brands (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    logo_url VARCHAR(500),
    website_url VARCHAR(500),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_slug (slug),
    INDEX idx_name (name)
);

-- Product categories (traditional categories like Vitamins, Herbs, etc.)
CREATE TABLE product_categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    parent_id INT NULL,
    description TEXT,
    image_url VARCHAR(500),
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES product_categories(id) ON DELETE SET NULL,
    INDEX idx_slug (slug),
    INDEX idx_parent_id (parent_id),
    INDEX idx_sort_order (sort_order)
);

-- Main products table
CREATE TABLE products (
    id INT PRIMARY KEY AUTO_INCREMENT,
    sku VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    short_description TEXT,
    long_description LONGTEXT,
    brand_id INT NOT NULL,
    category_id INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    compare_price DECIMAL(10,2) NULL,
    cost_price DECIMAL(10,2) NULL,
    weight DECIMAL(8,2),
    weight_unit ENUM('oz', 'lb', 'g', 'kg') DEFAULT 'oz',
    dimensions_length DECIMAL(8,2),
    dimensions_width DECIMAL(8,2),
    dimensions_height DECIMAL(8,2),
    dimension_unit ENUM('in', 'cm') DEFAULT 'in',
    requires_shipping BOOLEAN DEFAULT TRUE,
    is_taxable BOOLEAN DEFAULT TRUE,
    track_inventory BOOLEAN DEFAULT TRUE,
    inventory_quantity INT DEFAULT 0,
    low_stock_threshold INT DEFAULT 10,
    allow_backorder BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    meta_title VARCHAR(255),
    meta_description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (brand_id) REFERENCES brands(id),
    FOREIGN KEY (category_id) REFERENCES product_categories(id),
    INDEX idx_sku (sku),
    INDEX idx_slug (slug),
    INDEX idx_brand_id (brand_id),
    INDEX idx_category_id (category_id),
    INDEX idx_is_active (is_active),
    INDEX idx_is_featured (is_featured),
    INDEX idx_price (price),
    FULLTEXT idx_search (name, short_description, long_description)
);

-- Product images
CREATE TABLE product_images (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    image_url VARCHAR(500) NOT NULL,
    alt_text VARCHAR(255),
    sort_order INT DEFAULT 0,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    INDEX idx_product_id (product_id),
    INDEX idx_sort_order (sort_order)
);

-- Product variants (different sizes, formulations, etc.)
CREATE TABLE product_variants (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    sku VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    compare_price DECIMAL(10,2) NULL,
    inventory_quantity INT DEFAULT 0,
    weight DECIMAL(8,2),
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    INDEX idx_product_id (product_id),
    INDEX idx_sku (sku),
    INDEX idx_sort_order (sort_order)
);

-- Junction table for products and health categories (many-to-many)
CREATE TABLE product_health_categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    health_category_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (health_category_id) REFERENCES health_categories(id) ON DELETE CASCADE,
    UNIQUE KEY unique_product_health_category (product_id, health_category_id),
    INDEX idx_product_id (product_id),
    INDEX idx_health_category_id (health_category_id)
);

-- Shopping carts
CREATE TABLE shopping_carts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NULL,
    session_id VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_session_id (session_id),
    INDEX idx_updated_at (updated_at)
);

-- Shopping cart items
CREATE TABLE cart_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    cart_id INT NOT NULL,
    product_id INT NOT NULL,
    variant_id INT NULL,
    quantity INT NOT NULL DEFAULT 1,
    price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (cart_id) REFERENCES shopping_carts(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    INDEX idx_cart_id (cart_id),
    INDEX idx_product_id (product_id)
);

-- Orders
CREATE TABLE orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    user_id INT NULL,
    email VARCHAR(255) NOT NULL,
    status ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded') DEFAULT 'pending',
    payment_status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
    fulfillment_status ENUM('unfulfilled', 'partial', 'fulfilled') DEFAULT 'unfulfilled',
    
    -- Pricing
    subtotal DECIMAL(10,2) NOT NULL,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    shipping_amount DECIMAL(10,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,
    
    -- Shipping address
    shipping_first_name VARCHAR(100),
    shipping_last_name VARCHAR(100),
    shipping_company VARCHAR(100),
    shipping_address_line_1 VARCHAR(255),
    shipping_address_line_2 VARCHAR(255),
    shipping_city VARCHAR(100),
    shipping_state VARCHAR(100),
    shipping_postal_code VARCHAR(20),
    shipping_country VARCHAR(100),
    
    -- Billing address
    billing_first_name VARCHAR(100),
    billing_last_name VARCHAR(100),
    billing_company VARCHAR(100),
    billing_address_line_1 VARCHAR(255),
    billing_address_line_2 VARCHAR(255),
    billing_city VARCHAR(100),
    billing_state VARCHAR(100),
    billing_postal_code VARCHAR(20),
    billing_country VARCHAR(100),
    
    -- Tracking
    tracking_number VARCHAR(255),
    tracking_url VARCHAR(500),
    shipped_at TIMESTAMP NULL,
    delivered_at TIMESTAMP NULL,
    
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_order_number (order_number),
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    INDEX idx_email (email)
);

-- Order items
CREATE TABLE order_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    variant_id INT NULL,
    product_name VARCHAR(255) NOT NULL,
    product_sku VARCHAR(100) NOT NULL,
    variant_name VARCHAR(255),
    quantity INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (variant_id) REFERENCES product_variants(id),
    INDEX idx_order_id (order_id),
    INDEX idx_product_id (product_id)
);

-- EDSA (Electro Dermal Stress Analysis) service bookings
CREATE TABLE edsa_bookings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    preferred_date DATE NOT NULL,
    preferred_time TIME NOT NULL,
    alternative_date DATE,
    alternative_time TIME,
    status ENUM('pending', 'confirmed', 'completed', 'cancelled') DEFAULT 'pending',
    notes TEXT,
    admin_notes TEXT,
    confirmed_date DATE,
    confirmed_time TIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_preferred_date (preferred_date),
    INDEX idx_email (email)
);

-- Wishlists
CREATE TABLE wishlists (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_product (user_id, product_id),
    INDEX idx_user_id (user_id),
    INDEX idx_product_id (product_id)
);

-- Product reviews
CREATE TABLE product_reviews (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    user_id INT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(255),
    review_text TEXT,
    is_verified_purchase BOOLEAN DEFAULT FALSE,
    is_approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_product_id (product_id),
    INDEX idx_user_id (user_id),
    INDEX idx_rating (rating),
    INDEX idx_is_approved (is_approved)
);

-- Admin users
CREATE TABLE admin_users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role ENUM('super_admin', 'admin', 'manager', 'staff') DEFAULT 'staff',
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_role (role)
);

-- System settings
CREATE TABLE settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    key_name VARCHAR(100) UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    type ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_key_name (key_name)
);

-- Email templates
CREATE TABLE email_templates (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) UNIQUE NOT NULL,
    subject VARCHAR(255) NOT NULL,
    html_content LONGTEXT NOT NULL,
    text_content LONGTEXT,
    variables JSON,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name)
);

-- Inventory transactions log
CREATE TABLE inventory_transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    variant_id INT NULL,
    type ENUM('sale', 'restock', 'adjustment', 'return') NOT NULL,
    quantity_change INT NOT NULL,
    quantity_after INT NOT NULL,
    reference_type ENUM('order', 'manual', 'import') NOT NULL,
    reference_id INT NULL,
    notes TEXT,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (variant_id) REFERENCES product_variants(id),
    FOREIGN KEY (created_by) REFERENCES admin_users(id),
    INDEX idx_product_id (product_id),
    INDEX idx_type (type),
    INDEX idx_created_at (created_at)
);

-- Vendor Management System
CREATE TABLE vendors (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    contact_person VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    website VARCHAR(255),
    
    -- Address Information
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'United States',
    
    -- Business Information
    tax_id VARCHAR(50),
    business_license VARCHAR(100),
    payment_terms ENUM('net_15', 'net_30', 'net_45', 'net_60', 'cod', 'prepaid') DEFAULT 'net_30',
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Integration Settings
    catalog_url VARCHAR(500),
    catalog_format ENUM('csv', 'xml', 'json', 'api') DEFAULT 'csv',
    catalog_auth_type ENUM('none', 'basic', 'bearer', 'api_key') DEFAULT 'none',
    catalog_auth_credentials JSON,
    auto_sync_enabled BOOLEAN DEFAULT FALSE,
    sync_frequency ENUM('hourly', 'daily', 'weekly', 'manual') DEFAULT 'daily',
    
    -- Status and Tracking
    status ENUM('active', 'inactive', 'pending', 'suspended') DEFAULT 'pending',
    rating DECIMAL(3,2) DEFAULT 0.00,
    total_products INT DEFAULT 0,
    last_catalog_sync TIMESTAMP NULL,
    
    -- Audit Fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by INT,
    
    FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    INDEX idx_name (name),
    INDEX idx_status (status),
    INDEX idx_email (email)
);

-- Vendor Catalog Import History
CREATE TABLE vendor_catalog_imports (
    id INT PRIMARY KEY AUTO_INCREMENT,
    vendor_id INT NOT NULL,
    import_type ENUM('manual', 'scheduled', 'webhook') DEFAULT 'manual',
    status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
    
    -- Import Statistics
    total_records INT DEFAULT 0,
    processed_records INT DEFAULT 0,
    new_products INT DEFAULT 0,
    updated_products INT DEFAULT 0,
    failed_records INT DEFAULT 0,
    
    -- File Information
    source_file VARCHAR(255),
    file_size INT,
    
    -- Results and Errors
    import_log TEXT,
    error_details JSON,
    
    -- Timing
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
    INDEX idx_vendor_id (vendor_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);

-- Vendor Product Mapping
CREATE TABLE vendor_products (
    id INT PRIMARY KEY AUTO_INCREMENT,
    vendor_id INT NOT NULL,
    product_id INT NOT NULL,
    vendor_sku VARCHAR(255),
    vendor_name VARCHAR(500),
    vendor_price DECIMAL(10,2),
    vendor_cost DECIMAL(10,2),
    minimum_order_quantity INT DEFAULT 1,
    lead_time_days INT DEFAULT 0,
    
    -- Mapping Status
    mapping_status ENUM('mapped', 'unmapped', 'conflict', 'discontinued') DEFAULT 'mapped',
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE KEY unique_vendor_product (vendor_id, product_id),
    INDEX idx_vendor_sku (vendor_sku),
    INDEX idx_mapping_status (mapping_status)
);

-- POS System Integration
CREATE TABLE pos_systems (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    system_type ENUM('square', 'shopify_pos', 'lightspeed', 'toast', 'clover', 'custom') NOT NULL,
    
    -- Connection Settings
    api_endpoint VARCHAR(500),
    api_version VARCHAR(50),
    auth_type ENUM('oauth', 'api_key', 'basic', 'bearer') DEFAULT 'api_key',
    auth_credentials JSON,
    
    -- Sync Configuration
    sync_inventory BOOLEAN DEFAULT TRUE,
    sync_orders BOOLEAN DEFAULT TRUE,
    sync_customers BOOLEAN DEFAULT FALSE,
    sync_frequency ENUM('real_time', 'every_5min', 'hourly', 'daily') DEFAULT 'hourly',
    
    -- Status
    status ENUM('active', 'inactive', 'error', 'testing') DEFAULT 'testing',
    last_sync TIMESTAMP NULL,
    last_error TEXT,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by INT,
    
    FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    INDEX idx_system_type (system_type),
    INDEX idx_status (status)
);

-- POS Transaction Log
CREATE TABLE pos_transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    pos_system_id INT NOT NULL,
    transaction_type ENUM('inventory_sync', 'order_sync', 'customer_sync', 'webhook') NOT NULL,
    direction ENUM('inbound', 'outbound') NOT NULL,
    
    -- Transaction Details
    external_id VARCHAR(255),
    entity_type ENUM('product', 'order', 'customer', 'inventory') NOT NULL,
    entity_id INT,
    
    -- Status and Results
    status ENUM('pending', 'processing', 'completed', 'failed', 'retrying') DEFAULT 'pending',
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    
    -- Data
    request_data JSON,
    response_data JSON,
    error_message TEXT,
    
    -- Timing
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,
    
    FOREIGN KEY (pos_system_id) REFERENCES pos_systems(id) ON DELETE CASCADE,
    INDEX idx_pos_system_id (pos_system_id),
    INDEX idx_transaction_type (transaction_type),
    INDEX idx_status (status),
    INDEX idx_external_id (external_id)
);

-- Gift Card System
CREATE TABLE gift_cards (
    id INT PRIMARY KEY AUTO_INCREMENT,
    card_number VARCHAR(50) UNIQUE NOT NULL,
    card_code VARCHAR(20) UNIQUE NOT NULL,
    
    -- Card Details
    initial_amount DECIMAL(10,2) NOT NULL,
    current_balance DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Status and Dates
    status ENUM('active', 'redeemed', 'expired', 'cancelled', 'suspended') DEFAULT 'active',
    issued_date DATE NOT NULL,
    expiry_date DATE,
    
    -- Purchase Information
    purchased_by_user_id INT NULL,
    purchased_by_email VARCHAR(255),
    purchase_order_id INT NULL,
    
    -- Recipient Information
    recipient_name VARCHAR(255),
    recipient_email VARCHAR(255),
    personal_message TEXT,
    
    -- Admin Information
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (purchased_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (purchase_order_id) REFERENCES orders(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    INDEX idx_card_number (card_number),
    INDEX idx_card_code (card_code),
    INDEX idx_status (status),
    INDEX idx_expiry_date (expiry_date)
);

-- Gift Card Transactions
CREATE TABLE gift_card_transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    gift_card_id INT NOT NULL,
    transaction_type ENUM('purchase', 'redemption', 'refund', 'adjustment', 'expiry') NOT NULL,
    
    -- Transaction Details
    amount DECIMAL(10,2) NOT NULL,
    balance_before DECIMAL(10,2) NOT NULL,
    balance_after DECIMAL(10,2) NOT NULL,
    
    -- Reference Information
    order_id INT NULL,
    user_id INT NULL,
    admin_id INT NULL,
    reference_number VARCHAR(100),
    notes TEXT,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (gift_card_id) REFERENCES gift_cards(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE SET NULL,
    INDEX idx_gift_card_id (gift_card_id),
    INDEX idx_transaction_type (transaction_type),
    INDEX idx_created_at (created_at)
);

-- Loyalty Programs
CREATE TABLE loyalty_programs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    program_type ENUM('points', 'cashback', 'tier_based', 'hybrid') DEFAULT 'points',
    
    -- Program Settings
    is_active BOOLEAN DEFAULT TRUE,
    auto_enrollment BOOLEAN DEFAULT TRUE,
    points_per_dollar DECIMAL(5,2) DEFAULT 1.00,
    dollar_per_point DECIMAL(5,4) DEFAULT 0.01,
    
    -- Tier Settings (for tier-based programs)
    enable_tiers BOOLEAN DEFAULT FALSE,
    tier_upgrade_threshold DECIMAL(10,2) DEFAULT 0.00,
    tier_downgrade_enabled BOOLEAN DEFAULT FALSE,
    
    -- Expiration Settings
    points_expire BOOLEAN DEFAULT FALSE,
    points_expiry_months INT DEFAULT 12,
    
    -- Minimum Redemption
    minimum_redemption_points INT DEFAULT 100,
    maximum_redemption_points INT DEFAULT 10000,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by INT,
    
    FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    INDEX idx_program_type (program_type),
    INDEX idx_is_active (is_active)
);

-- Loyalty Program Tiers
CREATE TABLE loyalty_tiers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    program_id INT NOT NULL,
    tier_name VARCHAR(100) NOT NULL,
    tier_level INT NOT NULL,
    
    -- Tier Requirements
    minimum_spend DECIMAL(10,2) DEFAULT 0.00,
    minimum_points INT DEFAULT 0,
    
    -- Tier Benefits
    points_multiplier DECIMAL(3,2) DEFAULT 1.00,
    discount_percentage DECIMAL(5,2) DEFAULT 0.00,
    free_shipping BOOLEAN DEFAULT FALSE,
    early_access BOOLEAN DEFAULT FALSE,
    
    -- Tier Colors/Branding
    tier_color VARCHAR(7) DEFAULT '#000000',
    tier_icon VARCHAR(50),
    
    FOREIGN KEY (program_id) REFERENCES loyalty_programs(id) ON DELETE CASCADE,
    UNIQUE KEY unique_program_tier (program_id, tier_level),
    INDEX idx_program_id (program_id)
);

-- Customer Loyalty Accounts
CREATE TABLE customer_loyalty (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    program_id INT NOT NULL,
    
    -- Current Status
    current_points INT DEFAULT 0,
    lifetime_points INT DEFAULT 0,
    current_tier_id INT NULL,
    tier_progress DECIMAL(5,2) DEFAULT 0.00,
    
    -- Statistics
    total_earned INT DEFAULT 0,
    total_redeemed INT DEFAULT 0,
    total_spent DECIMAL(10,2) DEFAULT 0.00,
    
    -- Dates
    enrolled_date DATE NOT NULL,
    last_activity_date DATE,
    tier_achieved_date DATE,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (program_id) REFERENCES loyalty_programs(id) ON DELETE CASCADE,
    FOREIGN KEY (current_tier_id) REFERENCES loyalty_tiers(id) ON DELETE SET NULL,
    UNIQUE KEY unique_user_program (user_id, program_id),
    INDEX idx_user_id (user_id),
    INDEX idx_program_id (program_id)
);

-- Loyalty Transactions
CREATE TABLE loyalty_transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    customer_loyalty_id INT NOT NULL,
    transaction_type ENUM('earn', 'redeem', 'expire', 'adjustment', 'bonus', 'refund') NOT NULL,
    
    -- Transaction Details
    points_change INT NOT NULL,
    points_balance_before INT NOT NULL,
    points_balance_after INT NOT NULL,
    
    -- Reference Information
    order_id INT NULL,
    admin_id INT NULL,
    reference_number VARCHAR(100),
    description TEXT,
    
    -- Expiration (for earned points)
    expires_at DATE NULL,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (customer_loyalty_id) REFERENCES customer_loyalty(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE SET NULL,
    INDEX idx_customer_loyalty_id (customer_loyalty_id),
    INDEX idx_transaction_type (transaction_type),
    INDEX idx_expires_at (expires_at),
    INDEX idx_created_at (created_at)
);
