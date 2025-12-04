# H&M Herbs & Vitamins - Modern E-commerce Website

A comprehensive redesign of the HM Herbs website featuring modern design, full accessibility compliance, and GDPR/CCPA privacy compliance.

## 🌟 Features

### Modern Design & User Experience
- **Botanical Design System**: Professional green color palette with botanical themes
- **Responsive Design**: Mobile-first approach that works on all devices
- **Modern Typography**: Inter and Playfair Display fonts for readability and elegance
- **Smooth Animations**: CSS transitions with respect for `prefers-reduced-motion`
- **Interactive Elements**: Hover effects, smooth scrolling, and engaging micro-interactions

### Accessibility Compliance (WCAG 2.1 AA)
- **Screen Reader Support**: Proper ARIA labels, landmarks, and live regions
- **Keyboard Navigation**: Full keyboard accessibility with visible focus indicators
- **Color Contrast**: WCAG AA compliant color combinations
- **Skip Links**: Navigation shortcuts for screen reader users
- **Semantic HTML**: Proper heading hierarchy and semantic markup
- **Alternative Text**: Descriptive alt text for all images
- **Focus Management**: Proper focus handling for modals and interactive elements

### Privacy Compliance
- **GDPR Compliance**: Cookie consent management, data subject rights, privacy by design
- **CCPA Compliance**: California privacy rights, opt-out mechanisms, data transparency
- **Cookie Management**: Granular cookie controls with essential, analytics, and marketing categories
- **Privacy Policy**: Comprehensive privacy documentation
- **Data Rights**: User-friendly interfaces for data access, deletion, and portability

### E-commerce Functionality
- **Product Catalog**: Featured products and bestsellers from original HM Herbs inventory
- **Shopping Cart**: Persistent cart with localStorage, quantity management
- **Search Functionality**: Product search with real-time results
- **Product Categories**: Organized by herbs, vitamins, women's health, pet health
- **Mobile Commerce**: Touch-friendly interface optimized for mobile shopping

## 🏗️ Architecture

### File Structure
```
├── index.html                 # Main homepage
├── styles.css                 # Complete CSS design system
├── script.js                  # Main application JavaScript
├── gdpr-compliance.js         # GDPR compliance system
├── privacy-policy.html        # Privacy policy page (coming soon)
├── ccpa-privacy-rights.html   # CCPA rights page (coming soon)
└── README.md                  # This documentation
```

### Design System
- **CSS Custom Properties**: Consistent design tokens for colors, spacing, typography
- **Component-Based**: Reusable CSS components for buttons, cards, modals
- **Utility Classes**: Helper classes for common styling needs
- **Responsive Grid**: CSS Grid and Flexbox for modern layouts

### JavaScript Architecture
- **Class-Based**: Modern ES6+ classes for organized code structure
- **Event-Driven**: Proper event handling with accessibility considerations
- **Local Storage**: Persistent data storage for cart and preferences
- **Modular Design**: Separate modules for different functionality areas

## 🎨 Design System

### Colors (WCAG AA Compliant)
- **Primary Green**: `#2d5a27` - Main brand color
- **Secondary Sage**: `#87a96b` - Complementary green
- **Accent Gold**: `#d4af37` - Highlight color
- **Neutral Grays**: Full spectrum from `#f9fafb` to `#111827`

### Typography
- **Primary Font**: Inter - Clean, modern sans-serif
- **Display Font**: Playfair Display - Elegant serif for headings
- **Font Sizes**: Responsive scale from 0.75rem to 3rem

### Spacing System
- **Consistent Scale**: 0.25rem to 5rem in logical increments
- **Responsive**: Adapts to different screen sizes
- **Semantic**: Meaningful spacing relationships

## 🔒 Privacy & Compliance

### GDPR Features
- **Cookie Consent Banner**: Granular consent with essential, analytics, and marketing categories
- **Privacy Rights**: Data access, portability, deletion, and correction
- **Consent Management**: Persistent consent storage with expiration
- **Data Minimization**: Only collect necessary data
- **Transparency**: Clear privacy policy and data usage explanations

### CCPA Features (Coming Soon)
- **California Resident Detection**: Automatic detection with manual override
- **Opt-Out Rights**: "Do Not Sell My Personal Information" functionality
- **Data Categories**: Clear explanation of collected information types
- **Request Management**: User-friendly data access and deletion requests
- **Non-Discrimination**: Equal service regardless of privacy choices

