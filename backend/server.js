require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const express = require("express");
const path = require("path");
const db = require("./db");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;

// Email configuration
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

app.use(express.json());

// Frontend static folder access
app.use(express.static(path.join(__dirname, "../")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../index.html"));
});

// ==========================================
// AUTHENTICATION APIs
// ==========================================

// Login API
app.post("/api/login", (req, res) => {
    const { email, password } = req.body;

    const sql = "SELECT * FROM users WHERE email = ? AND password = ?";

    db.query(sql, [email, password], (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Database error"
            });
        }

        if (results.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid Email or Password"
            });
        }

        const user = results[0];

        res.json({
            success: true,
            message: "Login successful",
            user: {
                id: user.user_id || user.id,
                user_id: user.user_id || user.id,
                name: user.name,
                email: user.email,
                phone: user.phone || "",
                address: user.address || "",
                role: user.role || "customer"
            }
        });
    });
});

// Register API
app.post("/api/register", (req, res) => {
    const { name, email, password, phone, address, role } = req.body;

    const checkSql = "SELECT * FROM users WHERE email = ?";

    db.query(checkSql, [email], (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Database error"
            });
        }

        if (results.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Email already registered"
            });
        }

        const userRole = (role === "seller") ? "seller" : "customer";
        const insertSql = `
            INSERT INTO users
            (name, email, password, phone, address, role)
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        db.query(
            insertSql,
            [name, email, password, phone || "", address || "", userRole],
            (err, result) => {
                if (err) {
                    return res.status(500).json({
                        success: false,
                        message: "Registration failed"
                    });
                }

                res.json({
                    success: true,
                    message: "Registration successful",
                    userId: result.insertId,
                    role: userRole
                });
            }
        );
    });
});

// ==========================================
// PRODUCTS APIs
// ==========================================

// Get products (All, or filtered by seller_id)
app.get("/api/products", (req, res) => {
    const { seller_id } = req.query;

    let sql = "SELECT * FROM products ORDER BY product_id DESC";
    let params = [];

    if (seller_id) {
        sql = "SELECT * FROM products WHERE seller_id = ? ORDER BY product_id DESC";
        params = [seller_id];
    }

    db.query(sql, params, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Database error"
            });
        }

        res.json({
            success: true,
            products: results
        });
    });
});

// Get single product by ID
app.get("/api/products/:id", (req, res) => {
    const sql = "SELECT * FROM products WHERE product_id = ?";

    db.query(sql, [req.params.id], (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Database error" });
        }
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }
        res.json({ success: true, product: results[0] });
    });
});

// Add new product (Admin or Seller)
app.post("/api/products", (req, res) => {
    const { name, description, price, category, image, inStock, seller_id } = req.body;

    if (!name || !price) {
        return res.status(400).json({ success: false, message: "Product name and price are required" });
    }

    const sql = `
        INSERT INTO products (name, description, price, category, image, inStock, seller_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
        sql,
        [
            name,
            description || "Authentic handmade craft.",
            price,
            category || "Craft",
            image || "images/vase.jpg",
            inStock !== undefined ? inStock : 1,
            seller_id || null
        ],
        (err, result) => {
            if (err) {
                console.error("Add Product Error:", err.message);
                return res.status(500).json({ success: false, message: "Could not add product" });
            }

            res.json({
                success: true,
                message: "Product added successfully",
                productId: result.insertId
            });
        }
    );
});

// Delete product
app.delete("/api/products/:id", (req, res) => {
    const sql = "DELETE FROM products WHERE product_id = ?";

    db.query(sql, [req.params.id], (err, result) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Could not delete product" });
        }
        res.json({ success: true, message: "Product deleted successfully" });
    });
});

// ==========================================
// ORDERS APIs
// ==========================================

