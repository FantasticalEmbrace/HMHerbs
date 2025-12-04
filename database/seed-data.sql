-- H&M Herbs & Vitamins - Seed Data
-- Initial data for health categories, brands, and sample products

-- Insert health condition categories
INSERT INTO health_categories (name, slug, description, sort_order) VALUES
('Blood Pressure', 'blood-pressure', 'Natural supplements to support healthy blood pressure levels', 1),
('Heart Health', 'heart-health', 'Cardiovascular support and heart health supplements', 2),
('Allergies', 'allergies', 'Natural allergy relief and immune system support', 3),
('Digestive Health', 'digestive-health', 'Digestive enzymes, probiotics, and gut health support', 4),
('Joint & Arthritis', 'joint-arthritis', 'Joint support, arthritis relief, and mobility supplements', 5),
('Immune Support', 'immune-support', 'Immune system boosters and wellness supplements', 6),
('Stress & Anxiety', 'stress-anxiety', 'Natural stress relief and anxiety management', 7),
('Sleep Support', 'sleep-support', 'Natural sleep aids and relaxation supplements', 8),
('Energy & Vitality', 'energy-vitality', 'Energy boosters and vitality supplements', 9),
('Brain Health', 'brain-health', 'Cognitive support and brain health supplements', 10),
('Womens Health', 'womens-health', 'Specialized supplements for womens health needs', 11),
('Mens Health', 'mens-health', 'Specialized supplements for mens health needs', 12),
('Pet Health', 'pet-health', 'Natural health products for cats and dogs', 13),
('Weight Management', 'weight-management', 'Natural weight loss and metabolism support', 14),
('Skin Health', 'skin-health', 'Supplements and topicals for healthy skin', 15),
('Eye Health', 'eye-health', 'Vision support and eye health supplements', 16),
('Liver Support', 'liver-support', 'Liver detox and hepatic support supplements', 17),
('Respiratory Health', 'respiratory-health', 'Lung and respiratory system support', 18),
('Bone Health', 'bone-health', 'Calcium, vitamin D, and bone strength supplements', 19),
('Anti-Aging', 'anti-aging', 'Antioxidants and anti-aging supplements', 20);

-- Insert major brands
INSERT INTO brands (name, slug, description) VALUES
('Standard Enzyme', 'standard-enzyme', 'Professional-grade enzyme and nutritional supplements'),
('Natures Plus', 'natures-plus', 'Premium natural vitamins and supplements'),
('Global Healing', 'global-healing', 'Organic and natural health products'),
('Host Defence', 'host-defence', 'Mushroom-based immune support supplements'),
('HM Enterprise', 'hm-enterprise', 'H&M Herbs proprietary formulations and products'),
('Terry Naturally', 'terry-naturally', 'Clinically studied natural health products'),
('Unicity', 'unicity', 'Science-based nutritional supplements'),
('Newton Labs', 'newton-labs', 'Homeopathic remedies and natural medicines'),
('Regal Labs', 'regal-labs', 'Cannabis-based health and wellness products'),
('Doctors Blend', 'doctors-blend', 'Physician-formulated nutritional supplements'),
('Miracle II', 'miracle-ii', 'Natural personal care and wellness products'),
('Herbs for Life', 'herbs-for-life', 'Traditional herbal remedies and supplements'),
('Advanced Orthomolecular Research', 'aor', 'Research-based nutritional supplements'),
('Cardio Amaze', 'cardio-amaze', 'Cardiovascular health supplements'),
('Life Extension', 'life-extension', 'Anti-aging and longevity supplements');

