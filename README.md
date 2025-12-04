# H&M Herbs & Vitamins - E-Commerce Platform

A comprehensive e-commerce platform for H&M Herbs & Vitamins, featuring a modern frontend with advanced backend integration for inventory management, POS systems, and customer analytics.

## 🚨 VS Code Loading Issue - SOLUTION

If you're experiencing loading issues in VS Code, this has been resolved! The project now includes:

- ✅ **Root-level `package.json`** - VS Code workspace configuration
- ✅ **`.gitignore`** - Proper file exclusions
- ✅ **VS Code settings** - Optimized editor configuration
- ✅ **Workspace file** - Multi-folder project structure support

### 🔧 How to Open in VS Code:

**Option 1: Open the workspace file (RECOMMENDED)**
```bash
code hmherbs.code-workspace
```

**Option 2: Open the root directory**
```bash
code .
```

The workspace file provides the best experience with separate frontend and backend folders.

## 🌟 Key Features

### Complete E-commerce Platform
- **10,000+ Products**: Scalable architecture to handle massive product catalog
- **Dual Categorization**: Products organized by health conditions AND brands
- **Customer Portal**: Complete user accounts with order history and tracking
- **EDSA Service**: Electro Dermal Stress Analysis booking system prominently featured
- **Modern Architecture**: Node.js/Express backend with MySQL database

### Health Condition Organization
- **Blood Pressure**: Natural supplements for cardiovascular health
- **Heart Health**: Comprehensive heart support products
- **Allergies**: Natural allergy relief and immune support
- **Digestive Health**: Enzymes, probiotics, and gut health
- **Joint & Arthritis**: Mobility and joint comfort solutions
- **Women's Health**: Specialized formulations for women
- **Men's Health**: Targeted men's wellness products
- **Pet Health**: Natural products for cats and dogs
- **20+ Categories**: Complete health condition coverage

### Brand Organization
- **Standard Enzyme**: Professional-grade enzyme supplements
- **Nature's Plus**: Premium natural vitamins
- **Global Healing**: Organic health products
- **Host Defence**: Mushroom-based immune support
- **Terry Naturally**: Clinically studied formulations
- **15+ Brands**: Trusted manufacturers and suppliers

### EDSA Service Integration
- **Prominent Placement**: Featured in navigation and hero section
- **Professional Service**: $75 per session health analysis
- **Booking System**: Complete appointment scheduling
- **Availability Checking**: Real-time slot management
- **Customer Portal**: Booking history and management

## 🏗️ Architecture

### Backend (Node.js/Express)
```
backend/
├── server.js                 # Main API server
├── routes/
│   ├── cart.js              # Shopping cart management
│   └── edsa.js              # EDSA service booking
├── package.json             # Dependencies and scripts
└── .env.example            # Environment configuration
```

### Database (MySQL)
```
database/
├── schema.sql              # Complete database schema
└── seed-data.sql          # Initial data with 20+ products
```

### Frontend (Modern JavaScript)
```
├── index.html              # Main application
├── styles.css              # Complete design system
├── script.js               # Frontend application
└── gdpr-compliance.js      # Privacy compliance
```

## 🗄️ Database Schema

### Core Tables
- **users**: Customer accounts with authentication
- **user_addresses**: Shipping and billing addresses
- **products**: 10,000+ product catalog
- **brands**: Brand information and descriptions
- **health_categories**: Health condition categories
- **product_health_categories**: Many-to-many relationships

### E-commerce Tables
- **shopping_carts**: User and session-based carts
- **cart_items**: Shopping cart item management
- **orders**: Complete order processing
- **order_items**: Order line items with pricing

### EDSA Service Tables
- **edsa_bookings**: Appointment scheduling system
- **settings**: System configuration
- **email_templates**: Automated communications

## 🛍️ E-commerce Features

### Customer Portal
- **User Registration**: Secure account creation
- **Authentication**: JWT-based login system
- **Order History**: Complete purchase tracking
- **Address Management**: Multiple shipping/billing addresses
- **EDSA Bookings**: Service appointment management

### Shopping Experience
- **Advanced Search**: Filter by health condition, brand, price
- **Product Variants**: Multiple sizes and formulations
- **Inventory Management**: Real-time stock tracking
- **Shopping Cart**: Persistent cart with quantity management
- **Checkout Process**: Streamlined purchase flow

### Product Management
- **Dual Categorization**: Health conditions + brands
- **Rich Product Data**: Descriptions, images, variants
- **Inventory Tracking**: Stock levels and low stock alerts
- **Pricing Management**: Regular and compare pricing
- **SEO Optimization**: Product URLs and meta data

## 🏥 EDSA Service Features

### Service Information
- **Professional Description**: Non-invasive health assessment
- **Pricing**: $75.00 per session
- **Service Features**: Stress analysis, professional consultation
- **Prominent Placement**: Featured throughout the site

### Booking System
- **Appointment Scheduling**: Date and time selection
- **Availability Checking**: Real-time slot management
- **Alternative Times**: Backup appointment options
- **Conflict Prevention**: Automatic double-booking prevention
- **Customer Management**: Booking history and status tracking

