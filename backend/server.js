const express = require("express");
const path = require("path");
const db = require("./db");

const app = express();

const PORT = 3000;

app.use(express.json());

// Frontend folder access
app.use(express.static(path.join(__dirname, "../")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../index.html"));
});
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
                name: user.name,
                email: user.email,
                phone: user.phone || "",
                address: user.address || "",
                role: user.role
            }
        });
    });
});
// Get all products
app.get("/api/products", (req, res) => {
    const sql = "SELECT * FROM products";

    db.query(sql, (err, results) => {
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
// Get all orders
app.get("/api/orders", (req, res) => {
    const sql = "SELECT * FROM orders ORDER BY order_id DESC";

    db.query(sql, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Database error"
            });
        }

        res.json({
            success: true,
            orders: results
        });
    });
});
// Register API
app.post("/api/register", (req, res) => {
    const { name, email, password, phone, address } = req.body;

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

        const insertSql = `
            INSERT INTO users
            (name, email, password, phone, address, role)
            VALUES (?, ?, ?, ?, ?, 'customer')
        `;

        db.query(
            insertSql,
            [name, email, password, phone || "", address || ""],
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
                    userId: result.insertId
                });
            }
        );
    });
});
// Create order API
app.post("/api/orders", (req, res) => {
    const {
        customer,
        email,
        phone,
        address,
        totalAmount,
        paymentMethod,
        status,
        orderDate
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

            res.json({
                success: true,
                message: "Order created successfully",
                orderId: result.insertId
            });
        }
    );
});
// Add order items API
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
        item.product_id || item.productId || "",
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
app.listen(PORT, () => {
    console.log(`CraftVerse server running on port ${PORT}`);
});