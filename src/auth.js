const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const JWT_SECRET = process.env.JWT_SECRET || "suryajaya-dashboard-secret-key";
const JWT_EXPIRY = process.env.JWT_EXPIRY || "24h";
const SUPERUSER_PASSWORD = process.env.SUPERUSER_PASSWORD || "suryajaya-super";

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function authMiddleware(userCollection) {
  return async (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.replace(/^Bearer\s+/i, "");

    if (!token) {
      return res.status(401).json({ message: "Token diperlukan" });
    }

    try {
      const decoded = verifyToken(token);
      const user = await userCollection.findOne(
        { _id: decoded.username },
        { projection: { password: 0 } }
      );
      if (!user) {
        return res.status(401).json({ message: "User tidak ditemukan" });
      }
      req.user = user;
      next();
    } catch {
      return res.status(401).json({ message: "Token tidak valid atau expired" });
    }
  };
}

async function verifySuperuserPassword(password) {
  return password === SUPERUSER_PASSWORD;
}

module.exports = {
  signToken,
  verifyToken,
  authMiddleware,
  bcrypt,
  JWT_SECRET,
  SUPERUSER_PASSWORD,
  verifySuperuserPassword
};