## 🛍️ E-commerce Features

### Product Management
- **Product Catalog**: Based on original HM Herbs inventory
- **Categories**: Herbs, vitamins, supplements, women's health, pet health
- **Search**: Real-time product search with filtering
- **Inventory Status**: Stock level indicators

### Shopping Experience
- **Responsive Cart**: Slide-out cart with quantity management
- **Persistent Storage**: Cart persists across browser sessions
- **Product Variants**: Support for different sizes and options
- **Price Calculation**: Real-time total calculation

### User Interface
- **Mobile-First**: Optimized for mobile shopping
- **Touch-Friendly**: Large touch targets and gestures
- **Loading States**: Visual feedback for user actions
- **Error Handling**: Graceful error messages and recovery

## 📱 Responsive Design

### Breakpoints
- **Mobile**: < 768px - Single column, touch-optimized
- **Tablet**: 768px - 1024px - Two-column layouts
- **Desktop**: > 1024px - Full three-column layouts

### Mobile Optimizations
- **Touch Targets**: Minimum 44px for accessibility
- **Thumb-Friendly**: Important actions within thumb reach
- **Simplified Navigation**: Collapsible mobile menu
- **Optimized Images**: Responsive images with lazy loading

## 🚀 Performance

### Optimization Features
- **Lazy Loading**: Images load as needed
- **Efficient CSS**: Minimal unused styles
- **Compressed Assets**: Optimized images and fonts
- **Caching Strategy**: Proper cache headers for static assets

### Loading Performance
- **Critical CSS**: Above-the-fold styles prioritized
- **Font Loading**: Optimized web font loading
- **JavaScript Splitting**: Modular loading where beneficial
- **Image Optimization**: WebP format with fallbacks

## 🔧 Development

### Prerequisites
- Modern web browser
- Local web server (optional, for development)
- Text editor with HTML/CSS/JS support

### Getting Started
1. Clone or download the repository
2. Open `index.html` in a web browser
3. For development, use a local server (e.g., Live Server extension)

### Customization
- **Colors**: Modify CSS custom properties in `:root`
- **Products**: Update the products array in `script.js`
- **Content**: Edit HTML files for text and structure changes
- **Styling**: Modify `styles.css` for design changes

## 📋 Compliance Checklist

### WCAG 2.1 AA Compliance
- ✅ Color contrast ratios meet AA standards
- ✅ All images have descriptive alt text
- ✅ Proper heading hierarchy (h1-h6)
- ✅ Keyboard navigation support
- ✅ Screen reader compatibility
- ✅ Focus indicators visible
- ✅ Form labels properly associated
- ✅ ARIA landmarks and labels

### GDPR Compliance
- ✅ Cookie consent banner
- ✅ Granular consent options
- ✅ Privacy policy (coming soon)
- ✅ Data subject rights
- ✅ Consent withdrawal
- ✅ Data portability
- ✅ Right to deletion
- ✅ Lawful basis documentation

### CCPA Compliance (Coming Soon)
- 🔄 California resident detection
- 🔄 "Do Not Sell" opt-out
- 🔄 Data category disclosure
- 🔄 Consumer rights explanation
- 🔄 Non-discrimination policy
- 🔄 Request verification process
- 🔄 45-day response timeline
- 🔄 Authorized agent support

## 🌐 Browser Support

### Fully Supported
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Graceful Degradation
- Internet Explorer 11 (basic functionality)
- Older mobile browsers (core features)

## 📞 Support & Contact

For questions about this redesign or implementation:

- **Technical Issues**: Check browser console for errors
- **Accessibility**: Test with screen readers and keyboard navigation
- **Privacy Compliance**: Review privacy policy and compliance documentation
- **Customization**: Modify CSS custom properties and JavaScript configuration

## 📄 License

This redesign is created for H&M Herbs & Vitamins. The code structure and compliance systems can be adapted for other projects with proper attribution.

---

**Built with ❤️ for accessibility, privacy, and user experience**

This redesign transforms the original HM Herbs website into a modern, compliant, and user-friendly e-commerce platform that respects user privacy while providing an excellent shopping experience across all devices.
