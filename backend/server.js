require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const express = require("express");
const path = require("path");
const db = require("./db");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const { promisify } = require("util");

const app = express();
const PORT = process.env.PORT || 3000;
const pbkdf2 = promisify(crypto.pbkdf2);
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const sessionCookieName = "craftverse_session";
const sessionMaxAgeSeconds = 8 * 60 * 60;
const passwordResetTokens = new Map();

if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be configured in production");
}

// Email configuration
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

app.use(express.json());

function query(sql, params = [], connection = db) {
    return new Promise((resolve, reject) => {
        connection.query(sql, params, (error, results) => {
            if (error) reject(error);
            else resolve(results);
        });
    });
}

function signSession(userId) {
    const payload = Buffer.from(JSON.stringify({
        userId,
        expiresAt: Date.now() + sessionMaxAgeSeconds * 1000
    })).toString("base64url");
    const signature = crypto.createHmac("sha256", sessionSecret).update(payload).digest("base64url");
    return `${payload}.${signature}`;
}

function verifySession(token) {
    if (!token) return null;
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;

    const expected = crypto.createHmac("sha256", sessionSecret).update(payload).digest();
    let actual;
    try {
        actual = Buffer.from(signature, "base64url");
    } catch {
        return null;
    }
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

    try {
        const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        return Number.isInteger(session.userId) && session.expiresAt > Date.now() ? session : null;
    } catch {
        return null;
    }
}

function setSessionCookie(res, userId) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader("Set-Cookie", `${sessionCookieName}=${signSession(userId)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionMaxAgeSeconds}${secure}`);
}

