const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
require("dotenv/config")
const cors = require('cors');
const cookieParser = require('cookie-parser');
const validator = require('validator');
const jwt = require('jsonwebtoken')
const multer = require('multer')
const path = require("path");
const { serialize } = require('v8');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
    origin: 'http://127.0.0.1:5502',
    credentials: true
}));
app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const PORT = process.env.PORT;

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
});


app.post("/", (req, res) => {
    res.send("asd")
})


const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});


const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed.'));
        }
    }
}).array('productImages', 5);


app.put("/api/upload", (req, res) => {
    console.log("Received fields:", req.body);
    console.log("Received files:", req.files);

    upload(req, res, function (err) {
        if (err) {
            console.error("Multer hiba:", err);
            return res.status(400).json({ message: err.message });
        }

        const { price, brand, model, size, color, state } = req.body;
        const imageUrls = req.files ? req.files.map(file => file.path) : [];

        if (!price || !brand || !model || !size || !color || !state) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        try {
            const sql = "INSERT INTO list(price, brand, model, size, color, state) VALUES (?, ?, ?, ?, ?, ?)";
            pool.query(sql, [price, brand, model, size, color, state], (err, result) => {
                if (err) {
                    console.error("❌ SQL Hiba:", err);
                    return res.status(500).json({ message: "Database error" });
                }

                const listId = result.insertId;
                if (imageUrls.length > 0) {
                    imageUrls.forEach(imageUrl => {
                        const imageSql = "INSERT INTO list_images(list_id, url) VALUES (?, ?)";
                        pool.query(imageSql, [listId, imageUrl], (imageErr, imageResult) => {
                            if (imageErr) {
                                console.error(" Image SQL Error:", imageErr);
                            }
                        });
                    });
                }

                return res.status(201).json({ message: "Success!", data: result });
            });
        } catch (error) {
            console.error(" Server Error:", error);
            res.status(500).json({ message: error });
        }
    });
});


app.get("/api/list", (req, res) => {
    try {
        const sql = "SELECT * FROM list ";
        pool.query(sql, (err, result) => {
            if (err) {
                console.error("SQL Error:", err);
                return res.status(500).json({ message: "Error fetching product list" });
            }

            if (result.length === 0) {
                return res.status(200).json([]);
            }

            const listIds = result.map(item => item.id);
            const imageSql = "SELECT * FROM list_images WHERE list_id IN (?)";
            pool.query(imageSql, [listIds], (imageErr, imageResult) => {
                if (imageErr) {
                    console.error("Image SQL Error:", imageErr);
                    return res.status(500).json({ message: "Error fetching images" });
                }

                const responseData = result.map(product => {
                    const images = imageResult.filter(image => image.list_id === product.id);
                    return {
                        ...product,
                        images: images.map(image => image.url)
                    };
                });

                return res.status(200).json(responseData);
            });
        });
    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ message: "Server error" });
    }
});



app.get("/api/search/:search", (req, res) => {
    const search = req.params.search.trim();

    if (!search) {
        return res.status(400).json({ message: "Search query cannot be empty" });
    }

    try {
        const sql = "SELECT * FROM list WHERE brand LIKE ? OR model LIKE ?";
        pool.query(sql, [`%${search}%`, `%${search}%`], (err, result) => {
            if (err) {
                console.error("SQL Error:", err);
                return res.status(500).json({ message: "Error fetching product list" });
            }

            if (result.length === 0) {
                return res.status(200).json([]);
            }

            const listIds = result.map(item => item.id);
            const imageSql = "SELECT * FROM list_images WHERE list_id IN (?)";
            pool.query(imageSql, [listIds], (imageErr, imageResult) => {
                if (imageErr) {
                    console.error("Image SQL Error:", imageErr);
                    return res.status(500).json({ message: "Error fetching images" });
                }

                const responseData = result.map(product => {
                    const images = imageResult.filter(image => image.list_id === product.id);
                    return {
                        ...product,
                        images: images.map(image => image.url)
                    };
                });

                return res.status(200).json(responseData);
            });
        });
    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ message: "Server error" });
    }
});