-- Insert product categories
INSERT INTO product_categories (name, slug, description, sort_order) VALUES
('Vitamins', 'vitamins', 'Essential vitamins and vitamin complexes', 1),
('Minerals', 'minerals', 'Essential minerals and trace elements', 2),
('Herbs & Botanicals', 'herbs-botanicals', 'Traditional herbs and botanical extracts', 3),
('Enzymes', 'enzymes', 'Digestive and systemic enzymes', 4),
('Probiotics', 'probiotics', 'Beneficial bacteria for digestive health', 5),
('Amino Acids', 'amino-acids', 'Essential and non-essential amino acids', 6),
('Antioxidants', 'antioxidants', 'Free radical fighting compounds', 7),
('Essential Fatty Acids', 'essential-fatty-acids', 'Omega-3, omega-6, and other healthy fats', 8),
('Homeopathic', 'homeopathic', 'Homeopathic remedies and preparations', 9),
('Topical Products', 'topical-products', 'Creams, lotions, and topical applications', 10),
('Liquid Supplements', 'liquid-supplements', 'Liquid vitamins and supplements', 11),
('Capsules & Tablets', 'capsules-tablets', 'Traditional capsule and tablet supplements', 12),
('Powders', 'powders', 'Powder supplements and drink mixes', 13),
('Pet Supplements', 'pet-supplements', 'Health products for pets', 14),
('Specialty Formulas', 'specialty-formulas', 'Unique and specialized formulations', 15);

-- Insert sample products based on what we found on the original site
INSERT INTO products (sku, name, slug, short_description, long_description, brand_id, category_id, price, inventory_quantity, is_featured, is_active) VALUES
-- Terry Naturally products
('TN-CURA-375-120', 'Terry Naturally Cura Med 375mg 120SG', 'terry-naturally-cura-med-375mg-120sg', 'Premium curcumin supplement for joint health and inflammation support', 'Terry Naturally Cura Med provides highly bioavailable curcumin for superior absorption and effectiveness. Supports healthy inflammatory response and joint comfort.', 6, 3, 69.95, 25, 1, 1),

-- Unicity products
('UN-ALOE-50', 'Unicity Aloe Vera 50 Capsules', 'unicity-aloe-vera-50-capsules', 'Pure aloe vera capsules for digestive health and wellness', 'Unicity Aloe Vera capsules provide the soothing benefits of aloe vera in convenient capsule form. Supports digestive health and overall wellness.', 7, 3, 34.95, 40, 1, 1),

-- Newton Labs products
('NL-ALLERGIES-1OZ', 'Newton Labs Allergies', 'newton-labs-allergies', 'Natural homeopathic remedy for seasonal allergies', 'Newton Labs Allergies provides natural relief from seasonal allergy symptoms using homeopathic principles. Available in liquid and pellet forms.', 8, 9, 17.95, 30, 1, 1),

-- Regal Labs products
('RL-CANNABIS-PETS', 'REGALABS CANNABIS OIL FOR PETS', 'regalabs-cannabis-oil-for-pets', 'Organic cannabis oil with CBD for cats and dogs', 'REGALABS Cannabis Oil for Pets provides natural CBD support for your furry friends. Made with organic ingredients for safety and effectiveness.', 9, 14, 29.99, 15, 1, 1),

-- Advanced Blood Pressure products
('ABP-CHERRY', 'ADVANCED BLOOD PRESSURE CHERRY', 'advanced-blood-pressure-cherry', 'Natural cherry-flavored blood pressure support supplement', 'Advanced Blood Pressure Cherry combines natural ingredients to support healthy blood pressure levels with a delicious cherry flavor.', 14, 1, 32.95, 20, 1, 1),

-- Regal Labs topical products
('RL-CANNABIS-CARE-4OZ', 'REGAL LABS CANNABIS CARE TUBES Or JARS', 'regal-labs-cannabis-care-tubes-jars', 'Cannabis care cream for topical relief', 'REGAL LABS Cannabis Care provides targeted topical relief with natural cannabis-derived ingredients. Available in tubes and jars.', 9, 10, 25.49, 35, 1, 1),

-- HM Enterprise bestsellers
('HM-EVE-GEN-2OZ', 'EVES GENERATIONAL FORMULA', 'eves-generational-formula', 'Specialized womens health formula, 2 oz pump', 'Eves Generational Formula is a specialized blend designed to support womens health needs across all life stages. Easy-to-use pump dispenser.', 5, 11, 19.99, 50, 0, 1),