function clearSessionCookie(res) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader("Set-Cookie", `${sessionCookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
}

function requireAuth(req, res, next) {
    const cookies = Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map(cookie => {
        const separator = cookie.indexOf("=");
        return [cookie.slice(0, separator).trim(), decodeURIComponent(cookie.slice(separator + 1).trim())];
    }));
    const session = verifySession(cookies[sessionCookieName]);
    if (!session) return res.status(401).json({ success: false, message: "Please log in to continue." });

    db.query(
        "SELECT user_id, name, email, phone, address, role FROM users WHERE user_id = ?",
        [session.userId],
        (error, results) => {
            if (error) return res.status(500).json({ success: false, message: "Unable to verify your account right now." });
            if (!results.length) return res.status(401).json({ success: false, message: "Please log in to continue." });
            req.user = results[0];
            next();
        }
    );
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: "You do not have permission to perform this action." });
        }
        next();
    };
}

async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = await pbkdf2(password, salt, 210000, 64, "sha512");
    return `pbkdf2$210000$${salt}$${hash.toString("hex")}`;
}

async function verifyPassword(password, storedPassword) {
    if (!storedPassword || !storedPassword.startsWith("pbkdf2$")) {
        return { valid: password === storedPassword, needsUpgrade: password === storedPassword };
    }

    const [, iterationsText, salt, storedHash] = storedPassword.split("$");
    const iterations = Number(iterationsText);
    if (!Number.isInteger(iterations) || iterations < 100000 || !salt || !storedHash) {
        return { valid: false, needsUpgrade: false };
    }
    const actualHash = await pbkdf2(password, salt, iterations, storedHash.length / 2, "sha512");
    const expectedHash = Buffer.from(storedHash, "hex");
    return {
        valid: actualHash.length === expectedHash.length && crypto.timingSafeEqual(actualHash, expectedHash),
        needsUpgrade: false
    };
}

function validEmail(email) {
    return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 150;
}

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../login.html"));
});

// Frontend static folder access
app.use(express.static(path.join(__dirname, "../")));

// ==========================================
// AUTHENTICATION APIs
// ==========================================

// Login API
app.post("/api/login", (req, res) => {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!validEmail(email) || !password) {
        return res.status(400).json({ success: false, message: "Enter a valid email and password." });
    }

    db.query("SELECT user_id, name, email, password, phone, address, role FROM users WHERE email = ?", [email], async (err, results) => {
        if (err) {
            console.error("Login database error:", err.message);
            return res.status(500).json({
                success: false,
                message: "Unable to sign in right now. Please try again later."
            });
        }

        if (results.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        const user = results[0];
        let passwordCheck;
        try {
            passwordCheck = await verifyPassword(password, user.password);
        } catch (passwordError) {
            console.error("Password verification error:", passwordError.message);
            return res.status(500).json({ success: false, message: "Unable to sign in right now. Please try again later." });
        }
        if (!passwordCheck.valid) {
            return res.status(401).json({ success: false, message: "Invalid email or password." });
        }
        if (passwordCheck.needsUpgrade) {
            try {
                const upgradedPassword = await hashPassword(password);
                await query("UPDATE users SET password = ? WHERE user_id = ?", [upgradedPassword, user.user_id]);
            } catch (upgradeError) {
                console.error("Legacy password upgrade failed:", upgradeError.message);
            }
        }

        setSessionCookie(res, user.user_id);
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

app.get("/api/session", requireAuth, (req, res) => {
    const { user_id, name, email, phone, address, role } = req.user;
    res.json({ success: true, user: { id: user_id, user_id, name, email, phone: phone || "", address: address || "", role } });
});

app.post("/api/logout", (req, res) => {
    clearSessionCookie(res);
    res.json({ success: true, message: "Logged out." });
});

// Register API
app.post("/api/register", (req, res) => {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : "";
    const address = typeof req.body.address === "string" ? req.body.address.trim() : "";

    if (name.length < 1 || name.length > 100 || !validEmail(email) || password.length < 6 || password.length > 128 || phone.length > 20 || address.length > 1000) {
        return res.status(400).json({ success: false, message: "Check your name, email, password, phone, and address and try again." });
    }

    const checkSql = "SELECT * FROM users WHERE email = ?";

    db.query(checkSql, [email], (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Unable to create your account right now. Please try again later."
            });
        }

        if (results.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Email already registered"
            });
        }

        const userRole = "customer";
        const insertSql = `
            INSERT INTO users
            (name, email, password, phone, address, role)
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        hashPassword(password).then(hashedPassword => {
            db.query(
                insertSql,
                [name, email, hashedPassword, phone || "", address || "", userRole],
                (err, result) => {
                if (err) {
                    console.error("Registration database error:", err.message);
                    return res.status(500).json({
                        success: false,
                        message: "Unable to create your account right now. Please try again later."
                    });
                }

                setSessionCookie(res, result.insertId);
                res.json({
                    success: true,
                    message: "Registration successful",
                    userId: result.insertId,
                    role: userRole,
                    user: { id: result.insertId, user_id: result.insertId, name, email, phone, address, role: userRole }
                });
                }
            );
        }).catch(hashError => {
            console.error("Registration password hashing error:", hashError.message);
            res.status(500).json({ success: false, message: "Unable to create your account right now. Please try again later." });
        });
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
        return requireAuth(req, res, () => {
            if (req.user.role !== "seller" && req.user.role !== "admin") {
                return res.status(403).json({ success: false, message: "You do not have permission to view seller products." });
            }
            sql = "SELECT * FROM products WHERE seller_id = ? ORDER BY product_id DESC";
            params = [req.user.role === "seller" ? req.user.user_id : seller_id];
            fetchProducts();
        });
    }

    fetchProducts();

    function fetchProducts() {
        db.query(sql, params, (err, results) => {
        if (err) {
            console.error("Product list database error:", err.message);
            return res.status(500).json({
                success: false,
                message: "Unable to load products right now."
            });
        }

        res.json({
            success: true,
            products: results
        });
        });
    }
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
    return requireAuth(req, res, () => {
        if (req.user.role !== "admin" && req.user.role !== "seller") {
            return res.status(403).json({ success: false, message: "Only an admin or seller can add products." });
        }

        const { name, description, price, category, image, inStock } = req.body;
        const cleanName = typeof name === "string" ? name.trim() : "";
        const cleanPrice = Number(price);
        if (!cleanName || cleanName.length > 150 || !Number.isFinite(cleanPrice) || cleanPrice <= 0 || String(description || "").length > 5000 || String(category || "Craft").length > 50 || String(image || "images/vase.jpg").length > 255) {
            return res.status(400).json({ success: false, message: "Enter a valid product name, price, description, category, and image." });
        }

        let sellerId = req.user.role === "seller" ? req.user.user_id : null;
        if (req.user.role === "admin" && req.body.seller_id !== undefined && req.body.seller_id !== null && req.body.seller_id !== "") {
            sellerId = Number(req.body.seller_id);
            if (!Number.isInteger(sellerId) || sellerId < 1) {
                return res.status(400).json({ success: false, message: "Invalid seller selected." });
            }
        }

        const sql = `
            INSERT INTO products (name, description, price, category, image, inStock, seller_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        const createProduct = () => db.query(
            sql,
            [cleanName, description || "Authentic handmade craft.", cleanPrice, category || "Craft", image || "images/vase.jpg", inStock === false || inStock === 0 || inStock === "0" || inStock === "false" ? 0 : 1, sellerId],
            (err, result) => {
                if (err) {
                    console.error("Add product database error:", err.message);
                    return res.status(500).json({ success: false, message: "Could not add product." });
                }
                res.status(201).json({ success: true, message: "Product added successfully", productId: result.insertId });
            }
        );

        if (req.user.role === "admin" && sellerId !== null) {
            db.query("SELECT user_id FROM users WHERE user_id = ? AND role = 'seller'", [sellerId], (err, sellers) => {
                if (err) {
                    console.error("Seller assignment validation error:", err.message);
                    return res.status(500).json({ success: false, message: "Could not validate the selected seller." });
                }
                if (!sellers.length) return res.status(400).json({ success: false, message: "Selected user is not a seller." });
                createProduct();
            });
            return;
        }
        createProduct();
    });
});

app.put("/api/products/:id", requireAuth, requireRole("admin", "seller"), (req, res) => {
    const productId = Number(req.params.id);
    const { name, description, price, category, image, inStock } = req.body;
    const cleanName = typeof name === "string" ? name.trim() : "";
    const cleanPrice = Number(price);
    if (!Number.isInteger(productId) || productId < 1 || !cleanName || cleanName.length > 150 || !Number.isFinite(cleanPrice) || cleanPrice <= 0 || String(description || "").length > 5000 || String(category || "Craft").length > 50 || String(image || "images/vase.jpg").length > 255) {
        return res.status(400).json({ success: false, message: "Enter valid product details." });
    }

    const sellerCondition = req.user.role === "seller" ? " AND seller_id = ?" : "";
    const values = [cleanName, description || "Authentic handmade craft.", cleanPrice, category || "Craft", image || "images/vase.jpg"];
    let stockSql = "";
    if (inStock !== undefined) {
        stockSql = ", inStock = ?";
        values.push(inStock === false || inStock === 0 || inStock === "0" || inStock === "false" ? 0 : 1);
    }
    values.push(productId);
    if (req.user.role === "seller") values.push(req.user.user_id);

    db.query(`UPDATE products SET name = ?, description = ?, price = ?, category = ?, image = ?${stockSql} WHERE product_id = ?${sellerCondition}`, values, (err, result) => {
        if (err) {
            console.error("Update product database error:", err.message);
            return res.status(500).json({ success: false, message: "Could not update product." });
        }
        if (!result.affectedRows) {
            const ownershipParams = req.user.role === "seller" ? [productId, req.user.user_id] : [productId];
            return db.query(`SELECT product_id FROM products WHERE product_id = ?${sellerCondition}`, ownershipParams, (checkError, rows) => {
                if (checkError) return res.status(500).json({ success: false, message: "Could not verify this product." });
                if (!rows.length) return res.status(404).json({ success: false, message: "Product not found or you do not own it." });
                res.json({ success: true, message: "Product updated successfully." });
            });
        }
        res.json({ success: true, message: "Product updated successfully." });
    });
});

// Delete product
app.delete("/api/products/:id", requireAuth, requireRole("admin", "seller"), (req, res) => {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId < 1) return res.status(400).json({ success: false, message: "Invalid product ID." });
    const sellerCondition = req.user.role === "seller" ? " AND seller_id = ?" : "";
    const params = req.user.role === "seller" ? [productId, req.user.user_id] : [productId];
    db.query(`DELETE FROM products WHERE product_id = ?${sellerCondition}`, params, (err, result) => {
        if (err) {
            console.error("Delete product database error:", err.message);
            return res.status(500).json({ success: false, message: "Could not delete product." });
        }
        if (!result.affectedRows) return res.status(404).json({ success: false, message: "Product not found or you do not own it." });
        res.json({ success: true, message: "Product deleted successfully" });
    });
});

// ==========================================
// ORDERS APIs
// ==========================================

// Return orders scoped to the authenticated role.
app.get("/api/orders", requireAuth, (req, res) => {
    let ordersSql = "SELECT * FROM orders ORDER BY order_id DESC";
    let orderParams = [];
    if (req.user.role === "customer") {
        ordersSql = "SELECT * FROM orders WHERE email = ? ORDER BY order_id DESC";
        orderParams = [req.user.email];
    } else if (req.user.role === "seller") {
        ordersSql = `
            SELECT DISTINCT o.* FROM orders o
            JOIN order_items oi ON oi.order_id = o.order_id
            JOIN products p ON p.product_id = oi.product_id
            WHERE p.seller_id = ? ORDER BY o.order_id DESC
        `;
        orderParams = [req.user.user_id];
    } else if (req.user.role !== "admin") {
        return res.status(403).json({ success: false, message: "You do not have permission to view orders." });
    }

    db.query(ordersSql, orderParams, (err, orders) => {
        if (err) {
            console.error("Order list database error:", err.message);
            return res.status(500).json({
                success: false,
                message: "Unable to load orders right now."
            });
        }

        if (orders.length === 0) {
            return res.json({
                success: true,
                orders: []
            });
        }

        const orderIds = orders.map(order => order.order_id);

        const sellerItemJoin = req.user.role === "seller" ? "JOIN products p ON p.product_id = oi.product_id AND p.seller_id = ?" : "";
        const itemsSql = `SELECT oi.* FROM order_items oi ${sellerItemJoin} WHERE oi.order_id IN (?) ORDER BY oi.order_id DESC`;
        const itemParams = req.user.role === "seller" ? [req.user.user_id, orderIds] : [orderIds];

        db.query(itemsSql, itemParams, (err, items) => {
            if (err) {
                console.error("Order items database error:", err.message);
                return res.status(500).json({
                    success: false,
                    message: "Unable to load order items right now."
                });
            }

            const finalOrders = orders.map(order => ({
                id: order.order_id,
                order_id: order.order_id,
                customer: order.customer,
                email: req.user.role === "seller" ? "" : order.email,
                phone: req.user.role === "seller" ? "" : order.phone,
                address: req.user.role === "seller" ? "" : order.address,
                total: req.user.role === "seller"
                    ? items.filter(item => item.order_id === order.order_id).reduce((sum, item) => sum + Number(item.price) * Number(item.quantity || 1), 0)
                    : order.totalAmount,
                totalAmount: req.user.role === "seller"
                    ? items.filter(item => item.order_id === order.order_id).reduce((sum, item) => sum + Number(item.price) * Number(item.quantity || 1), 0)
                    : order.totalAmount,
                paymentMethod: order.paymentMethod,
                status: order.status,
                orderDate: order.orderDate,
                createdAt: order.created_at,
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
app.put("/api/orders/:id/status", requireAuth, requireRole("admin"), (req, res) => {
    const { status } = req.body;
    const orderId = Number(req.params.id);
    const allowedStatuses = ["Placed", "Shipped", "Delivered", "Cancelled"];

    if (!Number.isInteger(orderId) || orderId < 1 || !allowedStatuses.includes(status)) {
        return res.status(400).json({
            success: false,
            message: `Invalid order ID or status. Allowed statuses: ${allowedStatuses.join(", ")}`
        });
    }

    db.query("UPDATE orders SET status = ? WHERE order_id = ?", [status, orderId], (err, result) => {
        if (err) {
            console.error("Order status database error:", err.message);
            return res.status(500).json({ success: false, message: "Could not update order status." });
        }
        if (!result.affectedRows) return res.status(404).json({ success: false, message: "Order not found." });
        res.json({ success: true, message: `Order status updated to ${status}` });
    });
});

// Create Order (Sends Customer Confirmation + Admin Notification)
app.post("/api/orders", requireAuth, requireRole("customer"), async (req, res) => {
    const { customer, phone, address, paymentMethod, items } = req.body;
    const cleanCustomer = typeof customer === "string" ? customer.trim() : "";
    const cleanPhone = typeof phone === "string" ? phone.trim() : "";
    const cleanAddress = typeof address === "string" ? address.trim() : "";
    const allowedPayments = ["Cash on Delivery (COD)", "Online Payment / UPI"];
    if (!cleanCustomer || cleanCustomer.length > 100 || !/^\d{10}$/.test(cleanPhone) || !cleanAddress || cleanAddress.length > 1000 || !allowedPayments.includes(paymentMethod) || !Array.isArray(items) || items.length === 0 || items.length > 100) {
        return res.status(400).json({ success: false, message: "Check your delivery details, payment method, and cart items." });
    }

    const quantities = new Map();
    for (const item of items) {
        const productId = Number(item.product_id || item.productId || item.id);
        const quantity = Number(item.quantity || 1);
        if (!Number.isInteger(productId) || productId < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
            return res.status(400).json({ success: false, message: "Your cart contains an invalid product or quantity." });
        }
        quantities.set(productId, (quantities.get(productId) || 0) + quantity);
    }

    let connection;
    try {
        connection = await new Promise((resolve, reject) => db.getConnection((error, conn) => error ? reject(error) : resolve(conn)));
        await new Promise((resolve, reject) => connection.beginTransaction(error => error ? reject(error) : resolve()));
        const productIds = [...quantities.keys()];
        const products = await query("SELECT product_id, name, price, image, inStock FROM products WHERE product_id IN (?)", [productIds], connection);
        if (products.length !== productIds.length) {
            await new Promise(resolve => connection.rollback(() => resolve()));
            return res.status(400).json({ success: false, message: "One or more products in your cart no longer exist." });
        }
        if (products.some(product => !product.inStock)) {
            await new Promise(resolve => connection.rollback(() => resolve()));
            return res.status(400).json({ success: false, message: "One or more products in your cart are out of stock." });
        }

        const orderItems = products.map(product => ({
            product_id: product.product_id,
            name: product.name,
            price: Number(product.price),
            quantity: quantities.get(product.product_id),
            image: product.image || ""
        }));
        const totalAmount = orderItems.reduce((total, item) => total + item.price * item.quantity, 0);
        const orderDate = new Date().toISOString();
        const orderResult = await query(
            "INSERT INTO orders (customer, email, phone, address, totalAmount, paymentMethod, status, orderDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [cleanCustomer, req.user.email, cleanPhone, cleanAddress, totalAmount, paymentMethod, "Placed", orderDate],
            connection
        );
        const orderId = orderResult.insertId;
        const itemValues = orderItems.map(item => [orderId, item.product_id, item.name, item.price, item.quantity, item.image]);
        await query("INSERT INTO order_items (order_id, product_id, name, price, quantity, image) VALUES ?", [itemValues], connection);
        await new Promise((resolve, reject) => connection.commit(error => error ? reject(error) : resolve()));

        const formattedOrderId = `CV-${String(orderId).padStart(4, "0")}`;
        const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: req.user.email,
                subject: `CraftVerse - Order Confirmation #${formattedOrderId}`,
                text: `Thank you for your order. Order ${formattedOrderId}; total INR ${totalAmount}.`
            }).catch(error => console.error("Customer order email failed:", error.message));
            if (adminEmail) {
                transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: adminEmail,
                    subject: `[CraftVerse] New Order #${formattedOrderId}`,
                    text: `New order ${formattedOrderId} from ${cleanCustomer}, total INR ${totalAmount}.`
                }).catch(error => console.error("Admin order email failed:", error.message));
            }
        }
        res.status(201).json({ success: true, message: "Order created successfully", orderId, formattedOrderId, totalAmount });
    } catch (error) {
        if (connection) await new Promise(resolve => connection.rollback(() => resolve()));
        console.error("Order creation failed:", error.message);
        res.status(500).json({ success: false, message: "Unable to save your order right now." });
    } finally {
        if (connection) connection.release();
    }
});