app.get("/api/getitem", (req, res) => {
    const itemId = req.query.id;

    if (!itemId) {
        return res.status(400).send("ID is required");
    }

    try {
        const sql = `
            SELECT list.*, list_images.url AS imageUrl
            FROM list
            LEFT JOIN list_images ON list.id = list_images.list_id
            WHERE list.id = ?`;

        pool.query(sql, [itemId], (err, result) => {
            if (err) {
                console.error("Hiba a lekérdezés során:", err);
                return res.status(500).send("Hiba történt az adatbázis lekérdezése közben");
            }

            if (result.length === 0) {
                return res.status(404).send({ message: "Item not found" });
            }

            const product = result[0];
            const images = result
                .filter(row => row.imageUrl)
                .map(row => row.imageUrl);

            const productWithImages = {
                ...product,
                images: images
            };

            console.log("Product with images:", productWithImages);
            res.status(200).json(productWithImages);
        });
    } catch (error) {
        console.error("Hiba történt:", error);
        res.status(500).send("Valami hiba történt");
    }
});


const JWT_SECRET = process.env.JWT_SECRET;

function authenticateToken(req, res, next) {
    const token = req.cookies.auth_token;
    if (!token) {
        return res.status(403).json({ error: 'Nincs token' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Van token, csak épp nem érvényes' });
        }
        req.user = user;
        next();
    });
}


app.get("/api/profile", authenticateToken, (req, res) => {
    const user_id = req.user.id;
    const sql = "SELECT * FROM users WHERE user_id = ?";
    console.log("User ID from token:", user_id);

    pool.query(sql, [user_id], (err, result) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Database error" });
        }
        if (result.length === 0) {
            console.log("User not found for ID:", user_id);
            return res.status(404).json({ message: "User not found" });
        }
        console.log("User found:", result);
        return res.json(result);
    });
});

//regisztracio
app.post('/api/register', (req, res) => {
    const { email, name, password } = req.body;
    const errors = [];

    if (!validator.isEmail(email)) {
        errors.push({ error: 'Az email cím nem valós!' });
    }

    if (validator.isEmpty(name)) {
        errors.push({ error: 'Adj meg egy nevet!' });
    }

    if (!validator.isLength(password, { min: 6 })) {
        errors.push({ error: 'A jelszó túl rövid (legalább 6 karakterből kell állnia)' });
    }

    if (errors.length > 0) {
        return res.status(400).json({ errors });
    }

    bcrypt.hash(password, 10, (err, hash) => {
        if (err) {
            return res.status(500).json({ error: 'Hiba a hashelés során' });
        }

        const sql = 'INSERT INTO users(id, email, name, password) VALUES(NULL, ?, ?, ?)';
        pool.query(sql, [email, name, hash], (err, result) => {
            if (err) {
                return res.status(500).json({ error: err });
            }
            res.status(201).json({ message: 'Sikeres regisztráció! ' });
        });
    });
});


//bejelentkezes
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const errors = [];

    if (!validator.isEmail(email)) {
        errors.push({ error: 'Add meg az email címed!' });
    }

    if (validator.isEmpty(password)) {
        errors.push({ error: 'Add meg a jelszót!' });
    }

    if (errors.length > 0) {
        return res.status(400).json({ errors });
    }

    const sql = 'SELECT * FROM users WHERE email LIKE ?';
    pool.query(sql, [email], (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Hiba az SQL-ben' });
        }

        if (result.length === 0) {
            return res.status(404).json({ error: 'Nem található ilyen felhasználó!' });
        }

        const user = result[0];
        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (isMatch) {
                const token = jwt.sign({ id: user.user_id }, JWT_SECRET, { expiresIn: '1y' });

                res.cookie('auth_token', token, {
                    httpOnly: true,
                    secure: true,
                    sameSite: 'none',
                    maxAge: 1000 * 60 * 60 * 24 * 30 * 12
                });

                return res.status(200).json({ message: 'Sikeres bejelentkezés' });
            } else {
                return res.status(401).json({ error: 'Helytelen jelszó' });
            }
        });
    });
});



//kijelentkezes
app.post('/api/logout', authenticateToken, (req, res) => {
    res.clearCookie('auth_token', {
        httpOnly: true,
        secure: true,
        sameSite: 'none'
    });
    return res.status(200).json({ message: 'Kijelentkezve!' });
});


//ya
app.listen(PORT, () => {
    console.log(`App is running and listening on port ${PORT}`)
})