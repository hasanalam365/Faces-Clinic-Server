const client = require("../config/db");
const { ObjectId } = require("mongodb");

const usersCollection = client.db("Arabian-Essense").collection("Users");

exports.createOrUpdateUser = async (req, res) => {
  const email = req.params.email;
  const userInfo = req.body;

  const result = await usersCollection.updateOne(
    { email },
    { $set: userInfo },
    { upsert: true }
  );

  res.send(result);
};

exports.getAllUsers = async (req, res) => {
  try {
    const search = req.query.search || "";

    const query = search
      ? { email: { $regex: search, $options: "i" } }
      : {};

    const users = await usersCollection.find(query).toArray();
    res.send(users);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Server Error" });
  }
};


exports.checkAdmin = async (req, res) => {
  if (req.params.email !== req.decoded.email) {
    return res.status(403).send({ message: "forbidden" });
  }

  const user = await usersCollection.findOne({
    email: req.params.email,
  });

  res.send({ admin: user?.role === "admin" });
};

exports.getUserProfile = async (req, res) => {
  const user = await usersCollection.findOne({
    email: req.query.email,
  });
  res.send(user);
};

exports.updateUserProfile = async (req, res) => {
  const { email, name, phone, photoURL } = req.body;

  const result = await usersCollection.updateOne(
    { email },
    { $set: { name, phone, photoURL } }
  );

  res.send(result);
};

exports.updateUserRole = async (req, res) => {
  const result = await usersCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { role: req.body.role } }
  );

  res.send(result);
};

exports.deleteUser = async (req, res) => {
  const result = await usersCollection.deleteOne({
    _id: new ObjectId(req.params.id),
  });

  res.send(result);
};
