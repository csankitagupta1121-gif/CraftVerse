const db = require("../db");

const Product = {
    getAll: (callback) => {
        const sql = "SELECT * FROM products ORDER BY product_id DESC";
        db.query(sql, callback);
    },

    getById: (id, callback) => {
        const sql = "SELECT * FROM products WHERE product_id = ?";
        db.query(sql, [id], callback);
    },

    create: (productData, callback) => {
        const {
            name,
            description,
            price,
            category,
            image,
            inStock
        } = productData;

        const sql = `
            INSERT INTO products
            (name, description, price, category, image, inStock)
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        db.query(
            sql,
            [
                name,
                description || "",
                price,
                category,
                image || "",
                inStock !== undefined ? inStock : true
            ],
            callback
        );
    }
};

module.exports = Product;