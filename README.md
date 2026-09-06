# 🎨 CraftVerse - Online Handmade Crafts Marketplace

CraftVerse is a full-stack e-commerce web application developed to empower local artisans by connecting them directly with customers to discover and buy handcrafted products.

---

## 🌟 Key Features

* **User Authentication:** Customer registration and login backed by MySQL.
* **Dynamic Product Catalog:** Products are fetched from MySQL with search and category-wise filtering.
* **Interactive Shopping Cart:** Quantity adjustment, item deletion, live subtotal calculation, and cart badge count.
* **Seamless Checkout:** Delivery address form with Cash on Delivery and simulated UPI/Online payment.
* **Order Management & History:** Customers can place orders and view order details, delivery information, payment method, and order status.
* **Admin Control Room:** Admin dashboard for viewing inventory and customer orders.

---

## 🛠️ Technology Stack

* **Frontend:** HTML5, CSS3, JavaScript (ES6)
* **Backend:** Node.js, Express.js (REST APIs)
* **Database:** MySQL
* **Database Driver:** `mysql2`
* **Development Tools:** Visual Studio Code, XAMPP
* **Version Control:** Git & GitHub

---

## 📂 Project Structure

```text
CraftVerse/
├── backend/
│   ├── db.js             # MySQL database connection
│   └── server.js         # Express server & REST API endpoints
├── css/
│   └── style.css         # Complete styling and responsive design
├── images/               # Product images and banner assets
├── js/
│   └── main.js           # Shared client-side functions and cart management
├── index.html            # Home page
├── products.html         # Product catalog
├── product-details.html  # Detailed product view
├── cart.html             # Shopping cart
├── checkout.html         # Delivery details and order confirmation
├── orders.html           # Customer order history and tracking
├── profile.html          # Customer profile
├── admin.html            # Admin dashboard
├── admin-login.html      # Admin login
├── login.html            # Customer login
├── register.html         # Customer registration
├── contact.html          # Contact page
├── schema.sql            # MySQL database schema and sample records
├── package.json          # Project dependencies
└── README.md             # Project documentation