('HM-HAPPY-PMS-2OZ', 'HAPPY PMS CREAM JAR', 'happy-pms-cream-jar', 'Happy PMS progesterone body cream, 2oz jar', 'Happy PMS Cream provides natural support for womens monthly comfort with a gentle, effective topical formula.', 5, 11, 19.99, 45, 0, 1),

-- Standard Enzyme products
('SE-MALE-FORMULA-4OZ', 'STANDARD ENZYME MALE FORMULA', 'standard-enzyme-male-formula', 'Specialized enzyme formula for mens health', 'Standard Enzyme Male Formula provides targeted enzyme support specifically formulated for mens health needs.', 1, 12, 71.50, 12, 0, 1),

('SE-HEART-FORMULA-4OZ', 'STANDARD ENZYME HEART FORMULA', 'standard-enzyme-heart-formula', 'Premium enzyme formula for cardiovascular support', 'Standard Enzyme Heart Formula supports cardiovascular health with a blend of potent enzymes and nutrients.', 1, 2, 71.50, 18, 0, 1),

-- HM Enterprise topical products
('HM-EQUALIZER-UNSCENTED', 'EQUALIZER UNSCENTED', 'equalizer-unscented', 'Arthritis relief cream, unscented formula', 'Equalizer Unscented provides natural arthritis and joint pain relief without added fragrances.', 5, 10, 19.99, 30, 0, 1),

('HM-EQUALIZER-PEPPERMINT', 'EQUALIZER W/ PEPPERMINT', 'equalizer-with-peppermint', 'Arthritis relief cream with peppermint', 'Equalizer with Peppermint combines natural arthritis relief with the cooling sensation of peppermint.', 5, 10, 19.99, 25, 0, 1),

-- Host Defense products
('HD-CHAGA-60', 'HOST DEFENSE CHAGA', 'host-defense-chaga', 'Chaga mushroom immune support capsules', 'Host Defense Chaga provides powerful immune system support with organic chaga mushroom extract.', 4, 6, 27.99, 22, 0, 1),

('HD-CORDYCEPS-60', 'HOST DEFENSE CORDYCEPS', 'host-defense-cordyceps', 'Cordyceps mushroom energy and vitality support', 'Host Defense Cordyceps supports energy, stamina, and overall vitality with organic cordyceps mushroom.', 4, 9, 26.99, 28, 0, 1),

-- Global Healing products
('GH-ASHWAGANDHA', 'GLOBAL HEALING ASHWAGANDHA', 'global-healing-ashwagandha', 'Organic ashwagandha for stress support', 'Global Healing Ashwagandha provides natural stress relief and adaptogenic support with organic ashwagandha root.', 3, 7, 25.99, 35, 0, 1),

-- Doctors Blend products
('DB-CARDIO-911-CAPS', 'CARDIO 911 BEETS PLUS CAPSULES', 'cardio-911-beets-plus-capsules', 'Nitric oxide support with beets and nutrients', 'Cardio 911 Beets Plus provides cardiovascular support with nitric oxide boosting ingredients including organic beets.', 10, 2, 36.99, 20, 0, 1),

('DB-CARDIO-911-POWDER', 'CARDIO 911 POWDER', 'cardio-911-powder', 'Nitric oxide powder for heart health', 'Cardio 911 Powder delivers powerful cardiovascular support in convenient powder form for easy mixing.', 10, 13, 39.99, 15, 0, 1),

-- Mens health products
('MH-5DAY-FORECAST', '5 DAY FORECAST FOR MEN', '5-day-forecast-for-men', 'Specialized mens vitality formula', '5 Day Forecast for Men provides targeted support for mens energy, vitality, and overall wellness.', 5, 12, 27.95, 18, 0, 1),

('HM-ADAMS-PROSTATE', 'ADAMS PROSTATE CARE', 'adams-prostate-care', 'Prostate health support cream', 'Adams Prostate Care provides targeted topical support for mens prostate health and comfort.', 5, 12, 24.99, 22, 0, 1),

