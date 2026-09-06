-- ===================================================
-- CraftVerse - Database Setup & Schema Script
-- Database Name: craftverse
-- ===================================================

CREATE DATABASE IF NOT EXISTS craftverse;
USE craftverse;

-- ---------------------------------------------------
-- 1. Table: users
-- ---------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    role VARCHAR(20) DEFAULT 'customer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------
-- 2. Table: products
-- ---------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    product_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    category VARCHAR(50),
    image VARCHAR(255),
    inStock BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------
-- 3. Table: orders
-- ---------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
    order_id INT AUTO_INCREMENT PRIMARY KEY,
    customer VARCHAR(100) NOT NULL,
    email VARCHAR(150),
    phone VARCHAR(20) NOT NULL,
    address TEXT NOT NULL,
    totalAmount DECIMAL(10, 2) NOT NULL,
    paymentMethod VARCHAR(50) DEFAULT 'Cash on Delivery',
    status VARCHAR(50) DEFAULT 'Placed',
    orderDate VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------
-- 4. Table: order_items
-- ---------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
    item_id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id VARCHAR(50),
    name VARCHAR(150) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    image VARCHAR(255),
    FOREIGN KEY (order_id)
        REFERENCES orders(order_id)
        ON DELETE CASCADE
);

-- ---------------------------------------------------
-- Sample Initial Products Data
-- ---------------------------------------------------
INSERT IGNORE INTO products
(product_id, name, description, price, category, image, inStock)
VALUES
(1, 'Handmade Bracelet',
 'Beautiful handcrafted bracelet perfect for daily wear and gifting.',
 250.00, 'Accessories', 'images/bracelet.jpg', TRUE),

(2, 'Clay Pot',
 'Classic handmade clay pot ideal for home decoration.',
 400.00, 'Decor', 'images/claypot.jpg', TRUE),

(3, 'Wooden Photo Frame',
 'Premium wooden frame crafted to preserve your memories beautifully.',
 550.00, 'Decor', 'images/frame.jpg', TRUE),

(4, 'Decorative Flower Vase',
 'Elegant handmade ceramic vase that adds a serene aesthetic touch.',
 350.00, 'Decor', 'images/vase.jpg', TRUE),

(5, 'Macrame Wall Hanging',
 'Handmade macrame wall hanging perfect for stylish home interiors.',
 650.00, 'Decor', 'images/macrame.jpg', TRUE),

(6, 'Handmade Bag',
 'Eco-friendly handmade bag designed for everyday use.',
 750.00, 'Accessories', 'images/bag.jpg', TRUE),

(7, 'Scented Candle',
 'Organic soy wax scented candle with soothing essential oils.',
 450.00, 'Living', 'images/candle.jpg', TRUE),

(8, 'Wooden Bowl',
 'Handcrafted wooden bowl with a natural, food-safe finish.',
 300.00, 'Living', 'images/bowl.jpg', TRUE);

-- ---------------------------------------------------
-- Sample Demo Users Data
-- ---------------------------------------------------
INSERT IGNORE INTO users
(name, email, password, phone, address, role)
VALUES
('Ankita Gupta',
 'user@craftverse.com',
 'user123',
 '9876543210',
 'Mumbai',
 'customer'),

('Super Admin',
 'admin@craftverse.com',
 'admin123',
 '9876543210',
 'Head Office, Mumbai',
 'admin');