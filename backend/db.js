const mysql = require("mysql2");

const db = mysql.createConnection({
    host: "localhost",
    port: 3306,
    user: "root",
    password: "",
    database: "craftverse"
});

db.connect((err) => {
    if (err) {
        console.log("Database connection failed:", err.message);
        return;
    }

    console.log("MySQL Database Connected");
});

module.exports = db;