-- Natures Plus products
('NP-AGELOSS-EYE', 'NATURES PLUS AGELOSS EYE SUPPORT', 'natures-plus-ageloss-eye-support', 'Advanced eye health and vision support', 'Natures Plus AgeLoss Eye Support provides comprehensive nutrition for healthy vision and eye function.', 2, 16, 41.61, 15, 0, 1);

-- Insert product variants for products with multiple sizes/options
INSERT INTO product_variants (product_id, sku, name, price, inventory_quantity, sort_order) VALUES
-- Newton Labs Allergies variants
(3, 'NL-ALLERGIES-1OZ-LIQUID', '1oz Liquid', 17.95, 20, 1),
(3, 'NL-ALLERGIES-1OZ-DROPPER', '1oz Liquid W/Dropper', 18.95, 15, 2),
(3, 'NL-ALLERGIES-1OZ-PELLETS', '1oz Pellets', 20.95, 25, 3),

-- Regal Labs Cannabis Care variants
(6, 'RL-CANNABIS-4OZ-TUBE', '4oz Tube', 25.49, 20, 1),
(6, 'RL-CANNABIS-8OZ-TUBE', '8oz Tube', 38.95, 15, 2),
(6, 'RL-CANNABIS-4OZ-JAR', '4oz Jar', 25.49, 18, 3),
(6, 'RL-CANNABIS-8OZ-JAR', '8oz Jar', 38.95, 12, 4),

-- Eves Generational Formula variants (bulk pricing)
(7, 'HM-EVE-GEN-1TUBE', '1 Tube', 19.99, 50, 1),
(7, 'HM-EVE-GEN-2TUBES', '2 Tubes', 38.00, 25, 2),
(7, 'HM-EVE-GEN-3TUBES', '3 Tubes', 56.25, 20, 3),
(7, 'HM-EVE-GEN-4TUBES', '4 Tubes', 74.00, 15, 4),
(7, 'HM-EVE-GEN-6TUBES', '6 Tubes', 108.00, 10, 5),
(7, 'HM-EVE-GEN-12TUBES', '12 Tubes', 204.00, 5, 6),

-- Happy PMS Cream variants (bulk pricing)
(8, 'HM-HAPPY-PMS-1JAR', '1 Jar', 19.99, 45, 1),
(8, 'HM-HAPPY-PMS-2JARS', '2 Jars', 38.00, 22, 2),
(8, 'HM-HAPPY-PMS-3JARS', '3 Jars', 56.25, 18, 3),
(8, 'HM-HAPPY-PMS-4JARS', '4 Jars', 74.00, 15, 4),
(8, 'HM-HAPPY-PMS-6JARS', '6 Jars', 108.00, 8, 5),
(8, 'HM-HAPPY-PMS-12JARS', '12 Jars', 204.00, 4, 6),

-- 5 Day Forecast variants
(18, 'MH-5DAY-1BOTTLE', '1 Bottle', 27.95, 18, 1),
(18, 'MH-5DAY-2BOTTLES', '2 Bottles', 52.00, 10, 2);

-- Link products to health categories (many-to-many relationships)
INSERT INTO product_health_categories (product_id, health_category_id) VALUES
-- Terry Naturally Cura Med - Joint & Arthritis, Anti-Aging
(1, 5), (1, 20),

-- Unicity Aloe Vera - Digestive Health, Immune Support
(2, 4), (2, 6),

-- Newton Labs Allergies - Allergies, Immune Support
(3, 3), (3, 6),

-- Regal Labs Cannabis Oil for Pets - Pet Health
(4, 13),

-- Advanced Blood Pressure Cherry - Blood Pressure, Heart Health
(5, 1), (5, 2),

-- Regal Labs Cannabis Care - Joint & Arthritis, Skin Health
(6, 5), (6, 15),

-- Eves Generational Formula - Womens Health
(7, 11),

-- Happy PMS Cream - Womens Health
(8, 11),

-- Standard Enzyme Male Formula - Mens Health, Digestive Health
(9, 12), (9, 4),

-- Standard Enzyme Heart Formula - Heart Health, Blood Pressure
(10, 2), (10, 1),

-- Equalizer Unscented - Joint & Arthritis
(11, 5),