// Get orders with items (Supports filtering by ?email=...)
app.get("/api/orders", (req, res) => {
    const { email } = req.query;

    let ordersSql = "SELECT * FROM orders ORDER BY order_id DESC";
    let params = [];

    if (email) {
        ordersSql = "SELECT * FROM orders WHERE email = ? ORDER BY order_id DESC";
        params = [email];
    }

    db.query(ordersSql, params, (err, orders) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Database error"
            });
        }

        if (orders.length === 0) {
            return res.json({
                success: true,
                orders: []
            });
        }

        const orderIds = orders.map(order => order.order_id);

        const itemsSql = `
            SELECT * FROM order_items
            WHERE order_id IN (?)
            ORDER BY order_id DESC
        `;

        db.query(itemsSql, [orderIds], (err, items) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Order items database error"
                });
            }

            const finalOrders = orders.map(order => ({
                id: order.order_id,
                order_id: order.order_id,
                customer: order.customer,
                email: order.email,
                phone: order.phone,
                address: order.address,
                total: order.totalAmount,
                totalAmount: order.totalAmount,
                paymentMethod: order.paymentMethod,
                status: order.status,
                orderDate: order.orderDate,
                createdAt: order.createdAt,
                items: (items || [])
                    .filter(item => item.order_id === order.order_id)
                    .map(item => ({
                        item_id: item.item_id,
                        product_id: item.product_id,
                        name: item.name,
                        price: item.price,
                        quantity: item.quantity,
                        image: item.image
                    }))
            }));

            res.json({
                success: true,
                orders: finalOrders
            });
        });
    });
});

// Update Order Status (Admin only)
app.put("/api/orders/:id/status", (req, res) => {
    const { status } = req.body;
    const allowedStatuses = ["Placed", "Shipped", "Delivered", "Cancelled"];

    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
            success: false,
            message: `Invalid status. Allowed: ${allowedStatuses.join(", ")}`
        });
    }

    const sql = "UPDATE orders SET status = ? WHERE order_id = ?";

    db.query(sql, [status, req.params.id], (err, result) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Database update error" });
        }
        res.json({ success: true, message: `Order status updated to ${status}` });
    });
});

