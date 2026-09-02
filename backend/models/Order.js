const db = require("../db");

const Order = {
    create: (orderData, callback) => {
        const {
            customer,
            email,
            phone,
            address,
            totalAmount,
            paymentMethod,
            status,
            orderDate
        } = orderData;

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
            callback
        );
    },

    getAll: (callback) => {
        const sql = "SELECT * FROM orders ORDER BY order_id DESC";
        db.query(sql, callback);
    },

    getById: (id, callback) => {
        const sql = "SELECT * FROM orders WHERE order_id = ?";
        db.query(sql, [id], callback);
    }
};

module.exports = Order;