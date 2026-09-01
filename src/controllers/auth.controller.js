const jwt = require("jsonwebtoken");

exports.createJWT = async (req, res) => {
  const user = req.body;

  if (!user?.email) {
    return res.status(400).send({ message: "Invalid user data" });
  }

  const token = jwt.sign(
    { email: user.email },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "1h" }
  );

  res.send({ token });
};