app.post("/api/order-items", requireAuth, (req, res) => {
    res.status(410).json({ success: false, message: "Order items are saved atomically when an order is placed." });
});

// ==========================================
// USERS / CUSTOMERS MANAGEMENT APIs (Admin)
// ==========================================

// Get all users
app.get("/api/users", requireAuth, requireRole("admin"), (req, res) => {
    const sql = "SELECT user_id, name, email, phone, address, role, created_at FROM users ORDER BY user_id DESC";

    db.query(sql, (err, results) => {
        if (err) {
            console.error("User list database error:", err.message);
            return res.status(500).json({ success: false, message: "Unable to load users right now." });
        }
        res.json({ success: true, users: results });
    });
});

// Update user role
app.put("/api/users/:id/role", requireAuth, requireRole("admin"), (req, res) => {
    const { role } = req.body;
    const userId = Number(req.params.id);
    if (!["admin", "seller", "customer"].includes(role)) {
        return res.status(400).json({ success: false, message: "Invalid role" });
    }
    if (!Number.isInteger(userId) || userId < 1) return res.status(400).json({ success: false, message: "Invalid user ID." });
    if (userId === req.user.user_id && role !== "admin") return res.status(400).json({ success: false, message: "You cannot remove your own admin access." });

    db.query("UPDATE users SET role = ? WHERE user_id = ?", [role, userId], (err, result) => {
        if (err) {
            console.error("User role database error:", err.message);
            return res.status(500).json({ success: false, message: "Could not update the user role." });
        }
        if (!result.affectedRows) return res.status(404).json({ success: false, message: "User not found." });
        res.json({ success: true, message: `User role updated to ${role}` });
    });
});