### Business Hours
- **Operating Hours**: 9 AM to 5 PM (configurable)
- **Hourly Slots**: Professional appointment scheduling
- **Status Tracking**: Pending, confirmed, completed, cancelled
- **Admin Management**: Backend appointment oversight

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login

### Products
- `GET /api/products` - Product listing with filters
- `GET /api/products/:slug` - Single product details
- `GET /api/health-categories` - Health condition categories
- `GET /api/brands` - Brand information

### Shopping Cart
- `GET /api/cart` - Get cart contents
- `POST /api/cart/add` - Add item to cart
- `PUT /api/cart/items/:id` - Update cart item
- `DELETE /api/cart/items/:id` - Remove cart item

### EDSA Service
- `GET /api/edsa/info` - Service information
- `POST /api/edsa/book` - Book appointment
- `GET /api/edsa/bookings` - User's bookings
- `GET /api/edsa/availability/:date` - Check availability

## 🚀 Getting Started

### Prerequisites
- Node.js 16+
- MySQL 8.0+
- Modern web browser

### Backend Setup
```bash
cd backend
npm install
cp .env.example .env
# Configure database settings in .env
npm run migrate  # Run database migrations
npm run seed     # Load initial data
npm run dev      # Start development server
```

### Database Setup
```sql
-- Create database
CREATE DATABASE hmherbs;

-- Run schema
mysql -u root -p hmherbs < database/schema.sql

-- Load seed data
mysql -u root -p hmherbs < database/seed-data.sql
```

### Frontend Setup
```bash
# Serve frontend files
# Use Live Server extension in VS Code
# Or any static file server
```

## 📊 Sample Data

### Health Categories (20)
- Blood Pressure, Heart Health, Allergies
- Digestive Health, Joint & Arthritis, Immune Support
- Stress & Anxiety, Sleep Support, Energy & Vitality
- Brain Health, Women's Health, Men's Health
- Pet Health, Weight Management, Skin Health
- Eye Health, Liver Support, Respiratory Health
- Bone Health, Anti-Aging

### Brands (15)
- Standard Enzyme, Nature's Plus, Global Healing
- Host Defence, HM Enterprise, Terry Naturally
- Unicity, Newton Labs, Regal Labs
- Doctors Blend, Miracle II, Herbs for Life
- AOR, Cardio Amaze, Life Extension

### Sample Products (20+)
- Terry Naturally Cura Med 375mg ($69.95)
- Unicity Aloe Vera 50 Capsules ($34.95)
- Newton Labs Allergies ($17.95)
- Regal Labs Cannabis Oil for Pets ($29.99)
- Advanced Blood Pressure Cherry ($32.95)
- Standard Enzyme Heart Formula ($71.50)
- Host Defense Chaga ($27.99)
- Global Healing Ashwagandha ($25.99)

## 🔒 Security Features

### Authentication
- **Bcrypt Hashing**: 12 salt rounds for passwords
- **JWT Tokens**: 7-day expiration
- **Rate Limiting**: 100 requests per 15 minutes
- **Input Validation**: Comprehensive data validation

### Data Protection
- **SQL Injection Prevention**: Parameterized queries
- **XSS Protection**: Helmet.js security headers
- **CORS Configuration**: Controlled cross-origin access
- **File Upload Security**: Type and size validation

## 📱 Responsive Design

### Mobile Optimization
- **Touch-Friendly**: Large touch targets
- **Mobile Navigation**: Collapsible menu
- **Optimized Images**: Responsive and lazy loading
- **Fast Loading**: Optimized for mobile networks

### Accessibility
- **WCAG 2.1 AA**: Full compliance
- **Screen Readers**: Proper ARIA labels
- **Keyboard Navigation**: Complete keyboard support
- **Focus Management**: Visible focus indicators

## 🔄 Development Workflow

### Backend Development
```bash
npm run dev      # Development server with auto-reload
npm test         # Run test suite
npm run migrate  # Database migrations
npm run seed     # Load sample data
```

### Database Management
- **Migrations**: Structured schema updates
- **Seeding**: Sample data for development
- **Indexing**: Optimized for 10,000+ products
- **Relationships**: Proper foreign key constraints

## 📈 Scalability Features

### Performance
- **Database Indexing**: Optimized queries
- **Connection Pooling**: Efficient database connections
- **Caching Strategy**: Static asset optimization
- **Pagination**: Efficient large dataset handling

### Architecture
- **Modular Design**: Separated concerns
- **API-First**: Frontend/backend separation
- **Microservice Ready**: Scalable architecture
- **Cloud Deployment**: Production-ready configuration

## 📞 Support & Deployment

### Production Deployment
- **Environment Variables**: Secure configuration
- **Database Optimization**: Production settings
- **SSL/HTTPS**: Secure communications
- **Monitoring**: Error tracking and logging

### Maintenance
- **Backup Strategy**: Database and file backups
- **Update Process**: Safe deployment procedures
- **Monitoring**: Performance and error tracking
- **Documentation**: Complete API documentation

---

**Built for Scale, Security, and User Experience**

This complete e-commerce platform transforms HM Herbs from a basic website into a modern, scalable platform capable of handling 10,000+ products with proper health condition categorization, brand organization, customer portal functionality, and prominent EDSA service integration.
