const db = require("../db");

const User = {
    create: (userData, callback) => {
        const { name, email, password, phone, address, role } = userData;

        const sql = `
            INSERT INTO users 
            (name, email, password, phone, address, role)
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        db.query(
            sql,
            [name, email, password, phone || "", address || "", role || "customer"],
            callback
        );
    },

    findByEmail: (email, callback) => {
        const sql = "SELECT * FROM users WHERE email = ?";
        db.query(sql, [email], callback);
    }
};

module.exports = User;