app.get("/api/profile", requireAuth, (req, res) => {
    const { user_id, name, email, phone, address, role } = req.user;
    res.json({ success: true, user: { user_id, name, email, phone: phone || "", address: address || "", role } });
});

app.put("/api/profile", requireAuth, (req, res) => {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : "";
    const address = typeof req.body.address === "string" ? req.body.address.trim() : "";
    if (!name || name.length > 100 || phone.length > 20 || address.length > 1000) {
        return res.status(400).json({ success: false, message: "Enter a valid name, phone number, and address." });
    }

    db.query("UPDATE users SET name = ?, phone = ?, address = ? WHERE user_id = ?", [name, phone, address, req.user.user_id], (err, result) => {
        if (err) {
            console.error("Profile update database error:", err.message);
            return res.status(500).json({ success: false, message: "Could not save profile changes." });
        }
        res.json({ success: true, user: { user_id: req.user.user_id, id: req.user.user_id, name, email: req.user.email, phone, address, role: req.user.role } });
    });
});

app.post("/api/contact", async (req, res) => {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const subject = typeof req.body.subject === "string" ? req.body.subject.trim() : "";
    const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
    if (!name || name.length > 100 || !validEmail(email) || !subject || subject.length > 150 || !message || message.length > 5000) {
        return res.status(400).json({ success: false, message: "Please provide a valid name, email, subject, and message." });
    }
    const recipient = process.env.CONTACT_EMAIL || process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !recipient) {
        return res.status(503).json({ success: false, message: "Contact email is not configured yet. Please try again later." });
    }
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: recipient,
            replyTo: email,
            subject: `CraftVerse contact: ${subject}`,
            text: `From: ${name} <${email}>\n\n${message}`
        });
        res.json({ success: true, message: "Your message was sent successfully." });
    } catch (error) {
        console.error("Contact email failed:", error.message);
        res.status(502).json({ success: false, message: "We could not send your message right now. Please try again later." });
    }
});