// Create Order (Sends Customer Confirmation + Admin Notification)
app.post("/api/orders", (req, res) => {
    const {
        customer,
        email,
        phone,
        address,
        totalAmount,
        paymentMethod,
        status,
        orderDate,
        items
    } = req.body;

    const sql = `
        INSERT INTO orders
        (customer, email, phone, address, totalAmount, paymentMethod, status, orderDate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
        sql,
        [
            customer,
            email || "",
            phone,
            address,
            totalAmount,
            paymentMethod || "Cash on Delivery",
            status || "Placed",
            orderDate || new Date().toISOString()
        ],
        (err, result) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Order creation failed"
                });
            }

            const orderId = result.insertId;
            const formattedOrderId = `CV-${String(orderId).padStart(4, "0")}`;

            // If items are passed in the same request, save them automatically
            if (Array.isArray(items) && items.length > 0) {
                const values = items.map(item => [
                    orderId,
                    item.product_id || item.productId || item.id || "",
                    item.name,
                    item.price,
                    item.quantity || 1,
                    item.image || ""
                ]);

                const itemsSql = `
                    INSERT INTO order_items
                    (order_id, product_id, name, price, quantity, image)
                    VALUES ?
                `;

                db.query(itemsSql, [values], (itemErr) => {
                    if (itemErr) {
                        console.error("Order items error during order creation:", itemErr.message);
                    }
                });
            }

            // 1. Customer Confirmation Email
            if (email) {
                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: email,
                    subject: `CraftVerse - Order Confirmation #${formattedOrderId}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #c9a583; border-radius: 8px;">
                            <h2 style="color: #4b2d1c;">Thank you for your order, ${customer}!</h2>
                            <p>Your CraftVerse handmade order has been placed successfully.</p>
                            <hr style="border: 0; border-top: 1px solid #eee;">
                            <p><strong>Order ID:</strong> ${formattedOrderId}</p>
                            <p><strong>Total Amount:</strong> INR ${totalAmount}</p>
                            <p><strong>Payment Method:</strong> ${paymentMethod}</p>
                            <p><strong>Status:</strong> Placed</p>
                            <p><strong>Delivery Address:</strong><br>${address}</p>
                            <hr style="border: 0; border-top: 1px solid #eee;">
                            <p>Thank you for supporting authentic artisans!</p>
                            <p style="font-size: 13px; color: #888;">CraftVerse Marketplace</p>
                        </div>
                    `
                };

                transporter.sendMail(mailOptions, (mailError, info) => {
                    if (mailError) {
                        console.error("Customer Email Error:", mailError.message);
                    } else {
                        console.log("Customer order confirmation sent:", info.response);
                    }
                });
            }

            // 2. Admin Notification Email
            const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
            if (adminEmail) {
                const adminMailOptions = {
                    from: process.env.EMAIL_USER,
                    to: adminEmail,
                    subject: `[CraftVerse Alert] New Order Placed: #${formattedOrderId}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; border: 2px solid #b8754b; border-radius: 8px;">
                            <h2 style="color: #b8754b; margin-top: 0;">New Order Received!</h2>
                            <p>A customer has just placed an order on CraftVerse:</p>
                            <hr style="border: 0; border-top: 1px solid #ddd;">
                            <p><strong>Order ID:</strong> ${formattedOrderId}</p>
                            <p><strong>Customer Name:</strong> ${customer}</p>
                            <p><strong>Customer Email:</strong> ${email || "Not provided"}</p>
                            <p><strong>Mobile Number:</strong> ${phone}</p>
                            <p><strong>Delivery Address:</strong><br>${address}</p>
                            <p><strong>Payment Method:</strong> ${paymentMethod}</p>
                            <p><strong>Total Amount:</strong> <span style="font-size: 18px; color: #4b2d1c; font-weight: bold;">INR ${totalAmount}</span></p>
                            <hr style="border: 0; border-top: 1px solid #ddd;">
                            <p>Log in to your <strong>Admin Dashboard</strong> to manage and ship this order.</p>
                        </div>
                    `
                };

                transporter.sendMail(adminMailOptions, (adminMailErr, adminInfo) => {
                    if (adminMailErr) {
                        console.error("Admin Email Error:", adminMailErr.message);
                    } else {
                        console.log("Admin notification sent successfully:", adminInfo.response);
                    }
                });
            }

            res.json({
                success: true,
                message: "Order created successfully",
                orderId: orderId,
                formattedOrderId: formattedOrderId
            });
        }
    );
});

// Add order items API (kept for backward compatibility)
app.post("/api/order-items", (req, res) => {
    const { order_id, items } = req.body;

    if (!order_id || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            success: false,
            message: "Order ID and items are required"
        });
    }

    const values = items.map(item => [
        order_id,
        item.product_id || item.productId || item.id || "",
        item.name,
        item.price,
        item.quantity || 1,
        item.image || ""
    ]);

    const sql = `
        INSERT INTO order_items
        (order_id, product_id, name, price, quantity, image)
        VALUES ?
    `;

    db.query(sql, [values], (err, result) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Order items could not be saved"
            });
        }

        res.json({
            success: true,
            message: "Order items saved successfully",
            insertedItems: result.affectedRows
        });
    });
});

// ==========================================
// USERS / CUSTOMERS MANAGEMENT APIs (Admin)
// ==========================================

// Get all users
app.get("/api/users", (req, res) => {
    const sql = "SELECT user_id, name, email, phone, address, role, created_at FROM users ORDER BY user_id DESC";

    db.query(sql, (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Database error" });
        }
        res.json({ success: true, users: results });
    });
});

// Update user role
app.put("/api/users/:id/role", (req, res) => {
    const { role } = req.body;
    if (!["admin", "seller", "customer"].includes(role)) {
        return res.status(400).json({ success: false, message: "Invalid role" });
    }

    const sql = "UPDATE users SET role = ? WHERE user_id = ?";
    db.query(sql, [role, req.params.id], (err, result) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Database update error" });
        }
        res.json({ success: true, message: `User role updated to ${role}` });
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`CraftVerse server running on port ${PORT}`);
});
