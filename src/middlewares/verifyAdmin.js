const client = require("../config/db");

module.exports = async (req, res, next) => {
  const usersCollection = client.db("Arabian-Essense").collection("Users");

  const email = req.decoded.email;
  const user = await usersCollection.findOne({ email });

  if (user?.role !== "admin") {
    return res.status(403).send({ message: "forbidden access" });
  }
  next();
};