app.post("/api/password-reset", (req, res) => {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!validEmail(email)) return res.status(400).json({ success: false, message: "Enter a valid email address." });
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.APP_URL) {
        return res.status(503).json({ success: false, message: "Password reset email is not configured yet. Please contact the administrator." });
    }

    db.query("SELECT user_id, email FROM users WHERE email = ?", [email], async (err, results) => {
        if (err) {
            console.error("Password reset lookup failed:", err.message);
            return res.status(500).json({ success: false, message: "Unable to process the reset request right now." });
        }
        if (!results.length) return res.json({ success: true, message: "If the account exists, a reset link will be sent." });

        const token = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        const expiresAt = Date.now() + 15 * 60 * 1000;
        for (const [key, value] of passwordResetTokens) {
            if (value.userId === results[0].user_id || value.expiresAt <= Date.now()) passwordResetTokens.delete(key);
        }
        passwordResetTokens.set(tokenHash, { userId: results[0].user_id, expiresAt });
        const resetUrl = `${process.env.APP_URL.replace(/\/+$/, "")}/reset-password.html?token=${encodeURIComponent(token)}`;
        try {
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: results[0].email,
                subject: "CraftVerse password reset",
                text: `Use this link within 15 minutes to reset your password: ${resetUrl}`
            });
            res.json({ success: true, message: "If the account exists, a reset link will be sent." });
        } catch (mailError) {
            passwordResetTokens.delete(tokenHash);
            console.error("Password reset email failed:", mailError.message);
            res.status(502).json({ success: false, message: "Could not send the reset email right now." });
        }
    });
});

app.post("/api/password-reset/confirm", async (req, res) => {
    const token = typeof req.body.token === "string" ? req.body.token : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!/^[a-f0-9]{64}$/i.test(token) || password.length < 6 || password.length > 128) {
        return res.status(400).json({ success: false, message: "The reset link or new password is invalid." });
    }
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const reset = passwordResetTokens.get(tokenHash);
    if (!reset || reset.expiresAt <= Date.now()) {
        passwordResetTokens.delete(tokenHash);
        return res.status(400).json({ success: false, message: "This reset link has expired or was already used." });
    }
    try {
        await query("UPDATE users SET password = ? WHERE user_id = ?", [await hashPassword(password), reset.userId]);
        passwordResetTokens.delete(tokenHash);
        res.json({ success: true, message: "Your password has been reset. You can now log in." });
    } catch (error) {
        console.error("Password reset update failed:", error.message);
        res.status(500).json({ success: false, message: "Unable to reset the password right now." });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`CraftVerse server running on port ${PORT}`);
});