-- Equalizer with Peppermint - Joint & Arthritis
(12, 5),

-- Host Defense Chaga - Immune Support, Anti-Aging
(13, 6), (13, 20),

-- Host Defense Cordyceps - Energy & Vitality, Immune Support
(14, 9), (14, 6),

-- Global Healing Ashwagandha - Stress & Anxiety, Energy & Vitality
(15, 7), (15, 9),

-- Cardio 911 Beets Plus - Heart Health, Blood Pressure
(16, 2), (16, 1),

-- Cardio 911 Powder - Heart Health, Blood Pressure
(17, 2), (17, 1),

-- 5 Day Forecast for Men - Mens Health, Energy & Vitality
(18, 12), (18, 9),

-- Adams Prostate Care - Mens Health
(19, 12),

-- Natures Plus AgeLoss Eye Support - Eye Health, Anti-Aging
(20, 16), (20, 20);

-- Insert sample product images
INSERT INTO product_images (product_id, image_url, alt_text, is_primary, sort_order) VALUES
(1, 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80', 'Terry Naturally Cura Med 375mg 120 Softgels', 1, 1),
(2, 'https://images.unsplash.com/photo-1609840114035-3c981b782dfe?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80', 'Unicity Aloe Vera 50 Capsules', 1, 1),
(3, 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80', 'Newton Labs Allergies Homeopathic Remedy', 1, 1),
(4, 'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80', 'Regal Labs Cannabis Oil for Pets', 1, 1),
(5, 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80', 'Advanced Blood Pressure Cherry Supplement', 1, 1),
(6, 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80', 'Regal Labs Cannabis Care Cream', 1, 1),
(7, 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80', 'Eves Generational Formula 2oz Pump', 1, 1),
(8, 'https://images.unsplash.com/photo-1576086213369-97a306d36557?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80', 'Happy PMS Cream 2oz Jar', 1, 1);

-- Insert system settings
INSERT INTO settings (key_name, value, description, type) VALUES
('site_name', 'H&M Herbs & Vitamins', 'Website name', 'string'),
('site_description', 'Your trusted source for premium natural health products, herbs, vitamins, and wellness supplements.', 'Website description', 'string'),
('free_shipping_threshold', '25.00', 'Minimum order amount for free shipping', 'number'),
('tax_rate', '0.08', 'Default tax rate', 'number'),
('currency', 'USD', 'Default currency', 'string'),
('edsa_service_enabled', 'true', 'Enable EDSA service bookings', 'boolean'),
('edsa_service_price', '75.00', 'Price for EDSA service', 'number'),
('edsa_service_description', 'Electro Dermal Stress Analysis - A non-invasive health assessment technique', 'EDSA service description', 'string');

-- Insert default admin user (password should be changed immediately)
INSERT INTO admin_users (email, password_hash, first_name, last_name, role) VALUES
('admin@hmherbs.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6hsxq5S/kS', 'Admin', 'User', 'super_admin');

-- Insert email templates
INSERT INTO email_templates (name, subject, html_content, text_content, variables) VALUES
('order_confirmation', 'Order Confirmation - {{order_number}}', 
'<h1>Thank you for your order!</h1><p>Your order {{order_number}} has been received and is being processed.</p>', 
'Thank you for your order! Your order {{order_number}} has been received and is being processed.', 
'["order_number", "customer_name", "order_total"]'),

('edsa_booking_confirmation', 'EDSA Appointment Confirmation', 
'<h1>Your EDSA appointment has been confirmed</h1><p>Date: {{appointment_date}}<br>Time: {{appointment_time}}</p>', 
'Your EDSA appointment has been confirmed. Date: {{appointment_date}} Time: {{appointment_time}}', 
'["customer_name", "appointment_date", "appointment_time"]'),

('welcome_email', 'Welcome to H&M Herbs & Vitamins!', 
'<h1>Welcome {{customer_name}}!</h1><p>Thank you for creating an account with us.</p>', 
'Welcome {{customer_name}}! Thank you for creating an account with us.', 
'["customer_name"]');
